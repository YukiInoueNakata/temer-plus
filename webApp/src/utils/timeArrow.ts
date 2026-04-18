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
  const minTime = layout === 'horizontal' ? minX : minY;
  const maxTime = layout === 'horizontal' ? maxX : maxY;
  const minItem = layout === 'horizontal' ? minY : minX;
  const maxItem = layout === 'horizontal' ? maxY : maxX;

  // レベル換算
  const minTimeLevel = minTime / LEVEL_PX;
  const maxTimeLevel = maxTime / LEVEL_PX;
  const minItemLevel = minItem / LEVEL_PX;
  const maxItemLevel = maxItem / LEVEL_PX;

  const arrowStartTime = (minTimeLevel + settings.timeStartExtension) * LEVEL_PX;
  const arrowEndTime = (maxTimeLevel + settings.timeEndExtension) * LEVEL_PX;
  const refLevel = settings.itemReference === 'max' ? maxItemLevel : minItemLevel;
  const arrowItem = (refLevel + settings.itemOffset) * LEVEL_PX;

  if (layout === 'horizontal') {
    return {
      startX: arrowStartTime,
      startY: arrowItem,
      endX: arrowEndTime,
      endY: arrowItem,
      labelX: (arrowStartTime + arrowEndTime) / 2,
      labelY: arrowItem - settings.fontSize - 4,
      label: settings.label,
      strokeWidth: settings.strokeWidth,
      fontSize: settings.fontSize,
      layout,
    };
  } else {
    return {
      startX: arrowItem,
      startY: arrowStartTime,
      endX: arrowItem,
      endY: arrowEndTime,
      labelX: arrowItem - settings.fontSize - 4,
      labelY: (arrowStartTime + arrowEndTime) / 2,
      label: settings.label,
      strokeWidth: settings.strokeWidth,
      fontSize: settings.fontSize,
      layout,
    };
  }
}
