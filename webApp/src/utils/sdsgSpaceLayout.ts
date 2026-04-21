// ============================================================================
// SD/SG 専用スペース（帯）のレイアウト計算
// - 時期区分・時間矢印・Box 群を基準に上部・下部帯の Y 範囲を算出
// - 帯モード（band-top / band-bottom）の SDSG 位置を計算
// - 自動整列（重なり時の縦積み）を提供
// ============================================================================

import type {
  Sheet,
  ProjectSettings,
  SDSG,
  LayoutDirection,
  SDSGSpaceBandSettings,
} from '../types';
import { LEVEL_PX } from '../store/defaults';
import { computeTimeArrow } from './timeArrow';
import { computePeriodLabels } from './periodLabels';

export interface BandRange {
  // layout=horizontal: y 座標範囲 / layout=vertical: x 座標範囲
  start: number;       // 帯の開始位置（Box 群寄りの辺＝ bandTopEndY / bandBotEndY）
  end: number;         // 帯の終了位置（外側）
  center: number;      // 帯の中心
  axisFixed: number;   // Item 軸の固定座標（layout=horizontal では y、vertical では x の中心）
  axisSpan: number;    // 帯の厚み（= |end - start|）
  // 警告: 指定された heightLevel が offsetLevel 超過で自動クランプされた
  heightClamped?: boolean;
  // 警告: 指定 reference が無効だったため 'boxes' にフォールバック
  referenceFallback?: boolean;
}

export interface SDSGBandLayout {
  topBand?: BandRange;
  bottomBand?: BandRange;
}

/**
 * Box 群の Item 軸方向の bbox を取得
 */
function itemBoundsOfBoxes(sheet: Sheet, layout: LayoutDirection) {
  if (sheet.boxes.length === 0) return null;
  const isH = layout === 'horizontal';
  let min = Infinity;
  let max = -Infinity;
  sheet.boxes.forEach((b) => {
    const a = isH ? b.y : b.x;
    const c = isH ? b.y + b.height : b.x + b.width;
    if (a < min) min = a;
    if (c > max) max = c;
  });
  return { min, max };
}

/**
 * 時期区分 / 時間矢印 / Box 群を基準に、上部・下部帯の配置を算出
 */
export function computeSDSGBandLayout(
  sheet: Sheet,
  layout: LayoutDirection,
  settings: ProjectSettings,
): SDSGBandLayout {
  if (!settings.sdsgSpace?.enabled) return {};
  const isH = layout === 'horizontal';
  const boxBounds = itemBoundsOfBoxes(sheet, layout);
  if (!boxBounds) return {};

  // 「内側」= Box 群に近い側
  const result: SDSGBandLayout = {};

  // reference が無効なとき 'boxes' にフォールバック（フォールバック情報も返す）
  const resolveReference = (
    band: SDSGSpaceBandSettings,
    side: 'top' | 'bottom',
  ): { coord: number; fallback: boolean } | null => {
    const boxesCoord = () => (side === 'top' ? boxBounds.min : boxBounds.max);
    if (band.reference === 'boxes') {
      return { coord: boxesCoord(), fallback: false };
    }
    if (band.reference === 'period') {
      const geom = computePeriodLabels(sheet, layout, settings.periodLabels, settings.timeArrow);
      if (geom) return { coord: isH ? geom.startY : geom.startX, fallback: false };
      // 時期ラベルが無い → boxes にフォールバック
      return { coord: boxesCoord(), fallback: true };
    }
    if (band.reference === 'timearrow') {
      const geom = computeTimeArrow(sheet, layout, settings.timeArrow);
      if (geom) return { coord: isH ? geom.startY : geom.startX, fallback: false };
      return { coord: boxesCoord(), fallback: true };
    }
    return null;
  };

  const buildBand = (
    band: SDSGSpaceBandSettings,
    side: 'top' | 'bottom',
  ): BandRange | undefined => {
    if (!band.enabled) return undefined;
    const ref = resolveReference(band, side);
    if (ref == null) return undefined;
    const { coord: refCoord, fallback: referenceFallback } = ref;
    const offsetPx = band.offsetLevel * LEVEL_PX;
    let heightPx = band.heightLevel * LEVEL_PX;
    let heightClamped = false;

    // reference が 'period' / 'timearrow' の場合は heightLevel が offsetLevel を超えると
    // band が reference を越えてしまう。クランプして reference に接するまでに制限。
    // fallback=true（reference 無効で boxes に降格）の場合は制限なし。
    const referenceIsBoxes = band.reference === 'boxes' || referenceFallback;
    if (!referenceIsBoxes && heightPx > Math.max(0, offsetPx - 1)) {
      heightPx = Math.max(1, offsetPx - 1);
      heightClamped = true;
    }

    let inner: number, outer: number;
    // 基準: inner (bandTopEndY / bandBotEndY = Box 群寄りの内側エッジ) を offset で固定、
    //       outer を height で伸ばす
    if (side === 'top') {
      inner = referenceIsBoxes ? refCoord - offsetPx : refCoord + offsetPx;
      outer = inner - heightPx;
    } else {
      inner = referenceIsBoxes ? refCoord + offsetPx : refCoord - offsetPx;
      outer = inner + heightPx;
    }
    const start = inner;
    const end = outer;
    const center = (start + end) / 2;
    return {
      start,
      end,
      center,
      axisFixed: center,
      axisSpan: Math.abs(start - end),
      heightClamped,
      referenceFallback,
    };
  };

  result.topBand = buildBand(settings.sdsgSpace.bands.top, 'top');
  result.bottomBand = buildBand(settings.sdsgSpace.bands.bottom, 'bottom');
  return result;
}

