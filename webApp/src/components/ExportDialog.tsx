// ============================================================================
// ExportDialog - PNG / SVG / PPTX の共通出力ダイアログ
// - タブ: PNG / SVG / PPTX
// - PNG/SVG: 出力範囲 / 要素含有 / 背景 の設定
// - PPTX: 出力範囲 / スケーリング の設定（背景・要素は非表示）
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { useTEMStore } from '../store/store';
import type { ExportOptions } from '../utils/exportImage';

type Format = 'png' | 'svg' | 'pptx';

interface Config {
  range: 'visible' | 'all';
  offset: number;              // 全体出力時の余白比（0.1 等）
  // 画像系（PNG/SVG）オプション
  includeGrid: boolean;
  includePaperGuides: boolean;
  includeTopRuler: boolean;
  includeLeftRuler: boolean;
  background: 'white' | 'transparent';
  // PPTX オプション
  pptxScale: boolean;          // スケーリング有無（既定 true）
}

const DEFAULT_CONFIG: Config = {
  range: 'all',
  offset: 0.1,
  includeGrid: false,
  includePaperGuides: false,
  includeTopRuler: false,
  includeLeftRuler: false,
  background: 'white',
  pptxScale: true,
};

const FORMATS: { key: Format; label: string }[] = [
  { key: 'png', label: 'PNG' },
  { key: 'svg', label: 'SVG' },
  { key: 'pptx', label: 'PPTX' },
];

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [format, setFormat] = useState<Format>('png');
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ mouseX: 0, mouseY: 0, dlgX: 0, dlgY: 0 });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const requestFit = useTEMStore((s) => s.requestFit);
  const doc = useTEMStore((s) => s.doc);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.mouseX;
      const dy = e.clientY - dragStart.current.mouseY;
      setPos({
        x: dragStart.current.dlgX + dx,
        y: dragStart.current.dlgY + dy,
      });
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  if (!open) return null;

  const update = (patch: Partial<Config>) => setCfg((c) => ({ ...c, ...patch }));

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.modal-close')) return;
    const cur = pos ?? { x: window.innerWidth / 2 - 320, y: window.innerHeight / 2 - 220 };
    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, dlgX: cur.x, dlgY: cur.y };
    setPos(cur);
    setDragging(true);
  };

  const modalStyle: React.CSSProperties = pos
    ? { width: 640, position: 'absolute', left: pos.x, top: pos.y, margin: 0 }
    : { width: 640 };

  const runExport = async () => {
    setBusy(true);
    setNotice(null);
    try {
      // PPTX: visible 選択時は全体にフォールバック
      let effectiveRange = cfg.range;
      if (format === 'pptx' && effectiveRange === 'visible') {
        effectiveRange = 'all';
        setNotice('PPTX は全体出力のみサポート（visible 指定 → all にフォールバック）');
      }

      // 画像系の全体出力は事前に fit してからキャプチャ
      if ((format === 'png' || format === 'svg') && effectiveRange === 'all') {
        requestFit('all');
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        await new Promise((r) => setTimeout(r, 80));
      }

      const baseName = doc.metadata.title || 'TEMer';
      if (format === 'png') {
        const { exportToPNG } = await import('../utils/exportImage');
        const opts: ExportOptions = {
          includeGrid: cfg.includeGrid,
          includePaperGuides: cfg.includePaperGuides,
          includeRulers: cfg.includeTopRuler || cfg.includeLeftRuler,
          background: cfg.background,
        };
        await exportToPNG('diagram-canvas', `${baseName}.png`, 2, opts);
      } else if (format === 'svg') {
        const { exportToSVG } = await import('../utils/exportImage');
        const opts: ExportOptions = {
          includeGrid: cfg.includeGrid,
          includePaperGuides: cfg.includePaperGuides,
          includeRulers: cfg.includeTopRuler || cfg.includeLeftRuler,
          background: cfg.background,
        };
        await exportToSVG('diagram-canvas', `${baseName}.svg`, opts);
      } else if (format === 'pptx') {
        const { exportToPPTX } = await import('../utils/exportPPT');
        const sheet = doc.sheets.find((s) => s.id === doc.activeSheetId);
        if (!sheet) throw new Error('アクティブシートが見つかりません');
        await exportToPPTX({
          filename: `${baseName}.pptx`,
          sheet,
          settings: doc.settings,
          scale: cfg.pptxScale,
          offset: cfg.offset,
        });
      }
    } catch (e) {
      console.error(e);
      alert(`出力に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const isImage = format === 'png' || format === 'svg';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={modalStyle}>
        <div
          className="modal-header"
          onMouseDown={onHeaderMouseDown}
          style={{ cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none' }}
          title="ドラッグで移動"
        >
          <h3>出力</h3>
          <button onClick={onClose} className="modal-close">×</button>
        </div>
        <div className="settings-tabs">
          {FORMATS.map((f) => (
            <button
              key={f.key}
              className={format === f.key ? 'settings-tab active' : 'settings-tab'}
              onClick={() => setFormat(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="modal-body" style={{ minHeight: 320 }}>
          <section className="settings-section">
            <h4>出力範囲</h4>
            <div className="setting-row">
              <label>範囲</label>
              <select
                value={cfg.range}
                onChange={(e) => update({ range: e.target.value as 'visible' | 'all' })}
              >
                <option value="all">全体を出力</option>
                <option value="visible">
                  表示部分を出力{format === 'pptx' ? '（PPTXでは全体にフォールバック）' : ''}
                </option>
              </select>
            </div>
            {cfg.range === 'all' && (
              <div className="setting-row">
                <label>オフセット（全体出力時、比率）</label>
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  max={1}
                  value={cfg.offset}
                  onChange={(e) => update({ offset: Math.max(0, Number(e.target.value)) })}
                  style={{ width: 80 }}
                />
              </div>
            )}
          </section>

          {isImage && (
            <>
              <section className="settings-section">
                <h4>含める要素（既定すべてオフ）</h4>
                <div className="setting-row">
                  <label>グリッド</label>
                  <input
                    type="checkbox"
                    checked={cfg.includeGrid}
                    onChange={(e) => update({ includeGrid: e.target.checked })}
                  />
                </div>
                <div className="setting-row">
                  <label>用紙枠</label>
                  <input
                    type="checkbox"
                    checked={cfg.includePaperGuides}
                    onChange={(e) => update({ includePaperGuides: e.target.checked })}
                  />
                </div>
                <div className="setting-row">
                  <label>上ルーラー</label>
                  <input
                    type="checkbox"
                    checked={cfg.includeTopRuler}
                    onChange={(e) => update({ includeTopRuler: e.target.checked })}
                  />
                </div>
                <div className="setting-row">
                  <label>左ルーラー</label>
                  <input
                    type="checkbox"
                    checked={cfg.includeLeftRuler}
                    onChange={(e) => update({ includeLeftRuler: e.target.checked })}
                  />
                </div>
              </section>

              <section className="settings-section">
                <h4>背景</h4>
                <div className="setting-row">
                  <label>背景色</label>
                  <select
                    value={cfg.background}
                    onChange={(e) => update({ background: e.target.value as 'white' | 'transparent' })}
                  >
                    <option value="white">白</option>
                    <option value="transparent">透明</option>
                  </select>
                </div>
              </section>
            </>
          )}

          {format === 'pptx' && (
            <section className="settings-section">
              <h4>PPTX 固有</h4>
              <div className="setting-row">
                <label>スケーリング（スライドにフィット）</label>
                <input
                  type="checkbox"
                  checked={cfg.pptxScale}
                  onChange={(e) => update({ pptxScale: e.target.checked })}
                />
              </div>
              <p className="hint">
                オフにすると元の画面座標のサイズで配置（スライド外にはみ出す可能性あり）。
                レイアウト方向に応じて横型/縦型スライドで出力されます。
              </p>
            </section>
          )}

          {notice && (
            <p style={{ color: '#b36b00', fontSize: '0.85em', margin: '4px 0 0' }}>{notice}</p>
          )}
        </div>
        <div className="modal-footer">
          <button className="ribbon-btn-primary" onClick={runExport} disabled={busy}>
            {busy ? '出力中...' : `${format.toUpperCase()} で保存`}
          </button>
          <button className="ribbon-btn-small" onClick={onClose} disabled={busy} style={{ marginLeft: 8 }}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
