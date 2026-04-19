// ============================================================================
// LineEdge - 矢印の始点/終点からのマージンを反映する直線エッジ
// data:
//   startMargin / endMargin : 方向ベクトル沿いのオフセット (px)
//   startOffsetTime / endOffsetTime / startOffsetItem / endOffsetItem:
//     Time/Item 軸独立のオフセット (px、ユーザ座標)
//     layout に応じて x/y に変換:
//       横型: Time=+x, Item=-y
//       縦型: Time=+y, Item=+x
// ============================================================================

import { BaseEdge, getStraightPath, type EdgeProps } from 'reactflow';
import { useTEMView } from '../../context/TEMViewContext';

export interface LineEdgeData {
  startMargin?: number;
  endMargin?: number;
  startOffsetTime?: number;
  endOffsetTime?: number;
  startOffsetItem?: number;
  endOffsetItem?: number;
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

  const startMargin = data?.startMargin ?? 0;
  const endMargin = data?.endMargin ?? 0;
  const sOffT = data?.startOffsetTime ?? 0;
  const eOffT = data?.endOffsetTime ?? 0;
  const sOffI = data?.startOffsetItem ?? 0;
  const eOffI = data?.endOffsetItem ?? 0;

  // Time/Item → ストレージ x/y 変換
  // 横型: Time→+x, Item→-y
  // 縦型: Time→+y, Item→+x
  const sDx = isH ? sOffT : sOffI;
  const sDy = isH ? -sOffI : sOffT;
  const eDx = isH ? eOffT : eOffI;
  const eDy = isH ? -eOffI : eOffT;

  // 方向ベクトル沿いのマージン適用元（オフセット後の位置から方向計算）
  const sx0 = sourceX + sDx;
  const sy0 = sourceY + sDy;
  const tx0 = targetX + eDx;
  const ty0 = targetY + eDy;

  const dx = tx0 - sx0;
  const dy = ty0 - sy0;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len;
  const uy = dy / len;

  const sx = sx0 + ux * startMargin;
  const sy = sy0 + uy * startMargin;
  const tx = tx0 - ux * endMargin;
  const ty = ty0 - uy * endMargin;

  const [edgePath] = getStraightPath({
    sourceX: sx,
    sourceY: sy,
    targetX: tx,
    targetY: ty,
  });

  return <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />;
}
