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
import { MINOR_TICK_PX } from '../store/defaults';

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
  style?: React.CSSProperties;
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
  style,
}: ExportPreviewCanvasProps) {
  const sheet = doc.sheets.find((s) => s.id === doc.activeSheetId) ?? doc.sheets[0] ?? null;

  const ctxValue: TEMViewContextValue = useMemo(() => ({
    sheet,
    settings: doc.settings,
    view: {
      zoom: 1, panX: 0, panY: 0,
      showGrid,
      showPaperGuides: showPaperGuide,
      showLegend: true,
      showComments: false,
      showBoxIds: false,            // プレビューではID非表示（ノイズ低減）
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
  }), [sheet, doc.settings, showGrid, showPaperGuide]);

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
        subLabelAsciiUpright: b.subLabelAsciiUpright,
        asciiUpright: b.asciiUpright,
        autoFitBoxMode: 'none',  // プレビュー中は自動拡張・自動文字調整を停止
        autoFitText: false,
      },
      style: { width: b.width, height: b.height, zIndex: b.zIndex ?? 0 },
    }));

    // band / between モードも考慮した SDSG レンダリング（Canvas.tsx と同じ計算を使用）
    const bandLayout = computeSDSGBandLayout(sheet, doc.settings.layout, doc.settings);
    const bandEntries: Record<'top' | 'bottom', Array<{ id: string; timeStart: number; timeEnd: number }>> = { top: [], bottom: [] };
    sheet.sdsg.forEach((sg) => {
      const bk = sdsgBandKey(sg);
      if (!bk) return;
      let timeStart: number, timeEnd: number;
      if (sg.anchorMode === 'between' && sg.attachedTo2) {
        const a = sheet.boxes.find((b) => b.id === sg.attachedTo);
        const b = sheet.boxes.find((bx) => bx.id === sg.attachedTo2);
        if (!a || !b) return;
        const mode = sg.betweenMode ?? 'edge-to-edge';
        const aT = isH ? a.x : a.y;
        const bT = isH ? b.x : b.y;
        const aSize = isH ? a.width : a.height;
        const bSize = isH ? b.width : b.height;
        const left = aT <= bT ? { t: aT, sz: aSize } : { t: bT, sz: bSize };
        const right = aT <= bT ? { t: bT, sz: bSize } : { t: aT, sz: aSize };
        if (mode === 'edge-to-edge') { timeStart = left.t + left.sz; timeEnd = right.t; }
        else { timeStart = left.t + left.sz / 2; timeEnd = right.t + right.sz / 2; }
      } else {
        const attached = sheet.boxes.find((b) => b.id === sg.attachedTo);
        if (!attached) return;
        const centerT = isH ? attached.x + attached.width / 2 : attached.y + attached.height / 2;
        const w0 = sg.spaceWidth ?? sg.width ?? 70;
        timeStart = centerT - w0 / 2;
        timeEnd = centerT + w0 / 2;
      }
      bandEntries[bk].push({ id: sg.id, timeStart, timeEnd });
    });
    const topRows = doc.settings.sdsgSpace?.autoArrange
      ? computeBandRowAssignments(bandEntries.top)
      : new Map<string, number>();
    const bottomRows = doc.settings.sdsgSpace?.autoArrange
      ? computeBandRowAssignments(bandEntries.bottom)
      : new Map<string, number>();
    const topTotal = Math.max(1, ...Array.from(topRows.values()).map((v) => v + 1));
    const bottomTotal = Math.max(1, ...Array.from(bottomRows.values()).map((v) => v + 1));

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
          const pos = computeSDSGBandPosition(band, doc.settings.layout, timeAnchor, timeWidth, rowIdx, totalRows, sg, bk);
          x = pos.x; y = pos.y; w = pos.width; h = pos.height;
          const autoFlip = doc.settings.sdsgSpace?.autoFlipDirectionInBand ?? false;
          flipDirection = autoFlip && (
            (bk === 'top' && sg.type === 'SG') ||
            (bk === 'bottom' && sg.type === 'SD')
          );
        } else { return null as unknown as Node<SDSGNodeData>; }
      } else if (sg.anchorMode === 'between' && sg.attachedTo2) {
        // between モード
        const boxA = sheet.boxes.find((b) => b.id === sg.attachedTo);
        const boxB = sheet.boxes.find((b) => b.id === sg.attachedTo2);
        if (!boxA || !boxB) return null as unknown as Node<SDSGNodeData>;
        const mode = sg.betweenMode ?? 'edge-to-edge';
        let startPos: number, endPos: number;
        if (isH) {
          const leftBox = boxA.x <= boxB.x ? boxA : boxB;
          const rightBox = boxA.x <= boxB.x ? boxB : boxA;
          if (mode === 'edge-to-edge') { startPos = leftBox.x + leftBox.width; endPos = rightBox.x; }
          else { startPos = leftBox.x + leftBox.width / 2; endPos = rightBox.x + rightBox.width / 2; }
        } else {
          const topBox = boxA.y <= boxB.y ? boxA : boxB;
          const botBox = boxA.y <= boxB.y ? boxB : boxA;
          if (mode === 'edge-to-edge') { startPos = topBox.y + topBox.height; endPos = botBox.y; }
          else { startPos = topBox.y + topBox.height / 2; endPos = botBox.y + botBox.height / 2; }
        }
        const timeCenter = (startPos + endPos) / 2;
        const timeSpan = Math.max(10, Math.abs(endPos - startPos));
        const itemA = isH ? boxA.y + boxA.height / 2 : boxA.x + boxA.width / 2;
        const itemB = isH ? boxB.y + boxB.height / 2 : boxB.x + boxB.width / 2;
        const itemCenter = (itemA + itemB) / 2;
        w = isH ? timeSpan : (sg.width ?? 70);
        h = isH ? (sg.height ?? 40) : timeSpan;
        const anchorX = isH ? timeCenter : itemCenter;
        const anchorY = isH ? itemCenter : timeCenter;
        x = anchorX - w / 2 + (isH ? (sg.timeOffset ?? 0) : (sg.itemOffset ?? 0));
        y = anchorY - h / 2 + (isH ? (sg.itemOffset ?? 0) : (sg.timeOffset ?? 0));
      } else {
        // single モード（既存）
        const attached = sheet.boxes.find((b) => b.id === sg.attachedTo);
        let anchorX = 0, anchorY = 0;
        if (attached) {
          anchorX = attached.x + attached.width / 2;
          anchorY = attached.y + attached.height / 2;
        } else {
          const line = sheet.lines.find((l) => l.id === sg.attachedTo);
          if (line) {
            const fb = sheet.boxes.find((b) => b.id === line.from);
            const tb = sheet.boxes.find((b) => b.id === line.to);
            if (fb && tb) {
              anchorX = (fb.x + fb.width / 2 + tb.x + tb.width / 2) / 2;
              anchorY = (fb.y + fb.height / 2 + tb.y + tb.height / 2) / 2;
            }
          }
        }
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
          flipDirection,
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
      const useCustom = l.shape !== 'curve';
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

  // 親サイズと用紙比率から、収まる最大の内側サイズを計算
  const paperAspect = paper.width / paper.height;
  const containerAspect = outerSize.w / Math.max(1, outerSize.h);
  let innerW: number;
  let innerH: number;
  if (containerAspect > paperAspect) {
    // 親が用紙より横長 → 高さ基準で揃える
    innerH = outerSize.h;
    innerW = innerH * paperAspect;
  } else {
    innerW = outerSize.w;
    innerH = innerW / paperAspect;
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
            panOnDrag={true}
            zoomOnScroll={true}
            zoomOnPinch={true}
            panOnScroll={false}
            preventScrolling={true}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            selectionOnDrag={false}
            proOptions={{ hideAttribution: true }}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            minZoom={0.05}
            maxZoom={10}
          >
            {showGrid && <Background gap={MINOR_TICK_PX} variant={BackgroundVariant.Dots} />}
            <PaperExtentHelper width={paper.width} height={paper.height} />
            <TimeArrowOverlay />
            <PeriodLabelsOverlay />
            <LegendOverlay />
          </ReactFlow>
        </div>
        </div>
      </div>
    </TEMViewContext.Provider>
  );
}

// 用紙領域にぴったりフィットさせる
function PaperExtentHelper({ width, height }: { width: number; height: number }) {
  const rf = useReactFlow();
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        rf.fitBounds({ x: 0, y: 0, width, height }, { padding: 0 });
      } catch {
        // ignore
      }
    }, 30);
    return () => clearTimeout(t);
  }, [rf, width, height]);
  return null;
}

// 用紙枠の描画はコンテナ自身が担うため、別途の PreviewPaperGuide は不要（削除）
