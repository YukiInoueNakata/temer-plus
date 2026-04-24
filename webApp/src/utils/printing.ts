// ============================================================================
// プリンター印刷 - 新規ウィンドウを開いて window.print() を呼ぶ
// - 全体を html-to-image で PNG キャプチャ
// - 分割時は各ページ範囲でオフスクリーン canvas にクロップ
// - @page CSS で用紙サイズ / マージンを指定、1 ページ 1 img をレイアウト
// ============================================================================

import { toPng } from 'html-to-image';
import type { PageBounds } from './pageSplit';
import { getPaperInch, type PaperSizeKey } from './paperSizes';
import { checkAborted, type ProgressCallback } from './exportProgress';

export interface PrintOptions {
  /** N ページ分割（未指定 or 1 枚なら単一ページ印刷） */
  pages?: PageBounds[];
  /** 用紙サイズ（@page size に指定） */
  paperSize: PaperSizeKey;
  /** カスタム用紙サイズ時の実寸（inch） */
  customPaperWidthPx?: number;
  customPaperHeightPx?: number;
  /** 背景色 */
  background?: 'white' | 'transparent';
  /** 出力フィルタ */
  includeGrid?: boolean;
  includePaperGuides?: boolean;
  includeRulers?: boolean;
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
}

function buildFilter(opts: PrintOptions) {
  return (el: HTMLElement) => {
    if (!(el instanceof HTMLElement)) return true;
    if (el.classList?.contains('react-flow__controls')) return false;
    if (el.classList?.contains('react-flow__minimap')) return false;
    if (el.classList?.contains('react-flow__attribution')) return false;
    if (el.classList?.contains('scrollbar-h')) return false;
    if (el.classList?.contains('scrollbar-v')) return false;
    if (!opts.includeRulers) {
      if (el.classList?.contains('canvas-rulers')) return false;
      if (el.classList?.contains('ruler-vertical')) return false;
      if (el.classList?.contains('ruler-horizontal')) return false;
      if (el.classList?.contains('ruler-corner')) return false;
    }
    if (!opts.includeGrid && el.classList?.contains('react-flow__background')) return false;
    if (!opts.includePaperGuides && el.classList?.contains('paper-guide-overlay')) return false;
    if (el.classList?.contains('page-split-overlay')) return false;
    return true;
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

function computeStripFromPages(pages: PageBounds[]): { x: number; y: number; width: number; height: number } {
  const xs = pages.flatMap((p) => [p.innerX, p.innerX + p.innerWidth]);
  const ys = pages.flatMap((p) => [p.innerY, p.innerY + p.innerHeight]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/**
 * 指定 element をプリンター印刷する。
 * - 新規ウィンドウを開き、img タグで各ページを貼り付け、@page CSS で用紙サイズ指定、window.print() を呼ぶ
 * - ユーザーがブラウザの印刷ダイアログでプリンターと倍率を選択して印刷
 */
export async function printDiagram(
  elementId: string,
  opts: PrintOptions,
): Promise<void> {
  const node = document.getElementById(elementId);
  if (!node) throw new Error(`Element not found: #${elementId}`);

  const paper = getPaperInch(opts.paperSize, opts.customPaperWidthPx, opts.customPaperHeightPx);
  const pagesLen = opts.pages && opts.pages.length > 1 ? opts.pages.length : 1;
  const totalSteps = 1 + pagesLen + 1; // capture + crops + print window
  opts.onProgress?.({ current: 0, total: totalSteps, label: 'プレビューをキャプチャ中...' });
  checkAborted(opts.signal);

  // 全体を 1 回キャプチャ
  const dataUrl = await toPng(node, {
    backgroundColor: opts.background === 'transparent' ? undefined : '#ffffff',
    pixelRatio: 2,
    filter: buildFilter(opts),
  });
  checkAborted(opts.signal);

  // 各ページの dataURL を作成
  let pageDataUrls: string[];
  if (opts.pages && opts.pages.length > 1) {
    const img = await loadImage(dataUrl);
    const strip = computeStripFromPages(opts.pages);
    const ratioX = img.width / Math.max(1, strip.width);
    const ratioY = img.height / Math.max(1, strip.height);
    pageDataUrls = [];
    let idx = 0;
    for (const page of opts.pages) {
      idx++;
      checkAborted(opts.signal);
      opts.onProgress?.({ current: 1 + idx, total: totalSteps, label: `ページ ${idx} / ${opts.pages.length} をクロップ中` });
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
      pageDataUrls.push(canvas.toDataURL('image/png'));
    }
  } else {
    pageDataUrls = [dataUrl];
  }

  // 印刷用 HTML を生成。@page size に inch 寸法を指定し、プリンタが用紙を選べるようにする
  const pageSizeCSS = `${paper.width}in ${paper.height}in`;
  const bodyBg = opts.background === 'transparent' ? 'transparent' : '#ffffff';

  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8"/>
<title>TEMer 印刷プレビュー (${pageDataUrls.length} ページ)</title>
<style>
  @page { size: ${pageSizeCSS}; margin: 0; }
  html, body { margin: 0; padding: 0; background: ${bodyBg}; }
  .page {
    width: ${paper.width}in;
    height: ${paper.height}in;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
    box-sizing: border-box;
  }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .page img {
    max-width: 100%;
    max-height: 100%;
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
  .instructions {
    position: fixed;
    top: 8px; left: 8px;
    background: #fffbe6;
    border: 1px solid #e6c200;
    padding: 6px 10px;
    font-family: sans-serif;
    font-size: 12px;
    z-index: 9999;
  }
  @media print { .instructions { display: none; } }
</style>
</head>
<body>
  <div class="instructions">
    印刷ダイアログで「用紙サイズ」「向き」がこの用紙に合っているか確認してください。
    ダイアログを閉じたらこのウィンドウも閉じて構いません。
  </div>
${pageDataUrls.map((u, i) => `  <div class="page"><img src="${u}" alt="page ${i + 1}"/></div>`).join('\n')}
</body>
</html>`;

  opts.onProgress?.({ current: totalSteps, total: totalSteps, label: '印刷ウィンドウを開きます' });
  const win = window.open('', '_blank', 'width=960,height=720');
  if (!win) {
    throw new Error('ポップアップがブロックされました。ブラウザのポップアップブロックを解除してください。');
  }
  win.document.open();
  win.document.write(html);
  win.document.close();

  // 画像の load 完了を待つ
  await new Promise<void>((resolve) => {
    const check = () => {
      const imgs = Array.from(win.document.querySelectorAll('img')) as HTMLImageElement[];
      if (imgs.length === 0) return resolve();
      const pending = imgs.filter((im) => !im.complete);
      if (pending.length === 0) return resolve();
      Promise.all(pending.map((im) => new Promise<void>((res) => {
        im.addEventListener('load', () => res(), { once: true });
        im.addEventListener('error', () => res(), { once: true });
      }))).then(() => resolve());
    };
    if (win.document.readyState === 'complete') check();
    else win.addEventListener('load', () => check(), { once: true });
  });

  win.focus();
  win.print();
}
