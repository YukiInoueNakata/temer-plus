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

import { useRef, useState } from 'react';
import { BaseEdge, getStraightPath, useReactFlow, type EdgeProps } from 'reactflow';
import { useTEMView } from '../../context/TEMViewContext';
import type { Line, LineShape } from '../../types';
import {
  resolveLineDirection,
  computeAngleEndpoints,
  clampAngleDeg,
} from '../../utils/lineDirection';
import {
  computeLinePath,
  applyLinePathMargins,
  toSvgPath,
  resolveEffectiveShape,
} from '../../utils/linePath';

export interface LineEdgeData {
  startMargin?: number;
  endMargin?: number;
  startOffsetTime?: number;
  endOffsetTime?: number;
  startOffsetItem?: number;
  endOffsetItem?: number;
  angleMode?: boolean;
  angleDeg?: number;
  shape?: LineShape;
  elbowBendRatio?: number;
  curveIntensity?: number;
  controlPoints?: { x: number; y: number }[];
  connectionMode?: 'center-to-center' | 'horizontal';   // legacy
  fromBoxId?: string;
  toBoxId?: string;
  idOffsetX?: number;
  idOffsetY?: number;
  idFontSize?: number;
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
  selected,
}: EdgeProps<LineEdgeData>) {
  const view = useTEMView();
  const layout = view.settings.layout;
  const isH = layout === 'horizontal';
  const rf = useReactFlow();
  const updateLine = view.updateLine;
  // ドラッグ中のライブプレビュー（pointerup 時に store 反映）
  const [dragCP, setDragCP] = useState<{ cp1?: { x: number; y: number }; cp2?: { x: number; y: number } } | null>(null);
  const draggingHandleRef = useRef<null | 'cp1' | 'cp2'>(null);
  // 曲線制御点
  // L字 bend 比率ライブプレビュー
  const [dragBend, setDragBend] = useState<number | null>(null);
  const bendDraggingRef = useRef<boolean>(false);

  // angle モード / 自動入れ替えには from/to Box 座標が必要。
  // data.fromBoxId / toBoxId を view.sheet から解決
  const fromBox = data?.fromBoxId ? view.sheet?.boxes.find((b) => b.id === data.fromBoxId) : undefined;
  const toBox = data?.toBoxId ? view.sheet?.boxes.find((b) => b.id === data.toBoxId) : undefined;
  const hasBoxes = !!(fromBox && toBox);

  // 擬似 Line（resolveLineDirection / computeLinePath に渡すため）
  const line: Line = {
    id,
    type: 'RLine',
    from: data?.fromBoxId ?? '',
    to: data?.toBoxId ?? '',
    connectionMode: data?.connectionMode ?? 'center-to-center',
    shape: data?.shape ?? 'straight',
    startMargin: data?.startMargin,
    endMargin: data?.endMargin,
    startOffsetTime: data?.startOffsetTime,
    endOffsetTime: data?.endOffsetTime,
    startOffsetItem: data?.startOffsetItem,
    endOffsetItem: data?.endOffsetItem,
    elbowBendRatio: dragBend !== null ? dragBend : data?.elbowBendRatio,
    curveIntensity: data?.curveIntensity,
    // ドラッグ中は cp ライブプレビュー、無ければ永続値
    controlPoints: dragCP && dragCP.cp1 && dragCP.cp2
      ? [dragCP.cp1, dragCP.cp2]
      : data?.controlPoints,
  };

  const effectiveShape = resolveEffectiveShape(line);

  // L字 / 曲線: 形状別 path を生成（angle モードは無視）
  if (hasBoxes && (effectiveShape === 'elbow' || effectiveShape === 'curve')) {
    const resolved = resolveLineDirection(line, fromBox!, toBox!, layout);
    const resolvedLine: Line = {
      ...line,
      startMargin: resolved.startMargin,
      endMargin: resolved.endMargin,
      startOffsetTime: resolved.startOffsetTime,
      endOffsetTime: resolved.endOffsetTime,
      startOffsetItem: resolved.startOffsetItem,
      endOffsetItem: resolved.endOffsetItem,
    };
    const path = applyLinePathMargins(
      computeLinePath(resolvedLine, resolved.from, resolved.to, layout),
      resolved.startMargin,
      resolved.endMargin,
    );

    // curve 選択中のみ制御点ハンドル描画
    const showHandles =
      effectiveShape === 'curve'
      && !view.isPreview
      && selected === true
      && path.kind === 'curve'
      && path.points.length === 4;
    // L字 選択中のみ bend ハンドル描画
    const showBendHandle =
      effectiveShape === 'elbow'
      && !view.isPreview
      && selected === true
      && path.kind === 'elbow'
      && path.points.length === 4;

    const startDrag = (which: 'cp1' | 'cp2') => (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      draggingHandleRef.current = which;
      const target = e.currentTarget as SVGCircleElement;
      target.setPointerCapture(e.pointerId);
    };
    const onDragMove = (e: React.PointerEvent) => {
      if (!draggingHandleRef.current) return;
      const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      // スナップ適用（グリッドスナップがオンかつ canvas 側も snapEnabled のときのみ）
      const snap = view.settings.snap;
      const snapOn = view.view.snapEnabled && snap?.gridSnap && snap.gridPx > 0;
      const snappedPos = snapOn
        ? { x: Math.round(pos.x / snap.gridPx) * snap.gridPx, y: Math.round(pos.y / snap.gridPx) * snap.gridPx }
        : pos;
      setDragCP((cur) => ({
        cp1: draggingHandleRef.current === 'cp1' ? snappedPos : (cur?.cp1 ?? path.points[1]),
        cp2: draggingHandleRef.current === 'cp2' ? snappedPos : (cur?.cp2 ?? path.points[2]),
      }));
    };
    const endDrag = (e: React.PointerEvent) => {
      if (!draggingHandleRef.current) return;
      const target = e.currentTarget as SVGCircleElement;
      try { target.releasePointerCapture(e.pointerId); } catch { /* noop */ }
      draggingHandleRef.current = null;
      setDragCP((cur) => {
        if (!cur || !cur.cp1 || !cur.cp2) return null;
        if (updateLine) updateLine(id, { controlPoints: [cur.cp1, cur.cp2] });
        return null;
      });
    };

    // L字 bend ハンドル用
    const startBendDrag = (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      bendDraggingRef.current = true;
      const target = e.currentTarget as SVGCircleElement;
      target.setPointerCapture(e.pointerId);
    };
    const onBendDragMove = (e: React.PointerEvent) => {
      if (!bendDraggingRef.current) return;
      const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const snap = view.settings.snap;
      const snapOn = view.view.snapEnabled && snap?.gridSnap && snap.gridPx > 0;
      const snappedPos = snapOn
        ? { x: Math.round(pos.x / snap.gridPx) * snap.gridPx, y: Math.round(pos.y / snap.gridPx) * snap.gridPx }
        : pos;
      const p0 = path.points[0];
      const p3 = path.points[3];
      let newRatio: number;
      if (isH) {
        const range = p3.x - p0.x;
        newRatio = Math.abs(range) < 1e-3 ? 0.5 : (snappedPos.x - p0.x) / range;
      } else {
        const range = p3.y - p0.y;
        newRatio = Math.abs(range) < 1e-3 ? 0.5 : (snappedPos.y - p0.y) / range;
      }
      newRatio = Math.max(0, Math.min(1, newRatio));
      setDragBend(newRatio);
    };
    const endBendDrag = (e: React.PointerEvent) => {
      if (!bendDraggingRef.current) return;
      const target = e.currentTarget as SVGCircleElement;
      try { target.releasePointerCapture(e.pointerId); } catch { /* noop */ }
      bendDraggingRef.current = false;
      setDragBend((cur) => {
        if (cur !== null && updateLine) updateLine(id, { elbowBendRatio: cur });
        return null;
      });
    };

    // 中点: elbow は 2 番目のセグメント中点、curve は 4 点 Bezier の t=0.5 を近似
    const midOfPath = (() => {
      if (path.kind === 'curve' && path.points.length === 4) {
        const [p0, c1, c2, p3] = path.points;
        const t = 0.5;
        const mt = 1 - t;
        return {
          x: mt * mt * mt * p0.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * p3.x,
          y: mt * mt * mt * p0.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * p3.y,
        };
      }
      if (path.kind === 'elbow' && path.points.length >= 4) {
        return {
          x: (path.points[1].x + path.points[2].x) / 2,
          y: (path.points[1].y + path.points[2].y) / 2,
        };
      }
      const p0 = path.points[0];
      const p1 = path.points[path.points.length - 1];
      return { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    })();
    return (
      <>
        <BaseEdge id={id} path={toSvgPath(path)} markerEnd={markerEnd} style={style} />
        {view.view.showLineIds && renderLineIdBadge({
          id, midX: midOfPath.x, midY: midOfPath.y, data, isHorizontal: layout === 'horizontal',
        })}
        {showHandles && (
          <g className="curve-control-handles" style={{ pointerEvents: 'all' }}>
            {/* 補助線: p0↔cp1, p3↔cp2 */}
            <line
              x1={path.points[0].x} y1={path.points[0].y}
              x2={path.points[1].x} y2={path.points[1].y}
              stroke="#2684ff" strokeDasharray="3,3" strokeWidth={1} pointerEvents="none"
            />
            <line
              x1={path.points[3].x} y1={path.points[3].y}
              x2={path.points[2].x} y2={path.points[2].y}
              stroke="#2684ff" strokeDasharray="3,3" strokeWidth={1} pointerEvents="none"
            />
            {/* ハンドル */}
            <circle
              cx={path.points[1].x} cy={path.points[1].y} r={6}
              fill="#2684ff" stroke="#fff" strokeWidth={2}
              style={{ cursor: 'grab' }}
              onPointerDown={startDrag('cp1')}
              onPointerMove={onDragMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <title>cp1 をドラッグで移動</title>
            </circle>
            <circle
              cx={path.points[2].x} cy={path.points[2].y} r={6}
              fill="#2684ff" stroke="#fff" strokeWidth={2}
              style={{ cursor: 'grab' }}
              onPointerDown={startDrag('cp2')}
              onPointerMove={onDragMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <title>cp2 をドラッグで移動</title>
            </circle>
          </g>
        )}
        {showBendHandle && (
          <g className="elbow-bend-handle" style={{ pointerEvents: 'all' }}>
            <circle
              cx={(path.points[1].x + path.points[2].x) / 2}
              cy={(path.points[1].y + path.points[2].y) / 2}
              r={6}
              fill="#f39c12" stroke="#fff" strokeWidth={2}
              style={{ cursor: isH ? 'ew-resize' : 'ns-resize' }}
              onPointerDown={startBendDrag}
              onPointerMove={onBendDragMove}
              onPointerUp={endBendDrag}
              onPointerCancel={endBendDrag}
            >
              <title>L字の折れ位置をドラッグで調整（{isH ? '左右' : '上下'}方向）</title>
            </circle>
          </g>
        )}
      </>
    );
  }

  let sx: number;
  let sy: number;
  let tx: number;
  let ty: number;

  if (hasBoxes && data!.angleMode) {
    // 角度モード: forward-time 辺中点 → 指定角度で to の backward-time 辺まで
    //   調整は startOffset* / endOffset*（Time/Item 軸）で行う。margin は適用しない
    const resolved = resolveLineDirection(line, fromBox!, toBox!, layout);
    const ep = computeAngleEndpoints(resolved.from, resolved.to, clampAngleDeg(data!.angleDeg), layout);
    const sOffT = resolved.startOffsetTime;
    const eOffT = resolved.endOffsetTime;
    const sOffI = resolved.startOffsetItem;
    const eOffI = resolved.endOffsetItem;
    // 横型: Time=+x, Item=-y / 縦型: Time=+y, Item=+x
    const sDx = isH ? sOffT : sOffI;
    const sDy = isH ? -sOffI : sOffT;
    const eDx = isH ? eOffT : eOffI;
    const eDy = isH ? -eOffI : eOffT;
    sx = ep.sx + sDx;
    sy = ep.sy + sDy;
    tx = ep.ex + eDx;
    ty = ep.ey + eDy;
  } else if (hasBoxes) {
    // 通常モード + 自動入れ替え: bbox から forward-time 辺中点を自前計算
    const resolved = resolveLineDirection(line, fromBox!, toBox!, layout);
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

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {view.view.showLineIds && renderLineIdBadge({
        id, midX: (sx + tx) / 2, midY: (sy + ty) / 2, data, isHorizontal: layout === 'horizontal',
      })}
    </>
  );
}

function renderLineIdBadge(args: {
  id: string;
  midX: number;
  midY: number;
  data?: LineEdgeData;
  isHorizontal?: boolean;
}) {
  // idOffsetX/Y は論理軸基準 (X=時間軸, Y=項目軸)、レイアウトで画面軸へ変換
  const offTime = args.data?.idOffsetX ?? 0;
  const offItem = args.data?.idOffsetY ?? -12;
  const isH = args.isHorizontal !== false;
  const offX = isH ? offTime : offItem;
  const offY = isH ? offItem : offTime;
  const fs = args.data?.idFontSize ?? 9;
  const disp = args.id.length > 14 ? args.id.slice(0, 14) + '…' : args.id;
  const cx = args.midX + offX;
  const cy = args.midY + offY;
  const padX = 3;
  const padY = 1;
  const textW = disp.length * fs * 0.6 + padX * 2;
  const textH = fs + padY * 2;
  return (
    <g pointerEvents="none">
      <rect
        x={cx - textW / 2}
        y={cy - textH / 2}
        width={textW}
        height={textH}
        fill="#fff"
        stroke="none"
        rx={2}
      />
      <text
        x={cx}
        y={cy}
        fontSize={fs}
        fill="#666"
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontFamily: 'monospace' }}
      >
        {disp}
      </text>
    </g>
  );
}
