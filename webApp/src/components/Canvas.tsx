// ============================================================================
// Canvas - Main drawing area with scrollbars
// - 通常スクロール = パン（レイアウト方向）
// - Shift + スクロール = ズーム
// - Shift + クリック = 複数選択（controlled selection + カスタムクリック）
// ============================================================================

import { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  useStore as useReactFlowStore,
  useReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useTEMStore, useActiveSheet } from '../store/store';
import { BoxNode, type BoxNodeData } from './nodes/BoxNode';
import { SDSGNode, type SDSGNodeData } from './nodes/SDSGNode';
import { LineEdge } from './edges/LineEdge';
import { LEVEL_PX, MINOR_TICK_PX } from '../store/defaults';
import { computeTimeArrow } from '../utils/timeArrow';
import { LegendOverlay } from './LegendOverlay';
import { PeriodLabelsOverlay } from './PeriodLabelsOverlay';
import { renderVerticalAwareText } from '../utils/verticalText';
import { computeContentBounds } from '../utils/fitBounds';

const nodeTypes = { box: BoxNode, sdsg: SDSGNode };
const edgeTypes = { line: LineEdge };

const PAPER_SIZES: Record<string, { w: number; h: number }> = {
  'A4-landscape': { w: 1123, h: 794 },
  'A4-portrait':  { w: 794,  h: 1123 },
  'A3-landscape': { w: 1587, h: 1123 },
  'A3-portrait':  { w: 1123, h: 1587 },
  '16:9':         { w: 1280, h: 720 },
  '4:3':          { w: 1024, h: 768 },
};

export function Canvas({ onOpenLegendSettings }: { onOpenLegendSettings?: () => void }) {
  return (
    <ReactFlowProvider>
      <CanvasInner onOpenLegendSettings={onOpenLegendSettings} />
    </ReactFlowProvider>
  );
}

