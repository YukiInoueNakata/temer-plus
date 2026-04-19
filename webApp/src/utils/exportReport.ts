// ============================================================================
// 論文用レポート出力（.docx）
// - メタデータ（記号体系 / 協力者情報 / インタビュー / 表記方針）
// - 図（キャンバスを PNG 化して埋め込み）
// - Box / Line の description 一覧
// ============================================================================

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from 'docx';
import { toPng } from 'html-to-image';
import type { TEMDocument, Box, Line } from '../types';

export interface PaperReportOptions {
  filename?: string;
  diagramElementId?: string;
  includeDiagram: boolean;
}

function heading(text: string, level: typeof HeadingLevel[keyof typeof HeadingLevel]): Paragraph {
  return new Paragraph({
    heading: level,
    children: [new TextRun({ text, bold: true })],
  });
}

function para(text: string, opts?: { bold?: boolean; italic?: boolean }): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: opts?.bold, italics: opts?.italic })],
  });
}

async function fetchPngBytes(dataUrl: string): Promise<Uint8Array> {
  const res = await fetch(dataUrl);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

function boxRows(boxes: Box[]): TableRow[] {
  const header = new TableRow({
    tableHeader: true,
    children: ['ID', '種別', 'ラベル', '説明'].map((t) => new TableCell({
      width: { size: 25, type: WidthType.PERCENTAGE },
      children: [new Paragraph({ children: [new TextRun({ text: t, bold: true })] })],
    })),
  });
  const rows = boxes
    .filter((b) => b.description || !b.noDescriptionNeeded)
    .map((b) => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph(b.id)] }),
        new TableCell({ children: [new Paragraph(b.type)] }),
        new TableCell({ children: [new Paragraph(b.label)] }),
        new TableCell({
          children: [new Paragraph(b.noDescriptionNeeded
            ? '（説明不要）'
            : (b.description ?? '（未記入）'))],
        }),
      ],
    }));
  return [header, ...rows];
}

function lineRows(lines: Line[]): TableRow[] {
  const header = new TableRow({
    tableHeader: true,
    children: ['ID', '種別', 'From→To', '説明'].map((t) => new TableCell({
      width: { size: 25, type: WidthType.PERCENTAGE },
      children: [new Paragraph({ children: [new TextRun({ text: t, bold: true })] })],
    })),
  });
  const rows = lines
    .filter((l) => l.description || !l.noDescriptionNeeded)
    .map((l) => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph(l.id)] }),
        new TableCell({ children: [new Paragraph(l.type)] }),
        new TableCell({ children: [new Paragraph(`${l.from} → ${l.to}`)] }),
        new TableCell({
          children: [new Paragraph(l.noDescriptionNeeded
            ? '（説明不要）'
            : (l.description ?? '（未記入）'))],
        }),
      ],
    }));
  return [header, ...rows];
}

