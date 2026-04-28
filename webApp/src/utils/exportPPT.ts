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
import { getPaperInch, type PaperSizeKey } from './paperSizes';
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
import { clipPolylineToRect, type Pt as ClipPt } from './lineClip';

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
  /** N ページ分割（未指定または要素 1 個なら単一スライド） */
  pages?: PageBounds[];
  /** 分割モード: overlap = 単純重複、duplicate = Box複製+線クリップ+続マーカー */
  pageSplitMode?: 'overlap' | 'duplicate';
  /** duplicate モード時に続マーカーを描画（既定 true） */
  showContinuationMarkers?: boolean;
  /** ID バッジを含めるか（Box / SDSG / Line 個別） */
  includeIds?: { box: boolean; sdsg: boolean; line: boolean };
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
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

  const pres = new PptxGenJS();
  pres.defineLayout({ name: 'TEMER', width: slideW, height: slideH });
  pres.layout = 'TEMER';

  const pages = opts.pages && opts.pages.length > 1 ? opts.pages : null;
  const mode: 'overlap' | 'duplicate' = opts.pageSplitMode ?? 'overlap';
  const showMarkers = opts.showContinuationMarkers !== false;
  const includeIds = opts.includeIds ?? { box: false, sdsg: false, line: false };

  if (!pages) {
    // 単一スライド（従来動作）
    const t = buildTransform(bbox, slideWpx, slideHpx, scale, offsetRatio);
    const slide = pres.addSlide();
    drawTimeArrow(pres, slide, opts.sheet, layout, opts.settings.timeArrow, t, opts.settings.sdsgSpace, opts.settings.typeLabelVisibility);
    drawPeriodLabels(pres, slide, opts.sheet, layout, opts.settings.periodLabels, opts.settings.timeArrow, t, opts.settings.sdsgSpace, opts.settings.typeLabelVisibility);
    drawLines(pres, slide, opts.sheet, layout, t);
    drawSDSGs(pres, slide, opts.sheet, layout, opts.settings, t);
    drawBoxes(pres, slide, opts.sheet, layout, opts.settings, t);
    drawLegend(pres, slide, opts.sheet, layout, opts.settings.legend, t);
    drawIdBadges(slide, opts.sheet, layout, t, includeIds);
    await pres.writeFile({ fileName: filename });
    return;
  }

  // N スライド分割出力
  const total = pages.length;
  for (let i = 0; i < pages.length; i++) {
    checkAborted(opts.signal);
    opts.onProgress?.({ current: i + 1, total, label: `スライド ${i + 1} / ${total} を生成中` });
    const page = pages[i];
    const slide = pres.addSlide();
    const pageBbox = {
      x: page.innerX, y: page.innerY,
      width: page.innerWidth, height: page.innerHeight,
    };
    const t = buildTransform(pageBbox, slideWpx, slideHpx, false, 0);
    const pageSheet = filterSheetForPage(opts.sheet, page, layout, mode);
    drawTimeArrow(pres, slide, pageSheet, layout, opts.settings.timeArrow, t, opts.settings.sdsgSpace, opts.settings.typeLabelVisibility, page, mode, showMarkers);
    drawPeriodLabels(pres, slide, pageSheet, layout, opts.settings.periodLabels, opts.settings.timeArrow, t, opts.settings.sdsgSpace, opts.settings.typeLabelVisibility);
    // Line の端点解決と精密クリップのため、常に原シートの全 Box を持つ opts.sheet を渡す
    drawLines(pres, slide, opts.sheet, layout, t, page, mode, showMarkers);
    drawSDSGs(pres, slide, pageSheet, layout, opts.settings, t);
    drawBoxes(pres, slide, pageSheet, layout, opts.settings, t);
    // 凡例は全スライドに表示（SPEC）
    drawLegend(pres, slide, pageSheet, layout, opts.settings.legend, t);
    drawIdBadges(slide, pageSheet, layout, t, includeIds);
  }
  await pres.writeFile({ fileName: filename });
}

// ----------------------------------------------------------------------------
// ID badge (Box / SDSG / Line 共通、エクスポート設定で有効な場合のみ)
// ----------------------------------------------------------------------------

