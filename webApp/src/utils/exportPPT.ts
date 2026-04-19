// ============================================================================
// PPTX export（刷新版）
// - 横型レイアウト → 横型 PPTX（13.333 × 7.5 inch）
// - 縦型レイアウト → 縦型 PPTX（7.5 × 13.333 inch）
// - SDSG は rightArrow（ブロック矢印）を回転して描画
// - 二重線 Box は altText "TEMER_DBL" を付けておき、出力後に XML ポストプロセス
//   で <a:ln> に cmpd="dbl" を注入して本物の二重線に
// - ExportDialog の scale(スケーリング有無) / offset(余白比) を反映
// - 背景・グリッド・ルーラー等の PPTX 不要オプションは受け付けない
// ============================================================================

import PptxGenJS from 'pptxgenjs';
import type {
  Box,
  Sheet,
  SDSG,
  ProjectSettings,
  LayoutDirection,
  LegendSettings,
  PeriodLabelSettings,
  TimeArrowSettings,
} from '../types';
import { computeTimeArrow } from './timeArrow';
import { computePeriodLabels } from './periodLabels';
import { computeLegendItems, type LegendItem } from './legend';
import { computeContentBounds } from './fitBounds';
import { BOX_RENDER_SPECS } from '../store/defaults';
import { computeBoxDisplay } from './typeDisplay';
import { getPaperInch, type PaperSizeKey } from './paperSizes';

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

export interface PPTXExportOptions {
  filename?: string;
  sheet: Sheet;
  settings: ProjectSettings;
  scale?: boolean;              // 既定 true
  offset?: number;              // 既定 0.1
  paperSize?: PaperSizeKey;     // 既定: レイアウトに応じて 16:9
}

const PX_PER_INCH = 96;

interface Transform {
  toX: (worldX: number) => number;  // world px → slide inch
  toY: (worldY: number) => number;
  toLen: (worldPx: number) => number;
  scale: number;
}

export async function exportToPPTX(opts: PPTXExportOptions): Promise<void> {
  if (!opts || !opts.sheet || !opts.settings) {
    throw new Error('exportToPPTX: options.sheet と options.settings が必須です');
  }
  const filename = opts.filename ?? 'TEMer.pptx';
  const scale = opts.scale ?? true;
  const offsetRatio = opts.offset ?? 0.1;
  const layout = opts.settings.layout;
  const isH = layout === 'horizontal';

  // 用紙サイズ決定: 明示指定があればそれ、なければレイアウト方向に応じた 16:9 デフォルト
  const paperKey: PaperSizeKey = opts.paperSize ?? (isH ? '16:9' : 'A4-portrait');
  const paper = getPaperInch(paperKey);
  const slideW = paper.width;
  const slideH = paper.height;
  const slideWpx = slideW * PX_PER_INCH;
  const slideHpx = slideH * PX_PER_INCH;

  const bbox = computeContentBounds(opts.sheet, layout, opts.settings)
    ?? { x: 0, y: 0, width: slideWpx, height: slideHpx };

  const t = buildTransform(bbox, slideWpx, slideHpx, scale, offsetRatio);

  const pres = new PptxGenJS();
  pres.defineLayout({ name: 'TEMER', width: slideW, height: slideH });
  pres.layout = 'TEMER';
  const slide = pres.addSlide();
  // 背景は未設定

  // 描画（背面 → 前面の順）
  drawTimeArrow(pres, slide, opts.sheet, layout, opts.settings.timeArrow, t);
  drawPeriodLabels(pres, slide, opts.sheet, layout, opts.settings.periodLabels, opts.settings.timeArrow, t);
  drawLines(pres, slide, opts.sheet, layout, t);
  drawSDSGs(pres, slide, opts.sheet, layout, opts.settings, t);
  drawBoxes(pres, slide, opts.sheet, layout, opts.settings, t);
  drawLegend(pres, slide, opts.sheet, layout, opts.settings.legend, t);

  // PptxGenJS の標準の writeFile でダウンロード（ポストプロセスなし、
  // 二重線は 2 矩形重ね描きで視覚的に同等）
  await pres.writeFile({ fileName: filename });
}

// ----------------------------------------------------------------------------
// Transform
// ----------------------------------------------------------------------------

function buildTransform(
  bbox: { x: number; y: number; width: number; height: number },
  slideWpx: number,
  slideHpx: number,
  scale: boolean,
  offsetRatio: number,
): Transform {
  let sc = 1;
  let offX = 0;
  let offY = 0;
  if (scale) {
    const cw = bbox.width * (1 + offsetRatio * 2);
    const ch = bbox.height * (1 + offsetRatio * 2);
    sc = Math.min(slideWpx / Math.max(1, cw), slideHpx / Math.max(1, ch));
    const drawnW = bbox.width * sc;
    const drawnH = bbox.height * sc;
    offX = (slideWpx - drawnW) / 2 - bbox.x * sc;
    offY = (slideHpx - drawnH) / 2 - bbox.y * sc;
  } else {
    sc = 1;
    offX = (slideWpx - bbox.width) / 2 - bbox.x;
    offY = (slideHpx - bbox.height) / 2 - bbox.y;
  }
  return {
    toX: (wx) => (wx * sc + offX) / PX_PER_INCH,
    toY: (wy) => (wy * sc + offY) / PX_PER_INCH,
    toLen: (p) => (p * sc) / PX_PER_INCH,
    scale: sc,
  };
}

