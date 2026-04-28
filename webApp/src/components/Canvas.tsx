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
import { computeSDSGDisplay } from '../utils/typeDisplay';
import {
  computeSDSGBandLayout,
  sdsgBandKey,
  computeBandRowAssignments,
  computeSDSGBandPosition,
} from '../utils/sdsgSpaceLayout';
import { resolveAttachedAnchor, anchorCenter } from '../utils/sdsgAttach';
import { resolveBetweenEndpoint } from '../utils/sdsgBetween';
import { useTEMView } from '../context/TEMViewContext';

const nodeTypes = { box: BoxNode, sdsg: SDSGNode };
const edgeTypes = { line: LineEdge };

// 短辺×長辺（layout に応じて向きを決める）
const PAPER_BASE_SIZES: Record<string, { short: number; long: number }> = {
  'A4':    { short: 794,  long: 1123 },
  'A3':    { short: 1123, long: 1587 },
  '16:9':  { short: 720,  long: 1280 },
  '4:3':   { short: 768,  long: 1024 },
};

// 旧 size キーから baseKey を推定（互換用）
function legacySizeToBaseKey(size: string): 'A4' | 'A3' | '16:9' | '4:3' | 'custom' {
  if (size.startsWith('A4')) return 'A4';
  if (size.startsWith('A3')) return 'A3';
  if (size === '16:9') return '16:9';
  if (size === '4:3') return '4:3';
  return 'custom';
}

export function Canvas({
  onOpenLegendSettings,
  onOpenTimeArrowSettings,
  onOpenPeriodSettings,
}: {
  onOpenLegendSettings?: () => void;
  onOpenTimeArrowSettings?: () => void;
  onOpenPeriodSettings?: () => void;
}) {
  return (
    <ReactFlowProvider>
      <CanvasInner
        onOpenLegendSettings={onOpenLegendSettings}
        onOpenTimeArrowSettings={onOpenTimeArrowSettings}
        onOpenPeriodSettings={onOpenPeriodSettings}
      />
    </ReactFlowProvider>
  );
}