function drawIdBadges(
  slide: PptxGenJS.Slide,
  sheet: Sheet,
  layout: LayoutDirection,
  t: Transform,
  include: { box: boolean; sdsg: boolean; line: boolean },
) {
  const trunc = (s: string) => s.length > 14 ? s.slice(0, 14) + '…' : s;
  const makeBadge = (text: string, wx: number, wy: number, fs: number) => {
    const w = Math.max(32, text.length * fs * 0.62 + 6);
    const h = fs + 4;
    slide.addText(text, {
      x: t.toX(wx), y: t.toY(wy),
      w: t.toLen(w), h: t.toLen(h),
      fontSize: Math.max(6, fs * Math.max(0.4, t.scale)),
      color: '666666',
      fontFace: 'Consolas',
      fill: { color: 'FFFFFF' },
      align: 'left', valign: 'middle',
      margin: 1,
    });
  };

  if (include.box) {
    for (const bx of sheet.boxes) {
      const offX = bx.idOffsetX ?? 0;
      const offY = bx.idOffsetY ?? 0;
      const fs = bx.idFontSize ?? 9;
      makeBadge(trunc(bx.id), bx.x + 4 + offX, bx.y - fs - 2 + offY, fs);
    }
  }
  if (include.sdsg) {
    // SDSG の位置は drawSDSGs で計算された wx/wy と同一の定義が必要だが、
    // 簡略化として sg の attachedTo Box 中心から spaceMode に応じた bbox を再計算せず、
    // 各 SDSG の attached Box 直上にバッジを置く
    for (const sg of sheet.sdsg) {
      const attBox = sheet.boxes.find((b) => b.id === sg.attachedTo);
      if (!attBox) continue;
      const w = sg.spaceWidth ?? sg.width ?? 70;
      const h = sg.spaceHeight ?? sg.height ?? 40;
      const isH = layout === 'horizontal';
      // 近似: attached 中心 + time/itemOffset
      const cx = attBox.x + attBox.width / 2 + (isH ? (sg.timeOffset ?? 0) : (sg.itemOffset ?? 0));
      const cy = attBox.y + attBox.height / 2 + (isH ? (sg.itemOffset ?? 0) : (sg.timeOffset ?? 0));
      const wx = cx - w / 2;
      const wy = cy - h / 2;
      const offX = sg.idOffsetX ?? 0;
      const offY = sg.idOffsetY ?? 0;
      const fs = sg.idFontSize ?? 9;
      makeBadge(trunc(sg.id), wx + 4 + offX, wy - fs - 2 + offY, fs);
    }
  }
  if (include.line) {
    const byId = new Map(sheet.boxes.map((b) => [b.id, b]));
    for (const l of sheet.lines) {
      const fb = byId.get(l.from);
      const tb = byId.get(l.to);
      if (!fb || !tb) continue;
      const mx = (fb.x + fb.width / 2 + tb.x + tb.width / 2) / 2;
      const my = (fb.y + fb.height / 2 + tb.y + tb.height / 2) / 2;
      const offX = l.idOffsetX ?? 0;
      const offY = l.idOffsetY ?? -12;
      const fs = l.idFontSize ?? 9;
      const text = trunc(l.id);
      const w = Math.max(32, text.length * fs * 0.62 + 6);
      // 中央揃え配置のため wx を中央合わせ
      makeBadge(text, mx - w / 2 + offX, my - fs / 2 + offY, fs);
    }
  }
}

/**
 * シートをページ範囲でフィルタ。
 * overlap モード: 両端の Box がともにページ内にある Line のみ残す（従来動作）。
 * duplicate モード: Line フィルタは drawLines に任せ（ここでは全 Line を残す）、
 *   drawLines 側で Liang-Barsky クリップと続マーカーで処理する。
 * Box / SDSG / 時期ラベルの扱いは両モード共通。
 */
