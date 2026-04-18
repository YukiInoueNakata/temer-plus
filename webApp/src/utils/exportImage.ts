import { toPng } from 'html-to-image';

export async function exportToPNG(elementId: string, filename = 'TEMer.png') {
  const node = document.getElementById(elementId);
  if (!node) {
    throw new Error(`Element not found: #${elementId}`);
  }

  const dataUrl = await toPng(node, {
    backgroundColor: '#ffffff',
    pixelRatio: 2,
    filter: (el) => {
      if (!(el instanceof HTMLElement)) return true;
      if (el.classList?.contains('react-flow__controls')) return false;
      if (el.classList?.contains('react-flow__minimap')) return false;
      if (el.classList?.contains('react-flow__attribution')) return false;
      return true;
    },
  });

  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}