// ----------------------------------------------------------------------------
// 共通ヘルパ
// ----------------------------------------------------------------------------

function rgbToHex(color: string): string {
  if (!color) return '222222';
  const c = color.trim();
  if (c.startsWith('#')) return c.slice(1).toUpperCase();
  // rgb(r,g,b)
  const m = c.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    const r = Number(m[1]).toString(16).padStart(2, '0');
    const g = Number(m[2]).toString(16).padStart(2, '0');
    const b = Number(m[3]).toString(16).padStart(2, '0');
    return (r + g + b).toUpperCase();
  }
  return '222222';
}

function toPptAlign(a: 'left' | 'center' | 'right'): 'left' | 'center' | 'right' {
  return a;
}
function toPptVAlign(a: 'top' | 'middle' | 'bottom'): 'top' | 'middle' | 'bottom' {
  return a;
}

function fontSizeScaled(base: number, t: Transform): number {
  // 文字が小さくなりすぎない下限を設ける
  return Math.max(6, base * Math.max(0.4, t.scale));
}

// ----------------------------------------------------------------------------
// Box
// ----------------------------------------------------------------------------

function drawBoxes(
  pres: PptxGenJS,
  slide: PptxGenJS.Slide,
  sheet: Sheet,
  layout: LayoutDirection,
  settings: ProjectSettings,
  t: Transform,
) {
  for (const b of sheet.boxes) {
    renderBox(pres, slide, b, layout, settings, sheet, t);
  }
}

function renderBox(
  pres: PptxGenJS,
  slide: PptxGenJS.Slide,
  b: Box,
  layout: LayoutDirection,
  settings: ProjectSettings,
  sheet: Sheet,
  t: Transform,
) {
  const x = t.toX(b.x);
  const y = t.toY(b.y);
  const w = t.toLen(b.width);
  const h = t.toLen(b.height);
  const spec = BOX_RENDER_SPECS[b.type] ?? BOX_RENDER_SPECS.normal;
  const borderColor = rgbToHex(b.style?.borderColor ?? '#222');
  const fill = { color: rgbToHex(b.style?.backgroundColor ?? '#ffffff') };
  const isEllipse = (b.shape ?? spec.defaultShape) === 'ellipse';
  const shapeType = isEllipse ? pres.ShapeType.ellipse : pres.ShapeType.rect;

  switch (b.type) {
    case 'EFP':
    case '2nd-EFP': {
      // 二重線: 外枠 + 内枠の 2 矩形重ね描き（PptxGenJS が cmpd='dbl' を未サポート）
      slide.addShape(shapeType, {
        x, y, w, h,
        fill,
        line: { color: borderColor, width: 1 },
      });
      const ins = Math.max(0.015, 0.025 * Math.min(w, h));
      slide.addShape(shapeType, {
        x: x + ins, y: y + ins,
        w: Math.max(0.01, w - ins * 2),
        h: Math.max(0.01, h - ins * 2),
        fill: { color: 'FFFFFF', transparency: 100 },
        line: { color: borderColor, width: 1 },
      });
      break;
    }
    case 'OPP':
      slide.addShape(shapeType, {
        x, y, w, h,
        fill,
        line: { color: borderColor, width: 3.0 },
      });
      break;
    case 'P-EFP':
    case 'P-2nd-EFP': {
      // 二重点線: 外枠+内枠を両方 dash
      slide.addShape(shapeType, {
        x, y, w, h,
        fill,
        line: { color: borderColor, width: 1.5, dashType: 'dash' },
      });
      const inset = Math.max(0.02, 0.03 * Math.min(w, h));
      slide.addShape(shapeType, {
        x: x + inset,
        y: y + inset,
        w: Math.max(0.01, w - inset * 2),
        h: Math.max(0.01, h - inset * 2),
        fill: { color: 'FFFFFF', transparency: 100 },
        line: { color: borderColor, width: 1.5, dashType: 'dash' },
      });
      break;
    }
    case 'annotation':
      slide.addShape(shapeType, {
        x, y, w, h,
        fill,
        line: { color: borderColor, width: 1.0, dashType: 'sysDot' },
      });
      break;
    case 'BFP':
      slide.addShape(shapeType, {
        x, y, w, h,
        fill,
        line: { color: borderColor, width: 2.0 },
      });
      break;
    default:
      slide.addShape(shapeType, {
        x, y, w, h,
        fill,
        line: { color: borderColor, width: 1.5 },
      });
  }

  // 本文テキスト
  const isTextVertical = b.textOrientation === 'vertical';
  slide.addText(b.label, {
    x, y, w, h,
    align: toPptAlign((b.style?.textAlign ?? 'center') as 'left' | 'center' | 'right'),
    valign: toPptVAlign((b.style?.verticalAlign ?? 'middle') as 'top' | 'middle' | 'bottom'),
    fontSize: fontSizeScaled(b.style?.fontSize ?? settings.defaultFontSize, t),
    bold: b.style?.bold,
    italic: b.style?.italic,
    underline: b.style?.underline ? { style: 'sng' } : undefined,
    color: rgbToHex(b.style?.color ?? '#222'),
    fontFace: b.style?.fontFamily,
    vert: isTextVertical ? 'eaVert' : undefined,
    margin: 2,
  });

  // タイプラベル
  drawBoxTypeLabel(slide, b, layout, settings, sheet, t);
  // サブラベル
  drawBoxSubLabel(slide, b, layout, t);
}

