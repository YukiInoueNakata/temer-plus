// ============================================================================
// 座標変換ユーティリティ
//
// ユーザの座標系:
//   横型レイアウト: Time=横軸(右=+), Item=縦軸(上=+)
//   縦型レイアウト: Time=縦軸(下=+), Item=横軸(右=+)
//
// 内部ストレージ座標 (x, y) は常にスクリーン座標（y 下=正）
//
// 変換:
//   横型: TimeLevel = x/LEVEL_PX,  ItemLevel = -y/LEVEL_PX  (flipped)
//   縦型: TimeLevel = y/LEVEL_PX,  ItemLevel = x/LEVEL_PX   (no flip)
// ============================================================================

import type { LayoutDirection } from '../types';
import { LEVEL_PX } from '../store/defaults';

export function xyToTimeLevel(x: number, y: number, layout: LayoutDirection): number {
  return (layout === 'horizontal' ? x : y) / LEVEL_PX;
}

export function xyToItemLevel(x: number, y: number, layout: LayoutDirection): number {
  if (layout === 'horizontal') return -y / LEVEL_PX;
  return x / LEVEL_PX;
}

/** TimeLevel と ItemLevel から x, y を求める */
export function levelToXY(
  timeLevel: number,
  itemLevel: number,
  layout: LayoutDirection,
): { x: number; y: number } {
  if (layout === 'horizontal') {
    return { x: timeLevel * LEVEL_PX, y: -itemLevel * LEVEL_PX };
  } else {
    return { x: itemLevel * LEVEL_PX, y: timeLevel * LEVEL_PX };
  }
}

/** Time_Level 値を変更する: 現在の Item 値は保持 */
export function setTimeLevelOnly(
  currentX: number,
  currentY: number,
  newTimeLevel: number,
  layout: LayoutDirection,
): { x: number; y: number } {
  if (layout === 'horizontal') {
    return { x: newTimeLevel * LEVEL_PX, y: currentY };
  }
  return { x: currentX, y: newTimeLevel * LEVEL_PX };
}

/** Item_Level 値を変更する */
export function setItemLevelOnly(
  currentX: number,
  currentY: number,
  newItemLevel: number,
  layout: LayoutDirection,
): { x: number; y: number } {
  if (layout === 'horizontal') {
    return { x: currentX, y: -newItemLevel * LEVEL_PX };  // flip
  }
  return { x: newItemLevel * LEVEL_PX, y: currentY };
}
