// ============================================================================
// SVG 完全ベクター出力
// - html-to-image のラスタ埋め込みに依存せず、Box/Line/SDSG/TimeArrow/
//   PeriodLabels/Legend を native SVG (<rect>/<text>/<path>/<polygon>) として emit
// - Illustrator / Inkscape で各要素を選択・編集可能
// - 単一ページおよび N ページ分割 (ZIP) を提供
// ============================================================================

import JSZip from 'jszip';
import type {
  Box,
  Line,
  Sheet,
  SDSG,
  ProjectSettings,
  LayoutDirection,
  LegendSettings,
  PeriodLabelSettings,
  TimeArrowSettings,
  SDSGSpaceSettings,
  TypeLabelVisibilityMap,
} from '../types';
import { computeTimeArrow } from './timeArrow';
import { computePeriodLabels } from './periodLabels';
import {
  computeSDSGBandLayout,
  sdsgBandKey,
  computeBandRowAssignments,
  computeSDSGBandPosition,
} from './sdsgSpaceLayout';
import { computeLegendItems, type LegendItem } from './legend';
import { computeContentBounds } from './fitBounds';
import { BOX_RENDER_SPECS } from '../store/defaults';
import { computeBoxDisplay } from './typeDisplay';
import { getPaperPx, type PaperSizeKey } from './paperSizes';
import type { PageBounds } from './pageSplit';
import { rectIntersectsPage } from './pageSplit';
import {
  resolveLineDirection,
  computeAngleEndpoints,
  clampAngleDeg,
} from './lineDirection';
import { resolveBoxVisuals } from './boxPreset';
import {
  computeLinePath,
  applyLinePathMargins,
  resolveEffectiveShape,
  sampleCurveToSegments,
  type Pt as LinePathPt,
} from './linePath';
import { checkAborted, type ProgressCallback } from './exportProgress';
import { resolveAttachedAnchor, anchorCenter } from './sdsgAttach';
import { resolveBetweenEndpoint } from './sdsgBetween';
import { clipPolylineToRect } from './lineClip';

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

export interface SVGNativeExportOptions {
  filename?: string;
  sheet: Sheet;
  settings: ProjectSettings;
  paperSize?: PaperSizeKey;
  scale?: boolean;              // 既定 true
  offset?: number;              // 既定 0.1
  pages?: PageBounds[];         // N ページ分割
  background?: 'white' | 'transparent';
  /** ID バッジを含めるか（Box / SDSG / Line 個別） */
  includeIds?: { box: boolean; sdsg: boolean; line: boolean };
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
}

export async function exportToSVGNative(opts: SVGNativeExportOptions): Promise<void> {
  if (!opts || !opts.sheet || !opts.settings) {
    throw new Error('exportToSVGNative: options.sheet と options.settings が必須です');
  }
  const filename = opts.filename ?? 'TEMer.svg';
  const svgs = buildSVGDocuments(opts);

  if (svgs.length === 1) {
    downloadBlob(new Blob([svgs[0]], { type: 'image/svg+xml' }), filename);
    return;
  }

  // 複数ページ → ZIP
  const baseName = filename.replace(/\.svg$/i, '');
  const zip = new JSZip();
  const padLen = String(svgs.length).length;
  for (let i = 0; i < svgs.length; i++) {
    const pageNum = String(i + 1).padStart(padLen, '0');
    zip.file(`${baseName}_page${pageNum}.svg`, svgs[i]);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `${baseName}_pages.zip`);
}

function buildSVGDocuments(opts: SVGNativeExportOptions): string[] {
  const scale = opts.scale ?? true;
  const offsetRatio = opts.offset ?? 0.1;
  const layout = opts.settings.layout;
  const isH = layout === 'horizontal';
  const paperKey: PaperSizeKey = opts.paperSize ?? (isH ? 'A4-landscape' : 'A4-portrait');
  const paper = getPaperPx(paperKey);
  const paperW = paper.width;
  const paperH = paper.height;

  const bbox = computeContentBounds(opts.sheet, layout, opts.settings)
    ?? { x: 0, y: 0, width: paperW, height: paperH };

  const pages = opts.pages && opts.pages.length > 1 ? opts.pages : null;

  const includeIds = opts.includeIds ?? { box: false, sdsg: false, line: false };

  if (!pages) {
    const t = buildTransform(bbox, paperW, paperH, scale, offsetRatio);
    const svg = renderPage(opts.sheet, opts.settings, t, paperW, paperH, opts.background, includeIds);
    return [svg];
  }

  const docs: string[] = [];
  const total = pages.length;
  for (let i = 0; i < pages.length; i++) {
    checkAborted(opts.signal);
    opts.onProgress?.({ current: i + 1, total, label: `SVG ページ ${i + 1} / ${total}` });
    const page = pages[i];
    const pageBbox = { x: page.innerX, y: page.innerY, width: page.innerWidth, height: page.innerHeight };
    const t = buildTransform(pageBbox, paperW, paperH, false, 0);
    const pageSheet = filterSheetForPage(opts.sheet, page, layout);
    // Line は原シートの全 Box を使って polyline を構築し、pageInnerRect で精密クリップ
    const svg = renderPage(
      pageSheet, opts.settings, t, paperW, paperH, opts.background, includeIds,
      opts.sheet, pageBbox,
    );
    docs.push(svg);
  }
  return docs;
}

function renderPage(
  sheet: Sheet,
  settings: ProjectSettings,
  t: Transform,
  paperW: number,
  paperH: number,
  background: 'white' | 'transparent' = 'white',
  includeIds: { box: boolean; sdsg: boolean; line: boolean } = { box: false, sdsg: false, line: false },
  lineSourceSheet?: Sheet,
  pageInnerRect?: { x: number; y: number; width: number; height: number },
): string {
  const b = new SVGBuilder(paperW, paperH);
  if (background !== 'transparent') {
    b.rect(0, 0, paperW, paperH, { fill: '#ffffff', stroke: 'none' });
  }
  // TimeArrow は原シートのレイアウトで計算してページにクリップする
  drawTimeArrow(b, lineSourceSheet ?? sheet, settings.layout, settings.timeArrow, t, settings.sdsgSpace, settings.typeLabelVisibility, pageInnerRect);
  drawPeriodLabels(b, sheet, settings.layout, settings.periodLabels, settings.timeArrow, t, settings.sdsgSpace, settings.typeLabelVisibility);
  drawLines(b, lineSourceSheet ?? sheet, settings.layout, t, includeIds.line, pageInnerRect);
  drawSDSGs(b, sheet, settings.layout, settings, t, includeIds.sdsg);
  drawBoxes(b, sheet, settings.layout, settings, t, includeIds.box);
  drawLegend(b, sheet, settings.layout, settings.legend, t);
  return b.build();
}

function filterSheetForPage(sheet: Sheet, page: PageBounds, layout: LayoutDirection): Sheet {
  const visibleBoxes = sheet.boxes.filter((bx) =>
    rectIntersectsPage({ x: bx.x, y: bx.y, width: bx.width, height: bx.height }, page),
  );
  const visibleBoxIds = new Set(visibleBoxes.map((bx) => bx.id));
  const visibleSDSGs = sheet.sdsg.filter((sg) => visibleBoxIds.has(sg.attachedTo));
  const visibleLines = sheet.lines.filter((l) => visibleBoxIds.has(l.from) && visibleBoxIds.has(l.to));
  const LEVEL = 100;
  const tStart = layout === 'horizontal' ? page.innerX / LEVEL : page.innerY / LEVEL;
  const tEnd = layout === 'horizontal'
    ? (page.innerX + page.innerWidth) / LEVEL
    : (page.innerY + page.innerHeight) / LEVEL;
  const visiblePeriodLabels = sheet.periodLabels.filter((p) => p.position >= tStart && p.position <= tEnd);
  return {
    ...sheet,
    boxes: visibleBoxes,
    sdsg: visibleSDSGs,
    lines: visibleLines,
    periodLabels: visiblePeriodLabels,
  };
}

// ----------------------------------------------------------------------------
// Transform (world px → svg px)
// ----------------------------------------------------------------------------

interface Transform {
  toX: (wx: number) => number;
  toY: (wy: number) => number;
  toLen: (p: number) => number;
  scale: number;
}

function buildTransform(
  bbox: { x: number; y: number; width: number; height: number },
  paperW: number,
  paperH: number,
  scale: boolean,
  offsetRatio: number,
): Transform {
  let sc = 1;
  let offX = 0;
  let offY = 0;
  if (scale) {
    const cw = bbox.width * (1 + offsetRatio * 2);
    const ch = bbox.height * (1 + offsetRatio * 2);
    sc = Math.min(paperW / Math.max(1, cw), paperH / Math.max(1, ch));
    const drawnW = bbox.width * sc;
    const drawnH = bbox.height * sc;
    offX = (paperW - drawnW) / 2 - bbox.x * sc;
    offY = (paperH - drawnH) / 2 - bbox.y * sc;
  } else {
    sc = 1;
    offX = (paperW - bbox.width) / 2 - bbox.x;
    offY = (paperH - bbox.height) / 2 - bbox.y;
  }
  return {
    toX: (wx) => wx * sc + offX,
    toY: (wy) => wy * sc + offY,
    toLen: (p) => p * sc,
    scale: sc,
  };
}

function fontSizeScaled(base: number, t: Transform): number {
  return Math.max(6, base * Math.max(0.4, t.scale));
}

// ----------------------------------------------------------------------------
// SVGBuilder
// ----------------------------------------------------------------------------

class SVGBuilder {
  private parts: string[] = [];
  constructor(private width: number, private height: number) {}

  private attr(name: string, value: string | number | undefined): string {
    if (value === undefined || value === '') return '';
    return ` ${name}="${escapeAttr(String(value))}"`;
  }