function drawBoxTypeLabel(
  slide: PptxGenJS.Slide,
  b: Box,
  layout: LayoutDirection,
  settings: ProjectSettings,
  sheet: Sheet,
  t: Transform,
) {
  if (b.type === 'normal' || b.type === 'annotation') return;
  const vis = settings.typeLabelVisibility;
  if (vis && (vis as Record<string, boolean | undefined>)[b.type] === false) return;
  const typeText = computeBoxDisplay(sheet.boxes, b, layout);
  if (!typeText) return;

  const isH = layout === 'horizontal';
  const baseFS = b.typeLabelFontSize ?? 11;
  const fs = fontSizeScaled(baseFS, t);
  const bold = b.typeLabelBold !== false;
  const italic = !!b.typeLabelItalic;
  const fontFace = b.typeLabelFontFamily;

  if (isH) {
    // 横型: Box 上辺の外側中央
    const wpx = Math.max(60, b.width);
    const hpx = Math.max(14, baseFS * 1.8);
    slide.addText(typeText, {
      x: t.toX(b.x + b.width / 2 - wpx / 2),
      y: t.toY(b.y - hpx - 4),
      w: t.toLen(wpx),
      h: t.toLen(hpx),
      align: 'center',
      valign: 'bottom',
      fontSize: fs,
      bold,
      italic,
      fontFace,
      color: '222222',
      margin: 1,
    });
  } else {
    // 縦型: Box 左辺の外側中央、縦書き
    const wpx = Math.max(14, baseFS * 1.8);
    const hpx = Math.max(60, b.height);
    slide.addText(typeText, {
      x: t.toX(b.x - wpx - 4),
      y: t.toY(b.y + b.height / 2 - hpx / 2),
      w: t.toLen(wpx),
      h: t.toLen(hpx),
      align: 'center',
      valign: 'middle',
      fontSize: fs,
      bold,
      italic,
      fontFace,
      color: '222222',
      vert: 'eaVert',
      margin: 1,
    });
  }
}

function drawBoxSubLabel(slide: PptxGenJS.Slide, b: Box, layout: LayoutDirection, t: Transform) {
  const text = b.subLabel ?? b.participantId;
  if (!text) return;
  const isH = layout === 'horizontal';
  const baseFS = b.subLabelFontSize ?? 10;
  const fs = fontSizeScaled(baseFS, t);
  const offX = b.subLabelOffsetX ?? 0;
  const offY = b.subLabelOffsetY ?? 0;
  if (isH) {
    const wpx = Math.max(80, b.width);
    const hpx = Math.max(14, baseFS * 1.6);
    slide.addText(text, {
      x: t.toX(b.x + b.width / 2 - wpx / 2 + offX),
      y: t.toY(b.y + b.height + 6 + offY),
      w: t.toLen(wpx),
      h: t.toLen(hpx),
      align: 'center',
      valign: 'top',
      fontSize: fs,
      color: '555555',
      margin: 1,
    });
  } else {
    const wpx = Math.max(14, baseFS * 1.6);
    const hpx = Math.max(80, b.height);
    slide.addText(text, {
      x: t.toX(b.x + b.width + 6 + offX),
      y: t.toY(b.y + b.height / 2 - hpx / 2 + offY),
      w: t.toLen(wpx),
      h: t.toLen(hpx),
      align: 'center',
      valign: 'middle',
      fontSize: fs,
      color: '555555',
      vert: 'eaVert',
      margin: 1,
    });
  }
}

// ----------------------------------------------------------------------------
// Line
// ----------------------------------------------------------------------------

function drawLines(
  pres: PptxGenJS,
  slide: PptxGenJS.Slide,
  sheet: Sheet,
  layout: LayoutDirection,
  t: Transform,
) {
  const byId = new Map(sheet.boxes.map((b) => [b.id, b]));
  const dashedEndpoints = new Set(['annotation', 'P-EFP', 'P-2nd-EFP']);
  const isH = layout === 'horizontal';

  for (const l of sheet.lines) {
    const from = byId.get(l.from);
    const to = byId.get(l.to);
    if (!from || !to) continue;

    const connectsDashed = dashedEndpoints.has(from.type) || dashedEndpoints.has(to.type);
    const shouldDash = l.type === 'XLine' || connectsDashed;

    // キャンバスの既定ハンドル: 横型 左→右 / 縦型 上→下
    const x1 = isH ? from.x + from.width : from.x + from.width / 2;
    const y1 = isH ? from.y + from.height / 2 : from.y + from.height;
    const x2 = isH ? to.x : to.x + to.width / 2;
    const y2 = isH ? to.y + to.height / 2 : to.y;

    // ユーザ座標のオフセットを world 座標(x,y)へ適用
    // 横型: Time=+x, Item=-y
    // 縦型: Time=+y, Item=+x
    const sOffT = l.startOffsetTime ?? 0;
    const eOffT = l.endOffsetTime ?? 0;
    const sOffI = l.startOffsetItem ?? 0;
    const eOffI = l.endOffsetItem ?? 0;
    const sDx = isH ? sOffT : sOffI;
    const sDy = isH ? -sOffI : sOffT;
    const eDx = isH ? eOffT : eOffI;
    const eDy = isH ? -eOffI : eOffT;

    const sx0 = x1 + sDx;
    const sy0 = y1 + sDy;
    const tx0 = x2 + eDx;
    const ty0 = y2 + eDy;

    const dx = tx0 - sx0;
    const dy = ty0 - sy0;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const startMargin = l.startMargin ?? 0;
    const endMargin = l.endMargin ?? 0;

    const sx = sx0 + ux * startMargin;
    const sy = sy0 + uy * startMargin;
    const ex = tx0 - ux * endMargin;
    const ey = ty0 - uy * endMargin;

    const minX = Math.min(sx, ex);
    const minY = Math.min(sy, ey);
    const w = Math.max(1, Math.abs(ex - sx));
    const h = Math.max(1, Math.abs(ey - sy));

    slide.addShape(pres.ShapeType.line, {
      x: t.toX(minX),
      y: t.toY(minY),
      w: t.toLen(w),
      h: t.toLen(h),
      line: {
        color: rgbToHex(l.style?.color ?? '#222'),
        width: l.style?.strokeWidth ?? 1.5,
        dashType: shouldDash ? 'dash' : 'solid',
        endArrowType: 'triangle',
      },
      flipH: ex < sx,
      flipV: ey < sy,
    });
  }
}

