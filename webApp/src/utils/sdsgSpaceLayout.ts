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
import { resolveBetweenEndpoint } from './sdsgBetween';

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
 * @param requiredRows 自動拡張用: 各帯で必要な row 数（事前計算済み）
 */
export function computeSDSGBandLayout(
  sheet: Sheet,
  layout: LayoutDirection,
  settings: ProjectSettings,
  requiredRows?: { top?: number; bottom?: number },
): SDSGBandLayout {
  if (!settings.sdsgSpace?.enabled) return {};
  const isH = layout === 'horizontal';
  const boxBounds = itemBoundsOfBoxes(sheet, layout);
  if (!boxBounds) return {};

  // 「内側」= Box 群に近い側
  const result: SDSGBandLayout = {};

  // 'top' = 最高 Item_Level 側（SD 側）、'bottom' = 最低 Item_Level 側（SG 側）。
  // outward = 「Box 群から外へ向かう方向」の +1/-1。
  //   横型: IL+ = -y なので top=-1 / bottom=+1
  //   縦型: IL+ = +x なので top=+1 / bottom=-1
  const outwardFor = (side: 'top' | 'bottom'): 1 | -1 => {
    if (isH) return side === 'top' ? -1 : 1;
    return side === 'top' ? 1 : -1;
  };

  // reference が無効なとき 'boxes' にフォールバック（フォールバック情報も返す）
  const resolveReference = (
    band: SDSGSpaceBandSettings,
    side: 'top' | 'bottom',
  ): { coord: number; fallback: boolean } | null => {
    const ow = outwardFor(side);
    const boxesCoord = () => (ow < 0 ? boxBounds.min : boxBounds.max);
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

  // heightMode='auto' 時の帯高さ推定: 帯内 SDSG の最大 item 軸サイズ + タイプラベル余裕。
  // row 数を考慮して row 毎の高さを積み重ねる。typeLabel / subLabel の余裕として 1 SDSG
  // あたり +20px を加える（概算）。
  const TYPE_LABEL_MARGIN = 20;
  const autoHeightPx = (side: 'top' | 'bottom', rowsRequired: number): number => {
    const bandSdsgs = sheet.sdsg.filter((sg) =>
      (side === 'top' && sg.spaceMode === 'band-top') ||
      (side === 'bottom' && sg.spaceMode === 'band-bottom')
    );
    if (bandSdsgs.length === 0) {
      // SDSG が無ければ既定 1 row 分 + 余裕
      return 60;
    }
    let maxItemSize = 0;
    const typeLabelVis = settings.typeLabelVisibility;
    bandSdsgs.forEach((sg) => {
      const itemSize = isH
        ? (sg.spaceHeight ?? sg.height ?? 40)
        : (sg.spaceWidth ?? sg.width ?? 70);
      const labelVisible = typeLabelVis?.[sg.type] !== false;
      const extra = labelVisible ? TYPE_LABEL_MARGIN : 0;
      if (itemSize + extra > maxItemSize) maxItemSize = itemSize + extra;
    });
    const rows = Math.max(1, rowsRequired);
    // 各 row に同じ最大サイズを割り当て（保守的な推定）+ 上下に 10px の内部余裕
    return maxItemSize * rows + 10;
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
    const rowsNeeded = side === 'top' ? requiredRows?.top ?? 0 : requiredRows?.bottom ?? 0;

    // heightPx 決定:
    //   heightMode='auto' (既定): 帯内 SDSG + typeLabel から算出
    //   heightMode='manual'    : heightLevel * LEVEL_PX を使用
    const mode = band.heightMode ?? 'auto';
    let heightPx = mode === 'auto'
      ? autoHeightPx(side, rowsNeeded)
      : band.heightLevel * LEVEL_PX;

    // autoExpandHeight=true の場合、必要な row 数に応じて heightPx を拡大（manual モード用）
    if (mode === 'manual' && band.autoExpandHeight && rowsNeeded > 1) {
      const minPerRow = 50;
      const required = rowsNeeded * minPerRow;
      if (required > heightPx) heightPx = required;
    }

    // reference='period'/'timearrow' の場合の clamp は撤廃（band が reference を越えて
    // 塗りつぶされるのを許容し、ユーザ設定を尊重）。代わりに outOfRange 警告で対処。
    const heightClamped = false;
    const referenceIsBoxes = band.reference === 'boxes' || referenceFallback;
    const ow = outwardFor(side);

    // 基準: inner (bandTopEndY / bandBotEndY = Box 群寄りの内側エッジ) を offset で固定、
    //       outer を height で outward 方向へ伸ばす
    //   referenceIsBoxes: refCoord = Box 端, inner は refCoord から outward へ offset 離れ
    //   reference(period/timearrow): refCoord = 参照線, inner は refCoord から inward へ offset
    const inner = referenceIsBoxes
      ? refCoord + ow * offsetPx
      : refCoord - ow * offsetPx;
    const outer = inner + ow * heightPx;
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
 * bbox 拡張用: band の最外エッジ座標を返す（boxes 参照基準で計算）。
 * timeArrow / periodLabels から呼ばれ、循環参照を避けるため reference は boxes 固定扱い。
 *
 * 戻り値:
 *   - 横型 side='top': band 最外 y 座標（最小 y）
 *   - 横型 side='bottom': band 最外 y 座標（最大 y）
 *   - 縦型 side='top'（高 IL = 右）: band 最外 x 座標（最大 x）
 *   - 縦型 side='bottom'（低 IL = 左）: band 最外 x 座標（最小 x）
 * 該当 band に SDSG が無ければ null。
 */
export function computeBandOuterCoord(
  sheet: Sheet,
  layout: LayoutDirection,
  band: SDSGSpaceBandSettings,
  side: 'top' | 'bottom',
  typeLabelVisibility?: Record<string, boolean>,
): number | null {
  if (!band.enabled) return null;
  const bandSdsgs = sheet.sdsg.filter((sg) =>
    (side === 'top' && sg.spaceMode === 'band-top') ||
    (side === 'bottom' && sg.spaceMode === 'band-bottom')
  );
  if (bandSdsgs.length === 0) return null;

  const isH = layout === 'horizontal';
  // outward: top=-1(h) +1(v) / bottom=+1(h) -1(v)
  const ow: 1 | -1 = side === 'top' ? (isH ? -1 : 1) : (isH ? 1 : -1);

  // Box 群の該当 edge（boxes 基準）
  const boxBounds = (() => {
    if (sheet.boxes.length === 0) return null;
    let min = Infinity, max = -Infinity;
    sheet.boxes.forEach((b) => {
      const a = isH ? b.y : b.x;
      const c = isH ? b.y + b.height : b.x + b.width;
      if (a < min) min = a;
      if (c > max) max = c;
    });
    return { min, max };
  })();
  if (!boxBounds) return null;
  const boxEdge = ow < 0 ? boxBounds.min : boxBounds.max;

  // 高さを auto / manual で決定（computeSDSGBandLayout と揃える）
  const TYPE_LABEL_MARGIN = 20;
  const mode = band.heightMode ?? 'auto';
  let heightPx: number;
  if (mode === 'auto') {
    let maxItemSize = 0;
    bandSdsgs.forEach((sg) => {
      const itemSize = isH
        ? (sg.spaceHeight ?? sg.height ?? 40)
        : (sg.spaceWidth ?? sg.width ?? 70);
      const labelVis = typeLabelVisibility?.[sg.type] !== false;
      const extra = labelVis ? TYPE_LABEL_MARGIN : 0;
      if (itemSize + extra > maxItemSize) maxItemSize = itemSize + extra;
    });
    heightPx = Math.max(60, maxItemSize + 10);
  } else {
    heightPx = band.heightLevel * LEVEL_PX;
  }

  const offsetPx = band.offsetLevel * LEVEL_PX;
  // reference='boxes' 相当: outer = boxEdge + ow * (offset + height)
  return boxEdge + ow * (offsetPx + heightPx);
}

/**
 * row 数を含めて帯の実効外端を計算する（積み上げ対応）。
 * computeBandOuterCoord は 1 row 前提の高さを返すが、こちらは autoExpand で拡張された高さを
 * row 数倍して、period labels / time arrow が帯を越える位置に描画されるようにする。
 */
export function resolveBandOuterBounds(
  sheet: Sheet,
  layout: LayoutDirection,
  sdsgSpace: ProjectSettings['sdsgSpace'] | undefined,
  typeLabelVisibility?: Record<string, boolean>,
): { topOuter?: number; bottomOuter?: number } {
  const space = sdsgSpace;
  if (!space || !space.enabled) return {};
  const isH = layout === 'horizontal';

  const collectEntries = (side: 'top' | 'bottom') => {
    const sgs = sheet.sdsg.filter((sg) =>
      (side === 'top' && sg.spaceMode === 'band-top') ||
      (side === 'bottom' && sg.spaceMode === 'band-bottom')
    );
    const boxById = new Map(sheet.boxes.map((b) => [b.id, b]));
    const lineById = new Map(sheet.lines.map((l) => [l.id, l]));
    return sgs.map((sg) => {
      // band 時の時間範囲の概算（詳細は computeBandRowAssignments と整合）
      let tS = 0, tE = 0;
      if (sg.anchorMode === 'between' && sg.attachedTo2) {
        const ep1 = resolveBetweenEndpoint(sg.attachedTo, boxById, lineById, isH);
        const ep2 = resolveBetweenEndpoint(sg.attachedTo2, boxById, lineById, isH);
        if (!ep1 || !ep2) return null;
        const left = ep1.timeStart <= ep2.timeStart ? ep1 : ep2;
        const right = ep1.timeStart <= ep2.timeStart ? ep2 : ep1;
        // edge-to-edge: Time 軸両端を覆う
        tS = left.timeStart; tE = right.timeStart + right.timeSize;
      } else {
        const at = sheet.boxes.find((b) => b.id === sg.attachedTo);
        if (!at) return null;
        const centerT = isH ? at.x + at.width / 2 : at.y + at.height / 2;
        const w0 = sg.spaceWidth ?? sg.width ?? 70;
        tS = centerT - w0 / 2; tE = centerT + w0 / 2;
      }
      return { id: sg.id, timeStart: tS, timeEnd: tE, rowOverride: sg.spaceRowOverride };
    }).filter((e): e is NonNullable<typeof e> => e !== null);
  };

  const calcOuter = (side: 'top' | 'bottom'): number | undefined => {
    const band = side === 'top' ? space.bands.top : space.bands.bottom;
    if (!band.enabled) return undefined;
    const entries = collectEntries(side);
    if (entries.length === 0) return undefined;

    // row 数を算出
    const rows = space.autoArrange
      ? computeBandRowAssignments(entries)
      : new Map<string, number>();
    const totalRows = Math.max(1, ...Array.from(rows.values()).map((v) => v + 1));

    // 単一 row の高さを computeBandOuterCoord と同式で算出し、totalRows 分拡張
    const ow: 1 | -1 = side === 'top' ? (isH ? -1 : 1) : (isH ? 1 : -1);
    if (sheet.boxes.length === 0) return undefined;
    let min = Infinity, max = -Infinity;
    sheet.boxes.forEach((b) => {
      const a = isH ? b.y : b.x;
      const c = isH ? b.y + b.height : b.x + b.width;
      if (a < min) min = a;
      if (c > max) max = c;
    });
    const boxEdge = ow < 0 ? min : max;

    const TYPE_LABEL_MARGIN = 20;
    const mode = band.heightMode ?? 'auto';
    let perRowHeight: number;
    if (mode === 'auto') {
      let maxItemSize = 0;
      entries.forEach((e) => {
        const sg = sheet.sdsg.find((x) => x.id === e.id);
        if (!sg) return;
        const itemSize = isH
          ? (sg.spaceHeight ?? sg.height ?? 40)
          : (sg.spaceWidth ?? sg.width ?? 70);
        const labelVis = typeLabelVisibility?.[sg.type] !== false;
        const extra = labelVis ? TYPE_LABEL_MARGIN : 0;
        if (itemSize + extra > maxItemSize) maxItemSize = itemSize + extra;
      });
      perRowHeight = Math.max(60, maxItemSize + 10);
    } else {
      perRowHeight = (band.heightLevel * LEVEL_PX) / Math.max(1, totalRows);
    }

    const totalHeight = perRowHeight * totalRows;
    const offsetPx = band.offsetLevel * LEVEL_PX;
    return boxEdge + ow * (offsetPx + totalHeight);
  };

  return { topOuter: calcOuter('top'), bottomOuter: calcOuter('bottom') };
}

/**
 * 帯内での自動整列: 同じ Time 位置で重なる SDSG を Item 方向に縦積み
 * spaceRowOverride が指定されている SDSG はそれを優先、残りのみ自動割当
 * 返り値: SDSG ID → 帯内での row index（0 から）
 */
export function computeBandRowAssignments(
  bandSdsgs: Array<{ id: string; timeStart: number; timeEnd: number; rowOverride?: number }>,
): Map<string, number> {
  const assignment = new Map<string, number>();
  // 手動 override を先に反映
  const autoCandidates: Array<{ id: string; timeStart: number; timeEnd: number }> = [];
  // row ごとの占有済み区間（手動指定分）
  const rowOccupied: Map<number, Array<[number, number]>> = new Map();
  for (const sg of bandSdsgs) {
    if (sg.rowOverride != null && sg.rowOverride >= 0 && Number.isFinite(sg.rowOverride)) {
      const r = Math.floor(sg.rowOverride);
      assignment.set(sg.id, r);
      const arr = rowOccupied.get(r) ?? [];
      arr.push([sg.timeStart, sg.timeEnd]);
      rowOccupied.set(r, arr);
    } else {
      autoCandidates.push(sg);
    }
  }
  // 自動割当: timeStart 順、override と衝突しない最小 row
  const sorted = [...autoCandidates].sort((a, b) => a.timeStart - b.timeStart || a.id.localeCompare(b.id));
  const rowEnds: Map<number, number> = new Map();
  // override で既に使われた row の timeEnd を初期化（override は timeEnd 順 sort ではないので保守的に max）
  for (const [r, intervals] of rowOccupied) {
    let maxEnd = -Infinity;
    for (const [s, e] of intervals) { void s; if (e > maxEnd) maxEnd = e; }
    rowEnds.set(r, maxEnd);
  }
  for (const sg of sorted) {
    let placed = -1;
    // 既存 row（override 含む）で空きを探す（番号小さい順）
    const rowNums = Array.from(rowEnds.keys()).sort((a, b) => a - b);
    for (const r of rowNums) {
      // override 占有区間との重複チェック
      const intervals = rowOccupied.get(r) ?? [];
      const overlapsOverride = intervals.some(([s, e]) => !(sg.timeEnd <= s || sg.timeStart >= e));
      if (!overlapsOverride && (rowEnds.get(r) ?? -Infinity) <= sg.timeStart) {
        rowEnds.set(r, Math.max(rowEnds.get(r) ?? -Infinity, sg.timeEnd));
        placed = r;
        break;
      }
    }
    if (placed === -1) {
      // 新規 row を既存最大+1 に作る
      const maxRow = rowNums.length > 0 ? rowNums[rowNums.length - 1] : -1;
      placed = maxRow + 1;
      rowEnds.set(placed, sg.timeEnd);
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
  opts?: { shrinkToFitRow?: boolean },
): SDSGBandPosition {
  const isH = layout === 'horizontal';
  const w = sg.spaceWidth ?? sg.width ?? 70;
  // between モードの場合 timeWidth は 2 Box 間の距離、single は sg.width
  let effectiveWidth = isH ? timeWidth : w;
  let effectiveHeight = isH ? (sg.spaceHeight ?? sg.height ?? 40) : timeWidth;

  // shrinkToFitRow: row span より大きい SDSG は row span 以内に圧縮
  const shrink = opts?.shrinkToFitRow !== false;  // 既定 true
  if (shrink && totalRows > 0) {
    const rowSpanPx = band.axisSpan / totalRows;
    // マージン 20% 確保
    const maxItemSize = Math.max(10, rowSpanPx * 0.8);
    if (isH && effectiveHeight > maxItemSize) effectiveHeight = maxItemSize;
    if (!isH && effectiveWidth > maxItemSize) effectiveWidth = maxItemSize;
  }

  // row 配置: SDSG の apex (先端) が band.start（Box 側 = inner edge）に揃う。
  //   横型 SG: 上部（box 側）が band inner に揃う → SG top = band.start
  //   横型 SD: 下部（box 側 = apex）が band inner に揃う → SD bottom = band.start
  //   縦型 SG: 右部（box 側 = apex）が band inner に揃う → SG right = band.start
  //   縦型 SD: 左部（box 側 = apex）が band inner に揃う → SD left = band.start
  // row が増えるほど outer 方向（band.end 側）へ積まれる。
  const rowSpan = totalRows > 0 ? band.axisSpan / totalRows : band.axisSpan;
  const dir = Math.sign(band.end - band.start) || (side === 'top' ? -1 : 1);
  const itemAxisSize = isH ? effectiveHeight : effectiveWidth;
  const rowCenter = band.start + dir * (rowIndex * rowSpan + itemAxisSize / 2);
  const insetItem = sg.spaceInsetItem ?? 0;
  const axisCoord = rowCenter + insetItem;

  // Time 軸方向の微調整（between モードでは使わない方が自然なので single モードのみ適用）
  const isBetween = sg.anchorMode === 'between' && sg.attachedTo2;
  const insetTime = isBetween ? 0 : (sg.spaceInsetTime ?? 0);
  const timeCoord = timeAnchor + insetTime;

  // クランプは行わず、SDSG の実サイズと inset を尊重する。
  // band 範囲を超えるときだけ outOfRange=true にして描画側で警告枠を出す。
  const outOfRange = (rowIndex * rowSpan + itemAxisSize) > band.axisSpan + 1;

  if (isH) {
    return {
      x: timeCoord - effectiveWidth / 2,
      y: axisCoord - effectiveHeight / 2,
      width: effectiveWidth,
      height: effectiveHeight,
      outOfRange,
    };
  }
  return {
    x: axisCoord - effectiveWidth / 2,
    y: timeCoord - effectiveHeight / 2,
    width: effectiveWidth,
    height: effectiveHeight,
    outOfRange,
  };
}

/**
 * 指定 SDSG が現在の設定で帯からはみ出しているか判定（PropertyPanel 警告用）。
 * band モード外 / 帯無効な場合は常に false。
 */
export function isSDSGOutOfRange(
  sg: SDSG,
  sheet: Sheet,
  layout: LayoutDirection,
  settings: ProjectSettings,
): boolean {
  const bk = sdsgBandKey(sg);
  if (!bk || !settings.sdsgSpace?.enabled) return false;
  const isH = layout === 'horizontal';

  // band layout と row 割り当てを再計算（Canvas/export と同じロジック）
  const entries: Array<{ id: string; timeStart: number; timeEnd: number; rowOverride?: number }> = [];
  const boxById = new Map(sheet.boxes.map((b) => [b.id, b]));
  const lineById = new Map(sheet.lines.map((l) => [l.id, l]));
  sheet.sdsg.forEach((s) => {
    if (sdsgBandKey(s) !== bk) return;
    let tS: number, tE: number;
    if (s.anchorMode === 'between' && s.attachedTo2) {
      const ep1 = resolveBetweenEndpoint(s.attachedTo, boxById, lineById, isH);
      const ep2 = resolveBetweenEndpoint(s.attachedTo2, boxById, lineById, isH);
      if (!ep1 || !ep2) return;
      const mode = s.betweenMode ?? 'edge-to-edge';
      const left = ep1.timeStart <= ep2.timeStart ? ep1 : ep2;
      const right = ep1.timeStart <= ep2.timeStart ? ep2 : ep1;
      if (mode === 'edge-to-edge') { tS = left.timeStart; tE = right.timeStart + right.timeSize; }
      else { tS = left.timeStart + left.timeSize / 2; tE = right.timeStart + right.timeSize / 2; }
    } else {
      const attached = sheet.boxes.find((b) => b.id === s.attachedTo);
      if (!attached) return;
      const centerT = isH ? attached.x + attached.width / 2 : attached.y + attached.height / 2;
      const w0 = s.spaceWidth ?? s.width ?? 70;
      tS = centerT - w0 / 2; tE = centerT + w0 / 2;
    }
    entries.push({ id: s.id, timeStart: tS, timeEnd: tE, rowOverride: s.spaceRowOverride });
  });
  const rowMap = settings.sdsgSpace.autoArrange
    ? computeBandRowAssignments(entries)
    : new Map<string, number>();
  const totalRows = Math.max(1, ...Array.from(rowMap.values()).map((v) => v + 1));
  const bandLayout = computeSDSGBandLayout(sheet, layout, settings,
    { top: bk === 'top' ? totalRows : 1, bottom: bk === 'bottom' ? totalRows : 1 });
  const band = bk === 'top' ? bandLayout.topBand : bandLayout.bottomBand;
  if (!band) return false;

  const entry = entries.find((e) => e.id === sg.id);
  if (!entry) return false;
  const rowIdx = rowMap.get(sg.id) ?? 0;
  const timeAnchor = (entry.timeStart + entry.timeEnd) / 2;
  const timeWidth = Math.max(10, entry.timeEnd - entry.timeStart);
  const bandSettings = bk === 'top' ? settings.sdsgSpace.bands.top : settings.sdsgSpace.bands.bottom;
  const pos = computeSDSGBandPosition(
    band, layout, timeAnchor, timeWidth, rowIdx, totalRows, sg, bk,
    { shrinkToFitRow: bandSettings?.shrinkToFitRow !== false },
  );
  return pos.outOfRange;
}