  rect(x: number, y: number, w: number, h: number, opts: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    strokeDasharray?: string;
    rx?: number;
    ry?: number;
  }): void {
    this.parts.push(
      `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}"` +
      this.attr('rx', opts.rx !== undefined ? fmt(opts.rx) : undefined) +
      this.attr('ry', opts.ry !== undefined ? fmt(opts.ry) : undefined) +
      this.attr('fill', opts.fill ?? 'none') +
      this.attr('stroke', opts.stroke ?? 'none') +
      this.attr('stroke-width', opts.strokeWidth !== undefined ? fmt(opts.strokeWidth) : undefined) +
      this.attr('stroke-dasharray', opts.strokeDasharray) +
      ` />`,
    );
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, opts: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    strokeDasharray?: string;
  }): void {
    this.parts.push(
      `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(rx)}" ry="${fmt(ry)}"` +
      this.attr('fill', opts.fill ?? 'none') +
      this.attr('stroke', opts.stroke ?? 'none') +
      this.attr('stroke-width', opts.strokeWidth !== undefined ? fmt(opts.strokeWidth) : undefined) +
      this.attr('stroke-dasharray', opts.strokeDasharray) +
      ` />`,
    );
  }

  line(x1: number, y1: number, x2: number, y2: number, opts: {
    stroke?: string;
    strokeWidth?: number;
    strokeDasharray?: string;
  }): void {
    this.parts.push(
      `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}"` +
      this.attr('stroke', opts.stroke ?? '#222') +
      this.attr('stroke-width', opts.strokeWidth !== undefined ? fmt(opts.strokeWidth) : undefined) +
      this.attr('stroke-dasharray', opts.strokeDasharray) +
      ` />`,
    );
  }

  polygon(points: Array<{ x: number; y: number }>, opts: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
  }): void {
    const p = points.map((pt) => `${fmt(pt.x)},${fmt(pt.y)}`).join(' ');
    this.parts.push(
      `<polygon points="${p}"` +
      this.attr('fill', opts.fill ?? 'none') +
      this.attr('stroke', opts.stroke ?? 'none') +
      this.attr('stroke-width', opts.strokeWidth !== undefined ? fmt(opts.strokeWidth) : undefined) +
      ` />`,
    );
  }

  /**
   * 矩形領域内に単純テキストを配置。
   * alignH/alignV で text-anchor と baseline-shift 的な y 補正を行う。
   */
  text(
    x: number, y: number, w: number, h: number,
    text: string,
    opts: {
      fontSize: number;
      fontFamily?: string;
      color?: string;
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      alignH?: 'left' | 'center' | 'right';
      alignV?: 'top' | 'middle' | 'bottom';
      writingMode?: 'horizontal' | 'vertical';  // 'vertical' で CJK 縦書き
      asciiUpright?: boolean;                     // 縦書き時の ASCII 向き
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      // 背景塗りと枠
      bgFill?: string;                            // undefined | 'transparent' で描画しない
      bgStroke?: string;
      bgStrokeWidth?: number;
      // 余白
      paddingX?: number;
      paddingY?: number;
    },
  ): void {
    const padX = opts.paddingX ?? 2;
    const padY = opts.paddingY ?? 2;

    // 背景・枠
    if ((opts.bgFill && opts.bgFill !== 'transparent') || (opts.bgStroke && (opts.bgStrokeWidth ?? 0) > 0)) {
      this.rect(x, y, w, h, {
        fill: opts.bgFill && opts.bgFill !== 'transparent' ? opts.bgFill : 'none',
        stroke: (opts.bgStrokeWidth ?? 0) > 0 ? (opts.bgStroke ?? '#999') : 'none',
        strokeWidth: opts.bgStrokeWidth,
      });
    }

    if (!text) return;

    const lines = String(text).split(/\r?\n/);
    const alignH = opts.alignH ?? 'center';
    const alignV = opts.alignV ?? 'middle';
    const isVert = opts.writingMode === 'vertical';

    // 行高（経験的）
    const lineHeight = opts.fontSize * 1.25;
    const blockLen = lineHeight * lines.length;

    // テキストアンカー
    const anchor = alignH === 'left' ? 'start' : alignH === 'right' ? 'end' : 'middle';

    const styleParts: string[] = [];
    if (opts.bold) styleParts.push('font-weight:bold');
    if (opts.italic) styleParts.push('font-style:italic');
    if (opts.underline) styleParts.push('text-decoration:underline');
    if (opts.fontFamily) styleParts.push(`font-family:${escapeAttr(opts.fontFamily)}`);
    const style = styleParts.length > 0 ? ` style="${styleParts.join(';')}"` : '';

    const color = opts.fill ?? opts.color ?? '#222';

    if (isVert) {
      // 縦書き (portable 方式): writing-mode CSS は editor 非対応があるため、
      // 各文字を <tspan x y> で個別配置する。列は右から左へ、行内は上から下へ。
      // 既定は全文字 upright（縦積み）。asciiUpright=false の場合は ASCII 連続を
      // 90°回転 <text transform=rotate> として書き出し、右に倒して読む形にする。
      // 各行 (元テキストの \n 区切り) = 1 列。
      const charAdvance = opts.fontSize * 1.05;
      // 各行 (=列) の文字数最大値（縦の長さ推定に使用）
      const maxChars = Math.max(1, ...lines.map((l) => Array.from(l).length));
      const colBlockLen = charAdvance * maxChars;
      const colGap = opts.fontSize * 0.25;
      const totalColsW = lines.length * (opts.fontSize + colGap);

      // 列の x 軸開始（右から左へ）
      let rightColX: number;
      if (alignH === 'left') rightColX = x + padX + totalColsW - opts.fontSize / 2;
      else if (alignH === 'right') rightColX = x + w - padX - opts.fontSize / 2;
      else rightColX = x + w / 2 + totalColsW / 2 - opts.fontSize / 2;

      // 列の y 軸開始
      let topY: number;
      switch (alignV) {
        case 'top': topY = y + padY; break;
        case 'bottom': topY = y + h - padY - colBlockLen; break;
        case 'middle':
        default: topY = y + h / 2 - colBlockLen / 2;
      }
      const asciiMixed = opts.asciiUpright === false;

      lines.forEach((ln, li) => {
        const colX = rightColX - li * (opts.fontSize + colGap);
        const chars = Array.from(ln);
        // asciiMixed: 連続 ASCII を 1 グループにし、rotate 変換で横倒し
        //   各グループは占有セル数 = ceil(ASCII 長 / 2) 程度で短縮表示（粗い近似: 1 セル/char）
        let i = 0;
        let cellIdx = 0;
        while (i < chars.length) {
          const ch = chars[i];
          const isAscii = ch.charCodeAt(0) < 0x80 && /[\x21-\x7E]/.test(ch);
          if (asciiMixed && isAscii) {
            // ASCII 連続を吸い上げ
            let j = i;
            while (j < chars.length && chars[j].charCodeAt(0) < 0x80 && /[\x21-\x7E]/.test(chars[j])) j++;
            const run = chars.slice(i, j).join('');
            const cy = topY + cellIdx * charAdvance + opts.fontSize * 0.8;
            // 90° 回転。回転後、読み方向が top→bottom となる
            this.parts.push(
              `<text x="${fmt(colX)}" y="${fmt(cy)}" fill="${escapeAttr(color)}" font-size="${fmt(opts.fontSize)}" text-anchor="start" transform="rotate(90 ${fmt(colX)} ${fmt(cy)})"${style}>${escapeText(run)}</text>`,
            );
            // ASCII run は run.length 文字分のセルを使うと見た目が崩れるので、
            // 視覚的 advance を文字数 * 0.5 程度に圧縮（英文は縦幅が短い）
            const usedCells = Math.max(1, Math.ceil(run.length * 0.5));
            cellIdx += usedCells;
            i = j;
            continue;
          }
          // CJK / その他は 1 セル上のまま配置
          const cy = topY + cellIdx * charAdvance + opts.fontSize * 0.85;
          this.parts.push(
            `<text x="${fmt(colX)}" y="${fmt(cy)}" fill="${escapeAttr(color)}" font-size="${fmt(opts.fontSize)}" text-anchor="middle"${style}>${escapeText(ch)}</text>`,
          );
          cellIdx++;
          i++;
        }
      });
      return;
    }

    // 横書き: baseline は dominant-baseline='middle' で中央、各行の y を計算
    let topY: number;
    switch (alignV) {
      case 'top': topY = y + padY + opts.fontSize; break;
      case 'bottom': topY = y + h - padY - blockLen + opts.fontSize; break;
      case 'middle':
      default: topY = y + h / 2 - blockLen / 2 + opts.fontSize;
    }
    // text-anchor 基準 X
    const tx = alignH === 'left'
      ? x + padX
      : alignH === 'right'
        ? x + w - padX
        : x + w / 2;
    lines.forEach((ln, i) => {
      const ly = topY + i * lineHeight - opts.fontSize * 0.25; // baseline 補正
      this.parts.push(
        `<text x="${fmt(tx)}" y="${fmt(ly)}" fill="${escapeAttr(color)}" font-size="${fmt(opts.fontSize)}" text-anchor="${anchor}"${style}>${escapeText(ln)}</text>`,
      );
    });
  }

  group(transform: string, inner: () => void): void {
    this.parts.push(`<g transform="${escapeAttr(transform)}">`);
    inner();
    this.parts.push(`</g>`);
  }

  /** リッチテキスト (bold/通常 混在) を 1 行で描画。Legend 説明文表示に使用 */
  richText(
    x: number, y: number, w: number, h: number,
    runs: Array<{ text: string; bold?: boolean; fontSize: number; color?: string }>,
    opts: {
      alignH?: 'left' | 'center' | 'right';
      alignV?: 'top' | 'middle' | 'bottom';
      fontFamily?: string;
    },
  ): void {
    if (runs.length === 0) return;
    const alignH = opts.alignH ?? 'left';
    const alignV = opts.alignV ?? 'middle';
    // 複数行テキスト (改行を含む) は単純化: 1 行目 = first run 改行前、2 行目 = first run 改行後 + rest
    // Legend description の用途: [{text: 'label', bold:true, fs}, {text: '\ndesc', fs*0.85}]
    // → 2 行レイアウト想定
    const lineBlocks: Array<Array<{ text: string; bold?: boolean; fontSize: number; color?: string }>> = [];
    let current: typeof lineBlocks[number] = [];
    for (const r of runs) {
      const parts = r.text.split(/\r?\n/);
      parts.forEach((p, i) => {
        if (i > 0) {
          lineBlocks.push(current);
          current = [];
        }
        if (p.length > 0) current.push({ ...r, text: p });
      });
    }
    if (current.length > 0) lineBlocks.push(current);
    if (lineBlocks.length === 0) return;

    const fontSizes = lineBlocks.map((ln) => Math.max(...ln.map((r) => r.fontSize), 1));
    const lineHeights = fontSizes.map((fs) => fs * 1.25);
    const blockLen = lineHeights.reduce((a, b) => a + b, 0);

    let topY: number;
    switch (alignV) {
      case 'top': topY = y + 2 + fontSizes[0]; break;
      case 'bottom': topY = y + h - blockLen + fontSizes[0]; break;
      case 'middle':
      default: topY = y + h / 2 - blockLen / 2 + fontSizes[0];
    }

    const style = opts.fontFamily ? ` style="font-family:${escapeAttr(opts.fontFamily)}"` : '';
    const startX = alignH === 'right' ? x + w - 2 : alignH === 'center' ? x + w / 2 : x + 2;

    lineBlocks.forEach((line, i) => {
      const ly = topY + lineHeights.slice(0, i).reduce((a, b) => a + b, 0) - fontSizes[i] * 0.25;
      const totalTextWidth = line.reduce((a, r) => a + estimateTextWidth(r.text, r.fontSize), 0);
      let cursorX: number;
      if (alignH === 'center') cursorX = startX - totalTextWidth / 2;
      else if (alignH === 'right') cursorX = startX - totalTextWidth;
      else cursorX = startX;
      line.forEach((r) => {
        const boldAttr = r.bold ? ` font-weight="bold"` : '';
        this.parts.push(
          `<text x="${fmt(cursorX)}" y="${fmt(ly)}" fill="${escapeAttr(r.color ?? '#222')}" font-size="${fmt(r.fontSize)}" text-anchor="start"${boldAttr}${style}>${escapeText(r.text)}</text>`,
        );
        cursorX += estimateTextWidth(r.text, r.fontSize);
      });
    });
  }

  build(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n`
      + `<svg xmlns="http://www.w3.org/2000/svg" `
      + `viewBox="0 0 ${fmt(this.width)} ${fmt(this.height)}" `
      + `width="${fmt(this.width)}" height="${fmt(this.height)}" `
      + `font-family="sans-serif">\n`
      + this.parts.join('\n')
      + `\n</svg>\n`;
  }
}

function estimateTextWidth(text: string, fontSize: number): number {
  // 極めて粗い推定 (CJK:1em, ASCII:0.5em)。richText の折り返しに使用
  let w = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    w += code < 128 ? fontSize * 0.55 : fontSize;
  }
  return w;
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Number(n.toFixed(3)).toString();
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function normalizeColor(c: string | undefined, fallback: string): string {
  if (!c) return fallback;
  return c;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ----------------------------------------------------------------------------
// 矢印頭部 (polygon) 補助
// ----------------------------------------------------------------------------

function drawArrowHead(
  b: SVGBuilder,
  tipX: number, tipY: number,
  fromX: number, fromY: number,
  strokeWidth: number,
  color: string,
): void {
  const dx = tipX - fromX;
  const dy = tipY - fromY;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const headLen = Math.max(5, strokeWidth * 4);
  const headWidth = Math.max(3, strokeWidth * 2.5);
  const baseX = tipX - ux * headLen;
  const baseY = tipY - uy * headLen;
  const leftX = baseX + px * headWidth;
  const leftY = baseY + py * headWidth;
  const rightX = baseX - px * headWidth;
  const rightY = baseY - py * headWidth;
  b.polygon(
    [
      { x: tipX, y: tipY },
      { x: leftX, y: leftY },
      { x: rightX, y: rightY },
    ],
    { fill: color, stroke: 'none' },
  );
}

// ----------------------------------------------------------------------------
// Box
// ----------------------------------------------------------------------------

function drawBoxes(b: SVGBuilder, sheet: Sheet, layout: LayoutDirection, settings: ProjectSettings, t: Transform, includeIds = false) {
  for (const bx of sheet.boxes) {
    renderBox(b, bx, layout, settings, sheet, t);
    if (includeIds) drawBoxIdBadge(b, bx, t);
  }
}

function drawBoxIdBadge(b: SVGBuilder, bx: Box, t: Transform) {
  const offX = bx.idOffsetX ?? 0;
  const offY = bx.idOffsetY ?? 0;
  const fs = bx.idFontSize ?? 9;
  const id = bx.id.length > 14 ? bx.id.slice(0, 14) + '…' : bx.id;
  const cx = t.toX(bx.x + 8 + offX);
  const cy = t.toY(bx.y - 2 + offY);
  const w = id.length * fs * 0.62 + 6;
  const h = fs + 2;
  b.rect(cx - 3, cy - h / 2, w, h, { fill: '#ffffff', stroke: 'none' });
  (b as unknown as { parts: string[] }).parts.push(
    `<text x="${fmt(cx)}" y="${fmt(cy + fs * 0.35)}" fill="#666" font-size="${fmt(fs)}" text-anchor="start" style="font-family:monospace">${escapeText(id)}</text>`,
  );
}

function renderBox(
  b: SVGBuilder,
  bx: Box,
  layout: LayoutDirection,
  settings: ProjectSettings,
  sheet: Sheet,
  t: Transform,
) {
  const x = t.toX(bx.x);
  const y = t.toY(bx.y);
  const w = t.toLen(bx.width);
  const h = t.toLen(bx.height);
  const visuals = resolveBoxVisuals(bx, settings);
  const borderColor = normalizeColor(visuals.borderColor, '#222');
  const fill = normalizeColor(visuals.backgroundColor, '#ffffff');
  const isEllipse = visuals.shape === 'ellipse';

  const drawShape = (sx: number, sy: number, sw: number, sh: number, strokeW: number, dash: string | undefined, fillC: string) => {
    if (isEllipse) {
      b.ellipse(sx + sw / 2, sy + sh / 2, sw / 2, sh / 2, {
        fill: fillC, stroke: borderColor, strokeWidth: strokeW, strokeDasharray: dash,
      });
    } else {
      b.rect(sx, sy, sw, sh, {
        fill: fillC, stroke: borderColor, strokeWidth: strokeW, strokeDasharray: dash,
      });
    }
  };

  switch (bx.type) {
    case 'EFP':
    case '2nd-EFP': {
      drawShape(x, y, w, h, 1, undefined, fill);
      const ins = Math.max(1.5, 0.025 * Math.min(w, h));
      drawShape(x + ins, y + ins, Math.max(0.5, w - ins * 2), Math.max(0.5, h - ins * 2), 1, undefined, 'none');
      break;
    }
    case 'OPP':
      drawShape(x, y, w, h, 3, undefined, fill);
      break;
    case 'P-EFP':
    case 'P-2nd-EFP': {
      drawShape(x, y, w, h, 1.5, '5 3', fill);
      const inset = Math.max(1.5, 0.03 * Math.min(w, h));
      drawShape(x + inset, y + inset, Math.max(0.5, w - inset * 2), Math.max(0.5, h - inset * 2), 1.5, '5 3', 'none');
      break;
    }
    case 'annotation':
      drawShape(x, y, w, h, 1, '2 2', fill);
      break;
    case 'BFP':
      drawShape(x, y, w, h, 2, undefined, fill);
      break;
    default:
      drawShape(x, y, w, h, 1.5, undefined, fill);
  }

  // 本文テキスト
  const isTextVertical = bx.textOrientation === 'vertical';
  b.text(x, y, w, h, bx.label, {
    fontSize: fontSizeScaled(visuals.fontSize ?? settings.defaultFontSize, t),
    fontFamily: visuals.fontFamily,
    color: normalizeColor(visuals.color, '#222'),
    bold: visuals.bold,
    italic: visuals.italic,
    underline: bx.style?.underline,
    alignH: (bx.style?.textAlign ?? 'center') as 'left' | 'center' | 'right',
    alignV: (bx.style?.verticalAlign ?? 'middle') as 'top' | 'middle' | 'bottom',
    writingMode: isTextVertical ? 'vertical' : 'horizontal',
    asciiUpright: bx.asciiUpright,
  });

  drawBoxTypeLabel(b, bx, layout, settings, sheet, t);
  drawBoxSubLabel(b, bx, layout, settings, t);
}

function drawBoxTypeLabel(
  b: SVGBuilder, bx: Box, layout: LayoutDirection, settings: ProjectSettings, sheet: Sheet, t: Transform,
) {
  if (bx.type === 'normal' || bx.type === 'annotation') return;
  const vis = settings.typeLabelVisibility;
  if (vis && (vis as Record<string, boolean | undefined>)[bx.type] === false) return;
  const typeText = computeBoxDisplay(sheet.boxes, bx, layout);
  if (!typeText) return;

  const isH = layout === 'horizontal';
  const baseFS = bx.typeLabelFontSize ?? 11;
  const fs = fontSizeScaled(baseFS, t);
  const bold = bx.typeLabelBold !== false;
  const italic = !!bx.typeLabelItalic;
  const fontFace = bx.typeLabelFontFamily;
  const visuals = resolveBoxVisuals(bx, settings);
  const textColor = normalizeColor(visuals.typeLabelColor, '#222');
  const bgFill = visuals.typeLabelBackgroundColor && visuals.typeLabelBackgroundColor !== 'transparent'
    ? visuals.typeLabelBackgroundColor : undefined;
  const borderW = visuals.typeLabelBorderWidth ?? 0;
  const borderColor = visuals.typeLabelBorderColor;

  if (isH) {
    const wpx = Math.max(60, bx.width);
    const hpx = Math.max(14, baseFS * 1.8);
    b.text(
      t.toX(bx.x + bx.width / 2 - wpx / 2),
      t.toY(bx.y - hpx - 4),
      t.toLen(wpx), t.toLen(hpx),
      typeText,
      {
        fontSize: fs, bold, italic, fontFamily: fontFace, color: textColor,
        alignH: 'center', alignV: 'bottom',
        bgFill, bgStroke: borderColor, bgStrokeWidth: borderW,
      },
    );
  } else {
    const wpx = Math.max(14, baseFS * 1.8);
    const hpx = Math.max(60, bx.height);
    b.text(
      t.toX(bx.x - wpx - 4),
      t.toY(bx.y + bx.height / 2 - hpx / 2),
      t.toLen(wpx), t.toLen(hpx),
      typeText,
      {
        fontSize: fs, bold, italic, fontFamily: fontFace, color: textColor,
        alignH: 'center', alignV: 'middle',
        writingMode: 'vertical', asciiUpright: bx.typeLabelAsciiUpright ?? bx.asciiUpright,
        bgFill, bgStroke: borderColor, bgStrokeWidth: borderW,
      },
    );
  }
}

function drawBoxSubLabel(b: SVGBuilder, bx: Box, layout: LayoutDirection, settings: ProjectSettings, t: Transform) {
  const text = bx.subLabel ?? bx.participantId;
  if (!text) return;
  const isH = layout === 'horizontal';
  const baseFS = bx.subLabelFontSize ?? 10;
  const fs = fontSizeScaled(baseFS, t);
  const offX = bx.subLabelOffsetX ?? 0;
  const offY = bx.subLabelOffsetY ?? 0;
  const visuals = resolveBoxVisuals(bx, settings);
  const textColor = normalizeColor(visuals.subLabelColor, '#555');
  const bgFill = visuals.subLabelBackgroundColor && visuals.subLabelBackgroundColor !== 'transparent'
    ? visuals.subLabelBackgroundColor : undefined;
  const borderW = visuals.subLabelBorderWidth ?? 0;
  const borderColor = visuals.subLabelBorderColor;

  if (isH) {
    const wpx = Math.max(80, bx.width);
    const hpx = Math.max(14, baseFS * 1.6);
    b.text(
      t.toX(bx.x + bx.width / 2 - wpx / 2 + offX),
      t.toY(bx.y + bx.height + 6 + offY),
      t.toLen(wpx), t.toLen(hpx),
      text,
      {
        fontSize: fs, color: textColor,
        alignH: 'center', alignV: 'top',
        bgFill, bgStroke: borderColor, bgStrokeWidth: borderW,
      },
    );
  } else {
    const wpx = Math.max(14, baseFS * 1.6);
    const hpx = Math.max(80, bx.height);
    b.text(
      t.toX(bx.x + bx.width + 6 + offX),
      t.toY(bx.y + bx.height / 2 - hpx / 2 + offY),
      t.toLen(wpx), t.toLen(hpx),
      text,
      {
        fontSize: fs, color: textColor,
        alignH: 'center', alignV: 'middle',
        writingMode: 'vertical', asciiUpright: bx.subLabelAsciiUpright ?? bx.asciiUpright,
        bgFill, bgStroke: borderColor, bgStrokeWidth: borderW,
      },
    );
  }
}

// ----------------------------------------------------------------------------
// Line
// ----------------------------------------------------------------------------

interface Pt { x: number; y: number; }

function drawLines(
  b: SVGBuilder, sheet: Sheet, layout: LayoutDirection, t: Transform,
  includeIds = false,
  pageInnerRect?: { x: number; y: number; width: number; height: number },
) {
  const byId = new Map(sheet.boxes.map((bx) => [bx.id, bx]));
  const dashedEndpoints = new Set(['annotation', 'P-EFP', 'P-2nd-EFP']);

  for (const l of sheet.lines) {
    const fromOrig = byId.get(l.from);
    const toOrig = byId.get(l.to);
    if (!fromOrig || !toOrig) continue;
    const connectsDashed = dashedEndpoints.has(fromOrig.type) || dashedEndpoints.has(toOrig.type);
    const shouldDash = l.type === 'XLine' || connectsDashed;
    const effectiveShape = resolveEffectiveShape(l);
    const color = normalizeColor(l.style?.color, '#222');
    const strokeW = l.style?.strokeWidth ?? 1.5;
    const dashArray = shouldDash ? '6 4' : undefined;

    // === 全形状を polyline 形式に正規化 ===
    //   curve (Bezier) は pageInnerRect 指定時のみ polyline 化し、さもなくば Bezier のまま描画
    //   elbow は常に polyline
    //   straight は [start, end] の 2 点 polyline
    let polyline: Pt[] = [];
    let bezierPts: LinePathPt[] | null = null;
    let elbowMid: Pt | null = null;

    if (effectiveShape === 'elbow' || effectiveShape === 'curve') {
      const resolved = resolveLineDirection(l, fromOrig, toOrig, layout);
      const resolvedLine: Line = {
        ...l,
        startMargin: resolved.startMargin,
        endMargin: resolved.endMargin,
        startOffsetTime: resolved.startOffsetTime,
        endOffsetTime: resolved.endOffsetTime,
        startOffsetItem: resolved.startOffsetItem,
        endOffsetItem: resolved.endOffsetItem,
      };
      const path = applyLinePathMargins(
        computeLinePath(resolvedLine, resolved.from, resolved.to, layout),
        resolved.startMargin,
        resolved.endMargin,
      );
      if (effectiveShape === 'curve' && path.kind === 'curve') {
        bezierPts = path.points;
        polyline = sampleCurveToSegments(path, 24);
      } else if (path.kind === 'elbow' && path.points.length >= 4) {
        polyline = path.points;
        elbowMid = { x: (path.points[1].x + path.points[2].x) / 2, y: (path.points[1].y + path.points[2].y) / 2 };
      } else {
        polyline = path.points;
      }
    } else {
      const seg = computeLineSegment(l, byId, layout);
      if (!seg) continue;
      polyline = [{ x: seg.sx, y: seg.sy }, { x: seg.ex, y: seg.ey }];
    }

    // === クリップ分岐 ===
    if (pageInnerRect) {
      const pieces = clipPolylineToRect(polyline, pageInnerRect);
      if (pieces.length === 0) continue;
      for (const piece of pieces) {
        if (piece.points.length < 2) continue;
        const d = piece.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${fmt(t.toX(p.x))},${fmt(t.toY(p.y))}`).join(' ');
        (b as unknown as { parts: string[] }).parts.push(
          `<path d="${d}" fill="none" stroke="${color}" stroke-width="${fmt(strokeW)}"` +
          (dashArray ? ` stroke-dasharray="${dashArray}"` : '') +
          ` />`,
        );
        if (piece.endsAtOriginalEnd) {
          const last = piece.points[piece.points.length - 1];
          const prev = piece.points[piece.points.length - 2];
          drawArrowHead(b, t.toX(last.x), t.toY(last.y), t.toX(prev.x), t.toY(prev.y), strokeW, color);
          if (includeIds) {
            const midIdx = Math.floor(piece.points.length / 2);
            drawLineIdBadge(b, l, t.toX(piece.points[midIdx].x), t.toY(piece.points[midIdx].y));
          }
        }
      }
      continue;
    }

    // === クリップなし: 元の形状を最大限保持して出力 ===
    if (bezierPts) {
      const [p0, c1, c2, p1] = bezierPts;
      const d = `M ${fmt(t.toX(p0.x))},${fmt(t.toY(p0.y))} `
        + `C ${fmt(t.toX(c1.x))},${fmt(t.toY(c1.y))} `
        + `${fmt(t.toX(c2.x))},${fmt(t.toY(c2.y))} `
        + `${fmt(t.toX(p1.x))},${fmt(t.toY(p1.y))}`;
      (b as unknown as { parts: string[] }).parts.push(
        `<path d="${d}" fill="none" stroke="${color}" stroke-width="${fmt(strokeW)}"` +
        (dashArray ? ` stroke-dasharray="${dashArray}"` : '') +
        ` />`,
      );
      drawArrowHead(b, t.toX(p1.x), t.toY(p1.y), t.toX(c2.x), t.toY(c2.y), strokeW, color);
      if (includeIds) {
        // Bezier t=0.5
        const mt = 0.5, mm = 0.5;
        const midWX = mm*mm*mm*p0.x + 3*mm*mm*mt*c1.x + 3*mm*mt*mt*c2.x + mt*mt*mt*p1.x;
        const midWY = mm*mm*mm*p0.y + 3*mm*mm*mt*c1.y + 3*mm*mt*mt*c2.y + mt*mt*mt*p1.y;
        drawLineIdBadge(b, l, t.toX(midWX), t.toY(midWY));
      }
    } else if (polyline.length >= 2) {
      const d = polyline.map((p, i) => `${i === 0 ? 'M' : 'L'} ${fmt(t.toX(p.x))},${fmt(t.toY(p.y))}`).join(' ');
      (b as unknown as { parts: string[] }).parts.push(
        `<path d="${d}" fill="none" stroke="${color}" stroke-width="${fmt(strokeW)}"` +
        (dashArray ? ` stroke-dasharray="${dashArray}"` : '') +
        ` />`,
      );
      const last = polyline[polyline.length - 1];
      const prev = polyline[polyline.length - 2];
      drawArrowHead(b, t.toX(last.x), t.toY(last.y), t.toX(prev.x), t.toY(prev.y), strokeW, color);
      if (includeIds) {
        const mid = elbowMid ?? { x: (polyline[0].x + last.x) / 2, y: (polyline[0].y + last.y) / 2 };
        drawLineIdBadge(b, l, t.toX(mid.x), t.toY(mid.y));
      }
    }
  }
}