function filterSheetForPage(
  sheet: Sheet,
  page: PageBounds,
  layout: 'horizontal' | 'vertical',
  _mode: 'overlap' | 'duplicate' = 'overlap',
): Sheet {
  const visibleBoxes = sheet.boxes.filter((b) =>
    rectIntersectsPage({ x: b.x, y: b.y, width: b.width, height: b.height }, page),
  );
  const visibleBoxIds = new Set(visibleBoxes.map((b) => b.id));
  const visibleSDSGs = sheet.sdsg.filter((sg) => visibleBoxIds.has(sg.attachedTo));
  // Line はクリップでページ可視性を決めるため filter しない (drawLines が精密クリップ)
  const visibleLines = sheet.lines;
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
// 線分クリップ（Liang-Barsky, page.inner 矩形を窓として使用）
// ----------------------------------------------------------------------------

interface Pt { x: number; y: number; }

/**
 * 続マーカー「→続」「続→」を page 境界付近に描画。
 * direction='forward' = この側でページ外へ続く（右/下方向）→ 「→続」
 * direction='backward' = 前ページから続いてくる（左/上方向）→ 「続→」
 */
function drawContinuationMarker(
  slide: PptxGenJS.Slide,
  pt: Pt,
  direction: 'forward' | 'backward',
  layout: LayoutDirection,
  t: Transform,
) {
  const fsBase = 9;
  const label = direction === 'forward' ? '→続' : '続→';
  const wpx = 42;
  const hpx = 16;
  const isH = layout === 'horizontal';
  let bx: number;
  let by: number;
  if (isH) {
    // 横型: 境界は縦線（x 方向）。ラベルは線の少し上にオフセット
    bx = direction === 'forward' ? pt.x - wpx : pt.x;
    by = pt.y - hpx - 2;
  } else {
    // 縦型: 境界は横線（y 方向）。ラベルは線の少し右側にオフセット
    bx = pt.x + 4;
    by = direction === 'forward' ? pt.y - hpx : pt.y;
  }
  slide.addText(label, {
    x: t.toX(bx),
    y: t.toY(by),
    w: t.toLen(wpx),
    h: t.toLen(hpx),
    align: 'center',
    valign: 'middle',
    fontSize: Math.max(6, fsBase * Math.max(0.4, t.scale)),
    color: '555555',
    margin: 1,
  });
}

function computeLineSegment(
  l: Line,
  byId: Map<string, Box>,
  layout: LayoutDirection,
): { sx: number; sy: number; ex: number; ey: number; shouldDash: boolean } | null {
  const fromOrig = byId.get(l.from);
  const toOrig = byId.get(l.to);
  if (!fromOrig || !toOrig) return null;
  const isH = layout === 'horizontal';
  const dashedEndpoints = new Set(['annotation', 'P-EFP', 'P-2nd-EFP']);
  const connectsDashed = dashedEndpoints.has(fromOrig.type) || dashedEndpoints.has(toOrig.type);
  const shouldDash = l.type === 'XLine' || connectsDashed;

  // 自動入れ替え + マージン/オフセットの swap
  const resolved = resolveLineDirection(l, fromOrig, toOrig, layout);
  const from = resolved.from;
  const to = resolved.to;

  // 角度モード: forward-time 辺中点 → 指定角度で to の backward-time 辺まで
  //   調整は startOffset* / endOffset*（Time/Item 軸）で行う。margin は適用しない
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
      sx: ep.sx + sDx,
      sy: ep.sy + sDy,
      ex: ep.ex + eDx,
      ey: ep.ey + eDy,
      shouldDash,
    };
  }

  // 通常モード
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
    shouldDash,
  };
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
  const visuals = resolveBoxVisuals(b, settings);
  const borderColor = rgbToHex(visuals.borderColor ?? '#222');
  const fill = { color: rgbToHex(visuals.backgroundColor ?? '#ffffff') };
  const isEllipse = visuals.shape === 'ellipse';
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
    fontSize: fontSizeScaled(visuals.fontSize ?? settings.defaultFontSize, t),
    bold: visuals.bold,
    italic: visuals.italic,
    underline: b.style?.underline ? { style: 'sng' } : undefined,
    color: rgbToHex(visuals.color ?? '#222'),
    fontFace: visuals.fontFamily,
    vert: isTextVertical ? 'eaVert' : undefined,
    margin: 2,
  });

  // タイプラベル
  drawBoxTypeLabel(slide, b, layout, settings, sheet, t);
  // サブラベル
  drawBoxSubLabel(slide, b, layout, settings, t);
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
  const visuals = resolveBoxVisuals(b, settings);
  const textColor = rgbToHex(visuals.typeLabelColor ?? '#222');
  const bgColor = visuals.typeLabelBackgroundColor && visuals.typeLabelBackgroundColor !== 'transparent'
    ? { color: rgbToHex(visuals.typeLabelBackgroundColor) }
    : { color: 'FFFFFF', transparency: 100 };
  const borderW = visuals.typeLabelBorderWidth ?? 0;
  const hasBorder = borderW > 0 && !!visuals.typeLabelBorderColor;
  const lineProp = hasBorder
    ? { color: rgbToHex(visuals.typeLabelBorderColor!), width: borderW }
    : undefined;

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
      color: textColor,
      fill: bgColor,
      line: lineProp,
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
      color: textColor,
      fill: bgColor,
      line: lineProp,
      vert: 'eaVert',
      margin: 1,
    });
  }
}

