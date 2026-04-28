// ============================================================================
// Ribbon - PowerPoint-style ribbon UI
// タブ: File / Home / Insert / 表示 / 出力 / Help
// ============================================================================

import { useState } from 'react';
import { useTEMStore } from '../store/store';
import type { BoxType } from '../types';
import { BOX_TYPE_LABELS } from '../store/defaults';
import { pickBetweenAnchors } from '../utils/sdsgBetween';

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
        <RibbonButton label="全選択" icon="☰" onClick={() => useTEMStore.getState().selectAll()} />
        <RibbonButton label="複製" icon="⎘" onClick={() => { copyToClipboard(); pasteFromClipboard(); }} />
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
        <SwapBoxesButton />
        <SwapBoxesFullButton />
        <ShiftAfterButton />
      </RibbonGroup>
      <RibbonGroup title="整列・サイズ">
        <AlignButton type="left" />
        <AlignButton type="center-h" />
        <AlignButton type="right" />
        <AlignButton type="top" />
        <AlignButton type="middle" />
        <AlignButton type="bottom" />
        <AlignButton type="distribute-h" />
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
          label="移動..."
          icon="✥"
          onClick={onOpenShiftContent}
          title="選択中の Box または全体を Time/Item 方向に移動（▲▼ で即時 / 数値で一括）"
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

  // 選択数で自動分岐:
  //   Box 0 + Line 0 → エラー
  //   Box 0 + Line 1+ → single (Line 先頭)
  //   Box 1            → single
  //   Box 2            → between (両 Box)
  //   Box 3+           → between (Time レベル最小・最大の 2 Box)
  const handleAddSDSG = (type: 'SD' | 'SG') => {
    const st = useTEMStore.getState();
    const sheet = st.doc.sheets.find((s) => s.id === st.doc.activeSheetId);
    const isH = st.doc.settings.layout === 'horizontal';
    const { boxIds, lineIds } = selection;

    if (boxIds.length === 0 && lineIds.length === 0) {
      alert('Box または Line を選択してください（SD/SG は選択要素に紐づきます）');
      return;
    }

    // Box 0 個 + Line のみ → single (先頭 Line)
    if (boxIds.length === 0) {
      addSDSG({ type, attachedTo: lineIds[0], label: type });
      return;
    }

    // Box 1 個 → single
    if (boxIds.length === 1) {
      addSDSG({ type, attachedTo: boxIds[0], label: type });
      return;
    }

    // Box 2+ 個 → between
    // 3 個以上は Time レベル（横型=x / 縦型=y）の最小・最大 Box を採用
    if (!sheet) return;
    const selectedBoxes = sheet.boxes.filter((b) => boxIds.includes(b.id));
    const pair = pickBetweenAnchors(selectedBoxes, isH);
    if (!pair) return;
    addSDSG({
      type,
      attachedTo: pair.lowBoxId,
      attachedTo2: pair.highBoxId,
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
      <RibbonGroup title="SD/SG 作成">
        <RibbonButton label="SD追加" icon="▽" onClick={() => handleAddSDSG('SD')} title="Box 1個=single / 2個=between / 3個以上=Time軸両端2個でbetween" />
        <RibbonButton label="SG追加" icon="△" onClick={() => handleAddSDSG('SG')} title="Box 1個=single / 2個=between / 3個以上=Time軸両端2個でbetween" />
      </RibbonGroup>
      <RibbonGroup title="SD/SG 配置">
        <RibbonButton
          label="帯モードへ"
          icon="☰"
          onClick={() => {
            const st = useTEMStore.getState();
            const ids = st.selection.sdsgIds;
            if (ids.length === 0) { alert('SD/SG を選択してください'); return; }
            const sheet = st.doc.sheets.find((s) => s.id === st.doc.activeSheetId);
            if (!sheet) return;
            // 選択中 SDSG を種別別に分割: SD → band-top, SG → band-bottom
            const sdIds: string[] = [];
            const sgIds: string[] = [];
            sheet.sdsg.forEach((s) => {
              if (!ids.includes(s.id)) return;
              if (s.type === 'SD') sdIds.push(s.id);
              else sgIds.push(s.id);
            });
            if (sdIds.length === 0 && sgIds.length === 0) return;
            if (sdIds.length > 0) st.setSDSGSpaceMode(sdIds, 'band-top');
            if (sgIds.length > 0) st.setSDSGSpaceMode(sgIds, 'band-bottom');
          }}
          title="選択中 SD/SG を種別に応じて帯に配置（SD→上部帯 / SG→下部帯、縦型では右/左）"
        />
        <RibbonButton
          label="attached に"
          icon="⇄"
          onClick={() => {
            const ids = useTEMStore.getState().selection.sdsgIds;
            if (ids.length === 0) { alert('SD/SG を選択してください'); return; }
            useTEMStore.getState().setSDSGSpaceMode(ids, 'attached');
          }}
          title="選択中の SD/SG を attached モード（Box 追従）に戻す"
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
  const toggleSDSGIds = useTEMStore((s) => s.toggleSDSGIds);
  const toggleLineIds = useTEMStore((s) => s.toggleLineIds);
  const toggleAllIds = useTEMStore((s) => s.toggleAllIds);
  const toggleTopRuler = useTEMStore((s) => s.toggleTopRuler);
  const toggleLeftRuler = useTEMStore((s) => s.toggleLeftRuler);
  const toggleLegend = useTEMStore((s) => s.toggleLegend);
  const requestFit = useTEMStore((s) => s.requestFit);
  const legendVisible = useTEMStore((s) => s.doc.settings.legend.alwaysVisible);
  const togglePeriodLabels = useTEMStore((s) => s.togglePeriodLabels);
  const periodLabelsVisible = useTEMStore((s) => s.doc.settings.periodLabels.alwaysVisible);
  const timeArrowVisible = useTEMStore((s) => s.doc.settings.timeArrow.alwaysVisible);
  const typeLabelVisibility = useTEMStore((s) => s.doc.settings.typeLabelVisibility);
  const sdsgSpaceEnabled = useTEMStore((s) => s.doc.settings.sdsgSpace?.enabled ?? false);
  const toggleSDSGSpace = () => {
    useTEMStore.setState((state) => ({
      doc: {
        ...state.doc,
        settings: {
          ...state.doc.settings,
          sdsgSpace: state.doc.settings.sdsgSpace
            ? { ...state.doc.settings.sdsgSpace, enabled: !state.doc.settings.sdsgSpace.enabled }
            : state.doc.settings.sdsgSpace,
        },
      },
    }));
  };
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
        {(() => {
          const anyIdOn = view.showBoxIds || view.showSDSGIds || view.showLineIds;
          const allIdOn = view.showBoxIds && view.showSDSGIds && view.showLineIds;
          const label = allIdOn ? 'ID ✓' : anyIdOn ? 'ID …' : 'ID';
          return (
            <RibbonButton
              label={label}
              icon="🏷"
              onClick={toggleAllIds}
              active={anyIdOn}
              title={`Box / SDSG / Line の ID バッジ一括トグル (現状: Box=${view.showBoxIds ? 'ON' : 'OFF'}, SDSG=${view.showSDSGIds ? 'ON' : 'OFF'}, Line=${view.showLineIds ? 'ON' : 'OFF'})`}
            />
          );
        })()}
        <RibbonButton label={view.showBoxIds ? 'Box-ID ✓' : 'Box-ID'} icon="🔖" onClick={toggleBoxIds} active={view.showBoxIds} title="Box の ID バッジ表示切替" />
        <RibbonButton label={view.showSDSGIds ? 'SDSG-ID ✓' : 'SDSG-ID'} icon="🔖" onClick={toggleSDSGIds} active={view.showSDSGIds} title="SDSG の ID バッジ表示切替" />
        <RibbonButton label={view.showLineIds ? 'Line-ID ✓' : 'Line-ID'} icon="🔖" onClick={toggleLineIds} active={view.showLineIds} title="Line の ID バッジ表示切替（線の中点）" />
        <RibbonButton label={view.showTopRuler ? '上ルーラー ✓' : '上ルーラー'} icon="📏" onClick={toggleTopRuler} active={view.showTopRuler} />
        <RibbonButton label={view.showLeftRuler ? '左ルーラー ✓' : '左ルーラー'} icon="📐" onClick={toggleLeftRuler} active={view.showLeftRuler} />
        <RibbonButton
          label={allTypeLabelsOn ? 'タイプラベル ✓' : 'タイプラベル'}
          icon="🅰"
          onClick={toggleAllTypeLabels}
          title="Box / SDSG のタイプラベル（種別バッジ）を一括で表示・非表示"
          active={!!allTypeLabelsOn}
        />
        <RibbonButton
          label={sdsgSpaceEnabled ? 'SDSG 帯 ✓' : 'SDSG 帯'}
          icon="▤"
          onClick={toggleSDSGSpace}
          title="SD/SG を上部(SD)帯・下部(SG)帯に配置するモードの ON/OFF（詳細は設定 > SD/SG 配置）"
          active={sdsgSpaceEnabled}
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
      <RibbonButton label="ツアー" icon="🎓" disabled title="チュートリアルツアー (開発中)" />
      <RibbonButton label="マニュアル" icon="📘" disabled title="マニュアル (開発中)" />
      <RibbonButton label="動画" icon="🎬" disabled title="動画リンク (開発中)" />
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
  disabled,
}: {
  label: string;
  icon: string;
  onClick?: () => void;
  title?: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={active ? 'ribbon-btn active' : 'ribbon-btn'}
      onClick={onClick}
      title={title ?? label}
      disabled={disabled}
      style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
    >
      <span className="ribbon-btn-icon">{icon}</span>
      <span className="ribbon-btn-label">{label}</span>
    </button>
  );
}
