// ============================================================================
// Line 方向解決: from の Time レベルが to より後方なら自動入れ替え
// - データ上の line.from / line.to は変更しない（Undo履歴保護・ユーザ意図保持）
// - 描画・エクスポート時に本ヘルパーで swap 済みの実効 from/to を得る
// - 入れ替え時は startMargin ↔ endMargin、startOffset* ↔ endOffset* も交換して
//   「入れ替え後の起点から見た値」として渡す
// ============================================================================

import type { Box, Line, LayoutDirection } from '../types';

export const ANGLE_DEG_MAX = 85;
export const ANGLE_DEG_MIN = -85;

export interface ResolvedLineDirection {
  from: Box;
  to: Box;
  swapped: boolean;
  startMargin: number;
  endMargin: number;
  startOffsetTime: number;
  endOffsetTime: number;
  startOffsetItem: number;
  endOffsetItem: number;
}

/**
 * Line の描画方向を解決する。
 * from Box の Time 軸中心座標が to より大きければ入れ替え。
 * 同座標なら入れ替えなし（ユーザ指定順を尊重）。
 */
export function resolveLineDirection(
  line: Line,
  fromBox: Box,
  toBox: Box,
  layout: LayoutDirection,
): ResolvedLineDirection {
  const isH = layout === 'horizontal';
  const fromT = isH ? fromBox.x + fromBox.width / 2 : fromBox.y + fromBox.height / 2;
  const toT = isH ? toBox.x + toBox.width / 2 : toBox.y + toBox.height / 2;
  const swap = fromT > toT;

  if (!swap) {
    return {
      from: fromBox,
      to: toBox,
      swapped: false,
      startMargin: line.startMargin ?? 0,
      endMargin: line.endMargin ?? 0,
      startOffsetTime: line.startOffsetTime ?? 0,
      endOffsetTime: line.endOffsetTime ?? 0,
      startOffsetItem: line.startOffsetItem ?? 0,
      endOffsetItem: line.endOffsetItem ?? 0,
    };
  }

  return {
    from: toBox,
    to: fromBox,
    swapped: true,
    startMargin: line.endMargin ?? 0,
    endMargin: line.startMargin ?? 0,
    startOffsetTime: line.endOffsetTime ?? 0,
    endOffsetTime: line.startOffsetTime ?? 0,
    startOffsetItem: line.endOffsetItem ?? 0,
    endOffsetItem: line.startOffsetItem ?? 0,
  };
}

export function clampAngleDeg(deg: number | undefined): number {
  if (deg == null || !Number.isFinite(deg)) return 0;
  if (deg > ANGLE_DEG_MAX) return ANGLE_DEG_MAX;
  if (deg < ANGLE_DEG_MIN) return ANGLE_DEG_MIN;
  return deg;
}

export interface AngleLineEndpoints {
  sx: number;
  sy: number;
  ex: number;
  ey: number;
}

/**
 * 角度モードの端点を計算（マージン適用前）。
 * @param from  swap 済みの実効 from Box
 * @param to    swap 済みの実効 to Box
 * @param angleDeg 角度（度、正で視覚的上/右方向）
 * @param layout レイアウト
 */
export function computeAngleEndpoints(
  from: Box,
  to: Box,
  angleDeg: number,
  layout: LayoutDirection,
): AngleLineEndpoints {
  const theta = (clampAngleDeg(angleDeg) * Math.PI) / 180;
  if (layout === 'horizontal') {
    const sx = from.x + from.width;
    const sy = from.y + from.height / 2;
    const ex = to.x;
    const dx = ex - sx;
    // 画面 y は下向きなので「視覚的に上 = -y」を正とする
    const ey = sy - dx * Math.tan(theta);
    return { sx, sy, ex, ey };
  }
  // vertical
  const sx = from.x + from.width / 2;
  const sy = from.y + from.height;
  const ey = to.y;
  const dy = ey - sy;
  // 視覚的に右 = +x を正
  const ex = sx + dy * Math.tan(theta);
  return { sx, sy, ex, ey };
}
