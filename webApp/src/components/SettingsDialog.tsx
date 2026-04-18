// ============================================================================
// Settings Dialog - 設定モーダル
// ============================================================================

import { useTEMStore } from '../store/store';
import { produce } from 'immer';
import type { TimeArrowSettings, LegendSettings } from '../types';

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const doc = useTEMStore((s) => s.doc);
  const setLayout = useTEMStore((s) => s.setLayout);
  const setLocale = useTEMStore((s) => s.setLocale);
  const setUIFontSize = useTEMStore((s) => s.setUIFontSize);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>設定</h3>
          <button onClick={onClose} className="modal-close">×</button>
        </div>
        <div className="modal-body">
          <section className="settings-section">
            <h4>全体</h4>
            <div className="setting-row">
              <label>レイアウト</label>
              <select
                value={doc.settings.layout}
                onChange={(e) => setLayout(e.target.value as 'horizontal' | 'vertical')}
              >
                <option value="horizontal">横型</option>
                <option value="vertical">縦型</option>
              </select>
            </div>
            <div className="setting-row">
              <label>言語</label>
              <select
                value={doc.settings.locale}
                onChange={(e) => setLocale(e.target.value as 'ja' | 'en')}
              >
                <option value="ja">日本語</option>
                <option value="en">English</option>
              </select>
            </div>
            <div className="setting-row">
              <label>UI フォントサイズ（px）</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="range"
                  min={10}
                  max={40}
                  value={doc.settings.uiFontSize}
                  onChange={(e) => setUIFontSize(Number(e.target.value))}
                  style={{ width: 120 }}
                />
                <input
                  type="number"
                  min={10}
                  max={40}
                  value={doc.settings.uiFontSize}
                  onChange={(e) => setUIFontSize(Number(e.target.value))}
                  style={{ width: 50 }}
                />
              </div>
            </div>
          </section>

          <section className="settings-section">
            <h4>既定のBoxサイズ</h4>
            <div className="setting-row">
              <label>幅（px）</label>
              <input
                type="number"
                value={doc.settings.defaultBoxSize.width}
                readOnly
                style={{ width: 80 }}
              />
            </div>
            <div className="setting-row">
              <label>高さ（px）</label>
              <input
                type="number"
                value={doc.settings.defaultBoxSize.height}
                readOnly
                style={{ width: 80 }}
              />
            </div>
            <p className="hint">※ 今後のアップデートで変更可能にします</p>
          </section>

          <section className="settings-section">
            <h4>フォント</h4>
            <div className="setting-row">
              <label>既定フォント</label>
              <input type="text" value={doc.settings.defaultFont} readOnly style={{ width: 180 }} />
            </div>
            <div className="setting-row">
              <label>既定サイズ（pt）</label>
              <input type="number" value={doc.settings.defaultFontSize} readOnly style={{ width: 80 }} />
            </div>
          </section>

          <section className="settings-section">
            <h4>スナップ</h4>
            <div className="setting-row">
              <label>整列ガイド</label>
              <input type="checkbox" checked={doc.settings.snap.alignGuides} readOnly />
            </div>
            <div className="setting-row">
              <label>距離スナップ（px）</label>
              <input type="number" value={doc.settings.snap.distancePx} readOnly style={{ width: 60 }} />
            </div>
            <div className="setting-row">
              <label>グリッド（px）</label>
              <input type="number" value={doc.settings.snap.gridPx} readOnly style={{ width: 60 }} />
            </div>
            <p className="hint">※ 詳細設定はPhase 2後半で実装</p>
          </section>

          <TimeArrowSettingsSection />

          <LegendSettingsSection />

          <section className="settings-section">
            <h4>時期ラベル</h4>
            <div className="setting-row">
              <label>日本語</label>
              <input type="text" value={doc.settings.timelineLabel.ja} readOnly style={{ width: 180 }} />
            </div>
            <div className="setting-row">
              <label>English</label>
              <input type="text" value={doc.settings.timelineLabel.en} readOnly style={{ width: 180 }} />
            </div>
          </section>

          <section className="settings-section">
            <h4>プロジェクト情報</h4>
            <div className="setting-row">
              <label>タイトル</label>
              <input type="text" value={doc.metadata.title} readOnly style={{ width: 200 }} />
            </div>
            <div className="setting-row">
              <label>作成日</label>
              <input type="text" value={new Date(doc.metadata.createdAt).toLocaleString('ja-JP')} readOnly style={{ width: 200 }} />
            </div>
            <div className="setting-row">
              <label>編集履歴</label>
              <span style={{ fontSize: 12, color: '#666' }}>
                {doc.history.length}/50件
              </span>
            </div>
          </section>
        </div>
        <div className="modal-footer">
          <button className="ribbon-btn-primary" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}

