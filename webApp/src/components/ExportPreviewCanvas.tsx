// ============================================================================
// ExportPreviewCanvas - 変換後 doc を描画するプレビュー用キャンバス
// - TEMViewContext.Provider で変換後データを注入
// - 既存の BoxNode / SDSGNode / LineEdge / 各オーバーレイを再利用
// - React Flow の zoom/pan は有効、ユーザ操作ドラッグ等は抑止
// ============================================================================

import { useMemo } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  MarkerType,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from 'reactflow';
import { useEffect, useRef, useState } from 'react';
import type { TEMDocument } from '../types';
import { BoxNode, type BoxNodeData } from './nodes/BoxNode';
import { SDSGNode, type SDSGNodeData } from './nodes/SDSGNode';
import {
  computeSDSGBandLayout,
  sdsgBandKey,
  computeBandRowAssignments,
  computeSDSGBandPosition,
} from '../utils/sdsgSpaceLayout';
import { LineEdge } from './edges/LineEdge';
import { LegendOverlay } from './LegendOverlay';
import { PeriodLabelsOverlay } from './PeriodLabelsOverlay';
import { TimeArrowOverlay } from './Canvas';
import { TEMViewContext, type TEMViewContextValue } from '../context/TEMViewContext';
import { getPaperPx, type PaperSizeKey } from '../utils/paperSizes';
import { resolveAttachedAnchor, anchorCenter } from '../utils/sdsgAttach';
import { resolveBetweenEndpoint } from '../utils/sdsgBetween';
import { MINOR_TICK_PX } from '../store/defaults';
import type { PageBounds } from '../utils/pageSplit';
import { useStore as useReactFlowStore } from 'reactflow';

const nodeTypes = { box: BoxNode, sdsg: SDSGNode };
const edgeTypes = { line: LineEdge };

export interface ExportPreviewCanvasProps {
  doc: TEMDocument;         // 変換後 doc
  elementId?: string;       // DOM の id。出力時のキャプチャ対象
  paperSize: PaperSizeKey;  // 用紙枠を表示
  customPaperWidth?: number;
  customPaperHeight?: number;
  showPaperGuide?: boolean;
  showGrid?: boolean;
  background?: 'white' | 'transparent';
  /** ページ分割情報（未指定時は単一ページ） */
  pageBounds?: PageBounds[];
  /** プレビュー時にハイライトするページ index（未指定時は全ページ均等表示） */
  highlightPageIndex?: number;
  /**
   * ユーザがプレビュー内でパン/ズームした際のコールバック。
   * panDeltaWorldX/Y: world 座標単位の平行移動量（Box 等に加算する想定）
   * zoomRatio:       viewport zoom の倍率変化
   */
  onPanZoomChange?: (delta: { panDeltaWorldX: number; panDeltaWorldY: number; zoomRatio: number }) => void;
  style?: React.CSSProperties;
  /** エクスポート時に ID バッジを含めるか（プレビューでも表示） */
  includeIds?: { box: boolean; sdsg: boolean; line: boolean };
}

export function ExportPreviewCanvas(props: ExportPreviewCanvasProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}