// Liang-Barsky clipper は ./lineClip.ts へ分離 (上部 import 済 / re-export)

function drawLineIdBadge(b: SVGBuilder, l: Line, cx: number, cy: number) {
  const offX = l.idOffsetX ?? 0;
  const offY = l.idOffsetY ?? -12;
  const fs = l.idFontSize ?? 9;
  const id = l.id.length > 14 ? l.id.slice(0, 14) + '…' : l.id;
  const w = id.length * fs * 0.6 + 6;
  const h = fs + 2;
  const x = cx + offX;
  const y = cy + offY;
  b.rect(x - w / 2, y - h / 2, w, h, { fill: '#ffffff', stroke: 'none', rx: 2, ry: 2 });
  (b as unknown as { parts: string[] }).parts.push(
    `<text x="${fmt(x)}" y="${fmt(y + fs * 0.35)}" fill="#666" font-size="${fmt(fs)}" text-anchor="middle" style="font-family:monospace">${escapeText(id)}</text>`,
  );
}

function computeLineSegment(
  l: Line, byId: Map<string, Box>, layout: LayoutDirection,
): { sx: number; sy: number; ex: number; ey: number } | null {
  const fromOrig = byId.get(l.from);
  const toOrig = byId.get(l.to);
  if (!fromOrig || !toOrig) return null;
  const isH = layout === 'horizontal';
  const resolved = resolveLineDirection(l, fromOrig, toOrig, layout);
  const from = resolved.from;
  const to = resolved.to;

  if (l.angleMode) {
    const ep = computeAngleEndpoints(from, to, clampAngleDeg(l.angleDeg), layout);
    const sOffT = resolved.startOffsetTime;
    const eOffT = resolved.endOffsetTime;
    const sOffI = resolved.startOffsetItem;
    const eOffI = resolved.endOffsetItem;
    const sDx = isH ? sOffT : sOffI;
    const sDy = isH ? -sOffI : sOffT;
    const eDx = isH ? eOffT : eOffI;
    const eDy = isH ? -eOffI : eOffT;
    return {
      sx: ep.sx + sDx, sy: ep.sy + sDy,
      ex: ep.ex + eDx, ey: ep.ey + eDy,
    };
  }

  const x1 = isH ? from.x + from.width : from.x + from.width / 2;
  const y1 = isH ? from.y + from.height / 2 : from.y + from.height;
  const x2 = isH ? to.x : to.x + to.width / 2;
  const y2 = isH ? to.y + to.height / 2 : to.y;
  const sOffT = resolved.startOffsetTime;
  const eOffT = resolved.endOffsetTime;
  const sOffI = resolved.startOffsetItem;
  const eOffI = resolved.endOffsetItem;
  const sDx = isH ? sOffT : sOffI;
  const sDy = isH ? -sOffI : sOffT;
  const eDx = isH ? eOffT : eOffI;
  const eDy = isH ? -eOffI : eOffT;
  const sx0 = x1 + sDx;
  const sy0 = y1 + sDy;
  const tx0 = x2 + eDx;
  const ty0 = y2 + eDy;
  const dxs = tx0 - sx0;
  const dys = ty0 - sy0;
  const len = Math.sqrt(dxs * dxs + dys * dys) || 1;
  const ux = dxs / len;
  const uy = dys / len;
  return {
    sx: sx0 + ux * resolved.startMargin,
    sy: sy0 + uy * resolved.startMargin,
    ex: tx0 - ux * resolved.endMargin,
    ey: ty0 - uy * resolved.endMargin,
  };
}

