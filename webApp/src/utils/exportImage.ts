// ============================================================================
// PNG / SVG Export - キャンバスDOMを画像化
// オプションで ルーラー / グリッド / 用紙枠 / スクロールバー / 背景色 を制御
// ============================================================================

import { toPng, toSvg } from 'html-to-image';
import JSZip from 'jszip';
import type { PageBounds } from './pageSplit';
import { checkAborted, type ProgressCallback } from './exportProgress';

export interface ExportOptions {
  includeRulers?: boolean;       // 既定 false
  includeControls?: boolean;     // 既定 false
  includeGrid?: boolean;         // 既定 false
  includePaperGuides?: boolean;  // 既定 false
  background?: 'white' | 'transparent'; // 既定 'white'
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

function bg(opts: ExportOptions): string | undefined {
  if (opts.background === 'transparent') return undefined;
  return '#ffffff';
}

export async function exportToPNG(
  elementId: string,
  filename = 'TEMer.png',
  pixelRatio = 2,
  opts: ExportOptions = {},
) {
  const node = document.getElementById(elementId);
  if (!node) throw new Error(`Element not found: #${elementId}`);

  const dataUrl = await toPng(node, {
    backgroundColor: bg(opts),
    pixelRatio,
    filter: buildFilter(opts),
  });
  downloadDataUrl(dataUrl, filename);
}

export async function exportToSVG(
  elementId: string,
  filename = 'TEMer.svg',
  opts: ExportOptions = {},
) {
  const node = document.getElementById(elementId);
  if (!node) throw new Error(`Element not found: #${elementId}`);

  const dataUrl = await toSvg(node, {
    backgroundColor: bg(opts),
    filter: buildFilter(opts),
  });
  downloadDataUrl(dataUrl, filename);
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = dataUrl;
  });
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

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('canvas.toBlob returned null'));
    }, type);
  });
}

/**
 * N ページに分割した PNG を ZIP でダウンロード。
 * pages が 1 以下なら `exportToPNG` に委譲して単一ファイル出力。
 */
export async function exportToPNGPages(
  elementId: string,
  baseName: string,
  pages: PageBounds[],
  pixelRatio = 2,
  opts: ExportOptions = {},
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<void> {
  if (!pages || pages.length <= 1) {
    onProgress?.({ current: 0, total: 1, label: 'キャプチャ中...' });
    await exportToPNG(elementId, `${baseName}.png`, pixelRatio, opts);
    onProgress?.({ current: 1, total: 1, label: '完了' });
    return;
  }
  const node = document.getElementById(elementId);
  if (!node) throw new Error(`Element not found: #${elementId}`);

  const total = pages.length + 1; // 1=キャプチャ + N=ページクロップ
  onProgress?.({ current: 0, total, label: 'プレビューをキャプチャ中...' });
  checkAborted(signal);

  // 全体を 1 回キャプチャ
  const dataUrl = await toPng(node, {
    backgroundColor: bg(opts),
    pixelRatio,
    filter: buildFilter(opts),
  });
  checkAborted(signal);
  const img = await loadImage(dataUrl);
  const strip = computeStripFromPages(pages);
  const ratioX = img.width / Math.max(1, strip.width);
  const ratioY = img.height / Math.max(1, strip.height);

  const zip = new JSZip();
  for (let i = 0; i < pages.length; i++) {
    checkAborted(signal);
    onProgress?.({ current: i + 1, total, label: `ページ ${i + 1} / ${pages.length} をクロップ中` });
    const page = pages[i];
    const sx = Math.round((page.innerX - strip.x) * ratioX);
    const sy = Math.round((page.innerY - strip.y) * ratioY);
    const sw = Math.round(page.innerWidth * ratioX);
    const sh = Math.round(page.innerHeight * ratioY);
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
    const blob = await canvasToBlob(canvas, 'image/png');
    const pageNum = String(i + 1).padStart(String(pages.length).length, '0');
    zip.file(`${baseName}_page${pageNum}.png`, blob);
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(zipBlob, `${baseName}_pages.zip`);
  onProgress?.({ current: total, total, label: '完了' });
}

/**
 * N ページに分割した SVG を ZIP でダウンロード。
 * 各ページは data:image/png を <image> で埋め込んだ SVG にクロップ。
 * pages が 1 以下なら `exportToSVG` に委譲。
 */
export async function exportToSVGPages(
  elementId: string,
  baseName: string,
  pages: PageBounds[],
  opts: ExportOptions = {},
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<void> {
  if (!pages || pages.length <= 1) {
    onProgress?.({ current: 0, total: 1, label: 'キャプチャ中...' });
    await exportToSVG(elementId, `${baseName}.svg`, opts);
    onProgress?.({ current: 1, total: 1, label: '完了' });
    return;
  }
  const node = document.getElementById(elementId);
  if (!node) throw new Error(`Element not found: #${elementId}`);

  const total = pages.length + 1;
  onProgress?.({ current: 0, total, label: 'プレビューをキャプチャ中...' });
  checkAborted(signal);

  // ベース画像は PNG（高 DPI）で 1 回キャプチャし、各ページをクロップ → PNG を <image> 埋め込みした SVG として保存
  const pixelRatio = 2;
  const dataUrl = await toPng(node, {
    backgroundColor: bg(opts),
    pixelRatio,
    filter: buildFilter(opts),
  });
  checkAborted(signal);
  const img = await loadImage(dataUrl);
  const strip = computeStripFromPages(pages);
  const ratioX = img.width / Math.max(1, strip.width);
  const ratioY = img.height / Math.max(1, strip.height);

  const zip = new JSZip();
  for (let i = 0; i < pages.length; i++) {
    checkAborted(signal);
    onProgress?.({ current: i + 1, total, label: `ページ ${i + 1} / ${pages.length} をクロップ中` });
    const page = pages[i];
    const sx = Math.round((page.innerX - strip.x) * ratioX);
    const sy = Math.round((page.innerY - strip.y) * ratioY);
    const sw = Math.round(page.innerWidth * ratioX);
    const sh = Math.round(page.innerHeight * ratioY);
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
    const embeddedDataUrl = canvas.toDataURL('image/png');
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n`
      + `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sw} ${sh}" width="${sw}" height="${sh}">\n`
      + `  <image href="${embeddedDataUrl}" x="0" y="0" width="${sw}" height="${sh}" />\n`
      + `</svg>\n`;
    const pageNum = String(i + 1).padStart(String(pages.length).length, '0');
    zip.file(`${baseName}_page${pageNum}.svg`, svg);
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(zipBlob, `${baseName}_pages.zip`);
  onProgress?.({ current: total, total, label: '完了' });
}
