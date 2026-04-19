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
  useStore as useReactFlowStore,
  type Edge,
  type Node,
} from 'reactflow';
import type { TEMDocument } from '../types';
import { BoxNode, type BoxNodeData } from './nodes/BoxNode';
import { SDSGNode, type SDSGNodeData } from './nodes/SDSGNode';
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
        autoFitBoxMode: 'none',  // プレビュー中は自動拡張を停止
      },
      style: { width: b.width, height: b.height, zIndex: b.zIndex ?? 0 },
    }));

    const sdsgNodes: Node<SDSGNodeData>[] = sheet.sdsg.map((sg) => {
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
      const w = sg.width ?? 70;
      const h = sg.height ?? 40;
      const to = sg.timeOffset ?? 0;
      const io = sg.itemOffset ?? 0;
      const x = anchorX - w / 2 + (isH ? to : io);
      const y = anchorY - h / 2 + (isH ? io : to);
      return {
        id: sg.id, type: 'sdsg',
        position: { x, y },
        draggable: false, selectable: false,
        data: {
          id: sg.id, type: sg.type, label: sg.label,
          width: w, height: h, style: sg.style,
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
    });

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
  }, [sheet, doc.settings.layout]);

  // 用紙枠サイズ
  const paper = getPaperPx(paperSize, customPaperWidth, customPaperHeight);

  return (
    <TEMViewContext.Provider value={ctxValue}>
      <div
        id={elementId}
        style={{
          background: background === 'white' ? '#ffffff' : 'transparent',
          position: 'relative',
          ...style,
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
          panOnScroll={true}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          selectionOnDrag={false}
          proOptions={{ hideAttribution: true }}
          fitView
          fitViewOptions={{ padding: 0.1 }}
          minZoom={0.1}
          maxZoom={5}
        >
          {showGrid && <Background gap={MINOR_TICK_PX} variant={BackgroundVariant.Dots} />}
          {showPaperGuide && <PreviewPaperGuide width={paper.width} height={paper.height} />}
          <TimeArrowOverlay />
          <PeriodLabelsOverlay />
          <LegendOverlay />
        </ReactFlow>
      </div>
    </TEMViewContext.Provider>
  );
}

// プレビュー用の用紙枠（world 座標 0,0 を起点、zoom/pan 追従）
function PreviewPaperGuide({ width, height }: { width: number; height: number }) {
  const transform = useReactFlowStore((s) => s.transform);
  const [panX, panY, zoom] = transform;
  return (
    <div
      className="paper-guide-overlay"
      style={{
        position: 'absolute',
        left: panX,
        top: panY,
        width: width * zoom,
        height: height * zoom,
        border: '2px dashed #ff6b6b',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      <span style={{ position: 'absolute', top: -18, left: 0, fontSize: 10, color: '#ff6b6b', background: '#fff', padding: '0 4px', fontWeight: 600 }}>
        用紙枠
      </span>
    </div>
  );
}