// ----------------------------------------------------------------------------
// SDSG: 右向き矢印 polygon を回転で配置
// ----------------------------------------------------------------------------

function drawSDSGs(
  b: SVGBuilder, sheet: Sheet, layout: LayoutDirection, settings: ProjectSettings, t: Transform,
  includeIds = false,
) {
  const isH = layout === 'horizontal';

  // O(1) lookup: SDSG attach の解決に使う
  const boxById = new Map(sheet.boxes.map((bx) => [bx.id, bx]));
  const lineById = new Map(sheet.lines.map((l) => [l.id, l]));

  // band モード事前計算（PPTX と同ロジック）
  const bandEntries: Record<'top' | 'bottom', Array<{ id: string; timeStart: number; timeEnd: number; rowOverride?: number }>> = { top: [], bottom: [] };
  sheet.sdsg.forEach((sg) => {
    const bk = sdsgBandKey(sg);
    if (!bk) return;
    let tS: number, tE: number;
    if (sg.anchorMode === 'between' && sg.attachedTo2) {
      const ep1 = resolveBetweenEndpoint(sg.attachedTo, boxById, lineById, isH);
      const ep2 = resolveBetweenEndpoint(sg.attachedTo2, boxById, lineById, isH);
      if (!ep1 || !ep2) return;
      const mode = sg.betweenMode ?? 'edge-to-edge';
      const left = ep1.timeStart <= ep2.timeStart ? ep1 : ep2;
      const right = ep1.timeStart <= ep2.timeStart ? ep2 : ep1;
      if (mode === 'edge-to-edge') { tS = left.timeStart; tE = right.timeStart + right.timeSize; }
      else { tS = left.timeStart + left.timeSize / 2; tE = right.timeStart + right.timeSize / 2; }
    } else {
      const attached = boxById.get(sg.attachedTo);
      if (!attached) return;
      const centerT = isH ? attached.x + attached.width / 2 : attached.y + attached.height / 2;
      const w0 = sg.spaceWidth ?? sg.width ?? 70;
      tS = centerT - w0 / 2; tE = centerT + w0 / 2;
    }
    bandEntries[bk].push({ id: sg.id, timeStart: tS, timeEnd: tE, rowOverride: sg.spaceRowOverride });
  });
  // 帯の高さ算出には autoArrange に関わらず row 数を反映する（縦重ねに帯背景を合わせる）。
  const topRowsAll = computeBandRowAssignments(bandEntries.top);
  const bottomRowsAll = computeBandRowAssignments(bandEntries.bottom);
  const topRows = settings.sdsgSpace?.autoArrange ? topRowsAll : new Map<string, number>();
  const bottomRows = settings.sdsgSpace?.autoArrange ? bottomRowsAll : new Map<string, number>();
  const topTotal = Math.max(1, ...Array.from(topRowsAll.values()).map((v) => v + 1));
  const bottomTotal = Math.max(1, ...Array.from(bottomRowsAll.values()).map((v) => v + 1));
  const bandLayout = computeSDSGBandLayout(sheet, layout, settings, { top: topTotal, bottom: bottomTotal });

  for (const sg of sheet.sdsg) {
    let wx: number, wy: number, w: number, h: number;

    const bk = sdsgBandKey(sg);
    const bandEnabled = settings.sdsgSpace?.enabled;
    const band = bandEnabled && (bk === 'top' ? bandLayout.topBand : bk === 'bottom' ? bandLayout.bottomBand : undefined);
    let flipDirection = false;
    if (bk && band) {
      const entry = bandEntries[bk].find((e) => e.id === sg.id);
      if (!entry) continue;
      const rowMap = bk === 'top' ? topRows : bottomRows;
      const totalRows = bk === 'top' ? topTotal : bottomTotal;
      const rowIdx = rowMap.get(sg.id) ?? 0;
      const timeAnchor = (entry.timeStart + entry.timeEnd) / 2;
      const timeWidth = Math.max(10, entry.timeEnd - entry.timeStart);
      const bandSettings = bk === 'top' ? settings.sdsgSpace?.bands.top : settings.sdsgSpace?.bands.bottom;
      const pos = computeSDSGBandPosition(band, layout, timeAnchor, timeWidth, rowIdx, totalRows, sg, bk,
        { shrinkToFitRow: bandSettings?.shrinkToFitRow !== false });
      wx = pos.x; wy = pos.y; w = pos.width; h = pos.height;
      const autoFlip = settings.sdsgSpace?.autoFlipDirectionInBand ?? false;
      flipDirection = autoFlip && ((bk === 'top' && sg.type === 'SG') || (bk === 'bottom' && sg.type === 'SD'));
    } else if (sg.anchorMode === 'between' && sg.attachedTo2) {
      const ep1 = resolveBetweenEndpoint(sg.attachedTo, boxById, lineById, isH);
      const ep2 = resolveBetweenEndpoint(sg.attachedTo2, boxById, lineById, isH);
      if (!ep1 || !ep2) continue;
      const mode = sg.betweenMode ?? 'edge-to-edge';
      const left = ep1.timeStart <= ep2.timeStart ? ep1 : ep2;
      const right = ep1.timeStart <= ep2.timeStart ? ep2 : ep1;
      let startPos: number, endPos: number;
      if (mode === 'edge-to-edge') {
        startPos = left.timeStart;
        endPos = right.timeStart + right.timeSize;
      } else {
        startPos = left.timeStart + left.timeSize / 2;
        endPos = right.timeStart + right.timeSize / 2;
      }
      const timeCenter = (startPos + endPos) / 2;
      const timeSpan = Math.max(10, Math.abs(endPos - startPos));
      const itemCenter = (ep1.itemCenter + ep2.itemCenter) / 2;
      w = isH ? timeSpan : (sg.width ?? 70);
      h = isH ? (sg.height ?? 40) : timeSpan;
      const anchorX = isH ? timeCenter : itemCenter;
      const anchorY = isH ? itemCenter : timeCenter;
      wx = anchorX - w / 2 + (isH ? (sg.timeOffset ?? 0) : (sg.itemOffset ?? 0));
      wy = anchorY - h / 2 + (isH ? (sg.itemOffset ?? 0) : (sg.timeOffset ?? 0));
    } else {
      const anchor = resolveAttachedAnchor(sg, boxById, lineById);
      if (!anchor) continue;
      const { x: anchorX, y: anchorY } = anchorCenter(anchor);
      const timeOff = sg.timeOffset ?? 0;
      const itemOff = sg.itemOffset ?? 0;
      w = sg.width ?? 70;
      h = sg.height ?? 40;
      wx = anchorX - w / 2 + (isH ? timeOff : itemOff);
      wy = anchorY - h / 2 + (isH ? itemOff : timeOff);
    }

    const effectiveType = flipDirection ? (sg.type === 'SD' ? 'SG' : 'SD') : sg.type;
    const isSD = effectiveType === 'SD';
    const bgColor = normalizeColor(sg.style?.backgroundColor, '#ffffff');
    const borderColor = normalizeColor(sg.style?.borderColor, '#333');
    const rectRatio = Math.max(0.05, Math.min(0.95, sg.rectRatio ?? 0.55));

    // 方向別の polygon を直接生成
    // bbox: (wx, wy, w, h) で、矢印の「方向」は layout × type で決まる
    // H SD: 下向き / H SG: 上向き / V SD: 右向き / V SG: 左向き
    const points = buildSDSGPolygon(wx, wy, w, h, isH, isSD, rectRatio);
    const svgPoints = points.map((p) => ({ x: t.toX(p.x), y: t.toY(p.y) }));
    b.polygon(svgPoints, { fill: bgColor, stroke: borderColor, strokeWidth: 1.5 });

    // ラベル領域: pentagon (五角形全体) / rect (矩形部分のみ)
    const labelArea = sg.labelArea ?? 'pentagon';
    const sgTriRatio = 1 - rectRatio;
    let tx2 = wx, ty2 = wy, tw2 = w, th2 = h;
    if (labelArea === 'rect') {
      if (isH) {
        if (isSD) { th2 = h * rectRatio; }
        else      { ty2 = wy + h * sgTriRatio; th2 = h * rectRatio; }
      } else {
        if (isSD) { tx2 = wx + w * sgTriRatio; tw2 = w * rectRatio; }
        else      { tw2 = w * rectRatio; }
      }
    }
    tx2 += sg.labelOffsetX ?? 0;
    ty2 += sg.labelOffsetY ?? 0;
    b.text(
      t.toX(tx2), t.toY(ty2), t.toLen(tw2), t.toLen(th2),
      sg.label,
      {
        fontSize: fontSizeScaled(sg.style?.fontSize ?? 11, t),
        bold: sg.style?.bold ?? true,
        italic: sg.style?.italic,
        underline: sg.style?.underline,
        color: normalizeColor(sg.style?.color, '#222'),
        fontFamily: sg.style?.fontFamily,
        alignH: (sg.style?.textAlign ?? 'center') as 'left' | 'center' | 'right',
        alignV: (sg.style?.verticalAlign ?? 'middle') as 'top' | 'middle' | 'bottom',
        asciiUpright: sg.asciiUpright,
      },
    );

    drawSDSGTypeLabel(b, sg, wx, wy, w, h, isH, settings, t);
    drawSDSGSubLabel(b, sg, wx, wy, w, h, isH, t);
    if (includeIds) drawSDSGIdBadge(b, sg, wx, wy, h, isH, isSD, t);
  }
}

