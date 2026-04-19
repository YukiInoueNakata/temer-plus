import { useState, useEffect, useRef } from 'react';
import { Ribbon } from './components/Ribbon';
import { Canvas } from './components/Canvas';
import { DataSheet } from './components/DataSheet';
import { PropertyPanel } from './components/PropertyPanel';
import { SheetTabs } from './components/SheetTabs';
import { StatusBar } from './components/StatusBar';
import { SettingsDialog } from './components/SettingsDialog';
import { InsertBetweenDialog } from './components/InsertBetweenDialog';
import { PeriodLabelsDialog } from './components/PeriodLabelsDialog';
import { ExportDialog } from './components/ExportDialog';
import { useTEMStore } from './store/store';
import {
  saveToFile,
  loadFromFile,
  saveAutoBackup,
  loadAutoBackup,
  clearAutoBackup,
  BACKUP_INTERVAL_MS,
} from './utils/fileIO';
import './App.css';

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<string | undefined>(undefined);
  const [exportOpen, setExportOpen] = useState(false);
  const openSettings = (tab?: string) => {
    setSettingsInitialTab(tab);
    setSettingsOpen(true);
  };
  const [insertBetweenOpen, setInsertBetweenOpen] = useState(false);
  const [periodLabelsOpen, setPeriodLabelsOpen] = useState(false);
  const [restoreChecked, setRestoreChecked] = useState(false);
  const uiFontSize = useTEMStore((s) => s.doc.settings.uiFontSize);
  const fileHandleRef = useRef<unknown>(null);

  // UI全体のフォントサイズをCSS変数に反映
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-font-size', `${uiFontSize}px`);
    document.documentElement.style.fontSize = `${uiFontSize}px`;
    document.body.style.fontSize = `${uiFontSize}px`;
  }, [uiFontSize]);

  // 起動時: IndexedDB バックアップを検出して復元確認
  useEffect(() => {
    if (restoreChecked) return;
    (async () => {
      try {
        const backup = await loadAutoBackup();
        if (backup) {
          const savedAt = new Date(backup.meta.savedAt).toLocaleString('ja-JP');
          const confirmed = confirm(
            `前回保存されていないTEM図が見つかりました。\n` +
            `タイトル: ${backup.meta.title}\n` +
            `自動保存日時: ${savedAt}\n\n` +
            `復元しますか？\n` +
            `[OK] 復元する\n` +
            `[キャンセル] 破棄して新規作成`
          );
          if (confirmed) {
            useTEMStore.getState().loadDocument(backup.doc);
          } else {
            await clearAutoBackup();
          }
        }
      } catch (e) {
        console.error('Autobackup check failed:', e);
      } finally {
        setRestoreChecked(true);
      }
    })();
  }, [restoreChecked]);

  // IndexedDB 自動バックアップ（30秒ごと、dirty時のみ）
  useEffect(() => {
    if (!restoreChecked) return;
    const interval = setInterval(async () => {
      const state = useTEMStore.getState();
      if (state.dirty) {
        try {
          await saveAutoBackup(state.doc);
        } catch (e) {
          console.error('Auto-backup failed:', e);
        }
      }
    }, BACKUP_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [restoreChecked]);

  // File save handler
  const handleSave = async () => {
    const doc = useTEMStore.getState().doc;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = await saveToFile(doc, fileHandleRef.current as any);
    if (handle !== null || !('showSaveFilePicker' in window)) {
      useTEMStore.getState().markSaved();
      await clearAutoBackup();
      if (handle) fileHandleRef.current = handle;
    }
  };

  // File save-as handler
  const handleSaveAs = async () => {
    const doc = useTEMStore.getState().doc;
    const handle = await saveToFile(doc, null);
    if (handle !== null || !('showSaveFilePicker' in window)) {
      useTEMStore.getState().markSaved();
      await clearAutoBackup();
      if (handle) fileHandleRef.current = handle;
    }
  };

  // File open handler
  const handleOpen = async () => {
    const state = useTEMStore.getState();
    if (state.dirty) {
      const ok = confirm('未保存の変更があります。破棄して開きますか？');
      if (!ok) return;
    }
    try {
      const result = await loadFromFile();
      if (result) {
        state.loadDocument(result.doc);
        fileHandleRef.current = result.handle;
      }
    } catch (e) {
      alert('ファイルの読み込みに失敗しました: ' + (e as Error).message);
    }
  };

  // 新規作成
  const handleNew = () => {
    const state = useTEMStore.getState();
    if (state.dirty) {
      const ok = confirm('未保存の変更があります。破棄して新規作成しますか？');
      if (!ok) return;
    }
    state.resetDocument();
    fileHandleRef.current = null;
    clearAutoBackup();
  };

  // キーボードショートカット
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

      if (ctrl && !e.shiftKey && e.key === 's') { e.preventDefault(); handleSave(); return; }
      if (ctrl && e.shiftKey && e.key === 'S') { e.preventDefault(); handleSaveAs(); return; }
      if (ctrl && e.key === 'o') { e.preventDefault(); handleOpen(); return; }
      if (ctrl && !e.shiftKey && e.key === 'n') {
        if (isEditing) return;
        e.preventDefault();
        handleNew();
        return;
      }
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
        if (sel.sdsgIds.length > 0) sel.sdsgIds.forEach((id) => store.removeSDSG(id));
        return;
      }
      if (ctrl && e.shiftKey && e.key === 'T') { e.preventDefault(); store.addSheet(); return; }
      if (e.key === 'Escape' && !isEditing) { store.clearSelection(); return; }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 未保存時のブラウザ離脱警告
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const state = useTEMStore.getState();
      if (state.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return (
    <div className="app" style={{ fontSize: uiFontSize }}>
      <Ribbon
        onOpenSettings={() => openSettings()}
        onOpenInsertBetween={() => setInsertBetweenOpen(true)}
        onOpenPeriodLabels={() => setPeriodLabelsOpen(true)}
        onOpenExport={() => setExportOpen(true)}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onOpen={handleOpen}
        onNew={handleNew}
      />
      <div className="main">
        <DataSheet />
        <div className="canvas-wrapper">
          <Canvas onOpenLegendSettings={() => openSettings('legend')} />
        </div>
        <PropertyPanel />
      </div>
      <SheetTabs />
      <StatusBar />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialTab={settingsInitialTab}
      />
      <InsertBetweenDialog open={insertBetweenOpen} onClose={() => setInsertBetweenOpen(false)} />
      <PeriodLabelsDialog open={periodLabelsOpen} onClose={() => setPeriodLabelsOpen(false)} />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}