function CanvasInner({
  onOpenLegendSettings,
  onOpenTimeArrowSettings,
  onOpenPeriodSettings,
}: {
  onOpenLegendSettings?: () => void;
  onOpenTimeArrowSettings?: () => void;
  onOpenPeriodSettings?: () => void;
}) {
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
  // 整列ガイド（world 座標）
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  // band モード SDSG をドラッグ中のプレビュー情報 (row 境界表示用)
  const [bandDragInfo, setBandDragInfo] = useState<{ sdsgId: string; bandKey: 'top' | 'bottom' } | null>(null);
  const rf = useReactFlow();
  const rfWidth = useReactFlowStore((s) => s.width);
  const rfHeight = useReactFlowStore((s) => s.height);

  // レイアウト切替時: Item_Level=0 / Time_Level=0 の原点を画面中央に
  const prevLayoutRef = useRef(layout);
  useEffect(() => {
    if (prevLayoutRef.current !== layout) {
      prevLayoutRef.current = layout;
      // 次のフレームで setCenter（React Flow の準備完了後）
      requestAnimationFrame(() => {
        try {
          rf.setCenter(0, 0, { zoom: rf.getViewport().zoom });
        } catch {
          // ignore
        }
      });
    }
  }, [layout, rf]);

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
        autoFitBoxMode: b.autoFitBoxMode,
      } as BoxNodeData,
      style: { width: b.width, height: b.height, zIndex: b.zIndex ?? 0 },
    }));
  }, [sheet, storeBoxIds]);

  // SDSG nodes - 位置は attachedTo Box/Line + offset から計算（between モード時は 2 Box の間）
  const sdsgNodes: Node<SDSGNodeData>[] = useMemo(() => {
    if (!sheet) return [];
    const selSdsgIds = new Set(storeSdsgIds);
    const isH = layout === 'horizontal';
    const boxById = new Map(sheet.boxes.map((b) => [b.id, b]));
    const lineById = new Map(sheet.lines.map((l) => [l.id, l]));

    // --- band モードの事前計算: 帯の位置 + row 割り当て ---
    // 1st pass: row 割り当てだけ先に行うため、仮の band layout を計算
    const bandSdsgsByBand: Record<'top' | 'bottom', Array<{ id: string; timeStart: number; timeEnd: number; rowOverride?: number; ref: typeof sheet.sdsg[number] }>> = {
      top: [], bottom: [],
    };
    sheet.sdsg.forEach((sg) => {
      const bk = sdsgBandKey(sg);
      if (!bk) return;
      // Time 軸方向の占有範囲を計算（between 時は 2 アイテム間、single 時は Box 1 つの中心 ± w/2）
      let timeStart: number;
      let timeEnd: number;
      if (sg.anchorMode === 'between' && sg.attachedTo2) {
        const ep1 = resolveBetweenEndpoint(sg.attachedTo, boxById, lineById, isH);
        const ep2 = resolveBetweenEndpoint(sg.attachedTo2, boxById, lineById, isH);
        if (!ep1 || !ep2) return;
        const mode = sg.betweenMode ?? 'edge-to-edge';
        const left = ep1.timeStart <= ep2.timeStart ? ep1 : ep2;
        const right = ep1.timeStart <= ep2.timeStart ? ep2 : ep1;
        if (mode === 'edge-to-edge') {
          // Time レベル最小アイテムの外辺（手前側）から最大アイテムの外辺（奥側）まで覆う
          timeStart = left.timeStart;
          timeEnd = right.timeStart + right.timeSize;
        } else {
          timeStart = left.timeStart + left.timeSize / 2;
          timeEnd = right.timeStart + right.timeSize / 2;
        }
      } else {
        const attached = boxById.get(sg.attachedTo);
        if (!attached) return;
        const centerT = isH ? attached.x + attached.width / 2 : attached.y + attached.height / 2;
        // time 軸方向のサイズ: 横型 = spaceWidth / 縦型 = spaceHeight
        const timeAxisSize = isH
          ? (sg.spaceWidth ?? sg.width ?? 70)
          : (sg.spaceHeight ?? sg.height ?? 40);
        timeStart = centerT - timeAxisSize / 2;
        timeEnd = centerT + timeAxisSize / 2;
      }
      bandSdsgsByBand[bk].push({ id: sg.id, timeStart, timeEnd, rowOverride: sg.spaceRowOverride, ref: sg });
    });
    // 帯の高さ算出には autoArrange に関わらず row 数を反映する（縦重ねに帯背景を合わせる）。
    // 個別 SDSG の row 配置は autoArrange の設定を尊重する。
    const topRowsAll = computeBandRowAssignments(bandSdsgsByBand.top);
    const bottomRowsAll = computeBandRowAssignments(bandSdsgsByBand.bottom);
    const topRowAssignments = settings.sdsgSpace?.autoArrange
      ? topRowsAll
      : new Map<string, number>();
    const bottomRowAssignments = settings.sdsgSpace?.autoArrange
      ? bottomRowsAll
      : new Map<string, number>();
    const topTotalRows = Math.max(1, ...Array.from(topRowsAll.values()).map((v) => v + 1));
    const bottomTotalRows = Math.max(1, ...Array.from(bottomRowsAll.values()).map((v) => v + 1));
    // 2nd pass: row 数を渡して band layout 確定（autoExpandHeight 反映）
    const bandLayout = computeSDSGBandLayout(sheet, layout, settings, {
      top: topTotalRows, bottom: bottomTotalRows,
    });

    return sheet.sdsg.map((sg) => {
      const timeOff = sg.timeOffset ?? 0;
      const itemOff = sg.itemOffset ?? 0;

      // --- band モード: 帯内に配置 ---
      // band 機能 OFF / 帯 OFF の場合は single モードで描画（#3: 警告は PropertyPanel 側）
      const bk = sdsgBandKey(sg);
      const bandEnabled = settings.sdsgSpace?.enabled && bk && (bk === 'top' ? bandLayout.topBand : bandLayout.bottomBand);
      if (bandEnabled) {
        const band = bk === 'top' ? bandLayout.topBand! : bandLayout.bottomBand!;
        const entry = bandSdsgsByBand[bk!].find((e) => e.id === sg.id);
        if (entry) {
          const rowMap = bk === 'top' ? topRowAssignments : bottomRowAssignments;
          const totalRows = bk === 'top' ? topTotalRows : bottomTotalRows;
          const rowIdx = rowMap.get(sg.id) ?? 0;
          const timeAnchor = (entry.timeStart + entry.timeEnd) / 2;
          const timeWidth = Math.max(10, entry.timeEnd - entry.timeStart);
          const bandSettings = bk === 'top' ? settings.sdsgSpace?.bands.top : settings.sdsgSpace?.bands.bottom;
          const pos = computeSDSGBandPosition(
            band, layout, timeAnchor, timeWidth, rowIdx, totalRows, sg, bk!,
            { shrinkToFitRow: bandSettings?.shrinkToFitRow !== false },
          );
          // 方向点自動反転: band 位置と種別のミスマッチ時に反転
          const autoFlip = settings.sdsgSpace?.autoFlipDirectionInBand ?? false;
          const shouldFlip = autoFlip && (
            (bk === 'top' && sg.type === 'SG') ||
            (bk === 'bottom' && sg.type === 'SD')
          );
          return {
            id: sg.id,
            type: 'sdsg' as const,
            position: { x: pos.x, y: pos.y },
            selected: selSdsgIds.has(sg.id),
            data: {
              id: sg.id, type: sg.type, label: sg.label,
              width: pos.width, height: pos.height,
              spaceMode: sg.spaceMode,
              style: sg.style, rectRatio: sg.rectRatio,
              labelArea: sg.labelArea, labelOffsetX: sg.labelOffsetX, labelOffsetY: sg.labelOffsetY,
              flipDirection: shouldFlip,
              outOfRange: pos.outOfRange,
              subLabel: sg.subLabel, subLabelOffsetX: sg.subLabelOffsetX,
              subLabelOffsetY: sg.subLabelOffsetY, subLabelFontSize: sg.subLabelFontSize,
              subLabelAsciiUpright: sg.subLabelAsciiUpright,
              typeLabelFontSize: sg.typeLabelFontSize, typeLabelBold: sg.typeLabelBold,
              typeLabelItalic: sg.typeLabelItalic, typeLabelFontFamily: sg.typeLabelFontFamily,
              typeLabelAsciiUpright: sg.typeLabelAsciiUpright,
              typeLabelColor: sg.typeLabelColor,
              typeLabelBackgroundColor: sg.typeLabelBackgroundColor,
              typeLabelBorderColor: sg.typeLabelBorderColor,
              typeLabelBorderWidth: sg.typeLabelBorderWidth,
              subLabelColor: sg.subLabelColor,
              subLabelBackgroundColor: sg.subLabelBackgroundColor,
              subLabelBorderColor: sg.subLabelBorderColor,
              subLabelBorderWidth: sg.subLabelBorderWidth,
              typeLabelText: computeSDSGDisplay(sheet.sdsg, sg, sheet.boxes, layout),
              asciiUpright: sg.asciiUpright,
              idOffsetX: sg.idOffsetX,
              idOffsetY: sg.idOffsetY,
              idFontSize: sg.idFontSize,
            } as SDSGNodeData,
            style: { width: pos.width, height: pos.height, zIndex: sg.zIndex ?? 0 },
            draggable: true,
          };
        }
      }

      // between モード: Box / Line 混在の 2 端点間に配置
      if (sg.anchorMode === 'between' && sg.attachedTo2) {
        const ep1 = resolveBetweenEndpoint(sg.attachedTo, boxById, lineById, isH);
        const ep2 = resolveBetweenEndpoint(sg.attachedTo2, boxById, lineById, isH);
        if (!ep1 || !ep2) return null;
        const betweenMode = sg.betweenMode ?? 'edge-to-edge';
        const left = ep1.timeStart <= ep2.timeStart ? ep1 : ep2;
        const right = ep1.timeStart <= ep2.timeStart ? ep2 : ep1;
        let startPos: number;
        let endPos: number;
        if (betweenMode === 'edge-to-edge') {
          // Time 軸両端を覆う: 手前端 ～ 奥端
          startPos = left.timeStart;
          endPos = right.timeStart + right.timeSize;
        } else {
          // center-to-center
          startPos = left.timeStart + left.timeSize / 2;
          endPos = right.timeStart + right.timeSize / 2;
        }
        const timeCenter = (startPos + endPos) / 2;
        const timeSpan = Math.max(10, Math.abs(endPos - startPos));
        // Item 軸のアンカー = 2 端点の Item 中心の平均
        const itemCenter = (ep1.itemCenter + ep2.itemCenter) / 2;
        // SDSG サイズ: Time 軸方向は 2 Box 間の距離、Item 軸方向は sg.height/width
        const w = isH ? timeSpan : (sg.width ?? 70);
        const h = isH ? (sg.height ?? 40) : timeSpan;
        const anchorX = isH ? timeCenter : itemCenter;
        const anchorY = isH ? itemCenter : timeCenter;
        const x = anchorX - w / 2 + (isH ? timeOff : itemOff);
        const y = anchorY - h / 2 + (isH ? itemOff : timeOff);
        return {
          id: sg.id,
          type: 'sdsg' as const,
          position: { x, y },
          selected: selSdsgIds.has(sg.id),
          data: {
            id: sg.id, type: sg.type, label: sg.label, width: w, height: h,
            spaceMode: sg.spaceMode,
            style: sg.style, rectRatio: sg.rectRatio,
              labelArea: sg.labelArea, labelOffsetX: sg.labelOffsetX, labelOffsetY: sg.labelOffsetY,
            subLabel: sg.subLabel, subLabelOffsetX: sg.subLabelOffsetX,
            subLabelOffsetY: sg.subLabelOffsetY, subLabelFontSize: sg.subLabelFontSize,
            subLabelAsciiUpright: sg.subLabelAsciiUpright,
            typeLabelFontSize: sg.typeLabelFontSize, typeLabelBold: sg.typeLabelBold,
            typeLabelItalic: sg.typeLabelItalic, typeLabelFontFamily: sg.typeLabelFontFamily,
            typeLabelAsciiUpright: sg.typeLabelAsciiUpright,
            typeLabelColor: sg.typeLabelColor,
            typeLabelBackgroundColor: sg.typeLabelBackgroundColor,
            typeLabelBorderColor: sg.typeLabelBorderColor,
            typeLabelBorderWidth: sg.typeLabelBorderWidth,
            subLabelColor: sg.subLabelColor,
            subLabelBackgroundColor: sg.subLabelBackgroundColor,
            subLabelBorderColor: sg.subLabelBorderColor,
            subLabelBorderWidth: sg.subLabelBorderWidth,
            typeLabelText: computeSDSGDisplay(sheet.sdsg, sg, sheet.boxes, layout),
            asciiUpright: sg.asciiUpright,
          } as SDSGNodeData,
          style: { width: w, height: h, zIndex: sg.zIndex ?? 0 },
          draggable: true,
        };
      }

      // single モード（既定）: 既存ロジック
      const anchor = resolveAttachedAnchor(sg, boxById, lineById);
      if (!anchor) return null;
      const { x: anchorX, y: anchorY } = anchorCenter(anchor);
      const w = sg.width ?? 70;
      const h = sg.height ?? 40;
      const x = anchorX - w / 2 + (isH ? timeOff : itemOff);
      const y = anchorY - h / 2 + (isH ? itemOff : timeOff);
      return {
        id: sg.id,
        type: 'sdsg' as const,
        position: { x, y },
        selected: selSdsgIds.has(sg.id),
        data: {
          id: sg.id, type: sg.type, label: sg.label, width: w, height: h,
          spaceMode: sg.spaceMode,
          style: sg.style, rectRatio: sg.rectRatio,
              labelArea: sg.labelArea, labelOffsetX: sg.labelOffsetX, labelOffsetY: sg.labelOffsetY,
          subLabel: sg.subLabel, subLabelOffsetX: sg.subLabelOffsetX,
          subLabelOffsetY: sg.subLabelOffsetY, subLabelFontSize: sg.subLabelFontSize,
          subLabelAsciiUpright: sg.subLabelAsciiUpright,
          typeLabelFontSize: sg.typeLabelFontSize, typeLabelBold: sg.typeLabelBold,
          typeLabelItalic: sg.typeLabelItalic, typeLabelFontFamily: sg.typeLabelFontFamily,
          typeLabelAsciiUpright: sg.typeLabelAsciiUpright,
          typeLabelColor: sg.typeLabelColor,
          typeLabelBackgroundColor: sg.typeLabelBackgroundColor,
          typeLabelBorderColor: sg.typeLabelBorderColor,
          typeLabelBorderWidth: sg.typeLabelBorderWidth,
          subLabelColor: sg.subLabelColor,
          subLabelBackgroundColor: sg.subLabelBackgroundColor,
          subLabelBorderColor: sg.subLabelBorderColor,
          subLabelBorderWidth: sg.subLabelBorderWidth,
          asciiUpright: sg.asciiUpright,
        } as SDSGNodeData,
        style: { width: w, height: h, zIndex: sg.zIndex ?? 0 },
        draggable: true,
      };
    }).filter((n): n is NonNullable<typeof n> => n !== null);
  }, [sheet, storeSdsgIds, layout, settings]);

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
      // 全形状 (straight / elbow / curve) を LineEdge で自前描画
      const useCustom = true;
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
            setGuides({ v: [], h: [] });
          }
          // スマートガイド: Box / SDSG ドラッグ中（現在 SDSG は size を w/h or pos.width/height 経由で取得）
          if (ch.dragging === true) {
            const box = sheet.boxes.find((b) => b.id === ch.id);
            const sdsgDragged = sheet.sdsg.find((s) => s.id === ch.id);
            if (box || sdsgDragged) {
              const THRESHOLD = 5;
              const nx = ch.position.x;
              const ny = ch.position.y;
              const w = box ? box.width : (sdsgDragged!.spaceMode && sdsgDragged!.spaceMode !== 'attached'
                ? (sdsgDragged!.spaceWidth ?? sdsgDragged!.width ?? 70)
                : (sdsgDragged!.width ?? 70));
              const h = box ? box.height : (sdsgDragged!.spaceMode && sdsgDragged!.spaceMode !== 'attached'
                ? (sdsgDragged!.spaceHeight ?? sdsgDragged!.height ?? 40)
                : (sdsgDragged!.height ?? 40));
              const my = {
                left: nx,
                right: nx + w,
                centerX: nx + w / 2,
                top: ny,
                bottom: ny + h,
                centerY: ny + h / 2,
              };
              const vLines: number[] = [];
              const hLines: number[] = [];
              // 他の Box / SDSG の辺・中心と揃うかチェック
              sheet.boxes.forEach((o) => {
                if (o.id === ch.id) return;
                const oth = {
                  left: o.x,
                  right: o.x + o.width,
                  centerX: o.x + o.width / 2,
                  top: o.y,
                  bottom: o.y + o.height,
                  centerY: o.y + o.height / 2,
                };
                (['left', 'right', 'centerX'] as const).forEach((k) => {
                  (['left', 'right', 'centerX'] as const).forEach((ok) => {
                    if (Math.abs(my[k] - oth[ok]) < THRESHOLD) vLines.push(oth[ok]);
                  });
                });
                (['top', 'bottom', 'centerY'] as const).forEach((k) => {
                  (['top', 'bottom', 'centerY'] as const).forEach((ok) => {
                    if (Math.abs(my[k] - oth[ok]) < THRESHOLD) hLines.push(oth[ok]);
                  });
                });
              });
              // 重複排除
              const vUnique = Array.from(new Set(vLines));
              const hUnique = Array.from(new Set(hLines));
              setGuides({ v: vUnique, h: hUnique });
            }
          }
          let x = ch.position.x;
          let y = ch.position.y;
          if (snapEnabled && ch.dragging === false) {
            x = Math.round(x / gridPx) * gridPx;
            y = Math.round(y / gridPx) * gridPx;
          }
          // SDSG のドラッグは sub-pixel 抑制のため 0.5px 刻みに丸め
          const sdsgItem = sheet.sdsg.find((s) => s.id === ch.id);
          if (sdsgItem) {
            x = Math.round(x * 2) / 2;
            y = Math.round(y * 2) / 2;
          }
          if (sdsgItem) {
            const isH = layout === 'horizontal';
            const bandModeActive = settings.sdsgSpace?.enabled &&
              (sdsgItem.spaceMode === 'band-top' || sdsgItem.spaceMode === 'band-bottom');

            // --- band モード時のドラッグ: spaceInsetItem / spaceInsetTime に反映 ---
            if (bandModeActive) {
              const bk = sdsgItem.spaceMode === 'band-top' ? 'top' : 'bottom';
              const bandLayout = computeSDSGBandLayout(sheet, layout, settings);
              const band = bk === 'top' ? bandLayout.topBand : bandLayout.bottomBand;
              if (band) {
                // 現在の描画位置を再計算（auto-arrange の row を考慮）
                // まず Time anchor（attached Box center）
                const attached = sheet.boxes.find((b) => b.id === sdsgItem.attachedTo);
                if (!attached) { return; }
                const anchorTime = isH ? attached.x + attached.width / 2 : attached.y + attached.height / 2;
                // row 割り当てを再計算（現在の描画と同じ）
                const bandEntries = sheet.sdsg
                  .filter((s) => sdsgBandKey(s) === bk)
                  .map((s) => {
                    const a = sheet.boxes.find((b) => b.id === s.attachedTo);
                    const centerT = a ? (isH ? a.x + a.width / 2 : a.y + a.height / 2) : 0;
                    const taxSize = isH
                      ? (s.spaceWidth ?? s.width ?? 70)
                      : (s.spaceHeight ?? s.height ?? 40);
                    return {
                      id: s.id,
                      timeStart: centerT - taxSize / 2,
                      timeEnd: centerT + taxSize / 2,
                      rowOverride: s.spaceRowOverride,
                    };
                  });
                const rowMap = settings.sdsgSpace?.autoArrange
                  ? computeBandRowAssignments(bandEntries) : new Map<string, number>();
                const totalRows = Math.max(1, ...Array.from(rowMap.values()).map((v) => v + 1));
                const rowIdx = rowMap.get(sdsgItem.id) ?? 0;
                const rowSpan = totalRows > 0 ? band.axisSpan / totalRows : band.axisSpan;
                // computeSDSGBandPosition と同じ: band.start (box-side inner edge) アンカー
                const dir = Math.sign(band.end - band.start) || (bk === 'top' ? -1 : 1);
                const itemAxisSize = isH
                  ? (sdsgItem.spaceHeight ?? sdsgItem.height ?? 40)
                  : (sdsgItem.spaceWidth ?? sdsgItem.width ?? 70);
                const rowCenter = band.start + dir * (rowIdx * rowSpan + itemAxisSize / 2);
                // ドラッグ後の中心座標
                const w = sdsgItem.spaceWidth ?? sdsgItem.width ?? 70;
                const h = sdsgItem.spaceHeight ?? sdsgItem.height ?? 40;
                const newCenterX = x + w / 2;
                const newCenterY = y + h / 2;
                // isH: Time=X, Item=Y / !isH: Time=Y, Item=X
                const newItemAxis = isH ? newCenterY : newCenterX;
                const newTimeAxis = isH ? newCenterX : newCenterY;
                const insetItem = newItemAxis - rowCenter;
                const insetTime = newTimeAxis - anchorTime;
                updateSDSG(ch.id, {
                  spaceInsetItem: insetItem,
                  spaceInsetTime: insetTime,
                });
                return;
              }
            }

            // --- attached / between モード: 従来通り offset 逆算 ---
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
    [sheet, updateBox, updateSDSG, snapEnabled, gridPx, layout, settings]
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
    setGuides({ v: [], h: [] });
  }, [setSelection]);

  // 選択が解除されたらガイドも消す
  useEffect(() => {
    if (storeBoxIds.length === 0 && storeLineIds.length === 0 && storeSdsgIds.length === 0) {
      setGuides({ v: [], h: [] });
    }
  }, [storeBoxIds, storeLineIds, storeSdsgIds]);

  if (!sheet) {
    return <div style={{ padding: 20 }}>シートがありません</div>;
  }

  const isSelectMode = canvasMode === 'select';
  const isPointerMode = canvasMode === 'pointer';
  const isMoveMode = canvasMode === 'move';

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
            onNodeDragStart={(_e, node) => {
              const sg = sheet?.sdsg.find((s) => s.id === node.id);
              if (sg && (sg.spaceMode === 'band-top' || sg.spaceMode === 'band-bottom')) {
                setBandDragInfo({ sdsgId: sg.id, bandKey: sg.spaceMode === 'band-top' ? 'top' : 'bottom' });
              }
            }}
            onNodeDragStop={() => setBandDragInfo(null)}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            multiSelectionKeyCode={null}
            selectionKeyCode={null}
            deleteKeyCode={['Delete', 'Backspace']}
            panOnDrag={!isSelectMode && !isPointerMode}
            selectionOnDrag={isSelectMode}
            nodesDraggable={!isMoveMode}
            nodesConnectable={!isMoveMode}
            panOnScroll={false}
            zoomOnScroll={false}
            zoomOnPinch={true}
            snapToGrid={snapEnabled}
            snapGrid={[gridPx, gridPx]}
            fitView
            fitViewOptions={{ padding: 0.2 }}
          >
            {showGrid && <Background gap={Math.max(MINOR_TICK_PX, gridPx)} variant={BackgroundVariant.Dots} />}
            {showPaperGuides && <PaperGuideOverlay />}
            <TimeArrowOverlay onOpenSettings={onOpenTimeArrowSettings} />
            <PeriodLabelsOverlay onOpenSettings={onOpenPeriodSettings} />
            <LegendOverlay onOpenSettings={onOpenLegendSettings} />
            <SDSGBandOverlay dragInfo={bandDragInfo} />
            <SmartGuidesOverlay guides={guides} />
            <CustomControls />
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