function drawSDSGIdBadge(b: SVGBuilder, sg: SDSG, wx: number, wy: number, sgH: number, isH: boolean, isSD: boolean, t: Transform) {
  const offX = sg.idOffsetX ?? 0;
  const offY = sg.idOffsetY ?? 0;
  const fs = sg.idFontSize ?? 9;
  const id = sg.id.length > 14 ? sg.id.slice(0, 14) + '…' : sg.id;
  // 横型 SG（描画上 SG）は下辺の上に被せる、それ以外は上辺左寄り（従来通り）
  const idAtBottom = isH && !isSD;
  const cx = t.toX(wx + 8 + offX);
  const cy = idAtBottom ? t.toY(wy + sgH - 2 + offY) : t.toY(wy - 2 + offY);
  const badgeW = id.length * fs * 0.62 + 6;
  const badgeH = fs + 2;
  b.rect(cx - 3, cy - badgeH / 2, badgeW, badgeH, { fill: '#ffffff', stroke: 'none' });
  (b as unknown as { parts: string[] }).parts.push(
    `<text x="${fmt(cx)}" y="${fmt(cy + fs * 0.35)}" fill="#666" font-size="${fmt(fs)}" text-anchor="start" style="font-family:monospace">${escapeText(id)}</text>`,
  );
}

