// ============================================================================
// Ribbon - PowerPoint-style ribbon UI
// タブ: File / Home / Insert / 表示 / 出力 / Help
// ============================================================================

import { useState } from 'react';
import { useTEMStore } from '../store/store';
import type { BoxType } from '../types';
import { BOX_TYPE_LABELS } from '../store/defaults';

type RibbonTab = 'file' | 'home' | 'insert' | 'view' | 'help';

export function Ribbon({
  onOpenSettings,
  onOpenInsertBetween,
  onOpenPeriodLabels,
  onOpenPeriodSettings,
  onOpenExport,
  onOpenPaperReport,
  onOpenResize,
  onOpenCSVImport,
  onOpenShiftContent,
  onSave,
  onSaveAs,
  onOpen,
  onOpenAsNewSheets,
  onNew,
}: {
  onOpenSettings: () => void;
  onOpenInsertBetween: () => void;
  onOpenPeriodLabels: () => void;
  onOpenPeriodSettings: () => void;
  onOpenExport: () => void;
  onOpenPaperReport: () => void;
  onOpenResize: () => void;
  onOpenCSVImport: () => void;
  onOpenShiftContent: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onOpen: () => void;
  onOpenAsNewSheets: () => void;
  onNew: () => void;
}) {
  const [activeTab, setActiveTab] = useState<RibbonTab>('home');

  return (
    <div className="ribbon">
      <div className="ribbon-tabs">
        {(['file', 'home', 'insert', 'view', 'help'] as const).map((tab) => (
          <button
            key={tab}
            className={`ribbon-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tabLabel(tab)}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <LayoutToggle />
        <LocaleToggle />
        <SaveButton onSave={onSave} />
      </div>
      <div className="ribbon-body">
        {activeTab === 'file' && <FileTab onSave={onSave} onSaveAs={onSaveAs} onOpen={onOpen} onOpenAsNewSheets={onOpenAsNewSheets} onNew={onNew} onOpenExport={onOpenExport} onOpenPaperReport={onOpenPaperReport} onOpenCSVImport={onOpenCSVImport} onOpenSettings={onOpenSettings} />}
        {activeTab === 'home' && <HomeTab onOpenResize={onOpenResize} onOpenShiftContent={onOpenShiftContent} />}
        {activeTab === 'insert' && <InsertTab onOpenInsertBetween={onOpenInsertBetween} onOpenPeriodLabels={onOpenPeriodLabels} />}
        {activeTab === 'view' && <ViewTab onOpenPeriodSettings={onOpenPeriodSettings} onOpenPeriodLabels={onOpenPeriodLabels} />}
        {activeTab === 'help' && <HelpTab />}
      </div>
    </div>
  );
}

function tabLabel(tab: RibbonTab): string {
  const labels: Record<RibbonTab, string> = {
    file: 'ファイル',
    home: '編集',
    insert: '挿入',
    view: '表示',
    help: 'ヘルプ',
  };
  return labels[tab];
}

function LocaleToggle() {
  const locale = useTEMStore((s) => s.doc.settings.locale);
  const setLocale = useTEMStore((s) => s.setLocale);
  return (
    <button
      className="ribbon-btn-small"
      onClick={() => setLocale(locale === 'ja' ? 'en' : 'ja')}
      title="Language"
    >
      {locale === 'ja' ? '日本語 ▼' : 'English ▼'}
    </button>
  );
}

function LayoutToggle() {
  const layout = useTEMStore((s) => s.doc.settings.layout);
  const setLayout = useTEMStore((s) => s.setLayout);
  const isHorizontal = layout === 'horizontal';
  return (
    <div className="layout-toggle" role="group" aria-label="レイアウト">
      <button
        className={`layout-toggle-btn ${isHorizontal ? 'active' : ''}`}
        onClick={() => setLayout('horizontal')}
        title="横型レイアウト（時間軸→右）"
      >
        <span className="layout-icon">⇨</span>
        <span>横型</span>
      </button>
      <button
        className={`layout-toggle-btn ${!isHorizontal ? 'active' : ''}`}
        onClick={() => setLayout('vertical')}
        title="縦型レイアウト（時間軸↓）"
      >
        <span className="layout-icon">⇩</span>
        <span>縦型</span>
      </button>
    </div>
  );
}

function SaveButton({ onSave }: { onSave: () => void }) {
  const dirty = useTEMStore((s) => s.dirty);
  return (
    <button className="ribbon-btn-primary" onClick={onSave} title="保存 (Ctrl+S)">
      {dirty ? '● 保存' : '保存'}
    </button>
  );
}

// ---------------------------------------------------------------------------

function FileTab({ onSave, onSaveAs, onOpen, onOpenAsNewSheets, onNew, onOpenExport, onOpenPaperReport: _onOpenPaperReport, onOpenCSVImport, onOpenSettings }: {
  onSave: () => void;
  onSaveAs: () => void;
  onOpen: () => void;
  onOpenAsNewSheets: () => void;
  onNew: () => void;
  onOpenExport: () => void;
  onOpenPaperReport: () => void;
  onOpenCSVImport: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <>
      <RibbonGroup title="ファイル操作">
        <RibbonButton label="新規 (Ctrl+N)" icon="📄" onClick={onNew} title="空のシートで新規作成" />
        <RibbonButton label="開く (Ctrl+O)" icon="📂" onClick={onOpen} title="現在のシートを破棄して開く" />
        <RibbonButton label="別シートとして開く" icon="📂+" onClick={onOpenAsNewSheets} title="現状のシートはそのまま、ファイル内のシートを追加" />
        <RibbonButton label="保存 (Ctrl+S)" icon="💾" onClick={onSave} />
        <RibbonButton label="名前を付けて保存" icon="💾+" onClick={onSaveAs} />
      </RibbonGroup>
      <RibbonGroup title="インポート">
        <RibbonButton label="CSV インポート..." icon="📥" onClick={onOpenCSVImport} title="CSV から Box を一括追加" />
      </RibbonGroup>
      <RibbonGroup title="出力">
        <RibbonButton label="出力..." icon="📤" onClick={onOpenExport} title="PNG / SVG / PDF / PPTX 出力（設定ダイアログ）" />
        {/* 論文レポート機能は調整中のため一時停止 */}
        <RibbonButton label="論文レポート(調整中)" icon="📝" onClick={() => alert('論文レポート出力は現在調整中のため一時的に無効化しています。')} title="調整中のため一時停止" />
      </RibbonGroup>
      <RibbonGroup title="環境">
        <RibbonButton label="設定" icon="⚙" onClick={onOpenSettings} title="全般設定（レイアウト・フォント・凡例など）" />
      </RibbonGroup>
    </>
  );
}

function HomeTab({ onOpenResize, onOpenShiftContent }: { onOpenResize: () => void; onOpenShiftContent: () => void }) {
  const copyToClipboard = useTEMStore((s) => s.copyToClipboard);
  const pasteFromClipboard = useTEMStore((s) => s.pasteFromClipboard);
  const selection = useTEMStore((s) => s.selection);
  const removeBoxes = useTEMStore((s) => s.removeBoxes);
  const removeLines = useTEMStore((s) => s.removeLines);
  const bringToFront = useTEMStore((s) => s.bringToFront);
  const sendToBack = useTEMStore((s) => s.sendToBack);
  const bringForward = useTEMStore((s) => s.bringForward);
  const sendBackward = useTEMStore((s) => s.sendBackward);
  const canvasMode = useTEMStore((s) => s.view.canvasMode);
  const setCanvasMode = useTEMStore((s) => s.setCanvasMode);

  const firstSelectedId = selection.boxIds[0] ?? selection.lineIds[0];

  const handleDelete = () => {
    if (selection.boxIds.length > 0) removeBoxes(selection.boxIds);
    if (selection.lineIds.length > 0) removeLines(selection.lineIds);
  };

  return (
    <>
      <RibbonGroup title="モード">
        <RibbonButton
          label={canvasMode === 'move' ? '移動 ✓' : '移動'}
          icon="✋"
          onClick={() => setCanvasMode('move')}
          title="ドラッグで画面をパン"
          active={canvasMode === 'move'}
        />
        <RibbonButton
          label={canvasMode === 'pointer' ? '選択 ✓' : '選択'}
          icon="➤"
          onClick={() => setCanvasMode('pointer')}
          title="編集ロックなし・図形のクリック/ドラッグに専念（パン/範囲選択は無効）"
          active={canvasMode === 'pointer'}
        />
        <RibbonButton
          label={canvasMode === 'select' ? '範囲選択 ✓' : '範囲選択'}
          icon="⊡"
          onClick={() => setCanvasMode('select')}
          title="ドラッグで範囲選択"
          active={canvasMode === 'select'}
        />
      </RibbonGroup>
      <RibbonGroup title="クリップボード">
        <RibbonButton label="コピー" icon="📋" onClick={copyToClipboard} />
        <RibbonButton label="貼付" icon="📥" onClick={() => pasteFromClipboard()} />
        <RibbonButton label="削除" icon="🗑" onClick={handleDelete} />
      </RibbonGroup>
      <RibbonGroup title="履歴">
        <RibbonButton label="元に戻す (Ctrl+Z)" icon="↶" onClick={() => useTEMStore.temporal.getState().undo()} />
        <RibbonButton label="進む (Ctrl+Y)" icon="↷" onClick={() => useTEMStore.temporal.getState().redo()} />
      </RibbonGroup>
      <RibbonGroup title="編集">
        <SwapBoxesButton />
        <SwapBoxesFullButton />
        <ShiftAfterButton />
        <RibbonButton label="複製" icon="⎘" onClick={() => { copyToClipboard(); pasteFromClipboard(); }} />
        <RibbonButton label="全選択" icon="☰" onClick={() => useTEMStore.getState().selectAll()} />
        <RibbonButton
          label="文字に合わせる"
          icon="↔↕"
          onClick={() => {
            const ids = useTEMStore.getState().selection.boxIds;
            if (ids.length === 0) {
              alert('Box を選択してください');
              return;
            }
            useTEMStore.getState().fitBoxesToLabel(ids, 'both');
          }}
          title="選択 Box のサイズ（幅・高さとも）をラベルに合わせて最小化"
        />
        <RibbonButton
          label="幅を文字に"
          icon="↔Aa"
          onClick={() => {
            const ids = useTEMStore.getState().selection.boxIds;
            if (ids.length === 0) {
              alert('Box を選択してください');
              return;
            }
            useTEMStore.getState().fitBoxesToLabel(ids, 'width');
          }}
          title="高さは維持し、幅のみをラベルに合わせる"
        />
        <RibbonButton
          label="高さを文字に"
          icon="↕Aa"
          onClick={() => {
            const ids = useTEMStore.getState().selection.boxIds;
            if (ids.length === 0) {
              alert('Box を選択してください');
              return;
            }
            useTEMStore.getState().fitBoxesToLabel(ids, 'height');
          }}
          title="幅は維持し、高さのみをラベルに合わせる"
        />
      </RibbonGroup>
      <RibbonGroup title="整列">
        <AlignButton type="left" />
        <AlignButton type="center-h" />
        <AlignButton type="right" />
        <AlignButton type="top" />
        <AlignButton type="middle" />
        <AlignButton type="bottom" />
        <AlignButton type="distribute-h" />
      </RibbonGroup>
      <RibbonGroup title="サイズ統一">
        <RibbonButton
          label="幅を揃える"
          icon="↔"
          title="選択 Box の幅を先頭のものに揃える"
          onClick={() => {
            const ids = useTEMStore.getState().selection.boxIds;
            if (ids.length < 2) { alert('2 つ以上の Box を選択してください'); return; }
            useTEMStore.getState().matchBoxesSize(ids, 'width');
          }}
        />
        <RibbonButton
          label="高さを揃える"
          icon="↕"
          title="選択 Box の高さを先頭のものに揃える"
          onClick={() => {
            const ids = useTEMStore.getState().selection.boxIds;
            if (ids.length < 2) { alert('2 つ以上の Box を選択してください'); return; }
            useTEMStore.getState().matchBoxesSize(ids, 'height');
          }}
        />
        <RibbonButton
          label="サイズを揃える"
          icon="▭"
          title="選択 Box の幅と高さを先頭のものに揃える"
          onClick={() => {
            const ids = useTEMStore.getState().selection.boxIds;
            if (ids.length < 2) { alert('2 つ以上の Box を選択してください'); return; }
            useTEMStore.getState().matchBoxesSize(ids, 'both');
          }}
        />
        <RibbonButton
          label="文字サイズ揃え"
          icon="Aa"
          title="選択 Box の文字サイズを先頭のものに揃える"
          onClick={() => {
            const ids = useTEMStore.getState().selection.boxIds;
            if (ids.length < 2) { alert('2 つ以上の Box を選択してください'); return; }
            useTEMStore.getState().matchBoxesFontSize(ids);
          }}
        />
      </RibbonGroup>
      <RibbonGroup title="順序">
        <RibbonButton label="最前面" icon="⬆⬆" onClick={() => firstSelectedId && bringToFront(firstSelectedId)} />
        <RibbonButton label="前面" icon="⬆" onClick={() => firstSelectedId && bringForward(firstSelectedId)} />
        <RibbonButton label="背面" icon="⬇" onClick={() => firstSelectedId && sendBackward(firstSelectedId)} />
        <RibbonButton label="最背面" icon="⬇⬇" onClick={() => firstSelectedId && sendToBack(firstSelectedId)} />
      </RibbonGroup>
      <RibbonGroup title="シート">
        <RibbonButton
          label="リサイズ..."
          icon="⤡"
          onClick={onOpenResize}
          title="シート全体を用紙サイズや任意の倍率でリサイズ"
        />
        <RibbonButton
          label="一括移動..."
          icon="✥"
          onClick={onOpenShiftContent}
          title="時期区分・時間矢印・凡例以外を Time/Item 方向にまとめて移動"
        />
      </RibbonGroup>
    </>
  );
}

function SwapBoxesButton() {
  const selection = useTEMStore((s) => s.selection);
  const swapBoxes = useTEMStore((s) => s.swapBoxes);

  const canSwap = selection.boxIds.length === 2;

  const handleSwap = () => {
    if (!canSwap) {
      alert('Box を2つ選択してください');
      return;
    }
    swapBoxes(selection.boxIds[0], selection.boxIds[1]);
  };

  return (
    <RibbonButton
      label={canSwap ? '順序入替(直接)' : '順序入替(直接)*'}
      icon="⇄"
      onClick={handleSwap}
    />
  );
}

function ShiftAfterButton() {
  const selection = useTEMStore((s) => s.selection);
  const shiftBoxesAfter = useTEMStore((s) => s.shiftBoxesAfter);

  const canShift = selection.boxIds.length === 1;

  const handleShift = () => {
    if (!canShift) {
      alert('基準にする Box を 1つ選択してください');
      return;
    }
    const input = prompt('何レベル分シフトしますか？（正=後ろへ、負=前へ）', '1');
    if (input === null) return;
    const delta = Number(input);
    if (isNaN(delta) || delta === 0) {
      alert('0以外の数値を入力してください');
      return;
    }
    shiftBoxesAfter(selection.boxIds[0], delta);
  };

  return (
    <RibbonButton
      label={canShift ? '以降シフト' : '以降シフト*'}
      icon="⇉"
      onClick={handleShift}
    />
  );
}

function SwapBoxesFullButton() {
  const selection = useTEMStore((s) => s.selection);
  const swapBoxesFullLinks = useTEMStore((s) => s.swapBoxesFullLinks);

  const canSwap = selection.boxIds.length === 2;

  const handleSwap = () => {
    if (!canSwap) {
      alert('Box を2つ選択してください');
      return;
    }
    swapBoxesFullLinks(selection.boxIds[0], selection.boxIds[1]);
  };

  return (
    <RibbonButton
      label={canSwap ? '順序入替(全リンク)' : '順序入替(全リンク)*'}
      icon="⇆"
      onClick={handleSwap}
    />
  );
}

function AlignButton({ type }: { type: 'left' | 'center-h' | 'right' | 'top' | 'middle' | 'bottom' | 'distribute-h' }) {
  const selection = useTEMStore((s) => s.selection);
  const updateBox = useTEMStore((s) => s.updateBox);
  const doc = useTEMStore((s) => s.doc);

  const labels: Record<typeof type, { label: string; icon: string }> = {
    'left': { label: '左揃え', icon: '⇤' },
    'center-h': { label: '水平中央', icon: '≡' },
    'right': { label: '右揃え', icon: '⇥' },
    'top': { label: '上揃え', icon: '⤒' },
    'middle': { label: '垂直中央', icon: '≣' },
    'bottom': { label: '下揃え', icon: '⤓' },
    'distribute-h': { label: '等間隔(横)', icon: '⇔' },
  };
  const { label, icon } = labels[type];

  const handleAlign = () => {
    if (selection.boxIds.length < 2) return;
    const sheet = doc.sheets.find((s) => s.id === doc.activeSheetId);
    if (!sheet) return;
    const boxes = sheet.boxes.filter((b) => selection.boxIds.includes(b.id));
    if (boxes.length < 2) return;

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
      let cur = first.x;
      sorted.forEach((b, i) => {
        if (i === 0) { cur = first.x + b.width + gaps; return; }
        if (i === sorted.length - 1) return;
        updateBox(b.id, { x: cur });
        cur += b.width + gaps;
      });
    }
  };

  return <RibbonButton label={label} icon={icon} onClick={handleAlign} />;
}

function InsertTab({ onOpenInsertBetween, onOpenPeriodLabels }: { onOpenInsertBetween: () => void; onOpenPeriodLabels: () => void }) {
  const addBox = useTEMStore((s) => s.addBox);
  const selection = useTEMStore((s) => s.selection);
  const addLine = useTEMStore((s) => s.addLine);
  const addSequentialLines = useTEMStore((s) => s.addSequentialLines);
  const addSDSG = useTEMStore((s) => s.addSDSG);
  const boxTypes: BoxType[] = ['normal', 'BFP', 'EFP', 'P-EFP', 'OPP', 'annotation'];

  const handleAddSDSG = (type: 'SD' | 'SG') => {
    const { boxIds, lineIds } = selection;
    const attachedTo = boxIds[0] ?? lineIds[0];
    if (!attachedTo) {
      alert('Box または Line を1つ選択してください（SD/SGはその要素に紐づきます）');
      return;
    }
    addSDSG({ type, attachedTo, label: type });
  };

  // 2 Box 選択時、2 アイテム間に配置する SD/SG を追加
  const handleAddSDSGBetween = (type: 'SD' | 'SG') => {
    const { boxIds } = selection;
    if (boxIds.length !== 2) {
      alert('Box を 2 つ選択してください（2 アイテム間に配置します）');
      return;
    }
    addSDSG({
      type,
      attachedTo: boxIds[0],
      attachedTo2: boxIds[1],
      anchorMode: 'between',
      betweenMode: 'edge-to-edge',
      label: type,
    });
  };

  const handleAddLine = (type: 'RLine' | 'XLine') => {
    if (selection.boxIds.length !== 2) {
      alert('Box を 2つ選択してください（選択順に矢印を引きます）');
      return;
    }
    addLine(selection.boxIds[0], selection.boxIds[1], { type });
  };

  const handleSequentialArrow = (type: 'RLine' | 'XLine') => {
    if (selection.boxIds.length < 2) {
      alert('Box を2つ以上選択してください（選択順に矢印を繋ぎます）');
      return;
    }
    addSequentialLines(selection.boxIds, type);
  };

  return (
    <>
      <RibbonGroup title="Box">
        {boxTypes.map((type) => (
          <RibbonButton
            key={type}
            label={BOX_TYPE_LABELS[type].ja}
            icon={getIconForBoxType(type)}
            onClick={() => addBox({ type, label: BOX_TYPE_LABELS[type].ja })}
          />
        ))}
      </RibbonGroup>
      <RibbonGroup title="2選択間に">
        <RibbonButton label="間に挿入..." icon="↔+" onClick={onOpenInsertBetween} />
      </RibbonGroup>
      <RibbonGroup title="Line / 矢印">
        <RibbonButton label="実線矢印" icon="→" onClick={() => handleAddLine('RLine')} />
        <RibbonButton label="点線矢印" icon="⇢" onClick={() => handleAddLine('XLine')} />
        <RibbonButton label="順次接続(実線)" icon="→→" onClick={() => handleSequentialArrow('RLine')} />
        <RibbonButton label="順次接続(点線)" icon="⇢⇢" onClick={() => handleSequentialArrow('XLine')} />
      </RibbonGroup>
      <RibbonGroup title="SD/SG">
        <RibbonButton label="SD追加" icon="▽" onClick={() => handleAddSDSG('SD')} title="選択中の Box / Line に紐づく SD を追加" />
        <RibbonButton label="SG追加" icon="△" onClick={() => handleAddSDSG('SG')} title="選択中の Box / Line に紐づく SG を追加" />
        <RibbonButton label="SD (2 アイテム間)" icon="⊳⊲" onClick={() => handleAddSDSGBetween('SD')} title="選択した 2 Box の間に配置する SD を追加" />
        <RibbonButton label="SG (2 アイテム間)" icon="⊲⊳" onClick={() => handleAddSDSGBetween('SG')} title="選択した 2 Box の間に配置する SG を追加" />
        <RibbonButton
          label="選択を帯上へ"
          icon="↥"
          onClick={() => {
            const ids = useTEMStore.getState().selection.sdsgIds;
            if (ids.length === 0) { alert('SD/SG を選択してください'); return; }
            if (!confirm('選択した SD/SG を上部帯に配置します（オフセットはリセット）')) return;
            useTEMStore.getState().setSDSGSpaceMode(ids, 'band-top');
          }}
          title="選択中の SD/SG を上部帯に配置"
        />
        <RibbonButton
          label="選択を帯下へ"
          icon="↧"
          onClick={() => {
            const ids = useTEMStore.getState().selection.sdsgIds;
            if (ids.length === 0) { alert('SD/SG を選択してください'); return; }
            if (!confirm('選択した SD/SG を下部帯に配置します（オフセットはリセット）')) return;
            useTEMStore.getState().setSDSGSpaceMode(ids, 'band-bottom');
          }}
          title="選択中の SD/SG を下部帯に配置"
        />
        <RibbonButton
          label="選択を attached に"
          icon="⇄"
          onClick={() => {
            const ids = useTEMStore.getState().selection.sdsgIds;
            if (ids.length === 0) { alert('SD/SG を選択してください'); return; }
            if (!confirm('選択した SD/SG を attached モード（Box 追従）に戻します')) return;
            useTEMStore.getState().setSDSGSpaceMode(ids, 'attached');
          }}
          title="選択中の SD/SG を attached モードに戻す"
        />
      </RibbonGroup>
      <RibbonGroup title="その他">
        <RibbonButton label="時期ラベル..." icon="🏷" onClick={onOpenPeriodLabels} />
      </RibbonGroup>
    </>
  );
}

function getIconForBoxType(type: BoxType): string {
  switch (type) {
    case 'normal': return '□';
    case 'BFP': return '◇';
    case 'EFP': return '⊟';
    case 'P-EFP': return '⚃';
    case 'OPP': return '▣';
    case 'annotation': return '◈';
    default: return '□';
  }
}

function ViewTab({ onOpenPeriodSettings, onOpenPeriodLabels: _onOpenPeriodLabels }: { onOpenPeriodSettings: () => void; onOpenPeriodLabels: () => void }) {
  const view = useTEMStore((s) => s.view);
  const toggleGrid = useTEMStore((s) => s.toggleGrid);
  const toggleSnap = useTEMStore((s) => s.toggleSnap);
  const togglePaperGuides = useTEMStore((s) => s.togglePaperGuides);
  const toggleDataSheet = useTEMStore((s) => s.toggleDataSheet);
  const togglePropertyPanel = useTEMStore((s) => s.togglePropertyPanel);
  const toggleCommentMode = useTEMStore((s) => s.toggleCommentMode);
  const toggleBoxIds = useTEMStore((s) => s.toggleBoxIds);
  const toggleTopRuler = useTEMStore((s) => s.toggleTopRuler);
  const toggleLeftRuler = useTEMStore((s) => s.toggleLeftRuler);
  const toggleLegend = useTEMStore((s) => s.toggleLegend);
  const requestFit = useTEMStore((s) => s.requestFit);
  const legendVisible = useTEMStore((s) => s.doc.settings.legend.alwaysVisible);
  const togglePeriodLabels = useTEMStore((s) => s.togglePeriodLabels);
  const periodLabelsVisible = useTEMStore((s) => s.doc.settings.periodLabels.alwaysVisible);
  const timeArrowVisible = useTEMStore((s) => s.doc.settings.timeArrow.alwaysVisible);
  const typeLabelVisibility = useTEMStore((s) => s.doc.settings.typeLabelVisibility);
  const toggleTimeArrow = () => {
    useTEMStore.setState((state) => ({
      doc: {
        ...state.doc,
        settings: {
          ...state.doc.settings,
          timeArrow: {
            ...state.doc.settings.timeArrow,
            alwaysVisible: !state.doc.settings.timeArrow.alwaysVisible,
          },
        },
      },
    }));
  };

  // すべてのタイプラベルが表示されていれば「ON」、1つでも非表示なら「OFF」とみなし
  // クリックで全てをその逆にトグル
  const allTypeLabelsOn =
    typeLabelVisibility &&
    (Object.keys(typeLabelVisibility) as (keyof typeof typeLabelVisibility)[])
      .every((k) => typeLabelVisibility[k] !== false);
  const toggleAllTypeLabels = () => {
    const nextVal = !allTypeLabelsOn;
    useTEMStore.setState((state) => ({
      doc: {
        ...state.doc,
        settings: {
          ...state.doc.settings,
          typeLabelVisibility: {
            BFP: nextVal,
            EFP: nextVal,
            'P-EFP': nextVal,
            OPP: nextVal,
            '2nd-EFP': nextVal,
            'P-2nd-EFP': nextVal,
            SD: nextVal,
            SG: nextVal,
          },
        },
      },
    }));
  };

  return (
    <>
      <RibbonGroup title="表示">
        <RibbonButton label={view.showGrid ? 'グリッド ✓' : 'グリッド'} icon="⊞" onClick={toggleGrid} active={view.showGrid} />
        <RibbonButton label={view.snapEnabled ? 'スナップ ✓' : 'スナップ'} icon="⊡" onClick={toggleSnap} active={view.snapEnabled} />
        <RibbonButton label={view.showPaperGuides ? '用紙枠 ✓' : '用紙枠'} icon="▭" onClick={togglePaperGuides} active={view.showPaperGuides} />
        <RibbonButton label={view.showBoxIds ? 'ID ✓' : 'ID'} icon="🏷" onClick={toggleBoxIds} active={view.showBoxIds} />
        <RibbonButton label={view.showTopRuler ? '上ルーラー ✓' : '上ルーラー'} icon="📏" onClick={toggleTopRuler} active={view.showTopRuler} />
        <RibbonButton label={view.showLeftRuler ? '左ルーラー ✓' : '左ルーラー'} icon="📐" onClick={toggleLeftRuler} active={view.showLeftRuler} />
        <RibbonButton
          label={allTypeLabelsOn ? 'タイプラベル ✓' : 'タイプラベル'}
          icon="🅰"
          onClick={toggleAllTypeLabels}
          title="Box / SDSG のタイプラベル（種別バッジ）を一括で表示・非表示"
          active={!!allTypeLabelsOn}
        />
      </RibbonGroup>
      <RibbonGroup title="図要素">
        <RibbonButton label={timeArrowVisible ? '非可逆的時間 ✓' : '非可逆的時間'} icon="→" onClick={toggleTimeArrow} active={timeArrowVisible} />
        <RibbonButton label={legendVisible ? '凡例 ✓' : '凡例'} icon="📋" onClick={toggleLegend} active={legendVisible} />
        <RibbonButton label={periodLabelsVisible ? '時期 ✓' : '時期'} icon="🏷" onClick={togglePeriodLabels} active={periodLabelsVisible} />
        <RibbonButton label="時期編集..." icon="📝" onClick={onOpenPeriodSettings} title="設定の時期区分タブを開く" />
      </RibbonGroup>
      <RibbonGroup title="パネル">
        <RibbonButton label={view.dataSheetVisible ? 'データ ✓' : 'データ'} icon="🗂" onClick={toggleDataSheet} />
        <RibbonButton label={view.propertyPanelVisible ? 'プロパティ ✓' : 'プロパティ'} icon="⚙" onClick={togglePropertyPanel} />
        <RibbonButton label={view.commentMode ? 'コメント ✓' : 'コメント'} icon="💬" onClick={toggleCommentMode} />
      </RibbonGroup>
      <RibbonGroup title="フィット">
        <RibbonButton label="全体fit" icon="🔳" onClick={() => requestFit('all')} title="時間矢印・時期ラベル・凡例を含め全体を画面に合わせる" />
        <RibbonButton label="横fit" icon="↔" onClick={() => requestFit('width')} title="横幅に合わせる" />
        <RibbonButton label="縦fit" icon="↕" onClick={() => requestFit('height')} title="縦幅に合わせる" />
      </RibbonGroup>
    </>
  );
}

function HelpTab() {
  return (
    <RibbonGroup title="サポート">
      <RibbonButton label="ツアー" icon="🎓" onClick={() => alert('チュートリアルツアーはPhase 4で実装')} />
      <RibbonButton label="マニュアル" icon="📘" onClick={() => alert('マニュアルはPhase 4で実装')} />
      <RibbonButton label="動画" icon="🎬" onClick={() => alert('動画リンクはPhase 4で実装')} />
      <RibbonButton label="バージョン情報" icon="ℹ" onClick={() => alert('TEMer Plus v0.2.0-dev\n著者: 中田友貴\nライセンス: PolyForm Noncommercial 1.0.0')} />
    </RibbonGroup>
  );
}

// ---------------------------------------------------------------------------

function RibbonGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ribbon-group">
      <div className="ribbon-group-items">{children}</div>
      <div className="ribbon-group-title">{title}</div>
    </div>
  );
}

function RibbonButton({
  label,
  icon,
  onClick,
  title,
  active,
}: {
  label: string;
  icon: string;
  onClick?: () => void;
  title?: string;
  active?: boolean;
}) {
  return (
    <button
      className={active ? 'ribbon-btn active' : 'ribbon-btn'}
      onClick={onClick}
      title={title ?? label}
    >
      <span className="ribbon-btn-icon">{icon}</span>
      <span className="ribbon-btn-label">{label}</span>
    </button>
  );
}