// ============================================================================
// SmartGuidesOverlay - ドラッグ中の Box を他 Box と揃えるためのガイド線
// ============================================================================

function SmartGuidesOverlay({ guides }: { guides: { v: number[]; h: number[] } }) {
  const transform = useReactFlowStore((s) => s.transform);
  const [panX, panY, zoom] = transform;
  if (guides.v.length === 0 && guides.h.length === 0) return null;
  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 10,
        overflow: 'visible',
      }}
    >
      {guides.v.map((x, i) => {
        const sx = x * zoom + panX;
        return (
          <line
            key={`v${i}`}
            x1={sx}
            y1={0}
            x2={sx}
            y2={9999}
            stroke="#ff6b9d"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        );
      })}
      {guides.h.map((y, i) => {
        const sy = y * zoom + panY;
        return (
          <line
            key={`h${i}`}
            x1={-9999}
            y1={sy}
            x2={9999}
            y2={sy}
            stroke="#ff6b9d"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        );
      })}
    </svg>
  );
}

export function TimeArrowOverlay({ onOpenSettings }: { onOpenSettings?: () => void } = {}) {
  const view = useTEMView();
  const sheet = view.sheet;
  const layout = view.settings.layout;
  const settings = view.settings.timeArrow;
  const sdsgSpace = view.settings.sdsgSpace;
  const transform = useReactFlowStore((s) => s.transform);

  if (!sheet || !settings.alwaysVisible) return null;
  const arrow = computeTimeArrow(sheet, layout, settings, sdsgSpace, view.settings.typeLabelVisibility);
  if (!arrow) return null;

  const editable = !!onOpenSettings && !view.isPreview;

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
          pointerEvents: editable ? 'auto' : 'none',
          cursor: editable ? 'pointer' : 'default',
        }}
        onMouseDown={editable ? (e) => e.stopPropagation() : undefined}
        onClick={editable ? (e) => e.stopPropagation() : undefined}
        onDoubleClick={editable ? (e) => { e.preventDefault(); e.stopPropagation(); onOpenSettings?.(); } : undefined}
        title={editable ? 'ダブルクリックで非可逆的時間タブを開く' : undefined}
      >
        {renderVerticalAwareText(arrow.label, isVert)}
      </div>
    </div>
  );
}