/**
 * SDSG が所属する帯の種別を判定
 */
export function sdsgBandKey(sg: SDSG): 'top' | 'bottom' | null {
  if (sg.spaceMode === 'band-top') return 'top';
  if (sg.spaceMode === 'band-bottom') return 'bottom';
  return null;
}

/**
 * 帯内での自動整列: 同じ Time 位置で重なる SDSG を Item 方向に縦積み
 * 返り値: SDSG ID → 帯内での row index（0 から）
 */
export function computeBandRowAssignments(
  bandSdsgs: Array<{ id: string; timeStart: number; timeEnd: number }>,
): Map<string, number> {
  // timeStart で昇順、同時なら id
  const sorted = [...bandSdsgs].sort((a, b) => a.timeStart - b.timeStart || a.id.localeCompare(b.id));
  const rowEnds: number[] = []; // 各 row で現在最大の timeEnd
  const assignment = new Map<string, number>();
  for (const sg of sorted) {
    let placed = -1;
    for (let r = 0; r < rowEnds.length; r++) {
      if (rowEnds[r] <= sg.timeStart) {
        rowEnds[r] = sg.timeEnd;
        placed = r;
        break;
      }
    }
    if (placed === -1) {
      rowEnds.push(sg.timeEnd);
      placed = rowEnds.length - 1;
    }
    assignment.set(sg.id, placed);
  }
  return assignment;
}

export interface SDSGBandPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  outOfRange: boolean;   // 帯幅を超えた row か（自動整列の結果、帯の外にはみ出している）
}

/**
 * 帯内での SDSG 位置を計算
 * - band: 帯の範囲
 * - timeAnchor: SDSG の Time 中心座標（layout 軸方向）
 * - timeWidth: SDSG の Time 幅
 * - rowIndex: 自動整列の row（0 が内側、大きいほど外側へ）
 * - totalRows: このバンドの row 総数（高さ自動圧縮のため）
 * - sg: SDSG 自身（spaceInsetItem, spaceWidth, spaceHeight 参照）
 */
export function computeSDSGBandPosition(
  band: BandRange,
  layout: LayoutDirection,
  timeAnchor: number,
  timeWidth: number,
  rowIndex: number,
  totalRows: number,
  sg: SDSG,
  side: 'top' | 'bottom',
): SDSGBandPosition {
  const isH = layout === 'horizontal';
  const w = sg.spaceWidth ?? sg.width ?? 70;
  // between モードの場合 timeWidth は 2 Box 間の距離、single は sg.width
  const effectiveWidth = isH ? timeWidth : w;
  const effectiveHeight = isH ? (sg.spaceHeight ?? sg.height ?? 40) : timeWidth;

  // row 配置の Item 軸座標
  const rowSpan = totalRows > 0 ? band.axisSpan / totalRows : band.axisSpan;
  const dir = side === 'top' ? -1 : 1;
  const rowCenter = band.start + dir * (rowSpan * (rowIndex + 0.5));
  const insetItem = sg.spaceInsetItem ?? 0;
  const axisCoord = rowCenter + insetItem;

  // Time 軸方向の微調整（between モードでは使わない方が自然なので single モードのみ適用）
  const isBetween = sg.anchorMode === 'between' && sg.attachedTo2;
  const insetTime = isBetween ? 0 : (sg.spaceInsetTime ?? 0);
  const timeCoord = timeAnchor + insetTime;

  // 帯範囲内に Item 軸をクランプ
  const axisMin = Math.min(band.start, band.end);
  const axisMax = Math.max(band.start, band.end);
  const halfItem = (isH ? effectiveHeight : effectiveWidth) / 2;
  const clamped = Math.max(axisMin + halfItem, Math.min(axisMax - halfItem, axisCoord));
  const outOfRange = Math.abs(clamped - axisCoord) > 0.5;

  if (isH) {
    return {
      x: timeCoord - effectiveWidth / 2,
      y: clamped - effectiveHeight / 2,
      width: effectiveWidth,
      height: effectiveHeight,
      outOfRange,
    };
  }
  return {
    x: clamped - effectiveWidth / 2,
    y: timeCoord - effectiveHeight / 2,
    width: effectiveWidth,
    height: effectiveHeight,
    outOfRange,
  };
}