function drawBoxSubLabel(slide: PptxGenJS.Slide, b: Box, layout: LayoutDirection, settings: ProjectSettings, t: Transform) {
  const text = b.subLabel ?? b.participantId;
  if (!text) return;
  const isH = layout === 'horizontal';
  const baseFS = b.subLabelFontSize ?? 10;
  const fs = fontSizeScaled(baseFS, t);
  const offX = b.subLabelOffsetX ?? 0;
  const offY = b.subLabelOffsetY ?? 0;
  const visuals = resolveBoxVisuals(b, settings);
  const textColor = rgbToHex(visuals.subLabelColor ?? '#555');
  const bgColor = visuals.subLabelBackgroundColor && visuals.subLabelBackgroundColor !== 'transparent'
    ? { color: rgbToHex(visuals.subLabelBackgroundColor) }
    : { color: 'FFFFFF', transparency: 100 };
  const borderW = visuals.subLabelBorderWidth ?? 0;
  const hasBorder = borderW > 0 && !!visuals.subLabelBorderColor;
  const lineProp = hasBorder
    ? { color: rgbToHex(visuals.subLabelBorderColor!), width: borderW }
    : undefined;
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
      color: textColor,
      fill: bgColor,
      line: lineProp,
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
      color: textColor,
      fill: bgColor,
      line: lineProp,
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
  page?: PageBounds,
  mode?: 'overlap' | 'duplicate',
  showMarkers?: boolean,
) {
  const byId = new Map(sheet.boxes.map((b) => [b.id, b]));
  const isDup = !!(page && mode === 'duplicate');
  const dashedEndpoints = new Set(['annotation', 'P-EFP', 'P-2nd-EFP']);
  const pageInnerRect = page
    ? { x: page.innerX, y: page.innerY, width: page.innerWidth, height: page.innerHeight }
    : null;

  for (const l of sheet.lines) {
    const fromOrig = byId.get(l.from);
    const toOrig = byId.get(l.to);
    if (!fromOrig || !toOrig) continue;
    const connectsDashed = dashedEndpoints.has(fromOrig.type) || dashedEndpoints.has(toOrig.type);
    const shouldDash = l.type === 'XLine' || connectsDashed;
    const effectiveShape = resolveEffectiveShape(l);

    // === すべての形状を polyline に正規化 ===
    let polyline: LinePathPt[];
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
      polyline = path.kind === 'curve' ? sampleCurveToSegments(path, 24) : path.points;
    } else {
      const seg = computeLineSegment(l, byId, layout);
      if (!seg) continue;
      polyline = [{ x: seg.sx, y: seg.sy }, { x: seg.ex, y: seg.ey }];
    }

    // === クリップ ===
    if (pageInnerRect) {
      const pieces = clipPolylineToRect(polyline as ClipPt[], pageInnerRect);
      if (pieces.length === 0) continue;
      for (const piece of pieces) {
        if (piece.points.length < 2) continue;
        drawLineSegments(pres, slide, piece.points as LinePathPt[], l, shouldDash, piece.endsAtOriginalEnd, t);
        // duplicate モードでは続マーカーを描画
        if (isDup && showMarkers !== false) {
          const first = piece.points[0];
          const last = piece.points[piece.points.length - 1];
          const eq = (a: Pt, b: LinePathPt) => Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.y - b.y) < 1e-3;
          const origStart = polyline[0];
          const origEnd = polyline[polyline.length - 1];
          if (!eq(first, origStart)) drawContinuationMarker(slide, first, 'backward', layout, t);
          if (!eq(last, origEnd)) drawContinuationMarker(slide, last, 'forward', layout, t);
        }
      }
      continue;
    }

    // クリップなし (単一ページ): 全部描画、末端に矢印頭
    drawLineSegments(pres, slide, polyline, l, shouldDash, true, t);
  }
}

