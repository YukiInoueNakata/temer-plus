// ============================================================================
// LineEdge - 矢印の始点/終点からのマージン・オフセット・角度モードを反映するエッジ
// data:
//   startMargin / endMargin : 方向ベクトル沿いのオフセット (px)
//   startOffsetTime / endOffsetTime / startOffsetItem / endOffsetItem:
//     Time/Item 軸独立のオフセット (px、ユーザ座標)
//     layout に応じて x/y に変換:
//       横型: Time=+x, Item=-y
//       縦型: Time=+y, Item=+x
//   angleMode + angleDeg : ON のとき角度ベースで端点を決定（startOffset*は無視）
//   fromBox / toBox : 実レイアウトで使う Box 座標（swap 判定と angle モード用）
// ============================================================================

import { BaseEdge, getStraightPath, type EdgeProps } from 'reactflow';
import { useTEMView } from '../../context/TEMViewContext';
import type { Box, Line } from '../../types';
import {
  resolveLineDirection,
  computeAngleEndpoints,
  clampAngleDeg,
} from '../../utils/lineDirection';

export interface LineEdgeData {
  startMargin?: number;
  endMargin?: number;
  startOffsetTime?: number;
  endOffsetTime?: number;
  startOffsetItem?: number;
  endOffsetItem?: number;
  angleMode?: boolean;
  angleDeg?: number;
  fromBox?: Box;
  toBox?: Box;
}

export function LineEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  markerEnd,
  style,
}: EdgeProps<LineEdgeData>) {
  const view = useTEMView();
  const layout = view.settings.layout;
  const isH = layout === 'horizontal';

  // angle モード or 自動入れ替えには fromBox/toBox が必要。無い場合は従来動作
  const hasBoxes = !!(data?.fromBox && data?.toBox);

  // 擬似 Line を組んで resolveLineDirection へ（実際のユーザ意図は data 経由で渡される）
  const line: Line = {
    id,
    type: 'RLine',
    from: data?.fromBox?.id ?? '',
    to: data?.toBox?.id ?? '',
    connectionMode: 'center-to-center',
    shape: 'straight',
    startMargin: data?.startMargin,
    endMargin: data?.endMargin,
    startOffsetTime: data?.startOffsetTime,
    endOffsetTime: data?.endOffsetTime,
    startOffsetItem: data?.startOffsetItem,
    endOffsetItem: data?.endOffsetItem,
  };

  let sx: number;
  let sy: number;
  let tx: number;
  let ty: number;

  if (hasBoxes && data!.angleMode) {
    // 角度モード: forward-time 辺中点 → 指定角度で to の backward-time 辺まで
    const resolved = resolveLineDirection(line, data!.fromBox!, data!.toBox!, layout);
    const ep = computeAngleEndpoints(resolved.from, resolved.to, clampAngleDeg(data!.angleDeg), layout);
    // マージンを方向ベクトル沿いに適用
    const dx = ep.ex - ep.sx;
    const dy = ep.ey - ep.sy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    sx = ep.sx + ux * resolved.startMargin;
    sy = ep.sy + uy * resolved.startMargin;
    tx = ep.ex - ux * resolved.endMargin;
    ty = ep.ey - uy * resolved.endMargin;
  } else if (hasBoxes) {
    // 通常モード + 自動入れ替え: bbox から forward-time 辺中点を自前計算
    const resolved = resolveLineDirection(line, data!.fromBox!, data!.toBox!, layout);
    const from = resolved.from;
    const to = resolved.to;
    const sx0Base = isH ? from.x + from.width : from.x + from.width / 2;
    const sy0Base = isH ? from.y + from.height / 2 : from.y + from.height;
    const tx0Base = isH ? to.x : to.x + to.width / 2;
    const ty0Base = isH ? to.y + to.height / 2 : to.y;

    const sOffT = resolved.startOffsetTime;
    const eOffT = resolved.endOffsetTime;
    const sOffI = resolved.startOffsetItem;
    const eOffI = resolved.endOffsetItem;
    const sDx = isH ? sOffT : sOffI;
    const sDy = isH ? -sOffI : sOffT;
    const eDx = isH ? eOffT : eOffI;
    const eDy = isH ? -eOffI : eOffT;

    const sx0 = sx0Base + sDx;
    const sy0 = sy0Base + sDy;
    const tx0 = tx0Base + eDx;
    const ty0 = ty0Base + eDy;

    const dx = tx0 - sx0;
    const dy = ty0 - sy0;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    sx = sx0 + ux * resolved.startMargin;
    sy = sy0 + uy * resolved.startMargin;
    tx = tx0 - ux * resolved.endMargin;
    ty = ty0 - uy * resolved.endMargin;
  } else {
    // フォールバック: React Flow のハンドル位置から（従来動作、Boxデータ未提供時）
    const startMargin = data?.startMargin ?? 0;
    const endMargin = data?.endMargin ?? 0;
    const sOffT = data?.startOffsetTime ?? 0;
    const eOffT = data?.endOffsetTime ?? 0;
    const sOffI = data?.startOffsetItem ?? 0;
    const eOffI = data?.endOffsetItem ?? 0;
    const sDx = isH ? sOffT : sOffI;
    const sDy = isH ? -sOffI : sOffT;
    const eDx = isH ? eOffT : eOffI;
    const eDy = isH ? -eOffI : eOffT;
    const sx0 = sourceX + sDx;
    const sy0 = sourceY + sDy;
    const tx0 = targetX + eDx;
    const ty0 = targetY + eDy;
    const dx = tx0 - sx0;
    const dy = ty0 - sy0;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    sx = sx0 + ux * startMargin;
    sy = sy0 + uy * startMargin;
    tx = tx0 - ux * endMargin;
    ty = ty0 - uy * endMargin;
  }

  const [edgePath] = getStraightPath({
    sourceX: sx,
    sourceY: sy,
    targetX: tx,
    targetY: ty,
  });

  return <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />;
}