// ----------------------------------------------------------------------------
// SDSG: rightArrow を回転
// ----------------------------------------------------------------------------

function drawSDSGs(
  pres: PptxGenJS,
  slide: PptxGenJS.Slide,
  sheet: Sheet,
  layout: LayoutDirection,
  settings: ProjectSettings,
  t: Transform,
) {
  const isH = layout === 'horizontal';
  for (const sg of sheet.sdsg) {
    let anchorX = 0, anchorY = 0;
    const attBox = sheet.boxes.find((b) => b.id === sg.attachedTo);
    if (attBox) {
      anchorX = attBox.x + attBox.width / 2;
      anchorY = attBox.y + attBox.height / 2;
    } else {
      const attLine = sheet.lines.find((l) => l.id === sg.attachedTo);
      if (attLine) {
        const fb = sheet.boxes.find((b) => b.id === attLine.from);
        const tb = sheet.boxes.find((b) => b.id === attLine.to);
        if (fb && tb) {
          anchorX = (fb.x + fb.width / 2 + tb.x + tb.width / 2) / 2;
          anchorY = (fb.y + fb.height / 2 + tb.y + tb.height / 2) / 2;
        } else {
          continue;
        }
      } else {
        continue;
      }
    }
    const timeOff = sg.timeOffset ?? 0;
    const itemOff = sg.itemOffset ?? 0;
    const w = sg.width ?? 70;
    const h = sg.height ?? 40;
    const wx = anchorX - w / 2 + (isH ? timeOff : itemOff);
    const wy = anchorY - h / 2 + (isH ? itemOff : timeOff);

    // ブロック矢印（rightArrow）は既定で右向き
    // 横型: SD=下向き(90°), SG=上向き(270°)
    // 縦型: SD=右向き(0°), SG=左向き(180°)
    const isSD = sg.type === 'SD';
    const rotate = isH ? (isSD ? 90 : 270) : (isSD ? 0 : 180);

    const bgColor = rgbToHex(sg.style?.backgroundColor ?? '#ffffff');
    const borderColor = rgbToHex(sg.style?.borderColor ?? '#333');

    // 回転時の bounding box 入れ替えを考慮:
    // 横型は右向き rightArrow を 90/270°回転 → 矢印の長さが y方向、幅がx方向
    // つまり描画矩形は縦長(w=sg.width→逆、h=sg.height)
    // PptxGenJS は rotate 指定しても bbox 指定は同じまま。「指定 w,h に内接する」ように見える。
    // 直感: キャンバスの SDSG は「横型では縦方向の矢印」＝ 縦長領域。ここでは w = sg.width (横幅), h = sg.height (高さ)
    // rightArrow は元々横長なので、90°回転すれば縦長になる → w,h を入れ替えた領域として扱うのが自然。
    let rectW = w;
    let rectH = h;
    if (isH) {
      // 90/270° なので、矩形上の rightArrow の「長さ方向」は h 方向に
      // rightArrow は元々 width=h, height=w と考え、配置矩形の w/h を入れ替える
      rectW = h;
      rectH = w;
    }
    const rectX = anchorX - rectW / 2 + (isH ? timeOff : itemOff);
    const rectY = anchorY - rectH / 2 + (isH ? itemOff : timeOff);

    slide.addShape(pres.ShapeType.rightArrow, {
      x: t.toX(rectX),
      y: t.toY(rectY),
      w: t.toLen(rectW),
      h: t.toLen(rectH),
      fill: { color: bgColor },
      line: { color: borderColor, width: 1.5 },
      rotate,
    });
    // ラベル (本体): 中央
    slide.addText(sg.label, {
      x: t.toX(wx),
      y: t.toY(wy),
      w: t.toLen(w),
      h: t.toLen(h),
      align: 'center',
      valign: 'middle',
      fontSize: fontSizeScaled(sg.style?.fontSize ?? 11, t),
      bold: sg.style?.bold ?? true,
      color: rgbToHex(sg.style?.color ?? '#222'),
    });

    // タイプラベル (SD/SG) - Box と同形式
    drawSDSGTypeLabel(slide, sg, wx, wy, w, h, isH, settings, t);
    // サブラベル
    drawSDSGSubLabel(slide, sg, wx, wy, w, h, isH, t);
  }
}

