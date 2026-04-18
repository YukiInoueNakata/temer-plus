// ============================================================================
// Settings Dialog - 設定モーダル
// ============================================================================

import { useTEMStore } from '../store/store';

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

          <section className="settings-section">
            <h4>時間軸</h4>
            <div className="setting-row">
              <label>自動挿入</label>
              <input type="checkbox" checked={doc.settings.timelineAutoInsert} readOnly />
            </div>
            <div className="setting-row">
              <label>日本語ラベル</label>
              <input type="text" value={doc.settings.timelineLabel.ja} readOnly style={{ width: 180 }} />
            </div>
            <div className="setting-row">
              <label>英語ラベル</label>
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