function CanvasInner({ onOpenLegendSettings }: { onOpenLegendSettings?: () => void }) {
  const sheet = useActiveSheet();
  const updateBox = useTEMStore((s) => s.updateBox);
  const addLine = useTEMStore((s) => s.addLine);
  const setSelection = useTEMStore((s) => s.setSelection);
  const storeBoxIds = useTEMStore((s) => s.selection.boxIds);
  const storeLineIds = useTEMStore((s) => s.selection.lineIds);
  const storeSdsgIds = useTEMStore((s) => s.selection.sdsgIds);
  const updateSDSG = useTEMStore((s) => s.updateSDSG);
  const canvasMode = useTEMStore((s) => s.view.canvasMode);
  const showGrid = useTEMStore((s) => s.view.showGrid);
  const showPaperGuides = useTEMStore((s) => s.view.showPaperGuides);
  const showTopRuler = useTEMStore((s) => s.view.showTopRuler);
  const showLeftRuler = useTEMStore((s) => s.view.showLeftRuler);
  const snapEnabled = useTEMStore((s) => s.view.snapEnabled);
  const gridPx = useTEMStore((s) => s.doc.settings.snap.gridPx);
  const layout = useTEMStore((s) => s.doc.settings.layout);
  const settings = useTEMStore((s) => s.doc.settings);
  const fitCounter = useTEMStore((s) => s.fitCounter);
  const fitMode = useTEMStore((s) => s.fitMode);

  const dragging = useRef(false);
  const rf = useReactFlow();
  const rfWidth = useReactFlowStore((s) => s.width);
  const rfHeight = useReactFlowStore((s) => s.height);

  // fit リクエストへの反応
  useEffect(() => {
    if (!fitMode || !sheet) return;
    const bounds = computeContentBounds(sheet, layout, settings);
    if (!bounds) return;
    const padding = 40;
    if (fitMode === 'all') {
      rf.fitBounds(
        { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
        { padding: 0.1 }
      );
    } else if (fitMode === 'width') {
      const zoom = Math.max(0.1, Math.min(5, (rfWidth - padding * 2) / bounds.width));
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      rf.setViewport({
        x: rfWidth / 2 - centerX * zoom,
        y: rfHeight / 2 - centerY * zoom,
        zoom,
      });
    } else if (fitMode === 'height') {
      const zoom = Math.max(0.1, Math.min(5, (rfHeight - padding * 2) / bounds.height));
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      rf.setViewport({
        x: rfWidth / 2 - centerX * zoom,
        y: rfHeight / 2 - centerY * zoom,
        zoom,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitCounter]);

  // Controlled selection via `selected` prop on nodes/edges
  const boxNodes: Node<BoxNodeData>[] = useMemo(() => {
    if (!sheet) return [];
    const selBoxIds = new Set(storeBoxIds);
    return sheet.boxes.map((b) => ({
      id: b.id,
      type: 'box',
      position: { x: b.x, y: b.y },
      selected: selBoxIds.has(b.id),
      data: {
        id: b.id,
        label: b.label,
        type: b.type,
        width: b.width,
        height: b.height,
        shape: b.shape,
        textOrientation: b.textOrientation,
        style: b.style,
        number: b.number,
        participantId: b.participantId,
        subLabel: b.subLabel,
        subLabelOffsetX: b.subLabelOffsetX,
        subLabelOffsetY: b.subLabelOffsetY,
        subLabelFontSize: b.subLabelFontSize,
        idOffsetX: b.idOffsetX,
        idOffsetY: b.idOffsetY,
        idFontSize: b.idFontSize,
        typeLabelFontSize: b.typeLabelFontSize,
        typeLabelBold: b.typeLabelBold,
        typeLabelItalic: b.typeLabelItalic,
        typeLabelFontFamily: b.typeLabelFontFamily,
        typeLabelAsciiUpright: b.typeLabelAsciiUpright,
        subLabelAsciiUpright: b.subLabelAsciiUpright,
        asciiUpright: b.asciiUpright,
        autoFitBoxMode: b.autoFitBoxMode,
      } as BoxNodeData,
      style: { width: b.width, height: b.height, zIndex: b.zIndex ?? 0 },
    }));
  }, [sheet, storeBoxIds]);

  // SDSG nodes - 位置は attachedTo Box/Line + offset から計算
  const sdsgNodes: Node<SDSGNodeData>[] = useMemo(() => {
    if (!sheet) return [];
    const selSdsgIds = new Set(storeSdsgIds);
    return sheet.sdsg.map((sg) => {
      let anchorX = 0;
      let anchorY = 0;
      // Box に attached ?
      const attachedBox = sheet.boxes.find((b) => b.id === sg.attachedTo);
      if (attachedBox) {
        anchorX = attachedBox.x + attachedBox.width / 2;
        anchorY = attachedBox.y + attachedBox.height / 2;
      } else {
        // Line に attached ?
        const attachedLine = sheet.lines.find((l) => l.id === sg.attachedTo);
        if (attachedLine) {
          const fromBox = sheet.boxes.find((b) => b.id === attachedLine.from);
          const toBox = sheet.boxes.find((b) => b.id === attachedLine.to);
          if (fromBox && toBox) {
            // 線の中点
            anchorX = (fromBox.x + fromBox.width / 2 + toBox.x + toBox.width / 2) / 2;
            anchorY = (fromBox.y + fromBox.height / 2 + toBox.y + toBox.height / 2) / 2;
          } else {
            return null;
          }
        } else {
          return null;
        }
      }
      const isH = layout === 'horizontal';
      const timeOff = sg.timeOffset ?? 0;
      const itemOff = sg.itemOffset ?? 0;
      const w = sg.width ?? 70;
      const h = sg.height ?? 40;
      // SDSG 左上座標 = anchor - (w/2, h/2) + offset
      const x = anchorX - w / 2 + (isH ? timeOff : itemOff);
      const y = anchorY - h / 2 + (isH ? itemOff : timeOff);
      return {
        id: sg.id,
        type: 'sdsg',
        position: { x, y },
        selected: selSdsgIds.has(sg.id),
        data: {
          id: sg.id,
          type: sg.type,
          label: sg.label,
          width: w,
          height: h,
          style: sg.style,
          subLabel: sg.subLabel,
          subLabelOffsetX: sg.subLabelOffsetX,
          subLabelOffsetY: sg.subLabelOffsetY,
          subLabelFontSize: sg.subLabelFontSize,
          subLabelAsciiUpright: sg.subLabelAsciiUpright,
          typeLabelFontSize: sg.typeLabelFontSize,
          typeLabelBold: sg.typeLabelBold,
          typeLabelItalic: sg.typeLabelItalic,
          typeLabelFontFamily: sg.typeLabelFontFamily,
          typeLabelAsciiUpright: sg.typeLabelAsciiUpright,
          asciiUpright: sg.asciiUpright,
        } as SDSGNodeData,
        style: { width: w, height: h, zIndex: sg.zIndex ?? 0 },
        draggable: true,
      };
    }).filter((n): n is NonNullable<typeof n> => n !== null);
  }, [sheet, storeSdsgIds, layout]);

  const nodes = useMemo(() => [...boxNodes, ...sdsgNodes], [boxNodes, sdsgNodes]);

  const edges: Edge[] = useMemo(() => {
    if (!sheet) return [];
    const selLineIds = new Set(storeLineIds);
    return sheet.lines.map((l) => {
      // 端点が潜在経験(annotation)や両極化等至点(P-EFP/P-2nd-EFP)に
      // 接続している場合、XLineでなくても点線化
      const fromBox = sheet.boxes.find((b) => b.id === l.from);
      const toBox = sheet.boxes.find((b) => b.id === l.to);
      const dashedEndpointTypes = ['annotation', 'P-EFP', 'P-2nd-EFP'];
      const connectsToDashedType =
        (fromBox && dashedEndpointTypes.includes(fromBox.type)) ||
        (toBox && dashedEndpointTypes.includes(toBox.type));
      const shouldDash = l.type === 'XLine' || connectsToDashedType;
      // curve は React Flow の default edge を利用、straight は custom edge (LineEdge) でマージン対応
      const useCustom = l.shape !== 'curve';
      return {
        id: l.id,
        source: l.from,
        target: l.to,
        selected: selLineIds.has(l.id),
        type: useCustom ? 'line' : 'default',
        data: useCustom
          ? {
              startMargin: l.startMargin ?? 0,
              endMargin: l.endMargin ?? 0,
              startOffsetTime: l.startOffsetTime ?? 0,
              endOffsetTime: l.endOffsetTime ?? 0,
              startOffsetItem: l.startOffsetItem ?? 0,
              endOffsetItem: l.endOffsetItem ?? 0,
            }
          : undefined,
        style: {
          stroke: l.style?.color ?? '#222',
          strokeWidth: l.style?.strokeWidth ?? 1.5,
          strokeDasharray: shouldDash ? '6 4' : undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: l.style?.color ?? '#222',
          width: 18,
          height: 18,
        },
        zIndex: l.zIndex,
      };
    });
  }, [sheet, storeLineIds]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (!sheet) return;
      const temporal = useTEMStore.temporal.getState();
      for (const ch of changes) {
        if (ch.type === 'position' && ch.position) {
          if (ch.dragging === true && !dragging.current) {
            dragging.current = true;
            temporal.pause();
          } else if (ch.dragging === false && dragging.current) {
            dragging.current = false;
            temporal.resume();
          }
          let x = ch.position.x;
          let y = ch.position.y;
          if (snapEnabled && ch.dragging === false) {
            x = Math.round(x / gridPx) * gridPx;
            y = Math.round(y / gridPx) * gridPx;
          }
          // SDSG node か Box node か判別
          const sdsgItem = sheet.sdsg.find((s) => s.id === ch.id);
          if (sdsgItem) {
            // anchor を再計算
            let anchorX = 0, anchorY = 0;
            const attachedBox = sheet.boxes.find((b) => b.id === sdsgItem.attachedTo);
            if (attachedBox) {
              anchorX = attachedBox.x + attachedBox.width / 2;
              anchorY = attachedBox.y + attachedBox.height / 2;
            } else {
              const attachedLine = sheet.lines.find((l) => l.id === sdsgItem.attachedTo);
              if (attachedLine) {
                const fromBox = sheet.boxes.find((b) => b.id === attachedLine.from);
                const toBox = sheet.boxes.find((b) => b.id === attachedLine.to);
                if (fromBox && toBox) {
                  anchorX = (fromBox.x + fromBox.width / 2 + toBox.x + toBox.width / 2) / 2;
                  anchorY = (fromBox.y + fromBox.height / 2 + toBox.y + toBox.height / 2) / 2;
                }
              }
            }
            const w = sdsgItem.width ?? 70;
            const h = sdsgItem.height ?? 40;
            const isH = layout === 'horizontal';
            // 新規左上座標 → offset へ逆算
            const dx = x + w / 2 - anchorX;
            const dy = y + h / 2 - anchorY;
            const timeOff = isH ? dx : dy;
            const itemOff = isH ? dy : dx;
            updateSDSG(ch.id, { timeOffset: timeOff, itemOffset: itemOff });
          } else {
            updateBox(ch.id, { x, y });
          }
        }
      }
    },
    [sheet, updateBox, updateSDSG, snapEnabled, gridPx, layout]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        addLine(connection.source, connection.target);
      }
    },
    [addLine]
  );

  // ---- Custom click handlers for Shift+multi-select ----
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      const { boxIds, sdsgIds } = useTEMStore.getState().selection;
      const isSDSG = node.type === 'sdsg';
      if (event.shiftKey) {
        event.stopPropagation();
        if (isSDSG) {
          const already = sdsgIds.includes(node.id);
          const nextSdsg = already ? sdsgIds.filter((id) => id !== node.id) : [...sdsgIds, node.id];
          setSelection(boxIds, [], nextSdsg);
        } else {
          const already = boxIds.includes(node.id);
          const next = already ? boxIds.filter((id) => id !== node.id) : [...boxIds, node.id];
          setSelection(next, [], sdsgIds);
        }
      } else {
        if (isSDSG) {
          setSelection([], [], [node.id]);
        } else {
          setSelection([node.id], [], []);
        }
      }
    },
    [setSelection]
  );

  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      const { lineIds } = useTEMStore.getState().selection;
      if (event.shiftKey) {
        event.stopPropagation();
        const already = lineIds.includes(edge.id);
        const next = already ? lineIds.filter((id) => id !== edge.id) : [...lineIds, edge.id];
        setSelection([], next);
      } else {
        setSelection([], [edge.id]);
      }
    },
    [setSelection]
  );

  const onPaneClick = useCallback(() => {
    setSelection([], []);
  }, [setSelection]);

  if (!sheet) {
    return <div style={{ padding: 20 }}>シートがありません</div>;
  }

  const isSelectMode = canvasMode === 'select';

  return (
    <div id="diagram-canvas" className="canvas-container">
      {showTopRuler && (
        <div className="canvas-rulers">
          <div className="ruler-corner">
            <span className="ruler-origin">0</span>
          </div>
          <TopRuler layout={layout} />
        </div>
      )}
      <div className="canvas-main">
        {showLeftRuler && <LeftRuler layout={layout} />}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            multiSelectionKeyCode={null}
            selectionKeyCode={null}
            deleteKeyCode={['Delete', 'Backspace']}
            panOnDrag={!isSelectMode}
            selectionOnDrag={isSelectMode}
            panOnScroll={false}
            zoomOnScroll={false}
            zoomOnPinch={true}
            snapToGrid={snapEnabled}
            snapGrid={[gridPx, gridPx]}
            fitView
            fitViewOptions={{ padding: 0.2 }}
          >
            {showGrid && <Background gap={MINOR_TICK_PX} variant={BackgroundVariant.Dots} />}
            {showPaperGuides && <PaperGuideOverlay />}
            <TimeArrowOverlay />
            <PeriodLabelsOverlay />
            <LegendOverlay onOpenSettings={onOpenLegendSettings} />
            <Controls />
          </ReactFlow>
          <CustomWheelHandler layout={layout} />
          <HorizontalScrollbar />
          <VerticalScrollbar />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Custom wheel: pan normally, zoom with Shift
// ============================================================================

function CustomWheelHandler({ layout }: { layout: 'horizontal' | 'vertical' }) {
  const rf = useReactFlow();

  useEffect(() => {
    const el = document.querySelector('#diagram-canvas .react-flow__pane') as HTMLElement | null;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const vp = rf.getViewport();
      // Use whichever delta the browser provided (Shift can turn deltaY into deltaX)
      const primaryDelta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;

      if (e.shiftKey) {
        // Zoom
        const factor = primaryDelta < 0 ? 1.08 : 1 / 1.08;
        const newZoom = Math.max(0.1, Math.min(5, vp.zoom * factor));
        rf.zoomTo(newZoom);
      } else {
        // Pan in layout direction
        const pan = primaryDelta * 0.6;
        if (layout === 'horizontal') {
          rf.setViewport({ x: vp.x - pan, y: vp.y, zoom: vp.zoom });
        } else {
          rf.setViewport({ x: vp.x, y: vp.y - pan, zoom: vp.zoom });
        }
      }
    };

    el.addEventListener('wheel', handler as EventListener, { passive: false });
    return () => el.removeEventListener('wheel', handler as EventListener);
  }, [rf, layout]);

  return null;
}

