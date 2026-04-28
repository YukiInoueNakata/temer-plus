// ============================================================================
// CommandPalette - Ctrl+K で開く全コマンド検索パレット
// Ribbon の主要機能をテキスト検索で発見・実行できる
// ============================================================================

import { useEffect, useRef, useState, useMemo } from 'react';
import { useTEMStore } from '../store/store';
import type { BoxType, SDSGType } from '../types';
import { pickBetweenAnchors } from '../utils/sdsgBetween';

export interface CommandPaletteCallbacks {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onOpenSettings: (initialTab?: string) => void;
  onOpenExport: () => void;
  onOpenInsertBetween: () => void;
  onOpenPeriodLabels: () => void;
  onOpenPaperReport: () => void;
  onOpenResize: () => void;
  onOpenCSVImport: () => void;
  onOpenShiftContent: () => void;
}

type Category = 'file' | 'edit' | 'insert' | 'view' | 'align' | 'export' | 'tools' | 'help';

interface Command {
  id: string;
  label: string;
  keywords: string;
  category: Category;
  shortcut?: string;
  run: () => void;
}

const CATEGORY_LABELS: Record<Category, string> = {
  file: 'ファイル',
  edit: '編集',
  insert: '挿入',
  view: '表示',
  align: '整列・サイズ',
  export: '出力',
  tools: 'ツール',
  help: 'ヘルプ',
};

