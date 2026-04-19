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
import { useEffect } from 'react';
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
        autoFitBoxMode: 'none',  // プレビュー中は自動拡張・自動文字調整を停止
        autoFitText: false,
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
  const aspectRatio = `${paper.width} / ${paper.height}`;

  // 用紙境界フィット: React Flow の fitBounds を使って用紙領域 (0,0)..(paper.width, paper.height)
  // を表示範囲にぴったり合わせる。これによりコンテナ = 用紙枠になる。
  void showPaperGuide; // 外部から表示指定されるが、コンテナ自体が用紙なので内部描画は不要

  return (
    <TEMViewContext.Provider value={ctxValue}>
      {/* 外側: グレー背景、内側の用紙枠を中央配置 */}
      <div
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
            aspectRatio,
            maxWidth: '100%',
            maxHeight: '100%',
            width: 'auto',
            height: 'auto',
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
            panOnScroll={true}
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
