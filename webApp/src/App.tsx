import { useState, useEffect } from 'react';
import { Ribbon } from './components/Ribbon';
import { Canvas } from './components/Canvas';
import { DataSheet } from './components/DataSheet';
import { PropertyPanel } from './components/PropertyPanel';
import { SheetTabs } from './components/SheetTabs';
import { StatusBar } from './components/StatusBar';
import { SettingsDialog } from './components/SettingsDialog';
import { InsertBetweenDialog } from './components/InsertBetweenDialog';
import { useTEMStore } from './store/store';
import './App.css';

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [insertBetweenOpen, setInsertBetweenOpen] = useState(false);
  const uiFontSize = useTEMStore((s) => s.doc.settings.uiFontSize);

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-font-size', `${uiFontSize}px`);
    document.documentElement.style.fontSize = `${uiFontSize}px`;
    document.body.style.fontSize = `${uiFontSize}px`;
  }, [uiFontSize]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const store = useTEMStore.getState();
      const temporal = useTEMStore.temporal.getState();
      const target = e.target as HTMLElement;
      const isEditing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === 's') { e.preventDefault(); alert('保存機能は次のPhaseで実装'); return; }
      if (ctrl && !e.shiftKey && e.key === 'z') { e.preventDefault(); temporal.undo(); return; }
      if ((ctrl && e.shiftKey && e.key === 'z') || (ctrl && e.key === 'y')) { e.preventDefault(); temporal.redo(); return; }
      if (ctrl && e.key === 'a' && !isEditing) { e.preventDefault(); store.selectAll(); return; }
      if (ctrl && e.key === 'c' && !isEditing) { e.preventDefault(); store.copyToClipboard(); return; }
      if (ctrl && e.key === 'v' && !isEditing) { e.preventDefault(); store.pasteFromClipboard(); return; }
      if (ctrl && e.key === 'd' && !isEditing) { e.preventDefault(); store.copyToClipboard(); store.pasteFromClipboard(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditing) {
        e.preventDefault();
        const sel = store.selection;
        if (sel.boxIds.length > 0) store.removeBoxes(sel.boxIds);
        if (sel.lineIds.length > 0) store.removeLines(sel.lineIds);
        return;
      }
      if (ctrl && e.key === 'n' && !isEditing) {
        e.preventDefault();
        if (confirm('現在の編集内容を破棄して新規作成しますか？')) store.resetDocument();
        return;
      }
      if (ctrl && e.shiftKey && e.key === 'T') { e.preventDefault(); store.addSheet(); return; }
      if (e.key === 'Escape' && !isEditing) { store.clearSelection(); return; }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="app" style={{ fontSize: uiFontSize }}>
      <Ribbon
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenInsertBetween={() => setInsertBetweenOpen(true)}
      />
      <div className="main">
        <DataSheet />
        <div className="canvas-wrapper">
          <Canvas />
        </div>
        <PropertyPanel />
      </div>
      <SheetTabs />
      <StatusBar />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <InsertBetweenDialog open={insertBetweenOpen} onClose={() => setInsertBetweenOpen(false)} />
    </div>
  );
}
