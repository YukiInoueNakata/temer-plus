// ============================================================================
// 時期ラベルの描画位置計算
// - 長さは非可逆的時間矢印と同じ範囲（min-1 〜 max+1）
// - 高さは最大Item_Level+2 がデフォルト（調整可）
// ============================================================================

import type { Sheet, PeriodLabelSettings, TimeArrowSettings, LayoutDirection } from '../types';
import { LEVEL_PX } from '../store/defaults';

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