// ============================================================================
// Scrollbars (functional, synced to viewport)
// ============================================================================

// 仮想ワールドサイズ（スクロール範囲）
const WORLD_SIZE = 5000;  // -2500 to +2500

function HorizontalScrollbar() {
  const { getViewport, setViewport } = useReactFlow();
  const transform = useReactFlowStore((s) => s.transform);
  const width = useReactFlowStore((s) => s.width);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ mouseX: 0, vpX: 0 });

  const { panX, zoom } = { panX: transform[0], zoom: transform[2] };
  const worldWidth = WORLD_SIZE;
  const worldStart = -worldWidth / 2;
  // Screen position of world origin
  const visibleWorldStart = -panX / zoom;
  const visibleWorldSpan = width / zoom;
  const thumbLeft = ((visibleWorldStart - worldStart) / worldWidth) * 100;
  const thumbWidth = (visibleWorldSpan / worldWidth) * 100;

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const track = document.querySelector('.scrollbar-h') as HTMLElement | null;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const dx = e.clientX - startRef.current.mouseX;
      const trackWidthPx = rect.width;
      const worldPerPx = worldWidth / trackWidthPx;
      const newVpX = startRef.current.vpX - dx * worldPerPx * zoom;
      const vp = getViewport();
      setViewport({ x: newVpX, y: vp.y, zoom: vp.zoom });
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, zoom, getViewport, setViewport]);

  return (
    <div className="scrollbar-h">
      <div
        className="scrollbar-thumb"
        style={{ left: `${Math.max(0, Math.min(100 - thumbWidth, thumbLeft))}%`, width: `${Math.max(5, Math.min(100, thumbWidth))}%` }}
        onMouseDown={(e) => {
          e.preventDefault();
          startRef.current = { mouseX: e.clientX, vpX: panX };
          setDragging(true);
        }}
      />
    </div>
  );
}

