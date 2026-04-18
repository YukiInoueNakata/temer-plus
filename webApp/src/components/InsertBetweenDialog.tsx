// ============================================================================
// InsertBetweenDialog - 2選択Boxの間に挿入
// モード:
//   1. simple: 位置変更なし、A-B間に均等配置、A→B矢印は A→C1→..→CN→B に分割
//   2. expand-shift: レベル指定で挿入+シフト
//      - AからCまでのレベル差 (deltaAtoC)
//      - CからBまでのレベル差 (deltaCtoB)
//      - 内側Box間は 1レベル固定
//      - B以降のBoxも shift 分シフト
// ============================================================================

import { useState, useMemo, useEffect } from 'react';
import { useTEMStore, useActiveSheet } from '../store/store';
import { LEVEL_PX } from '../store/defaults';

export function InsertBetweenDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const selection = useTEMStore((s) => s.selection);
  const sheet = useActiveSheet();
  const layout = useTEMStore((s) => s.doc.settings.layout);
  const insertBoxesBetween = useTEMStore((s) => s.insertBoxesBetween);

  const [mode, setMode] = useState<'simple' | 'expand-shift'>('simple');
  const [count, setCount] = useState(1);
  const [deltaAtoC, setDeltaAtoC] = useState(1);
  const [deltaCtoB, setDeltaCtoB] = useState(1);

  const [startBox, endBox] = useMemo(() => {
    if (!sheet) return [undefined, undefined];
    const sel = selection.boxIds;
    if (sel.length !== 2) return [undefined, undefined];
    const boxes = sel.map((id) => sheet.boxes.find((b) => b.id === id)).filter((b): b is NonNullable<typeof b> => !!b);
    if (boxes.length !== 2) return [undefined, undefined];
    const [a, b] = boxes;
    const aTime = layout === 'horizontal' ? a.x : a.y;
    const bTime = layout === 'horizontal' ? b.x : b.y;
    return aTime <= bTime ? [a, b] : [b, a];
  }, [sheet, selection.boxIds, layout]);

  useEffect(() => {
    if (open) {
      setCount(1);
      setMode('simple');
      setDeltaAtoC(1);
      setDeltaCtoB(1);
    }
  }, [open]);

  if (!open) return null;

  const isValid = startBox && endBox && count >= 1;

  const handleSubmit = () => {
    if (!isValid) return;
    insertBoxesBetween(
      startBox!.id,
      endBox!.id,
      count,
      mode,
      mode === 'expand-shift' ? { deltaAtoC, deltaCtoB } : undefined
    );
    onClose();
  };

  const currentStartLevel = startBox
    ? ((layout === 'horizontal' ? startBox.x : startBox.y) / LEVEL_PX).toFixed(1)
    : '-';
  const currentEndLevel = endBox
    ? ((layout === 'horizontal' ? endBox.x : endBox.y) / LEVEL_PX).toFixed(1)
    : '-';

  // expand-shift のプレビュー計算
  const previewEndLevel = startBox
    ? Number(currentStartLevel) + deltaAtoC + (count - 1) + deltaCtoB
    : 0;
  const shift = endBox
    ? previewEndLevel - Number(currentEndLevel)
    : 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>2選択間にBox挿入</h3>
          <button onClick={onClose} className="modal-close">×</button>
        </div>
        <div className="modal-body">
          {!startBox || !endBox ? (
            <div style={{ padding: 20, color: '#d33' }}>
              ⚠ キャンバスで<strong>2つのBox</strong>を選択してください（Shift+クリック）
            </div>
          ) : (
            <>
              <section className="settings-section">
                <h4>選択中のBox</h4>
                <div className="setting-row">
                  <label>開始Box (A)</label>
                  <span><code>{startBox.id}</code> / {startBox.label}<br />現在Time_Level: <strong>{currentStartLevel}</strong></span>
                </div>
                <div className="setting-row">
                  <label>終了Box (B)</label>
                  <span><code>{endBox.id}</code> / {endBox.label}<br />現在Time_Level: <strong>{currentEndLevel}</strong></span>
                </div>
              </section>

              <section className="settings-section">
                <h4>挿入設定</h4>
                <div className="setting-row">
                  <label>挿入個数</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={count}
                    onChange={(e) => setCount(Math.max(1, Number(e.target.value)))}
                    style={{ width: 60 }}
                  />
                </div>
                <div className="setting-row">
                  <label>モード</label>
                  <select value={mode} onChange={(e) => setMode(e.target.value as 'simple' | 'expand-shift')}>
                    <option value="simple">単純挿入（位置変更なし）</option>
                    <option value="expand-shift">レベル指定+以降シフト</option>
                  </select>
                </div>
                <p className="hint">
                  📌 A→B の矢印がある場合、自動的に A→C1→...→CN→B に分割されます
                </p>
              </section>

              {mode === 'simple' && (
                <section className="settings-section">
                  <p className="hint">
                    <strong>単純挿入</strong>:<br />
                    開始Box ({currentStartLevel}) と終了Box ({currentEndLevel}) の間に <strong>{count}個</strong> を均等配置。<br />
                    他のBoxの位置は変更されません。
                  </p>
                </section>
              )}

              {mode === 'expand-shift' && (
                <section className="settings-section">
                  <h4>レベル差</h4>
                  <div className="setting-row">
                    <label>A → 最初の新Box のレベル差</label>
                    <input
                      type="number"
                      step="0.1"
                      min={0.1}
                      value={deltaAtoC}
                      onChange={(e) => setDeltaAtoC(Number(e.target.value))}
                      style={{ width: 80 }}
                    />
                  </div>
                  <div className="setting-row">
                    <label>最後の新Box → B のレベル差</label>
                    <input
                      type="number"
                      step="0.1"
                      min={0.1}
                      value={deltaCtoB}
                      onChange={(e) => setDeltaCtoB(Number(e.target.value))}
                      style={{ width: 80 }}
                    />
                  </div>
                  <p className="hint">
                    <strong>レベル指定+以降シフト</strong>:<br />
                    A (Level {currentStartLevel}) はそのまま固定。<br />
                    新Box は A から <strong>{deltaAtoC}</strong> レベル離れた位置から <strong>1レベル間隔</strong>で配置。<br />
                    {count > 1 && `最後の新Boxから `}B まで <strong>{deltaCtoB}</strong> レベル。<br />
                    → B の新Level: <strong>{previewEndLevel.toFixed(1)}</strong>（旧 {currentEndLevel}, シフト量 {shift >= 0 ? '+' : ''}{shift.toFixed(1)}）<br />
                    B より後ろのBoxもすべて <strong>{shift >= 0 ? '+' : ''}{shift.toFixed(1)}</strong> レベルずらします。
                  </p>
                </section>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="ribbon-btn-small" onClick={onClose}>キャンセル</button>
          <button
            className="ribbon-btn-primary"
            onClick={handleSubmit}
            disabled={!isValid}
            style={!isValid ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
          >
            挿入
          </button>
        </div>
      </div>
    </div>
  );
}