function drawSDSGTypeLabel(
  slide: PptxGenJS.Slide,
  sg: SDSG,
  wx: number,
  wy: number,
  w: number,
  h: number,
  isH: boolean,
  settings: ProjectSettings,
  t: Transform,
) {
  const vis = settings.typeLabelVisibility;
  if (vis && (vis as Record<string, boolean | undefined>)[sg.type] === false) return;
  const baseFS = sg.typeLabelFontSize ?? 11;
  const fs = fontSizeScaled(baseFS, t);
  const bold = sg.typeLabelBold !== false;
  const italic = !!sg.typeLabelItalic;
  const fontFace = sg.typeLabelFontFamily;
  if (isH) {
    const wpx = Math.max(60, w);
    const hpx = Math.max(14, baseFS * 1.8);
    slide.addText(sg.type, {
      x: t.toX(wx + w / 2 - wpx / 2),
      y: t.toY(wy - hpx - 4),
      w: t.toLen(wpx),
      h: t.toLen(hpx),
      align: 'center',
      valign: 'bottom',
      fontSize: fs,
      bold,
      italic,
      fontFace,
      color: '222222',
      margin: 1,
    });
  } else {
    const wpx = Math.max(14, baseFS * 1.8);
    const hpx = Math.max(60, h);
    slide.addText(sg.type, {
      x: t.toX(wx - wpx - 4),
      y: t.toY(wy + h / 2 - hpx / 2),
      w: t.toLen(wpx),
      h: t.toLen(hpx),
      align: 'center',
      valign: 'middle',
      fontSize: fs,
      bold,
      italic,
      fontFace,
      color: '222222',
      vert: 'eaVert',
      margin: 1,
    });
  }
}

function drawSDSGSubLabel(
  slide: PptxGenJS.Slide,
  sg: SDSG,
  wx: number,
  wy: number,
  w: number,
  h: number,
  isH: boolean,
  t: Transform,
) {
  if (!sg.subLabel) return;
  const baseFS = sg.subLabelFontSize ?? 10;
  const fs = fontSizeScaled(baseFS, t);
  const offX = sg.subLabelOffsetX ?? 0;
  const offY = sg.subLabelOffsetY ?? 0;
  if (isH) {
    const wpx = Math.max(80, w);
    const hpx = Math.max(14, baseFS * 1.6);
    slide.addText(sg.subLabel, {
      x: t.toX(wx + w / 2 - wpx / 2 + offX),
      y: t.toY(wy + h + 6 + offY),
      w: t.toLen(wpx),
      h: t.toLen(hpx),
      align: 'center',
      valign: 'top',
      fontSize: fs,
      color: '555555',
      margin: 1,
    });
  } else {
    const wpx = Math.max(14, baseFS * 1.6);
    const hpx = Math.max(80, h);
    slide.addText(sg.subLabel, {
      x: t.toX(wx + w + 6 + offX),
      y: t.toY(wy + h / 2 - hpx / 2 + offY),
      w: t.toLen(wpx),
      h: t.toLen(hpx),
      align: 'center',
      valign: 'middle',
      fontSize: fs,
      color: '555555',
      vert: 'eaVert',
      margin: 1,
    });
  }
}

// ----------------------------------------------------------------------------
// Time arrow
// ----------------------------------------------------------------------------

function drawTimeArrow(
  pres: PptxGenJS,
  slide: PptxGenJS.Slide,
  sheet: Sheet,
  layout: LayoutDirection,
  settings: TimeArrowSettings,
  t: Transform,
) {
  if (!settings || !settings.autoInsert) return;
  const arrow = computeTimeArrow(sheet, layout, settings);
  if (!arrow) return;

  const minX = Math.min(arrow.startX, arrow.endX);
  const minY = Math.min(arrow.startY, arrow.endY);
  const w = Math.max(1, Math.abs(arrow.endX - arrow.startX));
  const h = Math.max(1, Math.abs(arrow.endY - arrow.startY));

  slide.addShape(pres.ShapeType.line, {
    x: t.toX(minX),
    y: t.toY(minY),
    w: t.toLen(w),
    h: t.toLen(h),
    line: {
      color: '222222',
      width: arrow.strokeWidth,
      endArrowType: 'triangle',
    },
    flipH: arrow.endX < arrow.startX,
    flipV: arrow.endY < arrow.startY,
  });

  // ラベル
  const isVert = layout === 'vertical';
  const fsBase = arrow.fontSize;
  const fs = fontSizeScaled(fsBase, t);
  const labelBoxWpx = isVert ? Math.max(20, fsBase * 1.8) : Math.max(160, fsBase * 12);
  const labelBoxHpx = isVert ? Math.max(120, fsBase * 12) : Math.max(20, fsBase * 1.8);
  // labelSide に応じて anchor 変換
  let lbx = arrow.labelX;
  let lby = arrow.labelY;
  switch (arrow.labelSide) {
    case 'top':    // 下辺が labelY に一致
      lbx = arrow.labelX - labelBoxWpx / 2;
      lby = arrow.labelY - labelBoxHpx;
      break;
    case 'bottom':
      lbx = arrow.labelX - labelBoxWpx / 2;
      lby = arrow.labelY;
      break;
    case 'left':   // 右辺が labelX に一致
      lbx = arrow.labelX - labelBoxWpx;
      lby = arrow.labelY - labelBoxHpx / 2;
      break;
    case 'right':
      lbx = arrow.labelX;
      lby = arrow.labelY - labelBoxHpx / 2;
      break;
  }
  slide.addText(arrow.label, {
    x: t.toX(lbx),
    y: t.toY(lby),
    w: t.toLen(labelBoxWpx),
    h: t.toLen(labelBoxHpx),
    align: 'center',
    valign: 'middle',
    fontSize: fs,
    bold: !!settings.labelBold,
    italic: !!settings.labelItalic,
    underline: settings.labelUnderline ? { style: 'sng' } : undefined,
    fontFace: settings.labelFontFamily,
    color: '222222',
    vert: isVert ? 'eaVert' : undefined,
    margin: 1,
  });
}