/**
 * 多点 polyline を line shape 連打で描画。最後のセグメントのみ arrowhead。
 */
function drawLineSegments(
  pres: PptxGenJS,
  slide: PptxGenJS.Slide,
  points: LinePathPt[],
  l: Line,
  shouldDash: boolean,
  hasArrowhead: boolean,
  t: Transform,
) {
  const color = rgbToHex(l.style?.color ?? '#222');
  const width = l.style?.strokeWidth ?? 1.5;
  const dashType = shouldDash ? 'dash' : 'solid';
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const isLast = i === points.length - 2;
    const minX = Math.min(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const w = Math.max(1, Math.abs(b.x - a.x));
    const h = Math.max(1, Math.abs(b.y - a.y));
    slide.addShape(pres.ShapeType.line, {
      x: t.toX(minX),
      y: t.toY(minY),
      w: t.toLen(w),
      h: t.toLen(h),
      line: {
        color,
        width,
        dashType,
        endArrowType: (isLast && hasArrowhead) ? 'triangle' : 'none',
      },
      flipH: b.x < a.x,
      flipV: b.y < a.y,
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
  const boxById = new Map(sheet.boxes.map((b) => [b.id, b]));
  const lineById = new Map(sheet.lines.map((l) => [l.id, l]));

  // --- band モードの事前計算 ---
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

    // band モード（機能 OFF なら single モードへ falls through）
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
      flipDirection = autoFlip && (
        (bk === 'top' && sg.type === 'SG') ||
        (bk === 'bottom' && sg.type === 'SD')
      );
    } else if (sg.anchorMode === 'between' && sg.attachedTo2) {
      // between モード（Box / Line 混在対応）
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
      // single モード（既存）
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
    // anchorX/anchorY 相当（回転矩形計算用）
    const anchorX = wx + w / 2;
    const anchorY = wy + h / 2;
    const timeOff = 0;  // 既に wx/wy に織り込まれている
    const itemOff = 0;
    void timeOff; void itemOff; void anchorX; void anchorY;

    // ブロック矢印（rightArrow）は既定で右向き
    // 横型: SD=下向き(90°), SG=上向き(270°)
    // 縦型: SD=右向き(0°), SG=左向き(180°)
    // flipDirection=true の場合は種別と逆の向き
    const effectiveType = flipDirection ? (sg.type === 'SD' ? 'SG' : 'SD') : sg.type;
    const isSD = effectiveType === 'SD';
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
    // wx/wy は左上。中心は wx + w/2, wy + h/2。rectW/H に中心を合わせる
    const rectX = wx + w / 2 - rectW / 2;
    const rectY = wy + h / 2 - rectH / 2;

    slide.addShape(pres.ShapeType.rightArrow, {
      x: t.toX(rectX),
      y: t.toY(rectY),
      w: t.toLen(rectW),
      h: t.toLen(rectH),
      fill: { color: bgColor },
      line: { color: borderColor, width: 1.5 },
      rotate,
    });
    // ラベル領域: pentagon (五角形全体・既定) / rect (矩形部分のみ)
    const sgRectRatio = Math.max(0.05, Math.min(0.95, sg.rectRatio ?? 0.55));
    const sgTriRatio = 1 - sgRectRatio;
    const labelArea = sg.labelArea ?? 'pentagon';
    let tx2 = wx, ty2 = wy, tw2 = w, th2 = h;
    if (labelArea === 'rect') {
      if (isH) {
        if (isSD) { th2 = h * sgRectRatio; }
        else      { ty2 = wy + h * sgTriRatio; th2 = h * sgRectRatio; }
      } else {
        if (isSD) { tx2 = wx + w * sgTriRatio; tw2 = w * sgRectRatio; }
        else      { tw2 = w * sgRectRatio; }
      }
    }
    tx2 += sg.labelOffsetX ?? 0;
    ty2 += sg.labelOffsetY ?? 0;
    slide.addText(sg.label, {
      x: t.toX(tx2),
      y: t.toY(ty2),
      w: t.toLen(tw2),
      h: t.toLen(th2),
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
  const textColor = rgbToHex(sg.typeLabelColor ?? '#222');
  const bgColor = sg.typeLabelBackgroundColor && sg.typeLabelBackgroundColor !== 'transparent'
    ? { color: rgbToHex(sg.typeLabelBackgroundColor) }
    : { color: 'FFFFFF', transparency: 100 };
  const borderW = sg.typeLabelBorderWidth ?? 0;
  const lineProp = borderW > 0 && sg.typeLabelBorderColor
    ? { color: rgbToHex(sg.typeLabelBorderColor), width: borderW }
    : undefined;
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
      color: textColor,
      fill: bgColor,
      line: lineProp,
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
      color: textColor,
      fill: bgColor,
      line: lineProp,
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
  const textColor = rgbToHex(sg.subLabelColor ?? '#555');
  const bgColor = sg.subLabelBackgroundColor && sg.subLabelBackgroundColor !== 'transparent'
    ? { color: rgbToHex(sg.subLabelBackgroundColor) }
    : { color: 'FFFFFF', transparency: 100 };
  const borderW = sg.subLabelBorderWidth ?? 0;
  const lineProp = borderW > 0 && sg.subLabelBorderColor
    ? { color: rgbToHex(sg.subLabelBorderColor), width: borderW }
    : undefined;
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
      color: textColor,
      fill: bgColor,
      line: lineProp,
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
      color: textColor,
      fill: bgColor,
      line: lineProp,
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
  sdsgSpace?: SDSGSpaceSettings,
  typeLabelVisibility?: TypeLabelVisibilityMap,
  page?: PageBounds,
  mode?: 'overlap' | 'duplicate',
  showMarkers?: boolean,
) {
  if (!settings || !settings.autoInsert) return;
  const arrow = computeTimeArrow(sheet, layout, settings, sdsgSpace, typeLabelVisibility);
  if (!arrow) return;

  const origStart: Pt = { x: arrow.startX, y: arrow.startY };
  const origEnd: Pt = { x: arrow.endX, y: arrow.endY };
  const isDup = !!(page && mode === 'duplicate');

  // 多ページ時は page.inner 内にクリップ (overlap/duplicate 共通)
  const pieces = page
    ? clipPolylineToRect([origStart, origEnd] as ClipPt[], { x: page.innerX, y: page.innerY, width: page.innerWidth, height: page.innerHeight })
    : [{ points: [origStart, origEnd] as ClipPt[], endsAtOriginalEnd: true }];
  if (pieces.length === 0) return;

  const emitSeg = (p0: ClipPt, p1: ClipPt, hasArrowhead: boolean) => {
    const minX = Math.min(p0.x, p1.x);
    const minY = Math.min(p0.y, p1.y);
    const w = Math.max(1, Math.abs(p1.x - p0.x));
    const h = Math.max(1, Math.abs(p1.y - p0.y));
    slide.addShape(pres.ShapeType.line, {
      x: t.toX(minX), y: t.toY(minY), w: t.toLen(w), h: t.toLen(h),
      line: { color: '222222', width: arrow.strokeWidth, endArrowType: hasArrowhead ? 'triangle' : 'none' },
      flipH: p1.x < p0.x, flipV: p1.y < p0.y,
    });
  };
  for (const piece of pieces) {
    if (piece.points.length < 2) continue;
    const p0 = piece.points[0];
    const p1 = piece.points[piece.points.length - 1];
    emitSeg(p0, p1, piece.endsAtOriginalEnd);
    if (isDup && showMarkers !== false) {
      const eq = (a: ClipPt, b: Pt) => Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.y - b.y) < 1e-3;
      if (!eq(p0, origStart)) drawContinuationMarker(slide, p0, 'backward', layout, t);
      if (!eq(p1, origEnd)) drawContinuationMarker(slide, p1, 'forward', layout, t);
    }
  }

  // duplicate モード: ラベル位置が page.inner 外なら skip（1 スライドにだけ出す）
  if (isDup && page) {
    const inside =
      arrow.labelX >= page.innerX && arrow.labelX <= page.innerX + page.innerWidth &&
      arrow.labelY >= page.innerY && arrow.labelY <= page.innerY + page.innerHeight;
    if (!inside) return;
  }

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
  sdsgSpace?: SDSGSpaceSettings,
  typeLabelVisibility?: TypeLabelVisibilityMap,
) {
  if (!settings || !settings.includeInExport) return;
  if (sheet.periodLabels.length === 0) return;
  const geom = computePeriodLabels(sheet, layout, settings, timeArrow, sdsgSpace, typeLabelVisibility);
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
