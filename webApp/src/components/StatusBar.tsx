// ============================================================================
// StatusBar - Bottom bar with current state info
// ============================================================================

import { useTEMStore } from '../store/store';

export function StatusBar() {
  const view = useTEMStore((s) => s.view);
  const selection = useTEMStore((s) => s.selection);
  const dirty = useTEMStore((s) => s.dirty);
  const layout = useTEMStore((s) => s.doc.settings.layout);

  const totalSelected =
    selection.boxIds.length +
    selection.lineIds.length +
    selection.sdsgIds.length +
    selection.noteIds.length;

  return (
    <div className="status-bar">
      <span>ズーム: {Math.round(view.zoom * 100)}%</span>
      <span>グリッド: {view.showGrid ? 'ON' : 'OFF'}</span>
      <span>スナップ: {view.snapEnabled ? 'ON' : 'OFF'}</span>
      <span>レイアウト: {layout === 'horizontal' ? '横型' : '縦型'}</span>
      <span>選択: {totalSelected}</span>
      <div style={{ flex: 1 }} />
      {dirty && <span className="dirty">● 未保存</span>}
      {!dirty && <span className="saved">✓ 保存済み</span>}
    </div>
  );
}
