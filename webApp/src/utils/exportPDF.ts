// ============================================================================
// PDF 出力
// - キャンバス DOM を PNG 化し、jsPDF に埋め込んで PDF 化
// - 用紙サイズに fit させる（余白指定）
// ============================================================================

import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';
import { getPaperInch, type PaperSizeKey } from './paperSizes';
import type { ExportOptions } from './exportImage';

export interface PDFExportOptions extends ExportOptions {
  paperSize: PaperSizeKey;
  customWidth?: number;   // custom 時、px
  customHeight?: number;  // custom 時、px
  margin?: number;        // inch（上下左右）既定 0.3
}

function buildFilter(opts: ExportOptions) {
  return (el: HTMLElement) => {
    if (!(el instanceof HTMLElement)) return true;
    if (!opts.includeControls) {
      if (el.classList?.contains('react-flow__controls')) return false;
      if (el.classList?.contains('react-flow__minimap')) return false;
      if (el.classList?.contains('react-flow__attribution')) return false;
    }
    if (el.classList?.contains('scrollbar-h')) return false;
    if (el.classList?.contains('scrollbar-v')) return false;
    if (!opts.includeRulers) {
      if (el.classList?.contains('canvas-rulers')) return false;
      if (el.classList?.contains('ruler-vertical')) return false;
      if (el.classList?.contains('ruler-horizontal')) return false;
      if (el.classList?.contains('ruler-corner')) return false;
    }
    if (!opts.includeGrid) {
      if (el.classList?.contains('react-flow__background')) return false;
    }
    if (!opts.includePaperGuides) {
      if (el.classList?.contains('paper-guide-overlay')) return false;
    }
    return true;
  };
}

export async function exportToPDF(
  elementId: string,
  filename: string,
  opts: PDFExportOptions,
): Promise<void> {
  const node = document.getElementById(elementId);
  if (!node) throw new Error(`Element not found: #${elementId}`);

  const paper = getPaperInch(opts.paperSize, opts.customWidth, opts.customHeight);
  const margin = opts.margin ?? 0.3;
  const contentW = Math.max(1, paper.width - margin * 2);
  const contentH = Math.max(1, paper.height - margin * 2);

  // PNG をまず生成（ピクセル解像度は用紙サイズ × DPI）
  const dpi = 150;
  const targetPx = { w: paper.width * dpi, h: paper.height * dpi };
  // html-to-image で canvas 領域全体を撮る。pixelRatio で実質解像度を稼ぐ
  const nodeRect = node.getBoundingClientRect();
  const ratio = Math.max(1, Math.min(
    targetPx.w / Math.max(1, nodeRect.width),
    targetPx.h / Math.max(1, nodeRect.height),
  ));

  const dataUrl = await toPng(node, {
    backgroundColor: opts.background === 'transparent' ? undefined : '#ffffff',
    pixelRatio: ratio,
    filter: buildFilter(opts),
  });

  const pdf = new jsPDF({
    orientation: paper.width >= paper.height ? 'landscape' : 'portrait',
    unit: 'in',
    format: [paper.width, paper.height],
  });
  // アスペクト維持でコンテンツ領域に fit
  const imgAspect = nodeRect.width / Math.max(1, nodeRect.height);
  const boxAspect = contentW / contentH;
  let drawW: number;
  let drawH: number;
  if (imgAspect >= boxAspect) {
    drawW = contentW;
    drawH = contentW / imgAspect;
  } else {
    drawH = contentH;
    drawW = contentH * imgAspect;
  }
  const x = margin + (contentW - drawW) / 2;
  const y = margin + (contentH - drawH) / 2;
  pdf.addImage(dataUrl, 'PNG', x, y, drawW, drawH, undefined, 'FAST');
  pdf.save(filename);
}