function VerticalScrollbar() {
  const { getViewport, setViewport } = useReactFlow();
  const transform = useReactFlowStore((s) => s.transform);
  const height = useReactFlowStore((s) => s.height);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ mouseY: 0, vpY: 0 });

  const { panY, zoom } = { panY: transform[1], zoom: transform[2] };
  const worldHeight = WORLD_SIZE;
  const worldStart = -worldHeight / 2;
  const visibleWorldStart = -panY / zoom;
  const visibleWorldSpan = height / zoom;
  const thumbTop = ((visibleWorldStart - worldStart) / worldHeight) * 100;
  const thumbHeight = (visibleWorldSpan / worldHeight) * 100;

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const track = document.querySelector('.scrollbar-v') as HTMLElement | null;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const dy = e.clientY - startRef.current.mouseY;
      const trackHeightPx = rect.height;
      const worldPerPx = worldHeight / trackHeightPx;
      const newVpY = startRef.current.vpY - dy * worldPerPx * zoom;
      const vp = getViewport();
      setViewport({ x: vp.x, y: newVpY, zoom: vp.zoom });
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, zoom, getViewport, setViewport]);

  return (
    <div className="scrollbar-v">
      <div
        className="scrollbar-thumb"
        style={{ top: `${Math.max(0, Math.min(100 - thumbHeight, thumbTop))}%`, height: `${Math.max(5, Math.min(100, thumbHeight))}%` }}
        onMouseDown={(e) => {
          e.preventDefault();
          startRef.current = { mouseY: e.clientY, vpY: panY };
          setDragging(true);
        }}
      />
    </div>
  );
}