/**
 * SDSG 矢印 polygon を方向別に生成。
 * bbox: (x, y, w, h)。rectRatio = 矩形部分の占める比率。
 * H SD: 下向き / H SG: 上向き / V SD: 右向き / V SG: 左向き
 */
function buildSDSGPolygon(x: number, y: number, w: number, h: number, isH: boolean, isSD: boolean, rectRatio: number): Pt[] {
  const neckRatio = 0.6; // 首の幅を bbox の 60% に
  if (isH) {
    if (isSD) {
      // 下向き: 矩形上側 rectRatio*h、下側が三角（頂点下）
      const neckW = w * neckRatio;
      const neckCx = x + w / 2;
      const rectBottom = y + h * rectRatio;
      return [
        { x: x + (w - neckW) / 2, y: y },                      // top-left neck
        { x: x + (w + neckW) / 2, y: y },                      // top-right neck
        { x: x + (w + neckW) / 2, y: rectBottom },             // neck-head junction R
        { x: x + w,              y: rectBottom },              // head right shoulder
        { x: neckCx,             y: y + h },                   // tip (bottom)
        { x: x,                  y: rectBottom },              // head left shoulder
        { x: x + (w - neckW) / 2, y: rectBottom },             // neck-head junction L
      ];
    }
    // 上向き (SG): 矩形下側 rectRatio*h、上側が三角
    const neckW = w * neckRatio;
    const neckCx = x + w / 2;
    const rectTop = y + h * (1 - rectRatio);
    return [
      { x: x + (w - neckW) / 2, y: y + h },
      { x: x + (w + neckW) / 2, y: y + h },
      { x: x + (w + neckW) / 2, y: rectTop },
      { x: x + w,              y: rectTop },
      { x: neckCx,             y: y },
      { x: x,                  y: rectTop },
      { x: x + (w - neckW) / 2, y: rectTop },
    ];
  }
  // vertical layout
  if (isSD) {
    // 右向き: 矩形左 rectRatio*w、右側が三角
    const neckH = h * neckRatio;
    const neckCy = y + h / 2;
    const rectRight = x + w * rectRatio;
    return [
      { x: x, y: y + (h - neckH) / 2 },
      { x: x, y: y + (h + neckH) / 2 },
      { x: rectRight, y: y + (h + neckH) / 2 },
      { x: rectRight, y: y + h },
      { x: x + w, y: neckCy },
      { x: rectRight, y: y },
      { x: rectRight, y: y + (h - neckH) / 2 },
    ];
  }
  // 左向き (V SG): 矩形右 rectRatio*w、左側が三角
  const neckH = h * neckRatio;
  const neckCy = y + h / 2;
  const rectLeft = x + w * (1 - rectRatio);
  return [
    { x: x + w, y: y + (h - neckH) / 2 },
    { x: x + w, y: y + (h + neckH) / 2 },
    { x: rectLeft, y: y + (h + neckH) / 2 },
    { x: rectLeft, y: y + h },
    { x: x,        y: neckCy },
    { x: rectLeft, y: y },
    { x: rectLeft, y: y + (h - neckH) / 2 },
  ];
}

function drawSDSGTypeLabel(
  b: SVGBuilder, sg: SDSG, wx: number, wy: number, w: number, h: number, isH: boolean,
  settings: ProjectSettings, t: Transform,
) {
  const vis = settings.typeLabelVisibility;
  if (vis && (vis as Record<string, boolean | undefined>)[sg.type] === false) return;
  const baseFS = sg.typeLabelFontSize ?? 11;
  const fs = fontSizeScaled(baseFS, t);
  const bold = sg.typeLabelBold !== false;
  const italic = !!sg.typeLabelItalic;
  const fontFace = sg.typeLabelFontFamily;
  const textColor = normalizeColor(sg.typeLabelColor, '#222');
  const bgFill = sg.typeLabelBackgroundColor && sg.typeLabelBackgroundColor !== 'transparent'
    ? sg.typeLabelBackgroundColor : undefined;
  const borderW = sg.typeLabelBorderWidth ?? 0;
  const borderColor = sg.typeLabelBorderColor;
  if (isH) {
    const wpx = Math.max(60, w);
    const hpx = Math.max(14, baseFS * 1.8);
    b.text(
      t.toX(wx + w / 2 - wpx / 2), t.toY(wy - hpx - 4),
      t.toLen(wpx), t.toLen(hpx),
      sg.type,
      {
        fontSize: fs, bold, italic, fontFamily: fontFace, color: textColor,
        alignH: 'center', alignV: 'bottom',
        bgFill, bgStroke: borderColor, bgStrokeWidth: borderW,
      },
    );
  } else {
    const wpx = Math.max(14, baseFS * 1.8);
    const hpx = Math.max(60, h);
    b.text(
      t.toX(wx - wpx - 4), t.toY(wy + h / 2 - hpx / 2),
      t.toLen(wpx), t.toLen(hpx),
      sg.type,
      {
        fontSize: fs, bold, italic, fontFamily: fontFace, color: textColor,
        alignH: 'center', alignV: 'middle',
        writingMode: 'vertical', asciiUpright: sg.typeLabelAsciiUpright ?? sg.asciiUpright,
        bgFill, bgStroke: borderColor, bgStrokeWidth: borderW,
      },
    );
  }
}