export function CommandPalette({
  open,
  onClose,
  callbacks,
}: {
  open: boolean;
  onClose: () => void;
  callbacks: CommandPaletteCallbacks;
}) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const commands = useCommands(callbacks);

  // open 状態リセット
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // 次の tick で focus (DOM mount 後)
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      c.label.toLowerCase().includes(q)
      || c.keywords.toLowerCase().includes(q)
      || CATEGORY_LABELS[c.category].toLowerCase().includes(q),
    );
  }, [commands, query]);

  // active index を範囲内にクランプ
  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(Math.max(0, filtered.length - 1));
  }, [filtered.length, activeIndex]);

  // 選択行を画面内にスクロール
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector(`[data-cmd-idx="${activeIndex}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[activeIndex];
      if (cmd) {
        cmd.run();
        onClose();
      }
      return;
    }
  };

  // カテゴリごとにグループ化
  const grouped = filtered.reduce<Record<string, Command[]>>((acc, c) => {
    (acc[c.category] ??= []).push(c);
    return acc;
  }, {});
  const orderedCategories: Category[] = ['file', 'edit', 'insert', 'view', 'align', 'export', 'tools', 'help'];

  let runningIdx = 0;
  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{ alignItems: 'flex-start', paddingTop: 80 }}
    >
      <div
        className="command-palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-label="コマンドパレット"
      >
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
          placeholder="コマンドを検索 (例: 保存, 整列, グリッド, 凡例)"
          className="command-palette-input"
        />
        <div className="command-palette-list" ref={listRef}>
          {filtered.length === 0 && (
            <div className="command-palette-empty">該当するコマンドがありません</div>
          )}
          {orderedCategories.map((cat) => {
            const items = grouped[cat];
            if (!items || items.length === 0) return null;
            return (
              <div key={cat}>
                <div className="command-palette-category">{CATEGORY_LABELS[cat]}</div>
                {items.map((cmd) => {
                  const idx = runningIdx++;
                  const active = idx === activeIndex;
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      data-cmd-idx={idx}
                      className={active ? 'command-palette-item active' : 'command-palette-item'}
                      onClick={() => { cmd.run(); onClose(); }}
                      onMouseEnter={() => setActiveIndex(idx)}
                    >
                      <span className="command-palette-item-label">{cmd.label}</span>
                      {cmd.shortcut && (
                        <span className="command-palette-item-shortcut">{cmd.shortcut}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="command-palette-footer">
          <span>↑↓ 選択</span>
          <span>Enter 実行</span>
          <span>Esc 閉じる</span>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// コマンド定義
// ----------------------------------------------------------------------------

function useCommands(callbacks: CommandPaletteCallbacks): Command[] {
  // Store actions を hook で取得
  const view = useTEMStore((s) => s.view);
  const toggleGrid = useTEMStore((s) => s.toggleGrid);
  const toggleSnap = useTEMStore((s) => s.toggleSnap);
  const togglePaperGuides = useTEMStore((s) => s.togglePaperGuides);
  const toggleBoxIds = useTEMStore((s) => s.toggleBoxIds);
  const toggleSDSGIds = useTEMStore((s) => s.toggleSDSGIds);
  const toggleLineIds = useTEMStore((s) => s.toggleLineIds);
  const toggleAllIds = useTEMStore((s) => s.toggleAllIds);
  const toggleTopRuler = useTEMStore((s) => s.toggleTopRuler);
  const toggleLeftRuler = useTEMStore((s) => s.toggleLeftRuler);
  const toggleLegend = useTEMStore((s) => s.toggleLegend);
  const requestFit = useTEMStore((s) => s.requestFit);

  return useMemo(() => {
    const store = useTEMStore.getState;
    const temporal = useTEMStore.temporal.getState;

    const cmds: Command[] = [
      // === File ===
      { id: 'file.new', label: '新規作成', keywords: 'new file 新規 ファイル', category: 'file', shortcut: 'Ctrl+N',
        run: callbacks.onNew },
      { id: 'file.open', label: '開く...', keywords: 'open file 開く 読み込み load', category: 'file', shortcut: 'Ctrl+O',
        run: callbacks.onOpen },
      { id: 'file.save', label: '保存', keywords: 'save file 保存', category: 'file', shortcut: 'Ctrl+S',
        run: callbacks.onSave },
      { id: 'file.save-as', label: '名前を付けて保存...', keywords: 'save as 名前 保存', category: 'file', shortcut: 'Ctrl+Shift+S',
        run: callbacks.onSaveAs },

      // === Edit ===
      { id: 'edit.undo', label: '元に戻す', keywords: 'undo 元に戻す', category: 'edit', shortcut: 'Ctrl+Z',
        run: () => temporal().undo() },
      { id: 'edit.redo', label: 'やり直し', keywords: 'redo やり直し', category: 'edit', shortcut: 'Ctrl+Y',
        run: () => temporal().redo() },
      { id: 'edit.select-all', label: '全選択', keywords: 'select all 全選択', category: 'edit', shortcut: 'Ctrl+A',
        run: () => store().selectAll() },
      { id: 'edit.copy', label: 'コピー', keywords: 'copy コピー clipboard', category: 'edit', shortcut: 'Ctrl+C',
        run: () => store().copyToClipboard() },
      { id: 'edit.paste', label: '貼り付け', keywords: 'paste 貼り付け clipboard', category: 'edit', shortcut: 'Ctrl+V',
        run: () => store().pasteFromClipboard() },
      { id: 'edit.duplicate', label: '複製', keywords: 'duplicate 複製 copy', category: 'edit', shortcut: 'Ctrl+D',
        run: () => { store().copyToClipboard(); store().pasteFromClipboard(); } },
      { id: 'edit.delete', label: '削除 (選択中)', keywords: 'delete 削除', category: 'edit', shortcut: 'Delete',
        run: () => {
          const sel = store().selection;
          if (sel.boxIds.length > 0) store().removeBoxes(sel.boxIds);
          if (sel.lineIds.length > 0) store().removeLines(sel.lineIds);
          if (sel.sdsgIds.length > 0) sel.sdsgIds.forEach((id) => store().removeSDSG(id));
        } },
      { id: 'edit.clear-sel', label: '選択を解除', keywords: 'clear selection 選択解除', category: 'edit', shortcut: 'Esc',
        run: () => store().clearSelection() },
      { id: 'edit.fit-to-label-both', label: 'Box を文字に合わせる (幅・高さ)', keywords: 'fit label 文字 サイズ', category: 'edit',
        run: () => {
          const ids = store().selection.boxIds;
          if (ids.length === 0) { alert('Box を選択してください'); return; }
          store().fitBoxesToLabel(ids, 'both');
        } },
      { id: 'edit.fit-to-label-w', label: 'Box 幅を文字に合わせる', keywords: 'fit width label 幅', category: 'edit',
        run: () => {
          const ids = store().selection.boxIds;
          if (ids.length === 0) { alert('Box を選択してください'); return; }
          store().fitBoxesToLabel(ids, 'width');
        } },
      { id: 'edit.fit-to-label-h', label: 'Box 高さを文字に合わせる', keywords: 'fit height label 高さ', category: 'edit',
        run: () => {
          const ids = store().selection.boxIds;
          if (ids.length === 0) { alert('Box を選択してください'); return; }
          store().fitBoxesToLabel(ids, 'height');
        } },

      // === Insert ===
      ...(['normal', 'BFP', 'OPP', 'EFP', 'P-EFP', '2nd-EFP', 'P-2nd-EFP', 'annotation'] as BoxType[]).map((type): Command => ({
        id: `insert.box.${type}`,
        label: `Box: ${type} を追加`,
        keywords: `insert box add ${type} ${type === 'normal' ? '通常' : ''}`,
        category: 'insert',
        run: () => store().addBox({ type }),
      })),
      ...(['SD', 'SG'] as SDSGType[]).map((type): Command => ({
        id: `insert.sdsg.${type}`,
        label: `${type} を追加 (1個=single / 2個以上=between)`,
        keywords: `insert sdsg add ${type} between`,
        category: 'insert',
        run: () => {
          const st = store();
          const sel = st.selection;
          const sheet = st.doc.sheets.find((s) => s.id === st.doc.activeSheetId);
          const isH = st.doc.settings.layout === 'horizontal';
          if (sel.boxIds.length === 0 && sel.lineIds.length === 0) {
            alert('Box か Line を選択してください'); return;
          }
          if (sel.boxIds.length === 0) {
            st.addSDSG({ type, attachedTo: sel.lineIds[0], label: type });
            return;
          }
          if (sel.boxIds.length === 1) {
            st.addSDSG({ type, attachedTo: sel.boxIds[0], label: type });
            return;
          }
          if (!sheet) return;
          const selectedBoxes = sheet.boxes.filter((b) => sel.boxIds.includes(b.id));
          const pair = pickBetweenAnchors(selectedBoxes, isH);
          if (!pair) return;
          st.addSDSG({
            type,
            attachedTo: pair.lowBoxId,
            attachedTo2: pair.highBoxId,
            anchorMode: 'between',
            betweenMode: 'edge-to-edge',
            label: type,
          });
        },
      })),
      { id: 'insert.line.rline', label: 'Line: RLine (実線) を追加', keywords: 'insert line rline 実線', category: 'insert',
        run: () => {
          const sel = store().selection.boxIds;
          if (sel.length < 2) { alert('Box を 2 つ以上選択してください'); return; }
          for (let i = 0; i < sel.length - 1; i++) store().addLine(sel[i], sel[i + 1], { type: 'RLine' });
        } },
      { id: 'insert.line.xline', label: 'Line: XLine (点線) を追加', keywords: 'insert line xline 点線', category: 'insert',
        run: () => {
          const sel = store().selection.boxIds;
          if (sel.length < 2) { alert('Box を 2 つ以上選択してください'); return; }
          for (let i = 0; i < sel.length - 1; i++) store().addLine(sel[i], sel[i + 1], { type: 'XLine' });
        } },
      { id: 'insert.between', label: '2 選択 Box の間に挿入...', keywords: 'insert between 間 box', category: 'insert',
        run: callbacks.onOpenInsertBetween },
      { id: 'insert.period-labels', label: '時期ラベル...', keywords: 'period label 時期ラベル', category: 'insert',
        run: callbacks.onOpenPeriodLabels },

      // === View ===
      { id: 'view.toggle-grid', label: `グリッド: ${view.showGrid ? 'OFF' : 'ON'}`, keywords: 'grid toggle グリッド', category: 'view',
        run: toggleGrid },
      { id: 'view.toggle-snap', label: `スナップ: ${view.snapEnabled ? 'OFF' : 'ON'}`, keywords: 'snap toggle スナップ', category: 'view',
        run: toggleSnap },
      { id: 'view.toggle-paper', label: `用紙枠: ${view.showPaperGuides ? 'OFF' : 'ON'}`, keywords: 'paper guide toggle 用紙枠', category: 'view',
        run: togglePaperGuides },
      { id: 'view.toggle-all-ids', label: `全 ID バッジ: 切替`, keywords: 'id badge toggle ID', category: 'view',
        run: toggleAllIds },
      { id: 'view.toggle-box-ids', label: `Box ID: ${view.showBoxIds ? 'OFF' : 'ON'}`, keywords: 'box id badge', category: 'view',
        run: toggleBoxIds },
      { id: 'view.toggle-sdsg-ids', label: `SDSG ID: ${view.showSDSGIds ? 'OFF' : 'ON'}`, keywords: 'sdsg id badge', category: 'view',
        run: toggleSDSGIds },
      { id: 'view.toggle-line-ids', label: `Line ID: ${view.showLineIds ? 'OFF' : 'ON'}`, keywords: 'line id badge', category: 'view',
        run: toggleLineIds },
      { id: 'view.toggle-top-ruler', label: `上ルーラー: ${view.showTopRuler ? 'OFF' : 'ON'}`, keywords: 'top ruler 上ルーラー', category: 'view',
        run: toggleTopRuler },
      { id: 'view.toggle-left-ruler', label: `左ルーラー: ${view.showLeftRuler ? 'OFF' : 'ON'}`, keywords: 'left ruler 左ルーラー', category: 'view',
        run: toggleLeftRuler },
      { id: 'view.toggle-legend', label: `凡例: ${view.showLegend ? 'OFF' : 'ON'}`, keywords: 'legend toggle 凡例', category: 'view',
        run: toggleLegend },
      { id: 'view.fit-all', label: 'フィット: 全要素', keywords: 'fit zoom view フィット', category: 'view',
        run: () => requestFit('all') },
      { id: 'view.fit-width', label: 'フィット: 幅', keywords: 'fit width 幅', category: 'view',
        run: () => requestFit('width') },
      { id: 'view.fit-height', label: 'フィット: 高さ', keywords: 'fit height 高さ', category: 'view',
        run: () => requestFit('height') },

      // === Align ===
      { id: 'align.left', label: '左揃え', keywords: 'align left 左揃え', category: 'align',
        run: () => alignBoxes('left') },
      { id: 'align.center-h', label: '水平中央揃え', keywords: 'align center horizontal 中央', category: 'align',
        run: () => alignBoxes('center-h') },
      { id: 'align.right', label: '右揃え', keywords: 'align right 右揃え', category: 'align',
        run: () => alignBoxes('right') },
      { id: 'align.top', label: '上揃え', keywords: 'align top 上揃え', category: 'align',
        run: () => alignBoxes('top') },
      { id: 'align.middle', label: '垂直中央揃え', keywords: 'align middle vertical 中央', category: 'align',
        run: () => alignBoxes('middle') },
      { id: 'align.bottom', label: '下揃え', keywords: 'align bottom 下揃え', category: 'align',
        run: () => alignBoxes('bottom') },
      { id: 'align.distribute-h', label: '水平等間隔', keywords: 'align distribute 等間隔', category: 'align',
        run: () => alignBoxes('distribute-h') },
      { id: 'align.match-w', label: '幅を揃える', keywords: 'match width 幅 揃える', category: 'align',
        run: () => matchSize('width') },
      { id: 'align.match-h', label: '高さを揃える', keywords: 'match height 高さ 揃える', category: 'align',
        run: () => matchSize('height') },
      { id: 'align.match-both', label: 'サイズを揃える (幅・高さ)', keywords: 'match size サイズ 揃える', category: 'align',
        run: () => matchSize('both') },
      { id: 'align.match-fontsize', label: '文字サイズを揃える', keywords: 'match font size 文字 揃える', category: 'align',
        run: () => {
          const ids = store().selection.boxIds;
          if (ids.length < 2) { alert('2 つ以上の Box を選択してください'); return; }
          store().matchBoxesFontSize(ids);
        } },

      // === Export ===
      { id: 'export.preview', label: '出力プレビュー...', keywords: 'export preview 出力 PNG SVG PDF PPTX', category: 'export',
        run: callbacks.onOpenExport },
      { id: 'export.paper-report', label: '論文レポート...', keywords: 'paper report 論文 レポート docx', category: 'export',
        run: callbacks.onOpenPaperReport },

      // === Tools / Settings ===
      { id: 'tools.settings', label: '設定を開く...', keywords: 'settings preferences 設定', category: 'tools',
        run: () => callbacks.onOpenSettings() },
      { id: 'tools.settings.general', label: '設定: 全体', keywords: 'settings general 全体 レイアウト 言語', category: 'tools',
        run: () => callbacks.onOpenSettings('general') },
      { id: 'tools.settings.snap', label: '設定: スナップ', keywords: 'settings snap スナップ', category: 'tools',
        run: () => callbacks.onOpenSettings('snap') },
      { id: 'tools.settings.boxstyle', label: '設定: Box スタイル', keywords: 'settings boxstyle Box プリセット', category: 'tools',
        run: () => callbacks.onOpenSettings('boxstyle') },
      { id: 'tools.settings.typelabel', label: '設定: タイプラベル', keywords: 'settings typelabel タイプラベル', category: 'tools',
        run: () => callbacks.onOpenSettings('typelabel') },
      { id: 'tools.settings.timearrow', label: '設定: 非可逆的時間', keywords: 'settings timearrow 時間 矢印', category: 'tools',
        run: () => callbacks.onOpenSettings('timearrow') },
      { id: 'tools.settings.period', label: '設定: 時期区分', keywords: 'settings period 時期', category: 'tools',
        run: () => callbacks.onOpenSettings('period') },
      { id: 'tools.settings.legend', label: '設定: 凡例', keywords: 'settings legend 凡例', category: 'tools',
        run: () => callbacks.onOpenSettings('legend') },
      { id: 'tools.settings.sdsgspace', label: '設定: SD/SG 配置', keywords: 'settings sdsg 帯 band 配置', category: 'tools',
        run: () => callbacks.onOpenSettings('sdsgspace') },
      { id: 'tools.settings.project', label: '設定: プロジェクト', keywords: 'settings project プロジェクト メタデータ 既定値', category: 'tools',
        run: () => callbacks.onOpenSettings('project') },
      { id: 'tools.csv-import', label: 'CSV インポート...', keywords: 'csv import インポート', category: 'tools',
        run: callbacks.onOpenCSVImport },
      { id: 'tools.shift-content', label: 'コンテンツをシフト...', keywords: 'shift content シフト', category: 'tools',
        run: callbacks.onOpenShiftContent },
      { id: 'tools.resize', label: 'リサイズ...', keywords: 'resize リサイズ', category: 'tools',
        run: callbacks.onOpenResize },

      // === Help ===
      { id: 'help.about', label: 'バージョン情報', keywords: 'about version バージョン', category: 'help',
        run: () => alert('TEMer Plus v0.2.0-dev\n著者: 中田友貴\nライセンス: PolyForm Noncommercial 1.0.0') },
    ];

    return cmds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.showGrid, view.snapEnabled, view.showPaperGuides, view.showBoxIds, view.showSDSGIds,
      view.showLineIds, view.showTopRuler, view.showLeftRuler, view.showLegend,
      callbacks, toggleGrid, toggleSnap, togglePaperGuides, toggleBoxIds, toggleSDSGIds, toggleLineIds,
      toggleAllIds, toggleTopRuler, toggleLeftRuler, toggleLegend, requestFit]);
}

// AlignButton (Ribbon.tsx) の整列ロジックを再現
function alignBoxes(type: 'left' | 'center-h' | 'right' | 'top' | 'middle' | 'bottom' | 'distribute-h') {
  const store = useTEMStore.getState();
  const ids = store.selection.boxIds;
  if (ids.length < 2) { alert('2 つ以上の Box を選択してください'); return; }
  const sheet = store.doc.sheets.find((s) => s.id === store.doc.activeSheetId);
  if (!sheet) return;
  const boxes = sheet.boxes.filter((b) => ids.includes(b.id));
  if (boxes.length < 2) return;
  const updateBox = store.updateBox;
  if (type === 'left') {
    const minX = Math.min(...boxes.map((b) => b.x));
    boxes.forEach((b) => updateBox(b.id, { x: minX }));
  } else if (type === 'right') {
    const maxR = Math.max(...boxes.map((b) => b.x + b.width));
    boxes.forEach((b) => updateBox(b.id, { x: maxR - b.width }));
  } else if (type === 'center-h') {
    const centers = boxes.map((b) => b.x + b.width / 2);
    const avg = centers.reduce((a, c) => a + c, 0) / centers.length;
    boxes.forEach((b) => updateBox(b.id, { x: avg - b.width / 2 }));
  } else if (type === 'top') {
    const minY = Math.min(...boxes.map((b) => b.y));
    boxes.forEach((b) => updateBox(b.id, { y: minY }));
  } else if (type === 'bottom') {
    const maxB = Math.max(...boxes.map((b) => b.y + b.height));
    boxes.forEach((b) => updateBox(b.id, { y: maxB - b.height }));
  } else if (type === 'middle') {
    const centers = boxes.map((b) => b.y + b.height / 2);
    const avg = centers.reduce((a, c) => a + c, 0) / centers.length;
    boxes.forEach((b) => updateBox(b.id, { y: avg - b.height / 2 }));
  } else if (type === 'distribute-h') {
    const sorted = [...boxes].sort((a, b) => a.x - b.x);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const totalWidth = last.x + last.width - first.x;
    const gaps = (totalWidth - sorted.reduce((acc, b) => acc + b.width, 0)) / (sorted.length - 1);
    let cur = first.x + first.width + gaps;
    sorted.forEach((b, i) => {
      if (i === 0 || i === sorted.length - 1) return;
      updateBox(b.id, { x: cur });
      cur += b.width + gaps;
    });
  }
}

function matchSize(mode: 'width' | 'height' | 'both') {
  const store = useTEMStore.getState();
  const ids = store.selection.boxIds;
  if (ids.length < 2) { alert('2 つ以上の Box を選択してください'); return; }
  store.matchBoxesSize(ids, mode);
}
