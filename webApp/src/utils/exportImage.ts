// ============================================================================
// PNG / SVG Export - キャンバスDOMを画像化
// ============================================================================

import { toPng, toSvg } from 'html-to-image';

const DEFAULT_FILTER = (el: HTMLElement) => {
  if (!(el instanceof HTMLElement)) return true;
  if (el.classList?.contains('react-flow__controls')) return false;
  if (el.classList?.contains('react-flow__minimap')) return false;
  if (el.classList?.contains('react-flow__attribution')) return false;
  if (el.classList?.contains('scrollbar-h')) return false;
  if (el.classList?.contains('scrollbar-v')) return false;
  return true;
};

export async function exportToPNG(elementId: string, filename = 'TEMer.png', pixelRatio = 2) {
  const node = document.getElementById(elementId);
  if (!node) throw new Error(`Element not found: #${elementId}`);

  const dataUrl = await toPng(node, {
    backgroundColor: '#ffffff',
    pixelRatio,
    filter: DEFAULT_FILTER,
  });
  downloadDataUrl(dataUrl, filename);
}

export async function exportToSVG(elementId: string, filename = 'TEMer.svg') {
  const node = document.getElementById(elementId);
  if (!node) throw new Error(`Element not found: #${elementId}`);

  const dataUrl = await toSvg(node, {
    backgroundColor: '#ffffff',
    filter: DEFAULT_FILTER,
  });
  downloadDataUrl(dataUrl, filename);
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}