function drawSDSGSubLabel(
  b: SVGBuilder, sg: SDSG, wx: number, wy: number, w: number, h: number, isH: boolean, t: Transform,
) {
  if (!sg.subLabel) return;
  const baseFS = sg.subLabelFontSize ?? 10;
  const fs = fontSizeScaled(baseFS, t);
  const offX = sg.subLabelOffsetX ?? 0;
  const offY = sg.subLabelOffsetY ?? 0;
  const textColor = normalizeColor(sg.subLabelColor, '#555');
  const bgFill = sg.subLabelBackgroundColor && sg.subLabelBackgroundColor !== 'transparent'
    ? sg.subLabelBackgroundColor : undefined;
  const borderW = sg.subLabelBorderWidth ?? 0;
  const borderColor = sg.subLabelBorderColor;
  if (isH) {
    const wpx = Math.max(80, w);
    const hpx = Math.max(14, baseFS * 1.6);
    b.text(
      t.toX(wx + w / 2 - wpx / 2 + offX), t.toY(wy + h + 6 + offY),
      t.toLen(wpx), t.toLen(hpx),
      sg.subLabel,
      {
        fontSize: fs, color: textColor,
        alignH: 'center', alignV: 'top',
        bgFill, bgStroke: borderColor, bgStrokeWidth: borderW,
      },
    );
  } else {
    const wpx = Math.max(14, baseFS * 1.6);
    const hpx = Math.max(80, h);
    b.text(
      t.toX(wx + w + 6 + offX), t.toY(wy + h / 2 - hpx / 2 + offY),
      t.toLen(wpx), t.toLen(hpx),
      sg.subLabel,
      {
        fontSize: fs, color: textColor,
        alignH: 'center', alignV: 'middle',
        writingMode: 'vertical', asciiUpright: sg.subLabelAsciiUpright ?? sg.asciiUpright,
        bgFill, bgStroke: borderColor, bgStrokeWidth: borderW,
      },
    );
  }
}

// ----------------------------------------------------------------------------
// Time arrow
// ----------------------------------------------------------------------------

function drawTimeArrow(
  b: SVGBuilder, sheet: Sheet, layout: LayoutDirection,
  settings: TimeArrowSettings, t: Transform,
  sdsgSpace?: SDSGSpaceSettings, typeLabelVisibility?: TypeLabelVisibilityMap,
  pageInnerRect?: { x: number; y: number; width: number; height: number },
) {
  if (!settings || !settings.autoInsert) return;
  const arrow = computeTimeArrow(sheet, layout, settings, sdsgSpace, typeLabelVisibility);
  if (!arrow) return;
  const color = '#222';

  // 多ページ時は page.inner にクリップ、未指定時はそのまま描画
  const polyline = [
    { x: arrow.startX, y: arrow.startY },
    { x: arrow.endX, y: arrow.endY },
  ];
  const pieces = pageInnerRect
    ? clipPolylineToRect(polyline, pageInnerRect)
    : [{ points: polyline, endsAtOriginalEnd: true }];
  if (pieces.length === 0) return;

  for (const piece of pieces) {
    if (piece.points.length < 2) continue;
    const p0 = piece.points[0];
    const p1 = piece.points[piece.points.length - 1];
    b.line(t.toX(p0.x), t.toY(p0.y), t.toX(p1.x), t.toY(p1.y), {
      stroke: color, strokeWidth: arrow.strokeWidth,
    });
    if (piece.endsAtOriginalEnd) {
      drawArrowHead(b, t.toX(p1.x), t.toY(p1.y), t.toX(p0.x), t.toY(p0.y), arrow.strokeWidth, color);
    }
  }

  // ラベル: 本体が完全に見えていない (クリップで分割された) 場合は、末端を含む
  // piece がある場合に限りラベルを描く (そうでなければ複数ページに重複しないよう抑止)
  const hasEndPiece = pieces.some((p) => p.endsAtOriginalEnd);
  if (pageInnerRect && !hasEndPiece) return;

  const isVert = layout === 'vertical';
  const fsBase = arrow.fontSize;
  const fs = fontSizeScaled(fsBase, t);
  const labelBoxWpx = isVert ? Math.max(20, fsBase * 1.8) : Math.max(160, fsBase * 12);
  const labelBoxHpx = isVert ? Math.max(120, fsBase * 12) : Math.max(20, fsBase * 1.8);
  let lbx = arrow.labelX;
  let lby = arrow.labelY;
  switch (arrow.labelSide) {
    case 'top':    lbx = arrow.labelX - labelBoxWpx / 2; lby = arrow.labelY - labelBoxHpx; break;
    case 'bottom': lbx = arrow.labelX - labelBoxWpx / 2; lby = arrow.labelY; break;
    case 'left':   lbx = arrow.labelX - labelBoxWpx; lby = arrow.labelY - labelBoxHpx / 2; break;
    case 'right':  lbx = arrow.labelX; lby = arrow.labelY - labelBoxHpx / 2; break;
  }
  b.text(
    t.toX(lbx), t.toY(lby), t.toLen(labelBoxWpx), t.toLen(labelBoxHpx),
    arrow.label,
    {
      fontSize: fs,
      bold: !!settings.labelBold,
      italic: !!settings.labelItalic,
      underline: !!settings.labelUnderline,
      fontFamily: settings.labelFontFamily,
      color,
      alignH: 'center', alignV: 'middle',
      writingMode: isVert ? 'vertical' : 'horizontal',
    },
  );
}

// ----------------------------------------------------------------------------
// Period labels
// ----------------------------------------------------------------------------

function drawPeriodLabels(
  b: SVGBuilder, sheet: Sheet, layout: LayoutDirection,
  settings: PeriodLabelSettings, timeArrow: TimeArrowSettings, t: Transform,
  sdsgSpace?: SDSGSpaceSettings, typeLabelVisibility?: TypeLabelVisibilityMap,
) {
  if (!settings || !settings.includeInExport) return;
  if (sheet.periodLabels.length === 0) return;
  const geom = computePeriodLabels(sheet, layout, settings, timeArrow, sdsgSpace, typeLabelVisibility);
  if (!geom) return;

  const isH = layout === 'horizontal';
  const sideH = settings.labelSideHorizontal ?? 'top';
  const sideV = settings.labelSideVertical ?? 'right';

  if (settings.showDividers) {
    b.line(t.toX(geom.startX), t.toY(geom.startY), t.toX(geom.endX), t.toY(geom.endY), {
      stroke: '#555', strokeWidth: settings.dividerStrokeWidth,
    });
  }

  if (settings.bandStyle === 'band') {
    const sorted = [...geom.items].sort((a, bb) => (isH ? a.x - bb.x : a.y - bb.y));
    const bounds: number[] = [];
    bounds.push(isH ? geom.startX : geom.startY);
    sorted.forEach((it, i) => {
      if (i === 0) return;
      const prev = sorted[i - 1];
      const mid = isH ? (prev.x + it.x) / 2 : (prev.y + it.y) / 2;
      bounds.push(mid);
    });
    bounds.push(isH ? geom.endX : geom.endY);

    if (settings.showDividers) {
      const tickLen = 10;
      for (const bv of bounds) {
        if (isH) {
          b.line(t.toX(bv), t.toY(geom.startY - tickLen / 2), t.toX(bv), t.toY(geom.startY + tickLen / 2), {
            stroke: '#555', strokeWidth: settings.dividerStrokeWidth * 1.4,
          });
        } else {
          b.line(t.toX(geom.startX - tickLen / 2), t.toY(bv), t.toX(geom.startX + tickLen / 2), t.toY(bv), {
            stroke: '#555', strokeWidth: settings.dividerStrokeWidth * 1.4,
          });
        }
      }
    }
    const fsBase = settings.fontSize;
    const fs = fontSizeScaled(fsBase, t);
    sorted.forEach((item, i) => {
      const left = bounds[i];
      const right = bounds[i + 1];
      const center = (left + right) / 2;
      placePeriodLabel(b, item.label, center, geom, isH, sideH, sideV, fs, fsBase, t);
    });
    return;
  }

  const fsBase = settings.fontSize;
  const fs = fontSizeScaled(fsBase, t);
  geom.items.forEach((item) => {
    const center = isH ? item.x : item.y;
    placePeriodLabel(b, item.label, center, geom, isH, sideH, sideV, fs, fsBase, t);
    if (settings.showDividers) {
      const tickLen = 8;
      if (isH) {
        b.line(t.toX(item.x), t.toY(item.y - tickLen / 2), t.toX(item.x), t.toY(item.y + tickLen / 2), {
          stroke: '#555', strokeWidth: settings.dividerStrokeWidth,
        });
      } else {
        b.line(t.toX(item.x - tickLen / 2), t.toY(item.y), t.toX(item.x + tickLen / 2), t.toY(item.y), {
          stroke: '#555', strokeWidth: settings.dividerStrokeWidth,
        });
      }
    }
  });
}

function placePeriodLabel(
  b: SVGBuilder, label: string, centerWorld: number,
  geom: { startX: number; startY: number; endX: number; endY: number },
  isH: boolean, sideH: 'top' | 'bottom', sideV: 'left' | 'right',
  fs: number, baseFS: number, t: Transform,
) {
  if (isH) {
    const wpx = Math.max(80, baseFS * 8);
    const hpx = Math.max(18, baseFS * 1.8);
    const cx = centerWorld - wpx / 2;
    const cy = sideH === 'top' ? geom.startY - hpx - 2 : geom.startY + 2;
    b.text(t.toX(cx), t.toY(cy), t.toLen(wpx), t.toLen(hpx), label, {
      fontSize: fs, color: '#222',
      alignH: 'center', alignV: sideH === 'top' ? 'bottom' : 'top',
    });
  } else {
    const wpx = Math.max(18, baseFS * 1.8);
    const hpx = Math.max(80, baseFS * 8);
    const cx = sideV === 'right' ? geom.startX + 2 : geom.startX - wpx - 2;
    const cy = centerWorld - hpx / 2;
    b.text(t.toX(cx), t.toY(cy), t.toLen(wpx), t.toLen(hpx), label, {
      fontSize: fs, color: '#222',
      alignH: 'center', alignV: 'middle',
      writingMode: 'vertical',
    });
  }
}

