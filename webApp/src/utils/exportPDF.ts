// ============================================================================
// PDF 出力
// - キャンバス DOM を PNG 化し、jsPDF に埋め込んで PDF 化
// - 用紙サイズに fit させる（余白指定）
// ============================================================================

import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';
import { getPaperInch, type PaperSizeKey } from './paperSizes';
import type { ExportOptions } from './exportImage';
import type { PageBounds } from './pageSplit';

export interface PDFExportOptions extends ExportOptions {
  paperSize: PaperSizeKey;
  customWidth?: number;   // custom 時、px
  customHeight?: number;  // custom 時、px
  margin?: number;        // inch（上下左右）既定 0.3
  /** N ページ分割。未指定または要素 1 個なら単一ページ */
  pages?: PageBounds[];
  /** pages 指定時の、全ページを覆う world 座標 bbox */
  stripBounds?: { x: number; y: number; width: number; height: number };
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
    // ページ分割のガイド線は常に出力から除外（プレビュー専用）
    if (el.classList?.contains('page-split-overlay')) return false;
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

  const pages = opts.pages && opts.pages.length > 1 ? opts.pages : null;

  if (!pages) {
    // 単一ページ出力（従来動作）
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
    return;
  }

  // N ページ分割出力
  const strip = opts.stripBounds ?? computeStripFromPages(pages);
  // 撮影された画像を HTMLImageElement に load
  const img = await loadImage(dataUrl);
  const imgW = img.width, imgH = img.height;
  // world → 撮影画像の px 比率
  const ratioX = imgW / Math.max(1, strip.width);
  const ratioY = imgH / Math.max(1, strip.height);

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (i > 0) {
      pdf.addPage([paper.width, paper.height], paper.width >= paper.height ? 'landscape' : 'portrait');
    }
    // クロップ範囲（撮影画像 px）
    const sx = Math.round((page.innerX - strip.x) * ratioX);
    const sy = Math.round((page.innerY - strip.y) * ratioY);
    const sw = Math.round(page.innerWidth * ratioX);
    const sh = Math.round(page.innerHeight * ratioY);
    // オフスクリーン canvas にクロップ描画
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context not available');
    if (opts.background !== 'transparent') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sw, sh);
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const pageDataUrl = canvas.toDataURL('image/png');

    // コンテンツ領域にアスペクト維持で fit
    const imgAspect = sw / Math.max(1, sh);
    const boxAspect = contentW / contentH;
    let drawW: number, drawH: number;
    if (imgAspect >= boxAspect) {
      drawW = contentW;
      drawH = contentW / imgAspect;
    } else {
      drawH = contentH;
      drawW = contentH * imgAspect;
    }
    const x = margin + (contentW - drawW) / 2;
    const y = margin + (contentH - drawH) / 2;
    pdf.addImage(pageDataUrl, 'PNG', x, y, drawW, drawH, undefined, 'FAST');
  }
  pdf.save(filename);
}

function computeStripFromPages(pages: PageBounds[]): { x: number; y: number; width: number; height: number } {
  const xs = pages.flatMap((p) => [p.innerX, p.innerX + p.innerWidth]);
  const ys = pages.flatMap((p) => [p.innerY, p.innerY + p.innerHeight]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = dataUrl;
  });
}