export async function exportPaperReport(
  doc: TEMDocument,
  opts: PaperReportOptions,
): Promise<void> {
  const filename = opts.filename ?? 'TEMer_report.docx';
  const children: (Paragraph | Table)[] = [];

  // タイトル
  children.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: doc.metadata.title || 'TEM 図報告', bold: true })],
  }));
  if (doc.metadata.author) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: doc.metadata.author })],
    }));
  }
  children.push(para(''));

  // 1. 記号体系
  const ns = doc.metadata.notationSystem;
  children.push(heading('1. 記号体系の宣言', HeadingLevel.HEADING_1));
  if (ns) {
    children.push(para(
      ns.base === 'Arakawa2012'
        ? '本図は荒川・安田・サトウ（2012）の標準記号に準拠する。'
        : ns.base === 'custom'
          ? '本図は独自の記号体系を用いる（下記参照）。'
          : 'その他の記号体系を用いる（下記参照）。'
    ));
    if (ns.customDescription) children.push(para(ns.customDescription));
  } else {
    children.push(para('（未入力）', { italic: true }));
  }
  children.push(para(''));

  // 2. 協力者情報
  const pi = doc.metadata.participantsInfo;
  children.push(heading('2. 協力者情報', HeadingLevel.HEADING_1));
  if (pi) {
    if (pi.count > 0) children.push(para(`協力者数: ${pi.count} 名`));
    if (pi.description) children.push(para(`記述: ${pi.description}`));
    if (pi.hsiDescription) children.push(para(`HSI 水準: ${pi.hsiDescription}`));
    if (pi.pseudonyms && pi.pseudonyms.length) {
      children.push(para(`仮名: ${pi.pseudonyms.join(', ')}`));
    }
  } else {
    children.push(para('（未入力）', { italic: true }));
  }
  children.push(para(''));

  // 3. インタビュー
  const iv = doc.metadata.interview;
  children.push(heading('3. インタビュー方法', HeadingLevel.HEADING_1));
  if (iv) {
    if (iv.method) children.push(para(`方法: ${iv.method}`));
    if (iv.durationDescription) children.push(para(`所要時間/期間: ${iv.durationDescription}`));
    if (iv.timesCount > 0) children.push(para(`回数: ${iv.timesCount} 回`));
    if (iv.analysisCombination) children.push(para(`分析の組合せ: ${iv.analysisCombination}`));
    if (iv.notes) children.push(para(`備考: ${iv.notes}`));
  } else {
    children.push(para('（未入力）', { italic: true }));
  }
  children.push(para(''));

  // 4. 表記方針
  const vc = doc.metadata.visualConventions;
  children.push(heading('4. 表記方針', HeadingLevel.HEADING_1));
  const addConv = (label: string, ent?: { hasMeaning: boolean; description?: string }) => {
    if (!ent) return;
    const txt = ent.hasMeaning
      ? `${label}: 意味あり。${ent.description ?? ''}`
      : `${label}: 意味なし（見栄えのみ）`;
    children.push(para(txt));
  };
  if (vc) {
    addConv('横軸の長さ',      vc.horizontalLength);
    addConv('矢印の角度',      vc.arrowAngle);
    addConv('縦の位置',        vc.verticalPosition);
    addConv('色',              vc.colors);
    addConv('線の太さ',        vc.lineWeight);
    if (vc.other) {
      vc.other.forEach((o) => children.push(para(`${o.aspect}: ${o.description}`)));
    }
  } else {
    children.push(para('（未入力）', { italic: true }));
  }
  if (doc.metadata.reportNotes) {
    children.push(para(''));
    children.push(heading('補足', HeadingLevel.HEADING_2));
    children.push(para(doc.metadata.reportNotes));
  }
  children.push(para(''));

  // 5. 図（埋込）
  if (opts.includeDiagram && opts.diagramElementId) {
    children.push(heading('5. TEM 図', HeadingLevel.HEADING_1));
    try {
      const el = document.getElementById(opts.diagramElementId);
      if (el) {
        const dataUrl = await toPng(el, { backgroundColor: '#ffffff', pixelRatio: 2 });
        const bytes = await fetchPngBytes(dataUrl);
        const rect = el.getBoundingClientRect();
        const maxW = 600;
        const scale = Math.min(1, maxW / Math.max(1, rect.width));
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data: bytes,
              transformation: {
                width: rect.width * scale,
                height: rect.height * scale,
              },
              // PNG 以外は docx 側で rejected されるので固定
              type: 'png',
            } as ConstructorParameters<typeof ImageRun>[0]),
          ],
        }));
      }
    } catch (e) {
      console.warn('図の埋め込みに失敗:', e);
      children.push(para('（図の埋め込みに失敗しました）', { italic: true }));
    }
    children.push(para(''));
  }

  // 6. シート別要素一覧
  children.push(heading('6. 図の要素一覧（シート別）', HeadingLevel.HEADING_1));
  for (const sheet of doc.sheets) {
    children.push(heading(`シート: ${sheet.name}`, HeadingLevel.HEADING_2));
    if (sheet.boxes.length > 0) {
      children.push(heading('Box', HeadingLevel.HEADING_3));
      children.push(new Table({
        rows: boxRows(sheet.boxes),
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
          left: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
          right: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' },
          insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' },
        },
      }));
      children.push(para(''));
    }
    if (sheet.lines.length > 0) {
      children.push(heading('Line', HeadingLevel.HEADING_3));
      children.push(new Table({
        rows: lineRows(sheet.lines),
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
          left: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
          right: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' },
          insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' },
        },
      }));
      children.push(para(''));
    }
  }

  const docx = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(docx);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