// ----------------------------------------------------------------------------
// Legend
// ----------------------------------------------------------------------------

function drawLegend(
  b: SVGBuilder, sheet: Sheet, layout: LayoutDirection, lg: LegendSettings, t: Transform,
) {
  if (!lg || !lg.includeInExport) return;
  const items = computeLegendItems(sheet, lg);
  if (items.length === 0) return;

  const cols = Math.max(1, Math.floor(
    (layout === 'vertical' ? lg.columnsVertical : lg.columnsHorizontal) ?? lg.columns ?? 1,
  ));
  const showDesc = lg.showDescriptions === true;
  const baseFS = lg.fontSize;
  const fs = fontSizeScaled(baseFS, t);
  const titleBaseFS = lg.titleFontSize ?? lg.fontSize * 1.15;
  const titleFS = fontSizeScaled(titleBaseFS, t);
  const showTitle = lg.showTitle !== false;
  const titlePosition = lg.titlePosition ?? 'top';

  const sampleW = lg.sampleWidth ?? 32;
  const sampleH = lg.sampleHeight ?? 18;
  const padding = 10;
  const iconColMinPx = sampleW + 8;
  const cellGap = 12;
  const rowGap = 4;

  const rows = Math.ceil(items.length / cols);
  const showDescPerRow = items.map((it) => {
    const ov = lg.itemOverrides?.[`${it.category}:${it.key}`];
    return ov?.showDescription ?? showDesc;
  });

  const rowHpx = Math.max(baseFS * (showDesc ? 2 : 1) * 1.4 + 4, sampleH + 4);
  const cellLabelMinPx = Math.max(100, baseFS * 10);
  const cellW = iconColMinPx + 8 + cellLabelMinPx;
  const gridW = cols * cellW + (cols - 1) * cellGap;
  const gridH = rows * rowHpx + (rows - 1) * rowGap;

  const titleHpx = titleBaseFS * 1.4 + 6;
  let boxW = 0;
  let boxH = 0;
  if (titlePosition === 'top') {
    boxW = Math.max(lg.minWidth, gridW + padding * 2);
    boxH = gridH + padding * 2 + (showTitle ? titleHpx : 0);
  } else {
    const titleAreaW = Math.max(60, titleBaseFS * 6);
    boxW = Math.max(lg.minWidth, gridW + padding * 2 + (showTitle ? titleAreaW + 12 : 0));
    boxH = Math.max(gridH + padding * 2, titleBaseFS * 2);
  }

  const bx = lg.position.x;
  const by = lg.position.y;

  if (lg.backgroundStyle !== 'none' || lg.borderWidth > 0) {
    b.rect(t.toX(bx), t.toY(by), t.toLen(boxW), t.toLen(boxH), {
      fill: lg.backgroundStyle === 'none' ? 'none' : '#ffffff',
      stroke: lg.borderWidth > 0 ? normalizeColor(lg.borderColor, '#999') : 'none',
      strokeWidth: lg.borderWidth > 0 ? lg.borderWidth : undefined,
    });
  }

  if (showTitle) {
    const titleBold = lg.titleBold !== false;
    const titleItalic = !!lg.titleItalic;
    const titleUnderline = !!lg.titleUnderline;
    const titleAlign = (lg.titleAlign ?? 'left') as 'left' | 'center' | 'right';
    const titleVert = lg.titleWritingMode === 'vertical';
    if (titlePosition === 'top') {
      b.text(
        t.toX(bx + padding), t.toY(by + padding),
        t.toLen(boxW - padding * 2), t.toLen(titleHpx),
        lg.title,
        {
          fontSize: titleFS, bold: titleBold, italic: titleItalic, underline: titleUnderline,
          fontFamily: lg.titleFontFamily ?? lg.fontFamily, color: '#222',
          alignH: titleAlign, alignV: 'middle',
          writingMode: titleVert ? 'vertical' : 'horizontal',
        },
      );
    } else {
      const titleAreaW = Math.max(60, titleBaseFS * 6);
      const tva = lg.titleVerticalAlign ?? 'top';
      const vAlign: 'top' | 'middle' | 'bottom' = tva === 'middle' ? 'middle' : tva === 'bottom' ? 'bottom' : 'top';
      b.text(
        t.toX(bx + padding), t.toY(by + padding),
        t.toLen(titleAreaW), t.toLen(boxH - padding * 2),
        lg.title,
        {
          fontSize: titleFS, bold: titleBold, italic: titleItalic, underline: titleUnderline,
          fontFamily: lg.titleFontFamily ?? lg.fontFamily, color: '#222',
          alignH: titleAlign, alignV: vAlign,
          writingMode: titleVert ? 'vertical' : 'horizontal',
        },
      );
    }
  }

  const gridOriginX = titlePosition === 'left'
    ? bx + padding + (showTitle ? Math.max(60, titleBaseFS * 6) + 12 : 0)
    : bx + padding;
  const gridOriginY = titlePosition === 'top'
    ? by + padding + (showTitle ? titleHpx : 0)
    : by + padding;

  items.forEach((item, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const cellX = gridOriginX + col * (cellW + cellGap);
    const cellY = gridOriginY + row * (rowHpx + rowGap);
    const iconX = cellX + (iconColMinPx - sampleW) / 2;
    const iconY = cellY + (rowHpx - sampleH) / 2;
    drawLegendIcon(b, item, iconX, iconY, sampleW, sampleH, t);

    const overrideKey = `${item.category}:${item.key}`;
    const ov = lg.itemOverrides?.[overrideKey];
    const label = ov?.label ?? item.label;
    const description = ov?.description ?? item.description;
    const useShowDesc = showDescPerRow[idx];
    const textX = cellX + iconColMinPx + 8;
    const textW = cellLabelMinPx;
    if (useShowDesc && description) {
      b.richText(
        t.toX(textX), t.toY(cellY),
        t.toLen(textW), t.toLen(rowHpx),
        [
          { text: label, bold: true, fontSize: fs, color: '#222' },
          { text: `\n${description}`, fontSize: fs * 0.85, color: '#666' },
        ],
        { alignH: 'left', alignV: 'middle', fontFamily: lg.fontFamily },
      );
    } else {
      b.text(
        t.toX(textX), t.toY(cellY),
        t.toLen(textW), t.toLen(rowHpx),
        label,
        {
          fontSize: fs, bold: true, color: '#222',
          alignH: 'left', alignV: 'middle',
          fontFamily: lg.fontFamily,
        },
      );
    }
  });
}

function drawLegendIcon(
  b: SVGBuilder, item: LegendItem, x: number, y: number, w: number, h: number, t: Transform,
) {
  const X = t.toX(x), Y = t.toY(y), W = t.toLen(w), H = t.toLen(h);
  if (item.category === 'box') {
    const isPEfp = item.key === 'P-EFP' || item.key === 'P-2nd-EFP';
    if (isPEfp) {
      b.rect(X, Y, W, H, { fill: '#ffffff', stroke: '#222', strokeWidth: 1.2, strokeDasharray: '4 2' });
      const inset = 2;
      b.rect(X + inset, Y + inset, Math.max(1, W - inset * 2), Math.max(1, H - inset * 2), {
        fill: 'none', stroke: '#222', strokeWidth: 1.2, strokeDasharray: '4 2',
      });
      return;
    }
    const spec = BOX_RENDER_SPECS[item.key] ?? BOX_RENDER_SPECS.normal;
    const dashArr = spec.borderStyle === 'dashed' ? '5 3' : spec.borderStyle === 'dotted' ? '2 2' : undefined;
    if (item.key === 'EFP' || item.key === '2nd-EFP') {
      b.rect(X, Y, W, H, { fill: '#ffffff', stroke: '#222', strokeWidth: 1 });
      const ins = 2;
      b.rect(X + ins, Y + ins, Math.max(1, W - ins * 2), Math.max(1, H - ins * 2), {
        fill: 'none', stroke: '#222', strokeWidth: 1,
      });
      return;
    }
    b.rect(X, Y, W, H, { fill: '#ffffff', stroke: '#222', strokeWidth: spec.borderWidth, strokeDasharray: dashArr });
  } else if (item.category === 'line') {
    const dashArr = item.key === 'XLine' ? '5 3' : undefined;
    b.line(X, Y + H / 2, X + W, Y + H / 2, { stroke: '#222', strokeWidth: 1.5, strokeDasharray: dashArr });
    drawArrowHead(b, X + W, Y + H / 2, X, Y + H / 2, 1.5, '#222');
  } else if (item.category === 'sdsg') {
    // 凡例内は横向き矢印として描画
    const isSD = item.key === 'SD';
    // SD: 右向き, SG: 左向き として凡例表示
    const points = isSD
      ? buildSDSGPolygon(x, y, w, h, false, true, 0.55)
      : buildSDSGPolygon(x, y, w, h, false, false, 0.55);
    const pts = points.map((p) => ({ x: t.toX(p.x), y: t.toY(p.y) }));
    b.polygon(pts, { fill: '#ffffff', stroke: '#333', strokeWidth: 1 });
  } else if (item.category === 'timeArrow') {
    b.line(X, Y + H / 2, X + W, Y + H / 2, { stroke: '#222', strokeWidth: 2.5 });
    drawArrowHead(b, X + W, Y + H / 2, X, Y + H / 2, 2.5, '#222');
  }
}