// ============================================================================
// TimeArrow Overlay - 非可逆的時間矢印をキャンバス上に描画
// ============================================================================

function TimeArrowOverlay() {
  const sheet = useActiveSheet();
  const layout = useTEMStore((s) => s.doc.settings.layout);
  const settings = useTEMStore((s) => s.doc.settings.timeArrow);
  const transform = useReactFlowStore((s) => s.transform);

  if (!sheet || !settings.alwaysVisible) return null;
  const arrow = computeTimeArrow(sheet, layout, settings);
  if (!arrow) return null;

  const [panX, panY, zoom] = transform;
  const sx = arrow.startX * zoom + panX;
  const sy = arrow.startY * zoom + panY;
  const ex = arrow.endX * zoom + panX;
  const ey = arrow.endY * zoom + panY;
  const lx = arrow.labelX * zoom + panX;
  const ly = arrow.labelY * zoom + panY;

  const isVert = layout === 'vertical';
  // labelSide に応じて translate を決定
  // 'top': 矢印より上 → y軸方向に自身の全高分引く (-100%)
  // 'bottom': 矢印より下 → y軸方向はオフセット済みなので 0%
  // 'left': 矢印より左 → x軸方向に自身の全幅分引く (-100%)
  // 'right': 矢印より右 → x軸方向は 0%
  let labelTransform: string;
  switch (arrow.labelSide) {
    case 'top':
      labelTransform = 'translate(-50%, -100%)';
      break;
    case 'bottom':
      labelTransform = 'translate(-50%, 0%)';
      break;
    case 'left':
      labelTransform = 'translate(-100%, -50%)';
      break;
    case 'right':
      labelTransform = 'translate(0%, -50%)';
      break;
    default:
      labelTransform = 'translate(-50%, -50%)';
  }
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1,
        overflow: 'visible',
      }}
    >
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          overflow: 'visible',
        }}
      >
        <defs>
          <marker id="time-arrow-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#222" />
          </marker>
        </defs>
        <line
          x1={sx}
          y1={sy}
          x2={ex}
          y2={ey}
          stroke="#222"
          strokeWidth={arrow.strokeWidth * zoom}
          markerEnd="url(#time-arrow-head)"
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: lx,
          top: ly,
          transform: labelTransform,
          fontSize: arrow.fontSize * zoom,
          color: '#222',
          fontFamily: settings.labelFontFamily ?? undefined,
          fontWeight: settings.labelBold ? 700 : 400,
          fontStyle: settings.labelItalic ? 'italic' : 'normal',
          textDecoration: settings.labelUnderline ? 'underline' : 'none',
          writingMode: isVert ? 'vertical-rl' : undefined,
          textOrientation: isVert ? 'upright' : undefined,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        {renderVerticalAwareText(arrow.label, isVert)}
      </div>
    </div>
  );
}

