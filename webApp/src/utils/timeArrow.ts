// ============================================================================
// 非可逆的時間矢印の計算
// ============================================================================

import type { Sheet, TimeArrowSettings, LayoutDirection } from '../types';
import { LEVEL_PX } from '../store/defaults';

export interface TimeArrowGeometry {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  labelX: number;
  labelY: number;
  label: string;
  strokeWidth: number;
  fontSize: number;
  layout: LayoutDirection;
  // ラベル配置（描画側の transform 算出に使用）
  labelSide: 'top' | 'bottom' | 'left' | 'right';
}

/**
 * シート内の全要素を囲むバウンディングボックスを元に
 * 非可逆的時間矢印の配置を計算する
 */
export function computeTimeArrow(
  sheet: Sheet,
  layout: LayoutDirection,
  settings: TimeArrowSettings,
): TimeArrowGeometry | null {
  if (sheet.boxes.length === 0) return null;

  // 全Box座標収集
  const xs: number[] = [];
  const ys: number[] = [];
  sheet.boxes.forEach((b) => {
    xs.push(b.x, b.x + b.width);
    ys.push(b.y, b.y + b.height);
  });

  // SDSG座標も含める（位置は attachedTo + offset）
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

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  // time軸と item軸に対応
  const isH = layout === 'horizontal';
  const minTime = isH ? minX : minY;
  const maxTime = isH ? maxX : maxY;

  // レベル換算（time軸は layout によらず素直）
  const minTimeLevel = minTime / LEVEL_PX;
  const maxTimeLevel = maxTime / LEVEL_PX;

  // ユーザ座標系の Item_Level 範囲
  // 横型: Item UP=+ なので最上行(min y) が max_user_IL
  // 縦型: Item RIGHT=+ なので最右列(max x) が max_user_IL
  const userMaxItemLevel = isH ? -minY / LEVEL_PX : maxX / LEVEL_PX;
  const userMinItemLevel = isH ? -maxY / LEVEL_PX : minX / LEVEL_PX;

  const arrowStartTime = (minTimeLevel + settings.timeStartExtension) * LEVEL_PX;
  const arrowEndTime = (maxTimeLevel + settings.timeEndExtension) * LEVEL_PX;
  const refUserIL = settings.itemReference === 'max' ? userMaxItemLevel : userMinItemLevel;
  const targetUserIL = refUserIL + settings.itemOffset;
  // ユーザ座標 → ストレージ座標
  const arrowItem = isH ? -targetUserIL * LEVEL_PX : targetUserIL * LEVEL_PX;

  const offset = (settings.labelOffset ?? 4) + settings.fontSize / 2;
  if (layout === 'horizontal') {
    const sideH = settings.labelSideHorizontal ?? 'bottom';
    const alignH = settings.labelAlignHorizontal ?? 'center';
    // 矢印に沿った位置: center=中点、end=矢印の先端近く
    const labelX = alignH === 'end'
      ? arrowEndTime - (arrowEndTime - arrowStartTime) * 0.05
      : (arrowStartTime + arrowEndTime) / 2;
    return {
      startX: arrowStartTime,
      startY: arrowItem,
      endX: arrowEndTime,
      endY: arrowItem,
      labelX,
      labelY: sideH === 'top' ? arrowItem - offset : arrowItem + offset,
      label: settings.label,
      strokeWidth: settings.strokeWidth,
      fontSize: settings.fontSize,
      layout,
      labelSide: sideH,
    };
  } else {
    const sideV = settings.labelSideVertical ?? 'left';
    const alignV = settings.labelAlignVertical ?? 'center';
    // 縦型: center=中点、start=矢印の開始付近（上寄り）
    const labelY = alignV === 'start'
      ? arrowStartTime + (arrowEndTime - arrowStartTime) * 0.05
      : (arrowStartTime + arrowEndTime) / 2;
    return {
      startX: arrowItem,
      startY: arrowStartTime,
      endX: arrowItem,
      endY: arrowEndTime,
      labelX: sideV === 'left' ? arrowItem - offset : arrowItem + offset,
      labelY,
      label: settings.label,
      strokeWidth: settings.strokeWidth,
      fontSize: settings.fontSize,
      layout,
      labelSide: sideV,
    };
  }
}