function LegendSettingsSection() {
  const doc = useTEMStore((s) => s.doc);
  const lg = doc.settings.legend;

  const update = (patch: Partial<LegendSettings>) => {
    useTEMStore.setState((state) => ({
      doc: produce(state.doc, (d) => {
        d.settings.legend = { ...d.settings.legend, ...patch };
      }),
    }));
  };

  return (
    <section className="settings-section">
      <h4>凡例</h4>
      <div className="setting-row">
        <label>自動生成（使用記号を抽出）</label>
        <input type="checkbox" checked={lg.autoGenerate} onChange={(e) => update({ autoGenerate: e.target.checked })} />
      </div>
      <div className="setting-row">
        <label>編集中も表示</label>
        <input type="checkbox" checked={lg.alwaysVisible} onChange={(e) => update({ alwaysVisible: e.target.checked })} />
      </div>
      <div className="setting-row">
        <label>エクスポートに含める</label>
        <input type="checkbox" checked={lg.includeInExport} onChange={(e) => update({ includeInExport: e.target.checked })} />
      </div>
      <div className="setting-row">
        <label>Box 種別を含む</label>
        <input type="checkbox" checked={lg.includeBoxes} onChange={(e) => update({ includeBoxes: e.target.checked })} />
      </div>
      <div className="setting-row">
        <label>Line 種別を含む</label>
        <input type="checkbox" checked={lg.includeLines} onChange={(e) => update({ includeLines: e.target.checked })} />
      </div>
      <div className="setting-row">
        <label>SD/SG を含む</label>
        <input type="checkbox" checked={lg.includeSDSG} onChange={(e) => update({ includeSDSG: e.target.checked })} />
      </div>
      <div className="setting-row">
        <label>非可逆的時間を含む</label>
        <input type="checkbox" checked={lg.includeTimeArrow} onChange={(e) => update({ includeTimeArrow: e.target.checked })} />
      </div>
      <div className="setting-row">
        <label>タイトル</label>
        <input type="text" value={lg.title} onChange={(e) => update({ title: e.target.value })} style={{ width: 140 }} />
      </div>
      <div className="setting-row">
        <label>フォントサイズ</label>
        <input
          type="number"
          min={8}
          max={30}
          value={lg.fontSize}
          onChange={(e) => update({ fontSize: Number(e.target.value) })}
          style={{ width: 70 }}
        />
      </div>
      <div className="setting-row">
        <label>最小幅 (px)</label>
        <input
          type="number"
          min={100}
          max={500}
          value={lg.minWidth}
          onChange={(e) => update({ minWidth: Number(e.target.value) })}
          style={{ width: 70 }}
        />
      </div>
      <p className="hint">凡例はキャンバス上でドラッグして位置調整できます</p>
    </section>
  );
}

function TimeArrowSettingsSection() {
  const doc = useTEMStore((s) => s.doc);
  const ta = doc.settings.timeArrow;

  const update = (patch: Partial<TimeArrowSettings>) => {
    useTEMStore.setState((state) => ({
      doc: produce(state.doc, (d) => {
        d.settings.timeArrow = { ...d.settings.timeArrow, ...patch };
      }),
    }));
  };

  return (
    <section className="settings-section">
      <h4>非可逆的時間矢印</h4>
      <div className="setting-row">
        <label>エクスポート時に自動挿入</label>
        <input
          type="checkbox"
          checked={ta.autoInsert}
          onChange={(e) => update({ autoInsert: e.target.checked })}
        />
      </div>
      <div className="setting-row">
        <label>編集中も常時表示</label>
        <input
          type="checkbox"
          checked={ta.alwaysVisible}
          onChange={(e) => update({ alwaysVisible: e.target.checked })}
        />
      </div>
      <div className="setting-row">
        <label>開始レベル拡張（minTimeLevel に加算）</label>
        <input
          type="number"
          step="0.5"
          value={ta.timeStartExtension}
          onChange={(e) => update({ timeStartExtension: Number(e.target.value) })}
          style={{ width: 70 }}
        />
      </div>
      <div className="setting-row">
        <label>終了レベル拡張（maxTimeLevel に加算）</label>
        <input
          type="number"
          step="0.5"
          value={ta.timeEndExtension}
          onChange={(e) => update({ timeEndExtension: Number(e.target.value) })}
          style={{ width: 70 }}
        />
      </div>
      <div className="setting-row">
        <label>Item軸の基準</label>
        <select
          value={ta.itemReference}
          onChange={(e) => update({ itemReference: e.target.value as 'min' | 'max' })}
        >
          <option value="min">最小Item_Level（上側）</option>
          <option value="max">最大Item_Level（下側）</option>
        </select>
      </div>
      <div className="setting-row">
        <label>基準からのオフセット（±レベル）</label>
        <input
          type="number"
          step="0.5"
          value={ta.itemOffset}
          onChange={(e) => update({ itemOffset: Number(e.target.value) })}
          style={{ width: 70 }}
        />
      </div>
      <div className="setting-row">
        <label>ラベル</label>
        <input
          type="text"
          value={ta.label}
          onChange={(e) => update({ label: e.target.value })}
          style={{ width: 180 }}
        />
      </div>
      <div className="setting-row">
        <label>線の太さ (pt)</label>
        <input
          type="number"
          min={0.5}
          step="0.5"
          value={ta.strokeWidth}
          onChange={(e) => update({ strokeWidth: Number(e.target.value) })}
          style={{ width: 70 }}
        />
      </div>
      <div className="setting-row">
        <label>フォントサイズ</label>
        <input
          type="number"
          min={8}
          max={40}
          value={ta.fontSize}
          onChange={(e) => update({ fontSize: Number(e.target.value) })}
          style={{ width: 70 }}
        />
      </div>
    </section>
  );
}