// ----------------------------------------------------------------------------
// Period labels
// ----------------------------------------------------------------------------

function drawPeriodLabels(
  pres: PptxGenJS,
  slide: PptxGenJS.Slide,
  sheet: Sheet,
  layout: LayoutDirection,
  settings: PeriodLabelSettings,
  timeArrow: TimeArrowSettings,
  t: Transform,
) {
  if (!settings || !settings.includeInExport) return;
  if (sheet.periodLabels.length === 0) return;
  const geom = computePeriodLabels(sheet, layout, settings, timeArrow);
  if (!geom) return;

  const isH = layout === 'horizontal';
  const sideH = settings.labelSideHorizontal ?? 'top';
  const sideV = settings.labelSideVertical ?? 'right';

  // 主軸線
  if (settings.showDividers) {
    const minX = Math.min(geom.startX, geom.endX);
    const minY = Math.min(geom.startY, geom.endY);
    const w = Math.max(1, Math.abs(geom.endX - geom.startX));
    const h = Math.max(1, Math.abs(geom.endY - geom.startY));
    slide.addShape(pres.ShapeType.line, {
      x: t.toX(minX),
      y: t.toY(minY),
      w: t.toLen(w),
      h: t.toLen(h),
      line: { color: '555555', width: settings.dividerStrokeWidth },
    });
  }

  // band スタイル: 境界位置を計算
  if (settings.bandStyle === 'band') {
    const sorted = [...geom.items].sort((a, b) => (isH ? a.x - b.x : a.y - b.y));
    const bounds: number[] = [];
    bounds.push(isH ? geom.startX : geom.startY);
    sorted.forEach((it, i) => {
      if (i === 0) return;
      const prev = sorted[i - 1];
      const mid = isH ? (prev.x + it.x) / 2 : (prev.y + it.y) / 2;
      bounds.push(mid);
    });
    bounds.push(isH ? geom.endX : geom.endY);

    // 境界の短い縦（or 横）線
    if (settings.showDividers) {
      const tickLen = 10;
      for (const bv of bounds) {
        if (isH) {
          slide.addShape(pres.ShapeType.line, {
            x: t.toX(bv),
            y: t.toY(geom.startY - tickLen / 2),
            w: t.toLen(1),
            h: t.toLen(tickLen),
            line: { color: '555555', width: settings.dividerStrokeWidth * 1.4 },
          });
        } else {
          slide.addShape(pres.ShapeType.line, {
            x: t.toX(geom.startX - tickLen / 2),
            y: t.toY(bv),
            w: t.toLen(tickLen),
            h: t.toLen(1),
            line: { color: '555555', width: settings.dividerStrokeWidth * 1.4 },
          });
        }
      }
    }

    // ラベル
    const fsBase = settings.fontSize;
    const fs = fontSizeScaled(fsBase, t);
    sorted.forEach((item, i) => {
      const left = bounds[i];
      const right = bounds[i + 1];
      const center = (left + right) / 2;
      placePeriodLabel(slide, item.label, center, geom, isH, sideH, sideV, fs, fsBase, t);
    });
    return;
  }

  // tick スタイル: ラベルを各アイテム位置に配置
  const fsBase = settings.fontSize;
  const fs = fontSizeScaled(fsBase, t);
  geom.items.forEach((item) => {
    // center 値: 横型は item.x、縦型は item.y
    const center = isH ? item.x : item.y;
    placePeriodLabel(slide, item.label, center, geom, isH, sideH, sideV, fs, fsBase, t);
    // tick の短線
    if (settings.showDividers) {
      const tickLen = 8;
      if (isH) {
        slide.addShape(pres.ShapeType.line, {
          x: t.toX(item.x),
          y: t.toY(item.y - tickLen / 2),
          w: t.toLen(1),
          h: t.toLen(tickLen),
          line: { color: '555555', width: settings.dividerStrokeWidth },
        });
      } else {
        slide.addShape(pres.ShapeType.line, {
          x: t.toX(item.x - tickLen / 2),
          y: t.toY(item.y),
          w: t.toLen(tickLen),
          h: t.toLen(1),
          line: { color: '555555', width: settings.dividerStrokeWidth },
        });
      }
    }
  });
}

function placePeriodLabel(
  slide: PptxGenJS.Slide,
  label: string,
  centerWorld: number,
  geom: { startX: number; startY: number; endX: number; endY: number },
  isH: boolean,
  sideH: 'top' | 'bottom',
  sideV: 'left' | 'right',
  fs: number,
  baseFS: number,
  t: Transform,
) {
  if (isH) {
    const wpx = Math.max(80, baseFS * 8);
    const hpx = Math.max(18, baseFS * 1.8);
    const cx = centerWorld - wpx / 2;
    const cy = sideH === 'top' ? geom.startY - hpx - 2 : geom.startY + 2;
    slide.addText(label, {
      x: t.toX(cx),
      y: t.toY(cy),
      w: t.toLen(wpx),
      h: t.toLen(hpx),
      align: 'center',
      valign: sideH === 'top' ? 'bottom' : 'top',
      fontSize: fs,
      color: '222222',
      margin: 1,
    });
  } else {
    const wpx = Math.max(18, baseFS * 1.8);
    const hpx = Math.max(80, baseFS * 8);
    const cx = sideV === 'right' ? geom.startX + 2 : geom.startX - wpx - 2;
    const cy = centerWorld - hpx / 2;
    slide.addText(label, {
      x: t.toX(cx),
      y: t.toY(cy),
      w: t.toLen(wpx),
      h: t.toLen(hpx),
      align: 'center',
      valign: 'middle',
      fontSize: fs,
      color: '222222',
      vert: 'eaVert',
      margin: 1,
    });
  }
}

