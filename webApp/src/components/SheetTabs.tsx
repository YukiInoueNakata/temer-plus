// ============================================================================
// SheetTabs - Excel-style bottom tabs for multiple TEM figures
// ============================================================================

import { useTEMStore } from '../store/store';

export function SheetTabs() {
  const sheets = useTEMStore((s) => s.doc.sheets);
  const activeSheetId = useTEMStore((s) => s.doc.activeSheetId);
  const setActive = useTEMStore((s) => s.setActiveSheet);
  const addSheet = useTEMStore((s) => s.addSheet);
  const removeSheet = useTEMStore((s) => s.removeSheet);
  const renameSheet = useTEMStore((s) => s.renameSheet);
  const duplicateSheet = useTEMStore((s) => s.duplicateSheet);

  const handleRename = (id: string, currentName: string) => {
    const newName = prompt('シート名を変更', currentName);
    if (newName && newName !== currentName) renameSheet(id, newName);
  };

  const handleDelete = (id: string) => {
    if (sheets.length <= 1) {
      alert('最後のシートは削除できません');
      return;
    }
    if (confirm('このシートを削除しますか?')) removeSheet(id);
  };

  const handleContextMenu = (e: React.MouseEvent, id: string, name: string) => {
    e.preventDefault();
    const action = prompt('アクション: rename / duplicate / delete', 'rename');
    if (action === 'rename') handleRename(id, name);
    else if (action === 'duplicate') duplicateSheet(id);
    else if (action === 'delete') handleDelete(id);
  };

  return (
    <div className="sheet-tabs">
      {sheets.map((sheet) => (
        <div
          key={sheet.id}
          className={`sheet-tab ${sheet.id === activeSheetId ? 'active' : ''}`}
          onClick={() => setActive(sheet.id)}
          onDoubleClick={() => handleRename(sheet.id, sheet.name)}
          onContextMenu={(e) => handleContextMenu(e, sheet.id, sheet.name)}
        >
          {sheet.name}
        </div>
      ))}
      <button className="sheet-add" onClick={() => addSheet()}>+</button>
    </div>
  );
}
