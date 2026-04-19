// ============================================================================
// PNG / SVG Export - キャンバスDOMを画像化
// オプションで ルーラー / グリッド / 用紙枠 / スクロールバー / 背景色 を制御
// ============================================================================

import { toPng, toSvg } from 'html-to-image';

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