// ----------------------------------------------------------------------------
// Legend
// ----------------------------------------------------------------------------

function drawLegend(
  pres: PptxGenJS,
  slide: PptxGenJS.Slide,
  sheet: Sheet,
  layout: LayoutDirection,
  lg: LegendSettings,
  t: Transform,
) {
  if (!lg || !lg.includeInExport) return;
  const items = computeLegendItems(sheet, lg);
  if (items.length === 0) return;

  const cols = Math.max(1, Math.floor(
    (layout === 'vertical' ? lg.columnsVertical : lg.columnsHorizontal) ?? lg.columns ?? 1
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

  // 行高（1行〜2行）
  const rowHpx = Math.max(baseFS * (showDesc ? 2 : 1) * 1.4 + 4, sampleH + 4);
  const cellLabelMinPx = Math.max(100, baseFS * 10);
  const cellW = iconColMinPx + 8 + cellLabelMinPx;
  const gridW = cols * cellW + (cols - 1) * cellGap;
  const gridH = rows * rowHpx + (rows - 1) * rowGap;

  // 全体サイズ
  const titleHpx = titleBaseFS * 1.4 + 6;
  let boxW = 0;
  let boxH = 0;
  if (titlePosition === 'top') {
    boxW = Math.max(lg.minWidth, gridW + padding * 2);
    boxH = gridH + padding * 2 + (showTitle ? titleHpx : 0);
  } else {
    // 'left': タイトル左 + グリッド右
    const titleAreaW = Math.max(60, titleBaseFS * 6);
    boxW = Math.max(lg.minWidth, gridW + padding * 2 + (showTitle ? titleAreaW + 12 : 0));
    boxH = Math.max(gridH + padding * 2, titleBaseFS * 2);
  }

  const bx = lg.position.x;
  const by = lg.position.y;

  // 背景 / 枠
  if (lg.backgroundStyle !== 'none' || lg.borderWidth > 0) {
    slide.addShape(pres.ShapeType.rect, {
      x: t.toX(bx),
      y: t.toY(by),
      w: t.toLen(boxW),
      h: t.toLen(boxH),
      fill: lg.backgroundStyle === 'none'
        ? { color: 'FFFFFF', transparency: 100 }
        : { color: 'FFFFFF' },
      line: lg.borderWidth > 0
        ? { color: rgbToHex(lg.borderColor ?? '#999'), width: lg.borderWidth }
        : { color: 'FFFFFF', width: 0, transparency: 100 },
    });
  }

  // タイトル
  if (showTitle) {
    const titleBold = lg.titleBold !== false;
    const titleItalic = !!lg.titleItalic;
    const titleUnderline = !!lg.titleUnderline;
    const titleAlign = (lg.titleAlign ?? 'left') as 'left' | 'center' | 'right';
    const titleVert = lg.titleWritingMode === 'vertical';
    if (titlePosition === 'top') {
      slide.addText(lg.title, {
        x: t.toX(bx + padding),
        y: t.toY(by + padding),
        w: t.toLen(boxW - padding * 2),
        h: t.toLen(titleHpx),
        align: titleAlign,
        valign: 'middle',
        fontSize: titleFS,
        bold: titleBold,
        italic: titleItalic,
        underline: titleUnderline ? { style: 'sng' } : undefined,
        fontFace: lg.titleFontFamily ?? lg.fontFamily,
        color: '222222',
        vert: titleVert ? 'eaVert' : undefined,
      });
    } else {
      const titleAreaW = Math.max(60, titleBaseFS * 6);
      const tva = lg.titleVerticalAlign ?? 'top';
      const vAlign: 'top' | 'middle' | 'bottom' = tva === 'middle' ? 'middle' : tva === 'bottom' ? 'bottom' : 'top';
      slide.addText(lg.title, {
        x: t.toX(bx + padding),
        y: t.toY(by + padding),
        w: t.toLen(titleAreaW),
        h: t.toLen(boxH - padding * 2),
        align: titleAlign,
        valign: vAlign,
        fontSize: titleFS,
        bold: titleBold,
        italic: titleItalic,
        underline: titleUnderline ? { style: 'sng' } : undefined,
        fontFace: lg.titleFontFamily ?? lg.fontFamily,
        color: '222222',
        vert: titleVert ? 'eaVert' : undefined,
      });
    }
  }

  // 項目グリッド開始位置
  const gridOriginX = titlePosition === 'left'
    ? bx + padding + (showTitle ? Math.max(60, titleBaseFS * 6) + 12 : 0)
    : bx + padding;
  const gridOriginY = titlePosition === 'top'
    ? by + padding + (showTitle ? titleHpx : 0)
    : by + padding;

  // 各セル描画
  items.forEach((item, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const cellX = gridOriginX + col * (cellW + cellGap);
    const cellY = gridOriginY + row * (rowHpx + rowGap);

    // アイコン（中央揃え）
    const iconX = cellX + (iconColMinPx - sampleW) / 2;
    const iconY = cellY + (rowHpx - sampleH) / 2;
    drawLegendIcon(pres, slide, item, iconX, iconY, sampleW, sampleH, t);

    // テキスト（左揃え）
    const overrideKey = `${item.category}:${item.key}`;
    const ov = lg.itemOverrides?.[overrideKey];
    const label = ov?.label ?? item.label;
    const description = ov?.description ?? item.description;
    const useShowDesc = showDescPerRow[idx];
    const textX = cellX + iconColMinPx + 8;
    const textW = cellLabelMinPx;
    if (useShowDesc && description) {
      slide.addText([
        { text: label, options: { bold: true, fontSize: fs } },
        { text: `\n${description}`, options: { fontSize: fs * 0.85, color: '666666' } },
      ], {
        x: t.toX(textX),
        y: t.toY(cellY),
        w: t.toLen(textW),
        h: t.toLen(rowHpx),
        align: 'left',
        valign: 'middle',
        color: '222222',
        fontFace: lg.fontFamily,
      });
    } else {
      slide.addText(label, {
        x: t.toX(textX),
        y: t.toY(cellY),
        w: t.toLen(textW),
        h: t.toLen(rowHpx),
        align: 'left',
        valign: 'middle',
        bold: true,
        fontSize: fs,
        color: '222222',
        fontFace: lg.fontFamily,
      });
    }
  });
}

function drawLegendIcon(
  pres: PptxGenJS,
  slide: PptxGenJS.Slide,
  item: LegendItem,
  x: number,
  y: number,
  w: number,
  h: number,
  t: Transform,
) {
  if (item.category === 'box') {
    const isPEfp = item.key === 'P-EFP' || item.key === 'P-2nd-EFP';
    if (isPEfp) {
      // 二重点線: 外枠と内枠
      slide.addShape(pres.ShapeType.rect, {
        x: t.toX(x),
        y: t.toY(y),
        w: t.toLen(w),
        h: t.toLen(h),
        fill: { color: 'FFFFFF' },
        line: { color: '222222', width: 1.2, dashType: 'dash' },
      });
      const inset = 2;
      slide.addShape(pres.ShapeType.rect, {
        x: t.toX(x + inset),
        y: t.toY(y + inset),
        w: t.toLen(Math.max(1, w - inset * 2)),
        h: t.toLen(Math.max(1, h - inset * 2)),
        fill: { color: 'FFFFFF', transparency: 100 },
        line: { color: '222222', width: 1.2, dashType: 'dash' },
      });
      return;
    }
    const spec = BOX_RENDER_SPECS[item.key] ?? BOX_RENDER_SPECS.normal;
    const dashType = spec.borderStyle === 'dashed' ? 'dash' : spec.borderStyle === 'dotted' ? 'sysDot' : 'solid';
    if (item.key === 'EFP' || item.key === '2nd-EFP') {
      // 二重線: 外枠 + 内枠の 2 矩形重ね描き
      slide.addShape(pres.ShapeType.rect, {
        x: t.toX(x),
        y: t.toY(y),
        w: t.toLen(w),
        h: t.toLen(h),
        fill: { color: 'FFFFFF' },
        line: { color: '222222', width: 1 },
      });
      const ins = 2;
      slide.addShape(pres.ShapeType.rect, {
        x: t.toX(x + ins),
        y: t.toY(y + ins),
        w: t.toLen(Math.max(1, w - ins * 2)),
        h: t.toLen(Math.max(1, h - ins * 2)),
        fill: { color: 'FFFFFF', transparency: 100 },
        line: { color: '222222', width: 1 },
      });
      return;
    }
    slide.addShape(pres.ShapeType.rect, {
      x: t.toX(x),
      y: t.toY(y),
      w: t.toLen(w),
      h: t.toLen(h),
      fill: { color: 'FFFFFF' },
      line: { color: '222222', width: spec.borderWidth, dashType: dashType as 'solid' | 'dash' | 'sysDot' },
    });
  } else if (item.category === 'line') {
    slide.addShape(pres.ShapeType.line, {
      x: t.toX(x),
      y: t.toY(y + h / 2),
      w: t.toLen(w),
      h: 0.001,
      line: {
        color: '222222',
        width: 1.5,
        dashType: item.key === 'XLine' ? 'dash' : 'solid',
        endArrowType: 'triangle',
      },
    });
  } else if (item.category === 'sdsg') {
    const rotate = item.key === 'SD' ? 90 : 270;
    // 凡例アイコンは横長表示用に rightArrow を適切サイズで。回転で縦長扱い
    slide.addShape(pres.ShapeType.rightArrow, {
      x: t.toX(x),
      y: t.toY(y),
      w: t.toLen(w),
      h: t.toLen(h),
      fill: { color: 'FFFFFF' },
      line: { color: '333333', width: 1 },
      rotate,
    });
  } else if (item.category === 'timeArrow') {
    slide.addShape(pres.ShapeType.line, {
      x: t.toX(x),
      y: t.toY(y + h / 2),
      w: t.toLen(w),
      h: 0.001,
      line: { color: '222222', width: 2.5, endArrowType: 'triangle' },
    });
  }
}

// 二重線ポストプロセスは PowerPoint で壊れるケースがあったため廃止
// 現在は外枠 + 内枠の 2 矩形重ね描きで視覚的に二重線を再現している
