// ============================================================================
// PPTX export - 文献標準準拠レンダリング
// 注: PptxGenJS v3.12 は cmpd 属性未対応のため、二重線は矩形重ね描きで代替
// ============================================================================

import PptxGenJS from 'pptxgenjs';
import type { Box, Line, SDSG, Sheet, TimeArrowSettings, LayoutDirection } from '../types';
import { computeTimeArrow } from './timeArrow';

const EMU_PER_PX = 1 / 96;
const pxToInch = (px: number) => px * EMU_PER_PX;

function lineDashType(type: Line['type']): 'solid' | 'dashDot' {
  return type === 'XLine' ? 'dashDot' : 'solid';
}

export interface PPTXExportOptions {
  filename?: string;
  sheet?: Sheet;
  layout?: LayoutDirection;
  timeArrowSettings?: TimeArrowSettings;
  includeTimeArrow?: boolean;
}

export async function exportToPPTX(
  boxes: Box[],
  lines: Line[],
  optionsOrFilename: PPTXExportOptions | string = 'TEMer.pptx',
) {
  const opts: PPTXExportOptions = typeof optionsOrFilename === 'string'
    ? { filename: optionsOrFilename }
    : optionsOrFilename;
  const filename = opts.filename ?? 'TEMer.pptx';

  const pres = new PptxGenJS();
  pres.defineLayout({ name: 'TEMER', width: 13.333, height: 7.5 });
  pres.layout = 'TEMER';

  const slide = pres.addSlide();
  slide.background = { color: 'FFFFFF' };

  // 非可逆的時間矢印（オプション）
  if (opts.includeTimeArrow && opts.sheet && opts.layout && opts.timeArrowSettings) {
    const arrow = computeTimeArrow(opts.sheet, opts.layout, opts.timeArrowSettings);
    if (arrow) {
      const dx = arrow.endX - arrow.startX;
      const dy = arrow.endY - arrow.startY;
      slide.addShape(pres.ShapeType.line, {
        x: pxToInch(Math.min(arrow.startX, arrow.endX)),
        y: pxToInch(Math.min(arrow.startY, arrow.endY)),
        w: pxToInch(Math.max(1, Math.abs(dx))),
        h: pxToInch(Math.max(1, Math.abs(dy))),
        line: {
          color: '222222',
          width: arrow.strokeWidth,
          endArrowType: 'triangle',
        },
        flipH: dx < 0,
        flipV: dy < 0,
      });
      slide.addText(arrow.label, {
        x: pxToInch(arrow.labelX - 100),
        y: pxToInch(arrow.labelY - arrow.fontSize),
        w: pxToInch(200),
        h: pxToInch(arrow.fontSize + 4),
        fontSize: arrow.fontSize,
        align: 'center',
        valign: 'middle',
        color: '222222',
      });
    }

    // SDSG五角形も描画
    if (opts.sheet.sdsg.length > 0) {
      for (const sg of opts.sheet.sdsg) {
        const attached = opts.sheet.boxes.find((b) => b.id === sg.attachedTo);
        if (!attached) continue;
        const isH = opts.layout === 'horizontal';
        const sgX = attached.x + (isH ? (sg.timeOffset ?? 0) : (sg.itemOffset ?? 0));
        const sgY = attached.y + (isH ? (sg.itemOffset ?? 0) : (sg.timeOffset ?? 0));
        const sgW = sg.width ?? 70;
        const sgH = sg.height ?? 40;
        await renderSDSG(pres, slide, sg, sgX, sgY, sgW, sgH, opts.layout);
      }
    }
  }

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

async function renderSDSG(
  pres: PptxGenJS,
  slide: PptxGenJS.Slide,
  sg: SDSG,
  x: number,
  y: number,
  w: number,
  h: number,
  layout: LayoutDirection,
) {
  const isSD = sg.type === 'SD';
  const isH = layout === 'horizontal';
  // 簡易: 五角形ペンタゴン形状（レイアウト・種別で rotate 調整）
  slide.addShape(pres.ShapeType.pentagon, {
    x: pxToInch(x),
    y: pxToInch(y),
    w: pxToInch(w),
    h: pxToInch(h),
    fill: { color: isSD ? 'FFE8E8' : 'E8F0FF' },
    line: { color: isSD ? 'AA3333' : '3333AA', width: 1.5 },
    rotate: isH ? (isSD ? 180 : 0) : (isSD ? 90 : 270),
  });
  slide.addText(sg.label, {
    x: pxToInch(x),
    y: pxToInch(y),
    w: pxToInch(w),
    h: pxToInch(h),
    fontSize: sg.style?.fontSize ?? 11,
    bold: sg.style?.bold ?? true,
    align: 'center',
    valign: 'middle',
    color: '222222',
  });
  void isH;
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