// ============================================================================
// Paper Guide
// ============================================================================

function PaperGuideOverlay() {
  const transform = useReactFlowStore((s) => s.transform);
  const [panX, panY, zoom] = transform;
  const size = PAPER_SIZES['A4-landscape'];
  return (
    <div
      className="paper-guide-overlay"
      style={{
        position: 'absolute',
        left: panX,
        top: panY,
        width: size.w * zoom,
        height: size.h * zoom,
        border: `2px dashed #ff6b6b`,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      <span style={{ position: 'absolute', top: -18, left: 0, fontSize: 10, color: '#ff6b6b', background: '#fff', padding: '0 4px', fontWeight: 600 }}>
        A4 横
      </span>
    </div>
  );
}

// ============================================================================
// Rulers
// ============================================================================

function useViewport() {
  const transform = useReactFlowStore((s) => s.transform);
  return { x: transform[0], y: transform[1], zoom: transform[2] };
}

function TopRuler({ layout }: { layout: 'horizontal' | 'vertical' }) {
  const viewport = useViewport();
  // 横型: 上ルーラー = Time軸(→+)、縦型: 上ルーラー = Item軸(→+)
  const axisLabel = layout === 'horizontal' ? 'Time →' : 'Item →';
  const { ticks, minorTicks } = useMemo(() => {
    const tickMajor: { level: number; x: number }[] = [];
    const tickMinor: number[] = [];
    const viewWidth = 3000;
    const minLevel = Math.floor((-viewport.x) / (LEVEL_PX * viewport.zoom)) - 5;
    const maxLevel = minLevel + Math.ceil(viewWidth / (LEVEL_PX * viewport.zoom)) + 10;
    for (let level = minLevel; level <= maxLevel; level++) {
      const screenX = level * LEVEL_PX * viewport.zoom + viewport.x;
      tickMajor.push({ level, x: screenX });
      for (let i = 1; i <= 9; i++) {
        tickMinor.push(level * LEVEL_PX * viewport.zoom + viewport.x + i * MINOR_TICK_PX * viewport.zoom);
      }
    }
    return { ticks: tickMajor, minorTicks: tickMinor };
  }, [viewport]);

  return (
    <div className="ruler-horizontal">
      <span className="ruler-axis-label">{axisLabel}</span>
      {minorTicks.map((x, i) => (
        <div key={`m${i}`} className="ruler-tick-h-minor" style={{ left: x }} />
      ))}
      {ticks.map((t) => (
        <div key={t.level} className={`ruler-tick-h ${t.level === 0 ? 'origin' : ''}`} style={{ left: t.x }}>
          <span>{t.level}</span>
        </div>
      ))}
    </div>
  );
}

function LeftRuler({ layout }: { layout: 'horizontal' | 'vertical' }) {
  const viewport = useViewport();
  // 横型: 左ルーラー = Item軸（上ほど+）→ y 値を反転して表示
  // 縦型: 左ルーラー = Time軸（下ほど+）→ y 値そのまま
  const isHorizontal = layout === 'horizontal';
  const axisLabel = isHorizontal ? 'Item ↑+' : 'Time ↓+';
  const { ticks, minorTicks } = useMemo(() => {
    const tickMajor: { level: number; y: number }[] = [];
    const tickMinor: number[] = [];
    const viewHeight = 2000;
    const minLevel = Math.floor((-viewport.y) / (LEVEL_PX * viewport.zoom)) - 5;
    const maxLevel = minLevel + Math.ceil(viewHeight / (LEVEL_PX * viewport.zoom)) + 10;
    for (let level = minLevel; level <= maxLevel; level++) {
      const screenY = level * LEVEL_PX * viewport.zoom + viewport.y;
      // 横型 Item 軸は y 反転: 画面y=+100 は Item_Level=-1
      const displayLevel = isHorizontal ? -level : level;
      tickMajor.push({ level: displayLevel, y: screenY });
      for (let i = 1; i <= 9; i++) {
        tickMinor.push(level * LEVEL_PX * viewport.zoom + viewport.y + i * MINOR_TICK_PX * viewport.zoom);
      }
    }
    return { ticks: tickMajor, minorTicks: tickMinor };
  }, [viewport, isHorizontal]);

  return (
    <div className="ruler-vertical">
      <span className="ruler-axis-label vertical">{axisLabel}</span>
      {minorTicks.map((y, i) => (
        <div key={`m${i}`} className="ruler-tick-v-minor" style={{ top: y }} />
      ))}
      {ticks.map((t, i) => (
        <div key={i} className={`ruler-tick-v ${t.level === 0 ? 'origin' : ''}`} style={{ top: t.y }}>
          <span>{t.level}</span>
        </div>
      ))}
    </div>
  );
}
