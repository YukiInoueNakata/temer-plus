// ============================================================================
// 時期ラベルの描画位置計算
// - 長さは非可逆的時間矢印と同じ範囲（min-1 〜 max+1）
// - 高さは最大Item_Level+2 がデフォルト（調整可）
// ============================================================================

import type { Sheet, PeriodLabelSettings, TimeArrowSettings, LayoutDirection, SDSGSpaceSettings, TypeLabelVisibilityMap } from '../types';
import { LEVEL_PX } from '../store/defaults';
import { computeBandOuterCoord } from './sdsgSpaceLayout';

export interface PeriodLabelGeometry {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  itemPx: number;          // 時期ラベル帯の item 方向位置
  layout: LayoutDirection;
  items: Array<{
    x: number;             // ラベル中心 x
    y: number;             // ラベル中心 y
    label: string;
  }>;
}

export function computePeriodLabels(
  sheet: Sheet,
  layout: LayoutDirection,
  settings: PeriodLabelSettings,
  timeArrowSettings: TimeArrowSettings,
  // band 範囲を bbox に含めたいときに sdsgSpace を渡す。
  // sdsgSpaceLayout 自身からの呼び出しでは循環回避のため省略する。
  sdsgSpace?: SDSGSpaceSettings,
  typeLabelVisibility?: TypeLabelVisibilityMap,
): PeriodLabelGeometry | null {
  if (sheet.periodLabels.length === 0 && !settings.alwaysVisible) return null;

  // 全要素のバウンディングボックス（時間矢印と同じロジック）
  const xs: number[] = [];
  const ys: number[] = [];
  sheet.boxes.forEach((b) => {
    xs.push(b.x, b.x + b.width);
    ys.push(b.y, b.y + b.height);
  });
  sheet.sdsg.forEach((sg) => {
    // band-mode SDSG は下の sdsgSpace ブロックで近似拡張する
    if (sg.spaceMode === 'band-top' || sg.spaceMode === 'band-bottom') return;
    const attached = sheet.boxes.find((b) => b.id === sg.attachedTo);
    if (!attached) return;
    const isH = layout === 'horizontal';
    const sgX = attached.x + (isH ? (sg.timeOffset ?? 0) : (sg.itemOffset ?? 0));
    const sgY = attached.y + (isH ? (sg.itemOffset ?? 0) : (sg.timeOffset ?? 0));
    const sgW = sg.width ?? 70;
    const sgH = sg.height ?? 40;
    xs.push(sgX, sgX + sgW);
    ys.push(sgY, sgY + sgH);
  });

  // 時期ラベルは最高 IL 側を基準にするため、最高 IL 方向のみ bbox を拡張する。
  //   横型: 最高 IL = 最小 y 方向（画面上）
  //   縦型: 最高 IL = 最大 x 方向（画面右）
  // 拡張内容:
  //   - 常に LABEL_MARGIN_PX を加算（Box / 付随 SDSG のタイプラベル・サブラベル用）
  //   - SD 帯（band-top）に SDSG があれば、heightMode に応じた実際の band 外側エッジを使用
  const LABEL_MARGIN_PX = 30;
  const isHLocal = layout === 'horizontal';
  if (sheet.boxes.length > 0 && (xs.length > 0 || ys.length > 0)) {
    // 既存 bbox の最高 IL 側 + LABEL_MARGIN
    if (isHLocal) {
      ys.push(Math.min(...ys) - LABEL_MARGIN_PX);
    } else {
      xs.push(Math.max(...xs) + LABEL_MARGIN_PX);
    }
    // SD 帯の実際の外側エッジ
    if (sdsgSpace?.enabled) {
      const sdBand = sdsgSpace.bands.top;
      if (sdBand.reference !== 'period') {
        const outerCoord = computeBandOuterCoord(sheet, layout, sdBand, 'top', typeLabelVisibility);
        if (outerCoord != null) {
          let insetExt = 0;
          sheet.sdsg.forEach((sg) => {
            if (sg.spaceMode !== 'band-top') return;
            const inset = sg.spaceInsetItem ?? 0;
            if (inset > insetExt) insetExt = inset;
          });
          // 高 IL 方向: 横型 ow=-1、縦型 ow=+1
          const ow = isHLocal ? -1 : 1;
          const finalOuter = outerCoord + ow * insetExt;
          if (isHLocal) ys.push(finalOuter - LABEL_MARGIN_PX);
          else xs.push(finalOuter + LABEL_MARGIN_PX);
        }
      }
    }
  }

  if (xs.length === 0) return null;

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const isH = layout === 'horizontal';
  const minTime = isH ? minX : minY;
  const maxTime = isH ? maxX : maxY;

  const minTimeLevel = minTime / LEVEL_PX;
  const maxTimeLevel = maxTime / LEVEL_PX;

  // ユーザ座標系の Item_Level 範囲（横型 UP=+, 縦型 RIGHT=+）
  const userMaxItemLevel = isH ? -minY / LEVEL_PX : maxX / LEVEL_PX;
  const userMinItemLevel = isH ? -maxY / LEVEL_PX : minX / LEVEL_PX;

  // 時間範囲（時間矢印と同じ拡張量）
  const startTime = (minTimeLevel + timeArrowSettings.timeStartExtension) * LEVEL_PX;
  const endTime = (maxTimeLevel + timeArrowSettings.timeEndExtension) * LEVEL_PX;
  // item 位置（ユーザ座標 → ストレージ変換）
  const refUserIL = settings.itemReference === 'max' ? userMaxItemLevel : userMinItemLevel;
  const targetUserIL = refUserIL + settings.itemOffset;
  const itemPx = isH ? -targetUserIL * LEVEL_PX : targetUserIL * LEVEL_PX;

  // 各 PeriodLabel を配置
  const items = sheet.periodLabels.map((pl) => {
    const timePos = pl.position * LEVEL_PX;
    if (layout === 'horizontal') {
      return { x: timePos, y: itemPx, label: pl.label };
    } else {
      return { x: itemPx, y: timePos, label: pl.label };
    }
  });

  if (layout === 'horizontal') {
    return {
      startX: startTime,
      startY: itemPx,
      endX: endTime,
      endY: itemPx,
      itemPx,
      layout,
      items,
    };
  } else {
    return {
      startX: itemPx,
      startY: startTime,
      endX: itemPx,
      endY: endTime,
      itemPx,
      layout,
      items,
    };
  }
}
