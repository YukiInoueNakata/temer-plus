// ============================================================================
// ExportPreviewDialog - プレビュー付きの統合出力ダイアログ
// - 左カラム: 変換パラメータ / 用紙サイズ / フィット / 微調整 / プリセット / 出力設定
// - 右カラム: 変換後 doc をプレビュー（ExportPreviewCanvas）
// - 下: フォーマット別出力ボタン（PNG / SVG / PDF / PPTX）
// 元データは終始不変
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTEMStore } from '../store/store';
import {
  applyExportTransform,
  DEFAULT_EXPORT_TRANSFORM,
  type ExportTransform,
  type FitMode,
} from '../utils/exportTransform';
import { getPaperPx, getPaperSizeOptionsForLayout, type PaperSizeKey } from '../utils/paperSizes';
import { ExportPreviewCanvas } from './ExportPreviewCanvas';
import type { ExportOptions } from '../utils/exportImage';
import { computePageBounds } from '../utils/pageSplit';

type Format = 'png' | 'svg' | 'pdf' | 'pptx';

const FORMATS: { key: Format; label: string }[] = [
  { key: 'png', label: 'PNG' },
  { key: 'svg', label: 'SVG' },
  { key: 'pdf', label: 'PDF' },
  { key: 'pptx', label: 'PPTX' },
];

const PREVIEW_ID = 'export-preview-canvas';

