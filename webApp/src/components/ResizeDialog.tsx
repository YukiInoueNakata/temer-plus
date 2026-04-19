// ============================================================================
// ResizeDialog - メインキャンバスの実データをリサイズするダイアログ
// - 用紙サイズ基準: A4/A3/PPT 16:9/4:3 に「縦のみ / 横のみ / 両方」fit
// - パーセント指定: 任意倍率
// - 文字サイズ連動の ON/OFF
// - 適用ボタンで実データを更新（Undo 可能）
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTEMStore, useActiveSheet } from '../store/store';
import { computeContentBounds } from '../utils/fitBounds';
import {
  PAPER_SIZE_OPTIONS,
  getPaperPx,
  type PaperSizeKey,
} from '../utils/paperSizes';

type Mode = 'percent' | 'paper';
type FitMode = 'width' | 'height' | 'both';

export function ResizeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sheet = useActiveSheet();
  const doc = useTEMStore((s) => s.doc);
  const resize = useTEMStore((s) => s.resizeActiveSheet);

  const [mode, setMode] = useState<Mode>('percent');
  const [percent, setPercent] = useState(100);
  const [paperSize, setPaperSize] = useState<Exclude<PaperSizeKey, 'custom'>>('A4-landscape');
  const [fitMode, setFitMode] = useState<FitMode>('both');
  const [margin, setMargin] = useState(0.05);
  const [includeFontSize, setIncludeFontSize] = useState(true);

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

  // 現在の bbox
  const bbox = useMemo(() => {
    if (!sheet) return null;
    return computeContentBounds(sheet, doc.settings.layout, doc.settings);
  }, [sheet, doc.settings]);

  // 計算される倍率
  const computedScale = useMemo(() => {
    if (mode === 'percent') {
      return percent / 100;
    }
    if (!bbox) return 1;
    const paper = getPaperPx(paperSize);
    const innerW = Math.max(1, paper.width * (1 - margin * 2));
    const innerH = Math.max(1, paper.height * (1 - margin * 2));
    const sx = innerW / Math.max(1, bbox.width);
    const sy = innerH / Math.max(1, bbox.height);
    if (fitMode === 'width') return sx;
    if (fitMode === 'height') return sy;
    return Math.min(sx, sy);
  }, [mode, percent, bbox, paperSize, fitMode, margin]);

  if (!open) return null;

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.modal-close')) return;
    const cur = pos ?? { x: window.innerWidth / 2 - 240, y: window.innerHeight / 2 - 200 };
    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, dlgX: cur.x, dlgY: cur.y };
    setPos(cur);
    setDragging(true);
  };
  const modalStyle: React.CSSProperties = pos
    ? { width: 480, position: 'absolute', left: pos.x, top: pos.y, margin: 0 }
    : { width: 480 };

  const applyResize = () => {
    if (!isFinite(computedScale) || computedScale <= 0) {
      alert('倍率が不正です');
      return;
    }
    if (computedScale === 1) {
      alert('倍率が 1.0 のためリサイズ不要です');
      return;
    }
    const pct = (computedScale * 100).toFixed(1);
    if (!confirm(`現在のシートを ${pct}% にリサイズします。\n（Ctrl+Z で取り消し可能）`)) return;
    resize(computedScale, { includeFontSize });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={modalStyle}>
        <div
          className="modal-header"
          onMouseDown={onHeaderMouseDown}
          style={{ cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none' }}
          title="ドラッグで移動"
        >
          <h3>シートのリサイズ</h3>
          <button onClick={onClose} className="modal-close">×</button>
        </div>
        <div className="modal-body" style={{ minHeight: 300 }}>
          <p className="hint" style={{ marginTop: 0 }}>
            アクティブシートの図全体（Box 座標・サイズ、Line、SDSG、時期ラベル位置）を一度にリサイズします。
            <br />
            実データを変更します。Ctrl+Z で取り消せます。
          </p>
          <section className="settings-section">
            <div className="setting-row">
              <label>モード</label>
              <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                <option value="percent">パーセント指定</option>
                <option value="paper">用紙サイズにフィット</option>
              </select>
            </div>
            {mode === 'percent' && (
              <div className="setting-row">
                <label>倍率 (%)</label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  step={1}
                  value={percent}
                  onChange={(e) => setPercent(Math.max(1, Number(e.target.value)))}
                  style={{ width: 90 }}
                />
              </div>
            )}
            {mode === 'paper' && (
              <>
                <div className="setting-row">
                  <label>用紙サイズ</label>
                  <select
                    value={paperSize}
                    onChange={(e) => setPaperSize(e.target.value as typeof paperSize)}
                    style={{ maxWidth: 260 }}
                  >
                    {PAPER_SIZE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="setting-row">
                  <label>フィット方式</label>
                  <select value={fitMode} onChange={(e) => setFitMode(e.target.value as FitMode)}>
                    <option value="both">両方に収める（縦横アスペクト維持）</option>
                    <option value="width">横幅だけ収める</option>
                    <option value="height">縦幅だけ収める</option>
                  </select>
                </div>
                <div className="setting-row">
                  <label>用紙内余白比率</label>
                  <input
                    type="number"
                    min={0}
                    max={0.3}
                    step={0.01}
                    value={margin}
                    onChange={(e) => setMargin(Math.max(0, Number(e.target.value)))}
                    style={{ width: 80 }}
                  />
                </div>
              </>
            )}
          </section>

          <section className="settings-section">
            <div className="setting-row">
              <label>文字サイズも連動</label>
              <input
                type="checkbox"
                checked={includeFontSize}
                onChange={(e) => setIncludeFontSize(e.target.checked)}
              />
            </div>
            <p className="hint">
              ON: Box / SDSG の fontSize、タイプラベル・サブラベルも同じ倍率でリサイズ<br />
              OFF: 座標・寸法のみリサイズ（文字サイズは維持）
            </p>
          </section>

          <section className="settings-section" style={{ background: '#f6f9fc', padding: 8, borderRadius: 4, border: '1px solid #e0e8f0' }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>プレビュー</div>
            {!bbox ? (
              <p className="hint" style={{ margin: 0 }}>（シートに図形がありません）</p>
            ) : (
              <>
                <div className="setting-row">
                  <span>現在のサイズ:</span>
                  <span>{Math.round(bbox.width)} × {Math.round(bbox.height)} px</span>
                </div>
                <div className="setting-row">
                  <span>リサイズ後:</span>
                  <span style={{ fontWeight: 600, color: '#2684ff' }}>
                    {Math.round(bbox.width * computedScale)} × {Math.round(bbox.height * computedScale)} px
                  </span>
                </div>
                <div className="setting-row">
                  <span>倍率:</span>
                  <span style={{ fontWeight: 600 }}>
                    {(computedScale * 100).toFixed(1)} %
                  </span>
                </div>
              </>
            )}
          </section>
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="ribbon-btn-small" onClick={onClose}>キャンセル</button>
          <button className="ribbon-btn-primary" onClick={applyResize}>
            リサイズを適用
          </button>
        </div>
      </div>
    </div>
  );
}