function Inner({
  doc,
  elementId,
  paperSize,
  customPaperWidth,
  customPaperHeight,
  showPaperGuide = true,
  showGrid = false,
  background = 'white',
  pageBounds,
  highlightPageIndex,
  onPanZoomChange,
  style,
  includeIds,
}: ExportPreviewCanvasProps) {
  const sheet = doc.sheets.find((s) => s.id === doc.activeSheetId) ?? doc.sheets[0] ?? null;

  // パン/ズーム同期用: PaperExtentHelper が fit 完了後の viewport をここに保存
  const fitViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const rfInstanceRef = useRef<ReturnType<typeof useReactFlow> | null>(null);

  const ctxValue: TEMViewContextValue = useMemo(() => ({
    sheet,
    settings: doc.settings,
    view: {
      zoom: 1, panX: 0, panY: 0,
      showGrid,
      showPaperGuides: showPaperGuide,
      showLegend: true,
      showComments: false,
      showBoxIds: !!includeIds?.box,
      showSDSGIds: !!includeIds?.sdsg,
      showLineIds: !!includeIds?.line,
      showTopRuler: false,
      showLeftRuler: false,
      dataSheetVisible: false,
      propertyPanelVisible: false,
      snapEnabled: false,
      commentMode: false,
      canvasMode: 'move',
      dataSheetWidth: 0,
      propertyPanelWidth: 0,
    },
    // プレビューではアクションは no-op
    updateBox: () => {},
    updateSDSG: () => {},
    updateLine: () => {},
    isPreview: true,
    editLocked: true,
  }), [sheet, doc.settings, showGrid, showPaperGuide, includeIds?.box, includeIds?.sdsg, includeIds?.line]);

  // nodes/edges を自前で組み立て
  const { nodes, edges } = useMemo(() => {
    if (!sheet) return { nodes: [] as Node[], edges: [] as Edge[] };
    const isH = doc.settings.layout === 'horizontal';
    const boxNodes: Node<BoxNodeData>[] = sheet.boxes.map((b) => ({
      id: b.id,
      type: 'box',
      position: { x: b.x, y: b.y },
      draggable: false,
      selectable: false,
      data: {
        id: b.id, label: b.label, type: b.type,
        width: b.width, height: b.height,
        shape: b.shape, textOrientation: b.textOrientation,
        style: b.style, number: b.number, participantId: b.participantId,
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
        typeLabelColor: b.typeLabelColor,
        typeLabelBackgroundColor: b.typeLabelBackgroundColor,
        typeLabelBorderColor: b.typeLabelBorderColor,
        typeLabelBorderWidth: b.typeLabelBorderWidth,
        subLabelAsciiUpright: b.subLabelAsciiUpright,
        subLabelColor: b.subLabelColor,
        subLabelBackgroundColor: b.subLabelBackgroundColor,
        subLabelBorderColor: b.subLabelBorderColor,
        subLabelBorderWidth: b.subLabelBorderWidth,
        asciiUpright: b.asciiUpright,
        autoFitBoxMode: 'none',  // プレビュー中は自動拡張・自動文字調整を停止
        autoFitText: false,
      },
      style: { width: b.width, height: b.height, zIndex: b.zIndex ?? 0 },
    }));

    // band / between モードも考慮した SDSG レンダリング（Canvas.tsx と同じ計算を使用）
    const boxById = new Map(sheet.boxes.map((b) => [b.id, b]));
    const lineById = new Map(sheet.lines.map((l) => [l.id, l]));
    const bandEntries: Record<'top' | 'bottom', Array<{ id: string; timeStart: number; timeEnd: number; rowOverride?: number }>> = { top: [], bottom: [] };
    sheet.sdsg.forEach((sg) => {
      const bk = sdsgBandKey(sg);
      if (!bk) return;
      let timeStart: number, timeEnd: number;
      if (sg.anchorMode === 'between' && sg.attachedTo2) {
        const ep1 = resolveBetweenEndpoint(sg.attachedTo, boxById, lineById, isH);
        const ep2 = resolveBetweenEndpoint(sg.attachedTo2, boxById, lineById, isH);
        if (!ep1 || !ep2) return;
        const mode = sg.betweenMode ?? 'edge-to-edge';
        const left = ep1.timeStart <= ep2.timeStart ? ep1 : ep2;
        const right = ep1.timeStart <= ep2.timeStart ? ep2 : ep1;
        if (mode === 'edge-to-edge') { timeStart = left.timeStart; timeEnd = right.timeStart + right.timeSize; }
        else { timeStart = left.timeStart + left.timeSize / 2; timeEnd = right.timeStart + right.timeSize / 2; }
      } else {
        const attached = boxById.get(sg.attachedTo);
        if (!attached) return;
        const centerT = isH ? attached.x + attached.width / 2 : attached.y + attached.height / 2;
        const w0 = sg.spaceWidth ?? sg.width ?? 70;
        timeStart = centerT - w0 / 2;
        timeEnd = centerT + w0 / 2;
      }
      bandEntries[bk].push({ id: sg.id, timeStart, timeEnd, rowOverride: sg.spaceRowOverride });
    });
    // 帯の高さ算出には autoArrange に関わらず row 数を反映する（縦重ねに帯背景を合わせる）。
    const topRowsAll = computeBandRowAssignments(bandEntries.top);
    const bottomRowsAll = computeBandRowAssignments(bandEntries.bottom);
    const topRows = doc.settings.sdsgSpace?.autoArrange ? topRowsAll : new Map<string, number>();
    const bottomRows = doc.settings.sdsgSpace?.autoArrange ? bottomRowsAll : new Map<string, number>();
    const topTotal = Math.max(1, ...Array.from(topRowsAll.values()).map((v) => v + 1));
    const bottomTotal = Math.max(1, ...Array.from(bottomRowsAll.values()).map((v) => v + 1));
    const bandLayout = computeSDSGBandLayout(sheet, doc.settings.layout, doc.settings, {
      top: topTotal, bottom: bottomTotal,
    });

    const sdsgNodes: Node<SDSGNodeData>[] = sheet.sdsg.map((sg) => {
      let x: number, y: number, w: number, h: number;

      // band モード（機能 OFF なら single モードで描画）
      const bk = sdsgBandKey(sg);
      const bandEnabled = doc.settings.sdsgSpace?.enabled;
      const band = bandEnabled && (bk === 'top' ? bandLayout.topBand : bk === 'bottom' ? bandLayout.bottomBand : undefined);
      let flipDirection = false;
      if (bk && band) {
        const entry = bandEntries[bk].find((e) => e.id === sg.id);
        if (entry) {
          const rowMap = bk === 'top' ? topRows : bottomRows;
          const totalRows = bk === 'top' ? topTotal : bottomTotal;
          const rowIdx = rowMap.get(sg.id) ?? 0;
          const timeAnchor = (entry.timeStart + entry.timeEnd) / 2;
          const timeWidth = Math.max(10, entry.timeEnd - entry.timeStart);
          const bandSettings = bk === 'top' ? doc.settings.sdsgSpace?.bands.top : doc.settings.sdsgSpace?.bands.bottom;
          const pos = computeSDSGBandPosition(band, doc.settings.layout, timeAnchor, timeWidth, rowIdx, totalRows, sg, bk,
            { shrinkToFitRow: bandSettings?.shrinkToFitRow !== false });
          x = pos.x; y = pos.y; w = pos.width; h = pos.height;
          const autoFlip = doc.settings.sdsgSpace?.autoFlipDirectionInBand ?? false;
          flipDirection = autoFlip && (
            (bk === 'top' && sg.type === 'SG') ||
            (bk === 'bottom' && sg.type === 'SD')
          );
        } else { return null as unknown as Node<SDSGNodeData>; }
      } else if (sg.anchorMode === 'between' && sg.attachedTo2) {
        // between モード（Box / Line 混在対応）
        const ep1 = resolveBetweenEndpoint(sg.attachedTo, boxById, lineById, isH);
        const ep2 = resolveBetweenEndpoint(sg.attachedTo2, boxById, lineById, isH);
        if (!ep1 || !ep2) return null as unknown as Node<SDSGNodeData>;
        const mode = sg.betweenMode ?? 'edge-to-edge';
        const left = ep1.timeStart <= ep2.timeStart ? ep1 : ep2;
        const right = ep1.timeStart <= ep2.timeStart ? ep2 : ep1;
        let startPos: number, endPos: number;
        if (mode === 'edge-to-edge') {
          startPos = left.timeStart;
          endPos = right.timeStart + right.timeSize;
        } else {
          startPos = left.timeStart + left.timeSize / 2;
          endPos = right.timeStart + right.timeSize / 2;
        }
        const timeCenter = (startPos + endPos) / 2;
        const timeSpan = Math.max(10, Math.abs(endPos - startPos));
        const itemCenter = (ep1.itemCenter + ep2.itemCenter) / 2;
        w = isH ? timeSpan : (sg.width ?? 70);
        h = isH ? (sg.height ?? 40) : timeSpan;
        const anchorX = isH ? timeCenter : itemCenter;
        const anchorY = isH ? itemCenter : timeCenter;
        x = anchorX - w / 2 + (isH ? (sg.timeOffset ?? 0) : (sg.itemOffset ?? 0));
        y = anchorY - h / 2 + (isH ? (sg.itemOffset ?? 0) : (sg.timeOffset ?? 0));
      } else {
        // single モード（既存）
        const anchor = resolveAttachedAnchor(sg, boxById, lineById);
        const { x: anchorX, y: anchorY } = anchor ? anchorCenter(anchor) : { x: 0, y: 0 };
        w = sg.width ?? 70;
        h = sg.height ?? 40;
        const to = sg.timeOffset ?? 0;
        const io = sg.itemOffset ?? 0;
        x = anchorX - w / 2 + (isH ? to : io);
        y = anchorY - h / 2 + (isH ? io : to);
      }

      return {
        id: sg.id, type: 'sdsg',
        position: { x, y },
        draggable: false, selectable: false,
        data: {
          id: sg.id, type: sg.type, label: sg.label,
          width: w, height: h, style: sg.style, rectRatio: sg.rectRatio,
          labelArea: sg.labelArea, labelOffsetX: sg.labelOffsetX, labelOffsetY: sg.labelOffsetY,
          flipDirection,
          subLabel: sg.subLabel,
          subLabelOffsetX: sg.subLabelOffsetX,
          subLabelOffsetY: sg.subLabelOffsetY,
          subLabelFontSize: sg.subLabelFontSize,
          subLabelAsciiUpright: sg.subLabelAsciiUpright,
          subLabelColor: sg.subLabelColor,
          subLabelBackgroundColor: sg.subLabelBackgroundColor,
          subLabelBorderColor: sg.subLabelBorderColor,
          subLabelBorderWidth: sg.subLabelBorderWidth,
          typeLabelFontSize: sg.typeLabelFontSize,
          typeLabelBold: sg.typeLabelBold,
          typeLabelItalic: sg.typeLabelItalic,
          typeLabelFontFamily: sg.typeLabelFontFamily,
          typeLabelAsciiUpright: sg.typeLabelAsciiUpright,
          typeLabelColor: sg.typeLabelColor,
          typeLabelBackgroundColor: sg.typeLabelBackgroundColor,
          typeLabelBorderColor: sg.typeLabelBorderColor,
          typeLabelBorderWidth: sg.typeLabelBorderWidth,
          asciiUpright: sg.asciiUpright,
          idOffsetX: sg.idOffsetX,
          idOffsetY: sg.idOffsetY,
          idFontSize: sg.idFontSize,
        },
        style: { width: w, height: h, zIndex: sg.zIndex ?? 0 },
      };
    }).filter((n): n is Node<SDSGNodeData> => n !== null);

    const dashedEndpointTypes = ['annotation', 'P-EFP', 'P-2nd-EFP'];
    const edges: Edge[] = sheet.lines.map((l) => {
      const fromBox = sheet.boxes.find((b) => b.id === l.from);
      const toBox = sheet.boxes.find((b) => b.id === l.to);
      const dashed = l.type === 'XLine'
        || (fromBox && dashedEndpointTypes.includes(fromBox.type))
        || (toBox && dashedEndpointTypes.includes(toBox.type));
      const useCustom = true;
      return {
        id: l.id,
        source: l.from,
        target: l.to,
        type: useCustom ? 'line' : 'default',
        data: useCustom ? {
          startMargin: l.startMargin ?? 0,
          endMargin: l.endMargin ?? 0,
          startOffsetTime: l.startOffsetTime ?? 0,
          endOffsetTime: l.endOffsetTime ?? 0,
          startOffsetItem: l.startOffsetItem ?? 0,
          endOffsetItem: l.endOffsetItem ?? 0,
          angleMode: !!l.angleMode,
          angleDeg: l.angleDeg ?? 0,
          shape: l.shape,
          elbowBendRatio: l.elbowBendRatio,
          curveIntensity: l.curveIntensity,
          controlPoints: l.controlPoints,
          connectionMode: l.connectionMode,
          fromBoxId: l.from,
          toBoxId: l.to,
          idOffsetX: l.idOffsetX,
          idOffsetY: l.idOffsetY,
          idFontSize: l.idFontSize,
        } : undefined,
        style: {
          stroke: l.style?.color ?? '#222',
          strokeWidth: l.style?.strokeWidth ?? 1.5,
          strokeDasharray: dashed ? '6 4' : undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: l.style?.color ?? '#222',
          width: 18, height: 18,
        },
        zIndex: l.zIndex,
      };
    });

    return { nodes: [...boxNodes, ...sdsgNodes], edges };
  }, [sheet, doc.settings]);

  // 用紙枠サイズ
  const paper = getPaperPx(paperSize, customPaperWidth, customPaperHeight);
  void showPaperGuide;

  // ストリップ全体のサイズ（pageBounds から算出）
  const isH = doc.settings.layout === 'horizontal';
  const stripBounds = (() => {
    if (pageBounds && pageBounds.length > 0) {
      const xs = pageBounds.flatMap((p) => [p.innerX, p.innerX + p.innerWidth]);
      const ys = pageBounds.flatMap((p) => [p.innerY, p.innerY + p.innerHeight]);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      const w = Math.max(...xs) - x;
      const h = Math.max(...ys) - y;
      return { x, y, width: w, height: h };
    }
    return {
      x: isH ? 0 : -paper.width / 2,
      y: isH ? -paper.height / 2 : 0,
      width: paper.width,
      height: paper.height,
    };
  })();
  const stripOriginX = stripBounds.x;
  const stripOriginY = stripBounds.y;
  const stripWidth = stripBounds.width;
  const stripHeight = stripBounds.height;

  // 親要素のサイズを ResizeObserver で測定、aspectRatio に合わせた内側サイズを計算
  const outerRef = useRef<HTMLDivElement>(null);
  const [outerSize, setOuterSize] = useState<{ w: number; h: number }>({ w: 400, h: 300 });

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = () => {
      const pad = 24; // padding 分の余白
      const r = el.getBoundingClientRect();
      setOuterSize({
        w: Math.max(50, r.width - pad),
        h: Math.max(50, r.height - pad),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 親サイズとストリップ比率から、収まる最大の内側サイズを計算
  const stripAspect = stripWidth / stripHeight;
  const containerAspect = outerSize.w / Math.max(1, outerSize.h);
  let innerW: number;
  let innerH: number;
  if (containerAspect > stripAspect) {
    // 親が用紙より横長 → 高さ基準で揃える
    innerH = outerSize.h;
    innerW = innerH * stripAspect;
  } else {
    innerW = outerSize.w;
    innerH = innerW / stripAspect;
  }

  return (
    <TEMViewContext.Provider value={ctxValue}>
      {/* 外側: グレー背景、内側の用紙枠を中央配置 */}
      <div
        ref={outerRef}
        style={{
          background: '#dddddd',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 12,
          boxSizing: 'border-box',
          overflow: 'hidden',
          ...style,
        }}
      >
        {/* 用紙枠のラッパー（枠・影はここに、キャプチャ対象外） */}
        <div
          style={{
            width: innerW,
            height: innerH,
            border: '1px solid #999',
            boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
            position: 'relative',
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
        >
        {/* 用紙そのもの（キャプチャ対象、枠/影なし） */}
        <div
          id={elementId}
          style={{
            width: '100%',
            height: '100%',
            background: background === 'white' ? '#ffffff' : 'transparent',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            panOnDrag={!!onPanZoomChange}
            zoomOnScroll={!!onPanZoomChange}
            zoomOnPinch={!!onPanZoomChange}
            panOnScroll={false}
            zoomOnDoubleClick={false}
            preventScrolling={true}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            selectionOnDrag={false}
            proOptions={{ hideAttribution: true }}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            minZoom={0.05}
            maxZoom={10}
            onMoveEnd={onPanZoomChange ? (event, viewport) => {
              // event が null のときは programmatic (rf.fitBounds / rf.setViewport 等) なのでスキップ
              if (!event) return;
              const base = fitViewportRef.current;
              if (!base) return;
              const dx = viewport.x - base.x;
              const dy = viewport.y - base.y;
              const zoomRatio = viewport.zoom / base.zoom;
              const movedEnough = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
              const zoomedEnough = Math.abs(zoomRatio - 1) > 0.001;
              if (!movedEnough && !zoomedEnough) return;
              // CSS px → world px 変換はストリップ fit 時の zoom を使う
              const panDeltaWorldX = dx / base.zoom;
              const panDeltaWorldY = dy / base.zoom;
              onPanZoomChange({
                panDeltaWorldX,
                panDeltaWorldY,
                zoomRatio,
              });
              // viewport を fit 状態に戻す（変更は props の再注入でコンテンツ座標に反映される）
              const rf0 = rfInstanceRef.current;
              if (rf0) {
                setTimeout(() => { try { rf0.setViewport(base); } catch { /* ignore */ } }, 0);
              }
            } : undefined}
          >
            {showGrid && <Background gap={MINOR_TICK_PX} variant={BackgroundVariant.Dots} />}
            <PaperExtentHelper
              x={stripOriginX}
              y={stripOriginY}
              width={stripWidth}
              height={stripHeight}
              onAfterFit={(viewport, rfInstance) => {
                fitViewportRef.current = viewport;
                rfInstanceRef.current = rfInstance;
              }}
            />
            <TimeArrowOverlay />
            <PeriodLabelsOverlay />
            <LegendOverlay />
            {/* ページ分割のガイド線（キャプチャから除外するため `page-split-overlay` クラスを付与） */}
            {pageBounds && pageBounds.length > 1 && (
              <PageSplitOverlay
                pages={pageBounds}
                highlightIndex={highlightPageIndex}
                layout={doc.settings.layout}
              />
            )}
          </ReactFlow>
        </div>
        </div>
      </div>
    </TEMViewContext.Provider>
  );
}

// 用紙ストリップ領域にぴったりフィットさせる。fit 完了後の viewport を onAfterFit に渡す。
function PaperExtentHelper({
  x, y, width, height, onAfterFit,
}: {
  x: number; y: number; width: number; height: number;
  onAfterFit?: (viewport: { x: number; y: number; zoom: number }, rf: ReturnType<typeof useReactFlow>) => void;
}) {
  const rf = useReactFlow();
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        rf.fitBounds({ x, y, width, height }, { padding: 0 });
        // fit 後の viewport を取得して上層へ返す
        setTimeout(() => {
          try {
            const v = rf.getViewport();
            onAfterFit?.(v, rf);
          } catch { /* ignore */ }
        }, 20);
      } catch {
        // ignore
      }
    }, 30);
    return () => clearTimeout(t);
  }, [rf, x, y, width, height, onAfterFit]);
  return null;
}

// ページ分割の境界線・非アクティブページマスクオーバーレイ
// - DOM 位置は ReactFlow の transform (zoom/pan) に追従
// - class 'page-split-overlay' をキャプチャ除外フィルタ対象にする
function PageSplitOverlay({
  pages,
  highlightIndex,
  layout,
}: {
  pages: PageBounds[];
  highlightIndex?: number;
  layout: 'horizontal' | 'vertical';
}) {
  const transform = useReactFlowStore((s) => s.transform);
  const [panX, panY, zoom] = transform;
  const isH = layout === 'horizontal';

  const elements: React.ReactNode[] = [];

  // 各ページ境界線（inner の境界を描画）
  for (let i = 1; i < pages.length; i++) {
    const prev = pages[i - 1];
    if (isH) {
      const splitX = (prev.innerX + prev.innerWidth) * zoom + panX;
      const topY = prev.innerY * zoom + panY;
      const h = prev.innerHeight * zoom;
      elements.push(
        <div
          key={`split-${i}`}
          style={{
            position: 'absolute',
            left: splitX,
            top: topY,
            width: 0,
            height: h,
            borderLeft: '1.5px dashed #ff6b6b',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        />,
      );
    } else {
      const splitY = (prev.innerY + prev.innerHeight) * zoom + panY;
      const leftX = prev.innerX * zoom + panX;
      const w = prev.innerWidth * zoom;
      elements.push(
        <div
          key={`split-${i}`}
          style={{
            position: 'absolute',
            left: leftX,
            top: splitY,
            width: w,
            height: 0,
            borderTop: '1.5px dashed #ff6b6b',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        />,
      );
    }
  }

  // 非アクティブページのマスク（highlightIndex 指定時のみ）
  if (highlightIndex != null) {
    pages.forEach((p, i) => {
      if (i === highlightIndex) return;
      const x = p.innerX * zoom + panX;
      const y = p.innerY * zoom + panY;
      const w = p.innerWidth * zoom;
      const h = p.innerHeight * zoom;
      elements.push(
        <div
          key={`mask-${i}`}
          style={{
            position: 'absolute',
            left: x,
            top: y,
            width: w,
            height: h,
            background: 'rgba(0,0,0,0.18)',
            pointerEvents: 'none',
            zIndex: 9,
          }}
        />,
      );
    });
  }

  return (
    <div
      className="page-split-overlay"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {elements}
    </div>
  );
}

// 用紙枠の描画はコンテナ自身が担うため、別途の PreviewPaperGuide は不要（削除）
