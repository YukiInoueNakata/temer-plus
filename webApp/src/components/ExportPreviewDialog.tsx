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
  EXPORT_PRESETS,
  type ExportTransform,
  type FitMode,
} from '../utils/exportTransform';
import { PAPER_SIZE_OPTIONS, type PaperSizeKey } from '../utils/paperSizes';
import { ExportPreviewCanvas } from './ExportPreviewCanvas';
import type { ExportOptions } from '../utils/exportImage';

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

  const applyPreset = (key: string) => {
    const p = EXPORT_PRESETS[key];
    if (!p) return;
    setXf((cur) => ({ ...DEFAULT_EXPORT_TRANSFORM, ...cur, ...p }));
  };

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
      if (format === 'png') {
        const { exportToPNG } = await import('../utils/exportImage');
        // プレビュー DOM をキャプチャ
        await exportToPNG(PREVIEW_ID, `${baseName}.png`, 2, imgOpts);
      } else if (format === 'svg') {
        const { exportToSVG } = await import('../utils/exportImage');
        await exportToSVG(PREVIEW_ID, `${baseName}.svg`, imgOpts);
      } else if (format === 'pdf') {
        const { exportToPDF } = await import('../utils/exportPDF');
        await exportToPDF(PREVIEW_ID, `${baseName}.pdf`, {
          paperSize: xf.paperSize,
          margin: pdfMargin,
          background,
          includeGrid,
          includePaperGuides,
          includeRulers: false,
        });
      } else if (format === 'pptx') {
        const { exportToPPTX } = await import('../utils/exportPPT');
        const sheet = transformed.doc.sheets.find((s) => s.id === transformed.doc.activeSheetId);
        if (!sheet) throw new Error('アクティブシートが見つかりません');
        await exportToPPTX({
          filename: `${baseName}.pptx`,
          sheet,
          settings: transformed.doc.settings,
          // 変換層ですでにスケール適用済なので PPTX 側は追加スケーリングしない
          scale: false,
          offset: 0,
          paperSize: xf.paperSize,
        });
      }
    } catch (e) {
      console.error(e);
      alert(`出力に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
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
            <section className="settings-section">
              <h4>プリセット</h4>
              <div className="setting-row">
                <label>選択</label>
                <select
                  onChange={(e) => { if (e.target.value) applyPreset(e.target.value); }}
                  defaultValue=""
                >
                  <option value="">（選択して適用）</option>
                  {Object.entries(EXPORT_PRESETS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
            </section>

            <section className="settings-section">
              <h4>用紙とフィット</h4>
              <div className="setting-row">
                <label>用紙サイズ</label>
                <select
                  value={xf.paperSize}
                  onChange={(e) => update({ paperSize: e.target.value as PaperSizeKey })}
                  style={{ maxWidth: 200 }}
                >
                  {PAPER_SIZE_OPTIONS.map((o) => (
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
                </select>
              </div>
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

            <section className="settings-section">
              <h4>微調整</h4>
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
                <label>Box間距離 ×</label>
                <input
                  type="number"
                  step={0.05}
                  min={0.1}
                  value={xf.boxGapScale}
                  onChange={(e) => update({ boxGapScale: Math.max(0.1, Number(e.target.value)) })}
                  style={{ width: 80 }}
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
              プレビュー（ホイールでズーム、ドラッグでスクロール）
            </div>
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              <ExportPreviewCanvas
                doc={transformed.doc}
                elementId={PREVIEW_ID}
                paperSize={xf.paperSize}
                showPaperGuide={true}
                showGrid={includeGrid}
                background={background}
                style={{ width: '100%', height: '100%' }}
              />
            </div>
          </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {FORMATS.map((f) => (
              <button
                key={f.key}
                className={format === f.key ? 'settings-tab active' : 'settings-tab'}
                onClick={() => setFormat(f.key)}
                style={{ borderBottom: format === f.key ? '2px solid #2684ff' : '2px solid transparent' }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div>
            {notice && <span style={{ color: '#b36b00', fontSize: '0.82em', marginRight: 8 }}>{notice}</span>}
            <button className="ribbon-btn-primary" onClick={runExport} disabled={busy}>
              {busy ? '出力中...' : `${format.toUpperCase()} で保存`}
            </button>
            <button
              className="ribbon-btn-small"
              onClick={onClose}
              disabled={busy}
              style={{ marginLeft: 8 }}
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
