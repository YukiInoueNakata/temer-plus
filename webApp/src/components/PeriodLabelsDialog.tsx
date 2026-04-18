// ============================================================================
// PeriodLabelsDialog - 時期ラベルの追加・編集・削除
// ============================================================================

import { useState } from 'react';
import { useTEMStore, useActiveSheet } from '../store/store';

export function PeriodLabelsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sheet = useActiveSheet();
  const addPeriodLabel = useTEMStore((s) => s.addPeriodLabel);
  const updatePeriodLabel = useTEMStore((s) => s.updatePeriodLabel);
  const removePeriodLabel = useTEMStore((s) => s.removePeriodLabel);

  const [newLabel, setNewLabel] = useState('');
  const [newPosition, setNewPosition] = useState(0);

  if (!open) return null;

  const handleAdd = () => {
    if (!newLabel.trim()) {
      alert('ラベルを入力してください');
      return;
    }
    addPeriodLabel(newLabel.trim(), newPosition);
    setNewLabel('');
    setNewPosition((p) => p + 1);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>時期ラベル</h3>
          <button onClick={onClose} className="modal-close">×</button>
        </div>
        <div className="modal-body">
          <section className="settings-section">
            <h4>新規追加</h4>
            <div className="setting-row">
              <label>時期ラベル</label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="例: 入学前、就職後"
                style={{ width: 180 }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              />
            </div>
            <div className="setting-row">
              <label>Time_Level（時間軸位置）</label>
              <input
                type="number"
                step="0.5"
                value={newPosition}
                onChange={(e) => setNewPosition(Number(e.target.value))}
                style={{ width: 100 }}
              />
            </div>
            <div className="setting-row" style={{ justifyContent: 'flex-end' }}>
              <button className="ribbon-btn-primary" onClick={handleAdd}>追加</button>
            </div>
          </section>

          <section className="settings-section">
            <h4>現在の時期ラベル</h4>
            {sheet && sheet.periodLabels.length === 0 && (
              <p className="hint">まだ時期ラベルがありません。</p>
            )}
            {sheet && sheet.periodLabels.length > 0 && (
              <table style={{ width: '100%', fontSize: '0.92em' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>ラベル</th>
                    <th style={{ textAlign: 'left', width: 80 }}>Time_Level</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {[...sheet.periodLabels]
                    .sort((a, b) => a.position - b.position)
                    .map((pl) => (
                      <tr key={pl.id}>
                        <td>
                          <input
                            type="text"
                            value={pl.label}
                            onChange={(e) => updatePeriodLabel(pl.id, { label: e.target.value })}
                            style={{ width: '100%' }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.5"
                            value={pl.position}
                            onChange={(e) => updatePeriodLabel(pl.id, { position: Number(e.target.value) })}
                            style={{ width: 70 }}
                          />
                        </td>
                        <td>
                          <button className="row-btn danger" onClick={() => removePeriodLabel(pl.id)} title="削除">×</button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </section>

          <p className="hint">
            時期ラベルは「表示」タブの「時期」トグルで表示/非表示を切替できます。<br />
            位置の調整（基準・オフセット）は「設定」ダイアログから。
          </p>
        </div>
        <div className="modal-footer">
          <button className="ribbon-btn-primary" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