// ============================================================================
// Paper Guide
// ============================================================================

// ============================================================================
// CustomControls - 右下の独自コントロール
// ZoomIn / ZoomOut / 全体fit / 横fit / 縦fit / toggleInteractivity
// ============================================================================
function CustomControls() {
  const rf = useReactFlow();
  const requestFit = useTEMStore((s) => s.requestFit);
  const canvasMode = useTEMStore((s) => s.view.canvasMode);
  const setCanvasMode = useTEMStore((s) => s.setCanvasMode);

  const btn: React.CSSProperties = {
    width: 30,
    height: 30,
    border: '1px solid #ddd',
    background: '#fff',
    cursor: 'pointer',
    fontSize: 14,
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
  const activeBtn: React.CSSProperties = { ...btn, background: '#e3efff', borderColor: '#2684ff' };

  return (
    <div
      className="react-flow__controls"
      style={{
        position: 'absolute',
        right: 20,
        bottom: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        zIndex: 5,
        boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
        borderRadius: 3,
        overflow: 'hidden',
      }}
    >
      <button style={btn} title="ズームイン" onClick={() => rf.zoomIn()}>＋</button>
      <button style={btn} title="ズームアウト" onClick={() => rf.zoomOut()}>－</button>
      <button style={btn} title="全体フィット" onClick={() => requestFit('all')}>⛶</button>
      <button style={btn} title="横幅フィット" onClick={() => requestFit('width')}>↔</button>
      <button style={btn} title="縦幅フィット" onClick={() => requestFit('height')}>↕</button>
      <button
        style={canvasMode === 'move' ? activeBtn : btn}
        title="移動モード（ドラッグで画面パン、図形編集ロック）"
        onClick={() => setCanvasMode('move')}
      >✋</button>
      <button
        style={canvasMode === 'pointer' ? activeBtn : btn}
        title="選択モード（図形を自由に操作）"
        onClick={() => setCanvasMode('pointer')}
      >➤</button>
      <button
        style={canvasMode === 'select' ? activeBtn : btn}
        title="範囲選択モード（ドラッグで矩形選択）"
        onClick={() => setCanvasMode('select')}
      >⊡</button>
    </div>
  );
}

function PaperGuideOverlay() {
  const transform = useReactFlowStore((s) => s.transform);
  const layout = useTEMStore((s) => s.doc.settings.layout);
  const paperGuides = useTEMStore((s) => s.doc.settings.paperGuides);
  const [panX, panY, zoom] = transform;
  const guide = paperGuides[0];
  if (!guide) return null;

  const baseKey = guide.baseSize ?? legacySizeToBaseKey(guide.size);
  let short = 0;
  let long = 0;
  if (baseKey === 'custom') {
    short = guide.customWidth ?? 794;
    long = guide.customHeight ?? 1123;
  } else {
    const b = PAPER_BASE_SIZES[baseKey];
    short = b.short;
    long = b.long;
  }
  const isH = layout === 'horizontal';
  // 横型: 長辺 = width、縦型: 長辺 = height
  const pageW = isH ? long : short;
  const pageH = isH ? short : long;
  const pageCount = Math.max(1, guide.pageCount ?? 1);
  const color = guide.color ?? '#ff6b6b';

  // Level 0 が短辺中央になるよう:
  //   横型: Level 0 は y 方向中央 → y 起点を -pageH/2
  //   縦型: Level 0 は x 方向中央 → x 起点を -pageW/2
  // 長辺方向の起点は 0 から（複数枚は長辺方向に並ぶ）
  const worldOriginX = isH ? 0 : -pageW / 2;
  const worldOriginY = isH ? -pageH / 2 : 0;
  const totalLongPx = (isH ? pageW : pageH) * pageCount;

  // ワールド座標 → 画面座標
  const screenX = worldOriginX * zoom + panX;
  const screenY = worldOriginY * zoom + panY;
  const wPx = (isH ? totalLongPx : pageW) * zoom;
  const hPx = (isH ? pageH : totalLongPx) * zoom;

  // 複数枚の境界線
  const dividers: React.ReactNode[] = [];
  for (let i = 1; i < pageCount; i++) {
    if (isH) {
      const x = (worldOriginX + pageW * i) * zoom + panX;
      dividers.push(
        <div
          key={`d${i}`}
          style={{
            position: 'absolute',
            left: x,
            top: screenY,
            width: 0,
            height: pageH * zoom,
            borderLeft: `1.5px dashed ${color}`,
          }}
        />
      );
    } else {
      const y = (worldOriginY + pageH * i) * zoom + panY;
      dividers.push(
        <div
          key={`d${i}`}
          style={{
            position: 'absolute',
            left: screenX,
            top: y,
            height: 0,
            width: pageW * zoom,
            borderTop: `1.5px dashed ${color}`,
          }}
        />
      );
    }
  }

  return (
    <>
      {/* 用紙枠範囲外の薄グレーマスク（4 方向） */}
      {guide.maskOutside !== false && (
        <>
          <div style={maskStyle({ left: 0, top: 0, right: '100%', height: '100%' }, 'left', screenX, screenY, wPx, hPx)} />
          <div style={maskStyle({ left: screenX + wPx, top: 0, right: 0, height: '100%' }, 'right', screenX, screenY, wPx, hPx)} />
          <div style={maskStyle({ left: 0, top: 0, width: '100%', height: screenY }, 'top', screenX, screenY, wPx, hPx)} />
          <div style={maskStyle({ left: 0, top: screenY + hPx, width: '100%', bottom: 0 }, 'bottom', screenX, screenY, wPx, hPx)} />
        </>
      )}
      <div
        className="paper-guide-overlay"
        style={{
          position: 'absolute',
          left: screenX,
          top: screenY,
          width: wPx,
          height: hPx,
          border: `2px dashed ${color}`,
          pointerEvents: 'none',
          zIndex: 0,
          boxSizing: 'border-box',
        }}
      >
        <span style={{ position: 'absolute', top: -18, left: 0, fontSize: 10, color, background: '#fff', padding: '0 4px', fontWeight: 600 }}>
          {baseKey === 'custom' ? 'カスタム' : baseKey}
          {pageCount > 1 && ` × ${pageCount}`}
        </span>
      </div>
      {dividers}
    </>
  );
}

// 用紙枠外マスク（薄グレー半透明）
function maskStyle(
  pos: React.CSSProperties,
  _which: string,
  _sx: number,
  _sy: number,
  _sw: number,
  _sh: number,
): React.CSSProperties {
  return {
    position: 'absolute',
    ...pos,
    background: 'rgba(180, 180, 180, 0.25)',
    pointerEvents: 'none',
    zIndex: 0,
  };
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

// ============================================================================
// SDSGBandOverlay - SD/SG 帯の範囲を点線で可視化（編集時のみ、出力には含めない）
// ============================================================================
function SDSGBandOverlay({ dragInfo }: { dragInfo?: { sdsgId: string; bandKey: 'top' | 'bottom' } | null }) {
  const view = useTEMView();
  const sheet = view.sheet;
  const settings = view.settings;
  const layout = settings.layout;
  const isPreview = view.isPreview;
  const transform = useReactFlowStore((s) => s.transform);
  const [panX, panY, zoom] = transform;

  if (isPreview || !sheet || !settings.sdsgSpace?.enabled) return null;
  const bandLayout = computeSDSGBandLayout(sheet, layout, settings);
  const isH = layout === 'horizontal';

  // row 境界線オーバーレイ（ドラッグ中のみ表示）
  const renderRowGuides = (
    bk: 'top' | 'bottom',
    band: NonNullable<ReturnType<typeof computeSDSGBandLayout>['topBand']>,
  ) => {
    if (!dragInfo || dragInfo.bandKey !== bk) return null;
    // row 数再計算: 対象 band の SDSG から
    const entries = sheet.sdsg
      .filter((s) => (s.spaceMode === 'band-top' && bk === 'top') || (s.spaceMode === 'band-bottom' && bk === 'bottom'))
      .map((s) => {
        const a = sheet.boxes.find((b) => b.id === s.attachedTo);
        const centerT = a ? (isH ? a.x + a.width / 2 : a.y + a.height / 2) : 0;
        const taxSize = isH ? (s.spaceWidth ?? s.width ?? 70) : (s.spaceHeight ?? s.height ?? 40);
        return { id: s.id, timeStart: centerT - taxSize / 2, timeEnd: centerT + taxSize / 2, rowOverride: s.spaceRowOverride };
      });
    const rowMapAll = computeBandRowAssignments(entries);
    const totalRows = Math.max(1, ...Array.from(rowMapAll.values()).map((v) => v + 1));
    const rowSpan = band.axisSpan / totalRows;
    const dir = Math.sign(band.end - band.start) || (bk === 'top' ? -1 : 1);
    const guides: React.ReactNode[] = [];
    const color = bk === 'top' ? '#7e57c2' : '#388e3c';
    for (let r = 1; r < totalRows; r++) {
      const pos = band.start + dir * (r * rowSpan);
      if (isH) {
        const y = pos * zoom + panY;
        guides.push(
          <div key={`rg-${bk}-${r}`} style={{
            position: 'absolute', left: 0, right: 0, top: y, height: 0,
            borderTop: `1px dashed ${color}`, pointerEvents: 'none', zIndex: 1, opacity: 0.7,
          }} />,
        );
      } else {
        const x = pos * zoom + panX;
        guides.push(
          <div key={`rg-${bk}-${r}`} style={{
            position: 'absolute', top: 0, bottom: 0, left: x, width: 0,
            borderLeft: `1px dashed ${color}`, pointerEvents: 'none', zIndex: 1, opacity: 0.7,
          }} />,
        );
      }
    }
    return <>{guides}</>;
  };

  // 各 band に現在割り当てられている SDSG の数を集計
  // （SDSG が存在しない帯はオーバーレイを表示しない：空の帯は出さないポリシー）
  const topHasSDSG = sheet.sdsg.some((sg) => sg.spaceMode === 'band-top');
  const bottomHasSDSG = sheet.sdsg.some((sg) => sg.spaceMode === 'band-bottom');

  // ラベル位置の style を返す
  const labelStyleFor = (pos: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none', color: string, scale: number): React.CSSProperties | null => {
    if (pos === 'none') return null;
    const base: React.CSSProperties = {
      position: 'absolute',
      fontSize: 10 * scale, color,
      background: '#fff', padding: '0 4px', borderRadius: 2,
    };
    if (pos === 'top-left') return { ...base, left: 6, top: 4 };
    if (pos === 'top-right') return { ...base, right: 6, top: 4 };
    if (pos === 'bottom-left') return { ...base, left: 6, bottom: 4 };
    if (pos === 'bottom-right') return { ...base, right: 6, bottom: 4 };
    return null;
  };

  const renderBand = (
    band: NonNullable<ReturnType<typeof computeSDSGBandLayout>['topBand']>,
    label: string,
    bandCfg: NonNullable<typeof settings.sdsgSpace>['bands']['top'] | NonNullable<typeof settings.sdsgSpace>['bands']['bottom'],
    defaultColor: string,
  ) => {
    if (!bandCfg.showBorder) return null;
    const color = bandCfg.borderColor ?? defaultColor;
    const fillStyle = bandCfg.fillStyle ?? 'tinted';
    const background = fillStyle === 'tinted' ? `${color}18` : 'transparent';
    const labelPos = bandCfg.labelPosition ?? 'top-left';
    const scale = Math.max(0.8, zoom);
    const ls = labelStyleFor(labelPos, color, scale);
    const labelEl = ls ? <span style={ls}>{label}</span> : null;
    // 帯を全画面横断の薄い矩形として表示
    if (isH) {
      const yMin = Math.min(band.start, band.end) * zoom + panY;
      const yMax = Math.max(band.start, band.end) * zoom + panY;
      return (
        <div
          style={{
            position: 'absolute', left: 0, right: 0,
            top: yMin, height: yMax - yMin,
            border: `1.5px dashed ${color}`,
            background,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        >
          {labelEl}
        </div>
      );
    }
    const xMin = Math.min(band.start, band.end) * zoom + panX;
    const xMax = Math.max(band.start, band.end) * zoom + panX;
    return (
      <div
        style={{
          position: 'absolute', top: 0, bottom: 0,
          left: xMin, width: xMax - xMin,
          border: `1.5px dashed ${color}`,
          background,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      >
        {labelEl}
      </div>
    );
  };

  return (
    <>
      {topHasSDSG && bandLayout.topBand && settings.sdsgSpace?.bands.top.showBorder &&
        renderBand(bandLayout.topBand, isH ? '上部 (SD)' : '右側 (SD)', settings.sdsgSpace.bands.top, '#9b59b6')}
      {bottomHasSDSG && bandLayout.bottomBand && settings.sdsgSpace?.bands.bottom.showBorder &&
        renderBand(bandLayout.bottomBand, isH ? '下部 (SG)' : '左側 (SG)', settings.sdsgSpace.bands.bottom, '#27ae60')}
      {bandLayout.topBand && renderRowGuides('top', bandLayout.topBand)}
      {bandLayout.bottomBand && renderRowGuides('bottom', bandLayout.bottomBand)}
    </>
  );
}
