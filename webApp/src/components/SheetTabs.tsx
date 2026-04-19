// ============================================================================
// SheetTabs - Excel風シートタブ（右クリックメニュー付き）
// ============================================================================

import { useState, useEffect, useRef } from 'react';
import { useTEMStore } from '../store/store';

interface ContextMenuState {
  x: number;
  y: number;
  sheetId: string;
  sheetName: string;
}

export function SheetTabs() {
  const sheets = useTEMStore((s) => s.doc.sheets);
  const activeSheetId = useTEMStore((s) => s.doc.activeSheetId);
  const setActive = useTEMStore((s) => s.setActiveSheet);
  const addSheet = useTEMStore((s) => s.addSheet);
  const removeSheet = useTEMStore((s) => s.removeSheet);
  const renameSheet = useTEMStore((s) => s.renameSheet);
  const duplicateSheet = useTEMStore((s) => s.duplicateSheet);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const handleRename = (id: string, currentName: string) => {
    const newName = prompt('シート名を変更', currentName);
    if (newName && newName !== currentName) renameSheet(id, newName);
  };

  const handleDelete = (id: string) => {
    if (sheets.length <= 1) {
      alert('最後のシートは削除できません');
      return;
    }
    if (confirm('このシートを削除しますか？（取り消せません）')) removeSheet(id);
  };

  const handleContextMenu = (e: React.MouseEvent, id: string, name: string) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, sheetId: id, sheetName: name });
  };

  return (
    <>
      <div className="sheet-tabs">
        {sheets.map((sheet) => (
          <div
            key={sheet.id}
            className={`sheet-tab ${sheet.id === activeSheetId ? 'active' : ''}`}
            onClick={() => setActive(sheet.id)}
            onDoubleClick={() => handleRename(sheet.id, sheet.name)}
            onContextMenu={(e) => handleContextMenu(e, sheet.id, sheet.name)}
            title="右クリックで操作メニュー"
          >
            {sheet.name}
          </div>
        ))}
        <button className="sheet-add" onClick={() => addSheet()} title="新規シート">+</button>
      </div>

      {menu && (
        <SheetContextMenu
          menu={menu}
          onClose={() => setMenu(null)}
          actions={{
            rename: () => handleRename(menu.sheetId, menu.sheetName),
            duplicate: () => duplicateSheet(menu.sheetId),
            delete: () => handleDelete(menu.sheetId),
            moveLeft: () => moveSheet(menu.sheetId, -1),
            moveRight: () => moveSheet(menu.sheetId, 1),
          }}
          canDelete={sheets.length > 1}
        />
      )}
    </>
  );

  function moveSheet(id: string, delta: number) {
    const state = useTEMStore.getState();
    const arr = [...state.doc.sheets];
    const idx = arr.findIndex((s) => s.id === id);
    const newIdx = idx + delta;
    if (idx < 0 || newIdx < 0 || newIdx >= arr.length) return;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    state.reorderSheets(arr.map((s) => s.id));
  }
}

function SheetContextMenu({
  menu,
  onClose,
  actions,
  canDelete,
}: {
  menu: ContextMenuState;
  onClose: () => void;
  actions: {
    rename: () => void;
    duplicate: () => void;
    delete: () => void;
    moveLeft: () => void;
    moveRight: () => void;
  };
  canDelete: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [adj, setAdj] = useState<{ x: number; y: number } | null>(null);

  // メニューの実サイズを測って画面外にはみ出さないよう補正
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const margin = 8;
    const maxX = window.innerWidth - rect.width - margin;
    const maxY = window.innerHeight - rect.height - margin;
    let nx = menu.x;
    let ny = menu.y;
    if (nx > maxX) nx = Math.max(margin, maxX);
    if (ny > maxY) ny = Math.max(margin, maxY);
    if (nx !== menu.x || ny !== menu.y) setAdj({ x: nx, y: ny });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu.x, menu.y]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    setTimeout(() => {
      window.addEventListener('mousedown', onDoc);
      window.addEventListener('keydown', onEsc);
    }, 0);
    return () => {
      window.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);

  const run = (fn: () => void) => {
    fn();
    onClose();
  };

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ position: 'fixed', left: adj?.x ?? menu.x, top: adj?.y ?? menu.y, zIndex: 2000 }}
    >
      <div className="context-menu-header">{menu.sheetName}</div>
      <button className="context-menu-item" onClick={() => run(actions.rename)}>名前を変更</button>
      <button className="context-menu-item" onClick={() => run(actions.duplicate)}>複製</button>
      <div className="context-menu-separator" />
      <button className="context-menu-item" onClick={() => run(actions.moveLeft)}>← 左へ移動</button>
      <button className="context-menu-item" onClick={() => run(actions.moveRight)}>→ 右へ移動</button>
      <div className="context-menu-separator" />
      <button
        className="context-menu-item danger"
        onClick={() => run(actions.delete)}
        disabled={!canDelete}
        title={!canDelete ? '最後のシートは削除できません' : ''}
      >
        削除
      </button>
    </div>
  );
}
