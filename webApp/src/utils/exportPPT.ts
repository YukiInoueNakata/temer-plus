// ============================================================================
// PPTX export - 文献標準準拠レンダリング
// 注: PptxGenJS v3.12 は cmpd 属性未対応のため、二重線は矩形重ね描きで代替
// ============================================================================

import PptxGenJS from 'pptxgenjs';
import type { Box, Line } from '../types';

const EMU_PER_PX = 1 / 96;
const pxToInch = (px: number) => px * EMU_PER_PX;

function lineDashType(type: Line['type']): 'solid' | 'dashDot' {
  return type === 'XLine' ? 'dashDot' : 'solid';
}

export async function exportToPPTX(boxes: Box[], lines: Line[], filename = 'TEMer.pptx') {
  const pres = new PptxGenJS();
  pres.defineLayout({ name: 'TEMER', width: 13.333, height: 7.5 });
  pres.layout = 'TEMER';

  const slide = pres.addSlide();
  slide.background = { color: 'FFFFFF' };

  for (const b of boxes) {
    await renderBox(pres, slide, b);
  }

  const byId = new Map(boxes.map((b) => [b.id, b]));

  for (const l of lines) {
    const from = byId.get(l.from);
    const to = byId.get(l.to);
    if (!from || !to) continue;

    const x1 = from.x + from.width;
    const y1 = from.y + from.height / 2;
    const x2 = to.x;
    const y2 = to.y + to.height / 2;

    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const w = Math.max(1, Math.abs(x2 - x1));
    const h = Math.max(1, Math.abs(y2 - y1));

    slide.addShape(pres.ShapeType.line, {
      x: pxToInch(x),
      y: pxToInch(y),
      w: pxToInch(w),
      h: pxToInch(h),
      line: {
        color: '222222',
        width: 1.5,
        dashType: lineDashType(l.type),
        endArrowType: 'triangle',
      },
      flipH: x2 < x1,
      flipV: y2 < y1,
    });
  }

  await pres.writeFile({ fileName: filename });
}

async function renderBox(pres: PptxGenJS, slide: PptxGenJS.Slide, b: Box) {
  const x = pxToInch(b.x);
  const y = pxToInch(b.y);
  const w = pxToInch(b.width);
  const h = pxToInch(b.height);

  switch (b.type) {
    case 'EFP':
    case '2nd-EFP': {
      // 二重線: 外枠 + 内枠の2矩形重ね
      slide.addShape(pres.ShapeType.rect, {
        x, y, w, h,
        fill: { color: 'FFFFFF' },
        line: { color: '222222', width: 1 },
      });
      const inset = 4;
      slide.addShape(pres.ShapeType.rect, {
        x: pxToInch(b.x + inset),
        y: pxToInch(b.y + inset),
        w: pxToInch(b.width - inset * 2),
        h: pxToInch(b.height - inset * 2),
        fill: { color: 'FFFFFF' },
        line: { color: '222222', width: 1 },
      });
      break;
    }
    case 'OPP':
      slide.addShape(pres.ShapeType.rect, {
        x, y, w, h,
        fill: { color: 'FFFFFF' },
        line: { color: '222222', width: 3.0 },
      });
      break;
    case 'P-EFP':
    case 'P-2nd-EFP':
      slide.addShape(pres.ShapeType.rect, {
        x, y, w, h,
        fill: { color: 'FFFFFF' },
        line: { color: '222222', width: 1.5, dashType: 'dash' },
      });
      break;
    case 'annotation':
      slide.addShape(pres.ShapeType.rect, {
        x, y, w, h,
        fill: { color: 'FFFFFF' },
        line: { color: '222222', width: 1.0, dashType: 'sysDot' },
      });
      break;
    default:
      slide.addShape(pres.ShapeType.rect, {
        x, y, w, h,
        fill: { color: 'FFFFFF' },
        line: { color: '222222', width: 1.5 },
      });
  }

  slide.addText(b.label, {
    x, y, w, h,
    align: 'center',
    valign: 'middle',
    fontSize: b.style?.fontSize ?? 12,
    bold: b.style?.bold,
    italic: b.style?.italic,
    underline: b.style?.underline ? { style: 'sng' } : undefined,
    color: b.style?.color ?? '222222',
  });
}