export function ExportPreviewDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const doc = useTEMStore((s) => s.doc);
  const [xf, setXf] = useState<ExportTransform>(DEFAULT_EXPORT_TRANSFORM);
  const [format, setFormat] = useState<Format>('png');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // 出力固有オプション
  const [background, setBackground] = useState<'white' | 'transparent'>('white');
  const [includeGrid, setIncludeGrid] = useState(false);
  const [includePaperGuides, setIncludePaperGuides] = useState(false);
  const [pdfMargin, setPdfMargin] = useState(0.3);

  // 印刷モードタブ: 'single' = 単一印刷 / 'multi' = 複数印刷
  const [exportMode, setExportMode] = useState<'single' | 'multi'>('single');

  // プレビュー中のページ index（単一モードでは 0 固定）
  const [previewPageIndex, setPreviewPageIndex] = useState(0);

  // ダイアログ open 時の初期化:
  //  - 印刷モードは常に 'single' からスタート
  //  - paperGuides[0].pageCount は複数モード切替時の初期値として使う
  //  - layout に応じた既定用紙サイズ（縦型 = A4 縦 / 横型 = A4 横）を設定
  const paperGuidePageCount = doc.settings.paperGuides?.[0]?.pageCount ?? 1;
  const layoutDefaultPaperSize: PaperSizeKey = doc.settings.layout === 'vertical' ? 'A4-portrait' : 'A4-landscape';
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!open) { initializedRef.current = false; return; }
    if (initializedRef.current) return;
    initializedRef.current = true;
    setExportMode('single');
    setXf((cur) => ({
      ...cur,
      pageCount: 1,
      paperSize: layoutDefaultPaperSize,
      fitMode: 'fit-both',
      globalScale: 1,
      offsetX: 0,
      offsetY: 0,
    }));
    setPreviewPageIndex(0);
  }, [open, layoutDefaultPaperSize]);

  // 単一⇔複数 タブ切替時に pageCount と fitMode を同期
  const switchMode = (mode: 'single' | 'multi') => {
    setExportMode(mode);
    if (mode === 'single') {
      setXf((cur) => ({
        ...cur,
        pageCount: 1,
        fitMode: 'fit-both',
        globalScale: 1,
        offsetX: 0,
        offsetY: 0,
      }));
      setPreviewPageIndex(0);
    } else {
      // 複数モード初期値: paperGuides.pageCount、なければ 2。fitMode は短辺フィット
      const n = Math.max(2, paperGuidePageCount > 1 ? paperGuidePageCount : 2);
      setXf((cur) => ({
        ...cur,
        pageCount: n,
        fitMode: 'fit-short',
        globalScale: 1,
        offsetX: 0,
        offsetY: 0,
      }));
      setPreviewPageIndex(0);
    }
  };

  // ダイアログ位置
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ mouseX: 0, mouseY: 0, dlgX: 0, dlgY: 0 });

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.mouseX;
      const dy = e.clientY - dragStart.current.mouseY;
      setPos({ x: dragStart.current.dlgX + dx, y: dragStart.current.dlgY + dy });
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  // 変換後 doc（プレビュー / エクスポート両方で使用）
  const transformed = useMemo(() => applyExportTransform(doc, xf), [doc, xf]);

  // ページ境界を計算（プレビュー / 実出力で共用）
  const pageBounds = useMemo(() => {
    const paper = getPaperPx(xf.paperSize);
    return computePageBounds({
      paperWidth: paper.width,
      paperHeight: paper.height,
      layout: transformed.doc.settings.layout,
      pageCount: Math.max(1, xf.pageCount),
      overlapPx: xf.pageOverlapPx,
    });
  }, [xf.paperSize, xf.pageCount, xf.pageOverlapPx, transformed.doc.settings.layout]);

  if (!open) return null;

  const update = (patch: Partial<ExportTransform>) => setXf((x) => ({ ...x, ...patch }));
  const onHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.modal-close')) return;
    const cur = pos ?? { x: window.innerWidth / 2 - 500, y: window.innerHeight / 2 - 320 };
    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, dlgX: cur.x, dlgY: cur.y };
    setPos(cur);
    setDragging(true);
  };

  const modalStyle: React.CSSProperties = pos
    ? { width: 1000, maxWidth: '95vw', position: 'absolute', left: pos.x, top: pos.y, margin: 0 }
    : { width: 1000, maxWidth: '95vw' };

  // layout に応じた用紙サイズ選択肢
  const paperOptions = useMemo(
    () => getPaperSizeOptionsForLayout(doc.settings.layout),
    [doc.settings.layout],
  );

  const runExport = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const baseName = doc.metadata.title || 'TEMer';
      const imgOpts: ExportOptions = {
        includeGrid,
        includePaperGuides,
        includeRulers: false,
        background,
      };
      const multi = exportMode === 'multi' && xf.pageCount > 1 ? pageBounds : null;
      if (format === 'png') {
        if (multi) {
          const { exportToPNGPages } = await import('../utils/exportImage');
          await exportToPNGPages(PREVIEW_ID, baseName, multi, 2, imgOpts);
        } else {
          const { exportToPNG } = await import('../utils/exportImage');
          await exportToPNG(PREVIEW_ID, `${baseName}.png`, 2, imgOpts);
        }
      } else if (format === 'svg') {
        if (multi) {
          const { exportToSVGPages } = await import('../utils/exportImage');
          await exportToSVGPages(PREVIEW_ID, baseName, multi, imgOpts);
        } else {
          const { exportToSVG } = await import('../utils/exportImage');
          await exportToSVG(PREVIEW_ID, `${baseName}.svg`, imgOpts);
        }
      } else if (format === 'pdf') {
        const { exportToPDF } = await import('../utils/exportPDF');
        await exportToPDF(PREVIEW_ID, `${baseName}.pdf`, {
          paperSize: xf.paperSize,
          margin: pdfMargin,
          background,
          includeGrid,
          includePaperGuides,
          includeRulers: false,
          pages: multi ?? undefined,
        });
      } else if (format === 'pptx') {
        const { exportToPPTX } = await import('../utils/exportPPT');
        const sheet = transformed.doc.sheets.find((s) => s.id === transformed.doc.activeSheetId);
        if (!sheet) throw new Error('アクティブシートが見つかりません');
        await exportToPPTX({
          filename: `${baseName}.pptx`,
          sheet,
          settings: transformed.doc.settings,
          scale: false,
          offset: 0,
          paperSize: xf.paperSize,
          pages: multi ?? undefined,
          pageSplitMode: xf.pageSplitMode,
          showContinuationMarkers: xf.showContinuationMarkers,
        });
      }
    } catch (e) {
      console.error(e);
      alert(`出力に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const runPrint = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const multi = exportMode === 'multi' && xf.pageCount > 1 ? pageBounds : null;
      const { printDiagram } = await import('../utils/printing');
      await printDiagram(PREVIEW_ID, {
        paperSize: xf.paperSize,
        background,
        includeGrid,
        includePaperGuides,
        includeRulers: false,
        pages: multi ?? undefined,
      });
    } catch (e) {
      console.error(e);
      alert(`印刷の準備に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={modalStyle}
      >
        <div
          className="modal-header"
          onMouseDown={onHeaderMouseDown}
          style={{ cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none' }}
          title="ドラッグで移動"
        >
          <h3>出力プレビュー</h3>
          <button onClick={onClose} className="modal-close">×</button>
        </div>
        <div className="modal-body" style={{ padding: 0, display: 'flex', gap: 0, height: 560, overflow: 'hidden' }}>
          {/* 左: パラメータ */}
          <div style={{ width: 360, padding: '10px 14px', overflowY: 'auto', borderRight: '1px solid #e0e0e0' }}>
            {/* 印刷モードタブ */}
            <div className="settings-tabs" style={{ marginBottom: 10, padding: 0 }}>
              <button
                className={exportMode === 'single' ? 'settings-tab active' : 'settings-tab'}
                onClick={() => switchMode('single')}
              >単一印刷</button>
              <button
                className={exportMode === 'multi' ? 'settings-tab active' : 'settings-tab'}
                onClick={() => switchMode('multi')}
              >複数印刷（分割）</button>
            </div>

            <section className="settings-section">
              <h4>用紙とフィット</h4>
              <div className="setting-row">
                <label>用紙サイズ</label>
                <select
                  value={xf.paperSize}
                  onChange={(e) => update({ paperSize: e.target.value as PaperSizeKey })}
                  style={{ maxWidth: 200 }}
                >
                  {paperOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="setting-row">
                <label>フィット</label>
                <select
                  value={xf.fitMode}
                  onChange={(e) => update({ fitMode: e.target.value as FitMode })}
                >
                  <option value="manual">手動（倍率指定）</option>
                  <option value="fit-both">両方に収める</option>
                  <option value="fit-width">横だけ収める</option>
                  <option value="fit-height">縦だけ収める</option>
                  <option value="fit-short">短辺だけ収める（複数印刷向け）</option>
                </select>
              </div>
              {xf.fitMode === 'fit-short' && (
                <p className="hint" style={{ marginTop: 0 }}>
                  {doc.settings.layout === 'horizontal'
                    ? '横型: 縦方向（短辺）を用紙高さに合わせる。横方向はページ数で分割'
                    : '縦型: 横方向（短辺）を用紙幅に合わせる。縦方向はページ数で分割'}
                </p>
              )}
              {xf.fitMode === 'manual' && (
                <div className="setting-row">
                  <label>全体倍率</label>
                  <input
                    type="number"
                    step={0.05}
                    min={0.1}
                    max={10}
                    value={xf.globalScale}
                    onChange={(e) => update({ globalScale: Math.max(0.1, Number(e.target.value)) })}
                    style={{ width: 80 }}
                  />
                </div>
              )}
              <div className="setting-row">
                <label>用紙内余白比率</label>
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  max={0.3}
                  value={xf.paperMarginRatio}
                  onChange={(e) => update({ paperMarginRatio: Math.max(0, Number(e.target.value)) })}
                  style={{ width: 80 }}
                />
              </div>
            </section>

            {exportMode === 'multi' && (
              <section className="settings-section">
                <h4>ページ分割（長辺方向）</h4>
                <p className="hint" style={{ marginTop: 0 }}>
                  {doc.settings.layout === 'horizontal'
                    ? '横型レイアウト: x 軸方向（横）に N 分割して出力'
                    : '縦型レイアウト: y 軸方向（縦）に N 分割して出力'}
                </p>
                <div className="setting-row">
                  <label>分割数</label>
                  <input
                    type="number"
                    min={2}
                    max={20}
                    step={1}
                    value={xf.pageCount}
                    onChange={(e) => {
                      const n = Math.max(2, Math.min(20, Math.floor(Number(e.target.value) || 2)));
                      update({ pageCount: n });
                      if (previewPageIndex >= n) setPreviewPageIndex(0);
                    }}
                    style={{ width: 80 }}
                  />
                </div>
                <div className="setting-row">
                  <label>分割方式</label>
                  <select
                    value={xf.pageSplitMode}
                    onChange={(e) => update({ pageSplitMode: e.target.value as 'overlap' | 'duplicate' })}
                    style={{ maxWidth: 220 }}
                  >
                    <option value="overlap">オーバーラップ方式（単純クロップ）</option>
                    <option value="duplicate">SPEC方式（Box複製+続マーカー、PPTX 限定）</option>
                  </select>
                </div>
                <div className="setting-row">
                  <label>オーバーラップ量 (px)</label>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    step={5}
                    value={xf.pageOverlapPx}
                    onChange={(e) => update({ pageOverlapPx: Math.max(0, Number(e.target.value) || 0) })}
                    style={{ width: 80 }}
                  />
                </div>
                {xf.pageSplitMode === 'duplicate' && (
                  <>
                    <div className="setting-row">
                      <label>続マーカーを表示</label>
                      <input
                        type="checkbox"
                        checked={xf.showContinuationMarkers}
                        onChange={(e) => update({ showContinuationMarkers: e.target.checked })}
                      />
                    </div>
                    {format !== 'pptx' && (
                      <p className="hint" style={{ color: '#b36b00' }}>
                        ※ PPTX 以外ではオーバーラップ方式で出力されます（Box 複製・続マーカーは PPTX 限定機能）
                      </p>
                    )}
                  </>
                )}
                <div className="setting-row" style={{ justifyContent: 'flex-start', gap: 6 }}>
                  <button
                    className="ribbon-btn-small"
                    onClick={() => setPreviewPageIndex((i) => Math.max(0, i - 1))}
                    disabled={previewPageIndex <= 0}
                  >◀</button>
                  <span style={{ fontSize: '0.85em' }}>
                    プレビュー: {previewPageIndex + 1} / {xf.pageCount}
                  </span>
                  <button
                    className="ribbon-btn-small"
                    onClick={() => setPreviewPageIndex((i) => Math.min(xf.pageCount - 1, i + 1))}
                    disabled={previewPageIndex >= xf.pageCount - 1}
                  >▶</button>
                </div>
              </section>
            )}

            <section className="settings-section">
              <h4>微調整</h4>
              <div className="setting-row">
                <label>位置 X (px)</label>
                <input
                  type="number"
                  step={10}
                  value={xf.offsetX}
                  onChange={(e) => update({ offsetX: Number(e.target.value) })}
                  style={{ width: 80 }}
                  title="用紙中心を基準に全要素を X 方向に平行移動"
                />
              </div>
              <div className="setting-row">
                <label>位置 Y (px)</label>
                <input
                  type="number"
                  step={10}
                  value={xf.offsetY}
                  onChange={(e) => update({ offsetY: Number(e.target.value) })}
                  style={{ width: 80 }}
                  title="用紙中心を基準に全要素を Y 方向に平行移動"
                />
              </div>
              <div className="setting-row">
                <label>文字サイズ ±</label>
                <input
                  type="number"
                  step={1}
                  value={xf.fontSizeDelta}
                  onChange={(e) => update({ fontSizeDelta: Number(e.target.value) })}
                  style={{ width: 80 }}
                />
              </div>
              <div className="setting-row">
                <label>文字サイズ ×</label>
                <input
                  type="number"
                  step={0.05}
                  min={0.1}
                  value={xf.fontSizeScale}
                  onChange={(e) => update({ fontSizeScale: Math.max(0.1, Number(e.target.value)) })}
                  style={{ width: 80 }}
                />
              </div>
              <div className="setting-row">
                <label>枠線太さ ±</label>
                <input
                  type="number"
                  step={0.5}
                  value={xf.boxBorderWidthDelta}
                  onChange={(e) => update({ boxBorderWidthDelta: Number(e.target.value) })}
                  style={{ width: 80 }}
                />
              </div>
              <div className="setting-row">
                <label>線太さ ±</label>
                <input
                  type="number"
                  step={0.5}
                  value={xf.lineStrokeWidthDelta}
                  onChange={(e) => update({ lineStrokeWidthDelta: Number(e.target.value) })}
                  style={{ width: 80 }}
                />
              </div>
              <div className="setting-row">
                <label>Box間距離 横 ×</label>
                <input
                  type="number"
                  step={0.05}
                  min={0.1}
                  value={xf.boxGapScaleH}
                  onChange={(e) => update({ boxGapScaleH: Math.max(0.1, Number(e.target.value)), boxGapScale: undefined })}
                  style={{ width: 80 }}
                  title="Box のサイズは維持、横方向の中心間距離のみ拡縮（矢印の長さが変わる）"
                />
              </div>
              <div className="setting-row">
                <label>Box間距離 縦 ×</label>
                <input
                  type="number"
                  step={0.05}
                  min={0.1}
                  value={xf.boxGapScaleV}
                  onChange={(e) => update({ boxGapScaleV: Math.max(0.1, Number(e.target.value)), boxGapScale: undefined })}
                  style={{ width: 80 }}
                  title="Box のサイズは維持、縦方向の中心間距離のみ拡縮"
                />
              </div>
              <div className="setting-row">
                <label>用紙中央に自動配置</label>
                <input
                  type="checkbox"
                  checked={xf.autoCenterOnPaper !== false}
                  onChange={(e) => update({ autoCenterOnPaper: e.target.checked })}
                />
              </div>
              <div className="setting-row">
                <label>タイプラベル ±</label>
                <input
                  type="number"
                  step={1}
                  value={xf.typeLabelFontSizeDelta}
                  onChange={(e) => update({ typeLabelFontSizeDelta: Number(e.target.value) })}
                  style={{ width: 80 }}
                />
              </div>
              <div className="setting-row">
                <label>サブラベル ±</label>
                <input
                  type="number"
                  step={1}
                  value={xf.subLabelFontSizeDelta}
                  onChange={(e) => update({ subLabelFontSizeDelta: Number(e.target.value) })}
                  style={{ width: 80 }}
                />
              </div>
              <div className="setting-row">
                <label>時間矢印文字 ±</label>
                <input
                  type="number"
                  step={1}
                  value={xf.timeArrowFontSizeDelta}
                  onChange={(e) => update({ timeArrowFontSizeDelta: Number(e.target.value) })}
                  style={{ width: 80 }}
                />
              </div>
              <div className="setting-row">
                <label>凡例文字 ±</label>
                <input
                  type="number"
                  step={1}
                  value={xf.legendFontSizeDelta}
                  onChange={(e) => update({ legendFontSizeDelta: Number(e.target.value) })}
                  style={{ width: 80 }}
                />
              </div>
              <div className="setting-row">
                <label>時期区分文字 ±</label>
                <input
                  type="number"
                  step={1}
                  value={xf.periodLabelFontSizeDelta}
                  onChange={(e) => update({ periodLabelFontSizeDelta: Number(e.target.value) })}
                  style={{ width: 80 }}
                />
              </div>
              <div className="setting-row">
                <label>時期区分 線太さ ±</label>
                <input
                  type="number"
                  step={0.5}
                  value={xf.periodLabelStrokeDelta}
                  onChange={(e) => update({ periodLabelStrokeDelta: Number(e.target.value) })}
                  style={{ width: 80 }}
                />
              </div>
              <div className="setting-row" style={{ justifyContent: 'flex-start', gap: 4 }}>
                <button
                  className="ribbon-btn-small"
                  onClick={() => setXf(DEFAULT_EXPORT_TRANSFORM)}
                >
                  リセット
                </button>
              </div>
            </section>

            <section className="settings-section">
              <h4>出力設定</h4>
              <div className="setting-row">
                <label>背景</label>
                <select
                  value={background}
                  onChange={(e) => setBackground(e.target.value as 'white' | 'transparent')}
                >
                  <option value="white">白</option>
                  <option value="transparent">透明</option>
                </select>
              </div>
              <div className="setting-row">
                <label>グリッドを含める</label>
                <input
                  type="checkbox"
                  checked={includeGrid}
                  onChange={(e) => setIncludeGrid(e.target.checked)}
                />
              </div>
              <div className="setting-row">
                <label>用紙枠を含める</label>
                <input
                  type="checkbox"
                  checked={includePaperGuides}
                  onChange={(e) => setIncludePaperGuides(e.target.checked)}
                />
              </div>
              {format === 'pdf' && (
                <div className="setting-row">
                  <label>PDF マージン (inch)</label>
                  <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.05}
                    value={pdfMargin}
                    onChange={(e) => setPdfMargin(Math.max(0, Number(e.target.value)))}
                    style={{ width: 80 }}
                  />
                </div>
              )}
              <p className="hint">背景・グリッド・用紙枠は PPTX では無視されます</p>
            </section>
          </div>

          {/* 右: プレビュー */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '0.85em', color: '#555' }}>
              プレビュー（ドラッグ＝位置シフト / ホイール＝全体倍率 に反映）
            </div>
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              <ExportPreviewCanvas
                doc={transformed.doc}
                elementId={PREVIEW_ID}
                paperSize={xf.paperSize}
                showPaperGuide={true}
                showGrid={includeGrid}
                background={background}
                pageBounds={exportMode === 'multi' ? pageBounds : undefined}
                highlightPageIndex={exportMode === 'multi' && xf.pageCount > 1 ? previewPageIndex : undefined}
                onPanZoomChange={(delta) => {
                  // パン → offsetX/Y、ズーム → fitMode=manual + globalScale に反映
                  setXf((cur) => {
                    const next: ExportTransform = { ...cur };
                    if (delta.panDeltaWorldX !== 0 || delta.panDeltaWorldY !== 0) {
                      next.offsetX = cur.offsetX + delta.panDeltaWorldX;
                      next.offsetY = cur.offsetY + delta.panDeltaWorldY;
                    }
                    if (Math.abs(delta.zoomRatio - 1) > 0.001) {
                      next.fitMode = 'manual';
                      const base = cur.fitMode === 'manual' ? cur.globalScale : 1;
                      next.globalScale = Math.max(0.1, base * delta.zoomRatio);
                    }
                    return next;
                  });
                }}
                style={{ width: '100%', height: '100%' }}
              />
            </div>
          </div>
        </div>
        <div
          className="modal-footer"
          style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 14px', flexWrap: 'wrap' }}
        >
          {/* 左: 閉じる（破壊的動作から離す） */}
          <button
            className="ribbon-btn-small"
            onClick={onClose}
            disabled={busy}
          >
            閉じる
          </button>

          {/* 中央: 印刷（紙への出力・グループ A） */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              paddingLeft: 12,
              borderLeft: '1px solid #d8d8d8',
            }}
          >
            <span style={{ fontSize: '0.78em', color: '#777' }}>紙に出力</span>
            <button
              className="ribbon-btn-small"
              onClick={runPrint}
              disabled={busy}
              title="プリンターで印刷（新規ウィンドウを開いてブラウザの印刷ダイアログを表示）"
              style={{ whiteSpace: 'nowrap' }}
            >
              🖨️ プリンターで印刷
            </button>
          </div>

          {/* 右: ファイル保存（グループ B）— notice と primary を右端にまとめる */}
          <div
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              paddingLeft: 12,
              borderLeft: '1px solid #d8d8d8',
            }}
          >
            <span style={{ fontSize: '0.78em', color: '#777' }}>ファイルに保存</span>
            <div style={{ display: 'flex', gap: 2 }}>
              {FORMATS.map((f) => (
                <button
                  key={f.key}
                  className={format === f.key ? 'settings-tab active' : 'settings-tab'}
                  onClick={() => setFormat(f.key)}
                  style={{
                    borderBottom: format === f.key ? '2px solid #2684ff' : '2px solid transparent',
                    padding: '4px 10px',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {notice && <span style={{ color: '#b36b00', fontSize: '0.82em' }}>{notice}</span>}
            <button
              className="ribbon-btn-primary"
              onClick={runExport}
              disabled={busy}
              style={{ whiteSpace: 'nowrap' }}
            >
              {busy ? '出力中...' : `💾 ${format.toUpperCase()} で保存`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
