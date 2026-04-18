// ============================================================================
// Ribbon - PowerPoint-style ribbon UI
// タブ: File / Home / Insert / 表示 / 出力 / Help
// ============================================================================

import { useState } from 'react';
import { useTEMStore } from '../store/store';
import type { BoxType } from '../types';
import { BOX_TYPE_LABELS } from '../store/defaults';

type RibbonTab = 'file' | 'home' | 'insert' | 'view' | 'output' | 'help';

export function Ribbon({
  onOpenSettings,
  onOpenInsertBetween,
  onOpenPeriodLabels,
  onSave,
  onSaveAs,
  onOpen,
  onNew,
}: {
  onOpenSettings: () => void;
  onOpenInsertBetween: () => void;
  onOpenPeriodLabels: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onOpen: () => void;
  onNew: () => void;
}) {
  const [activeTab, setActiveTab] = useState<RibbonTab>('home');

  return (
    <div className="ribbon">
      <div className="ribbon-tabs">
        {(['file', 'home', 'insert', 'view', 'output', 'help'] as const).map((tab) => (
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
        {activeTab === 'file' && <FileTab onSave={onSave} onSaveAs={onSaveAs} onOpen={onOpen} onNew={onNew} />}
        {activeTab === 'home' && <HomeTab onOpenSettings={onOpenSettings} />}
        {activeTab === 'insert' && <InsertTab onOpenInsertBetween={onOpenInsertBetween} onOpenPeriodLabels={onOpenPeriodLabels} />}
        {activeTab === 'view' && <ViewTab onOpenPeriodLabels={onOpenPeriodLabels} />}
        {activeTab === 'output' && <OutputTab />}
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
    output: '出力',
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

function FileTab({ onSave, onSaveAs, onOpen, onNew }: {
  onSave: () => void;
  onSaveAs: () => void;
  onOpen: () => void;
  onNew: () => void;
}) {
  return (
    <RibbonGroup title="ファイル操作">
      <RibbonButton label="新規 (Ctrl+N)" icon="📄" onClick={onNew} />
      <RibbonButton label="開く (Ctrl+O)" icon="📂" onClick={onOpen} />
      <RibbonButton label="保存 (Ctrl+S)" icon="💾" onClick={onSave} />
      <RibbonButton label="名前を付けて保存" icon="💾+" onClick={onSaveAs} />
    </RibbonGroup>
  );
}

function HomeTab({ onOpenSettings }: { onOpenSettings: () => void }) {
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
        />
        <RibbonButton
          label={canvasMode === 'select' ? '範囲選択 ✓' : '範囲選択'}
          icon="⊡"
          onClick={() => setCanvasMode('select')}
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
      <RibbonGroup title="順序">
        <RibbonButton label="最前面" icon="⬆⬆" onClick={() => firstSelectedId && bringToFront(firstSelectedId)} />
        <RibbonButton label="前面" icon="⬆" onClick={() => firstSelectedId && bringForward(firstSelectedId)} />
        <RibbonButton label="背面" icon="⬇" onClick={() => firstSelectedId && sendBackward(firstSelectedId)} />
        <RibbonButton label="最背面" icon="⬇⬇" onClick={() => firstSelectedId && sendToBack(firstSelectedId)} />
      </RibbonGroup>
      <RibbonGroup title="その他">
        <RibbonButton label="設定" icon="⚙" onClick={onOpenSettings} />
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
        <RibbonButton label="SD追加" icon="▽" onClick={() => handleAddSDSG('SD')} />
        <RibbonButton label="SG追加" icon="△" onClick={() => handleAddSDSG('SG')} />
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

function ViewTab({ onOpenPeriodLabels }: { onOpenPeriodLabels: () => void }) {
  const view = useTEMStore((s) => s.view);
  const toggleGrid = useTEMStore((s) => s.toggleGrid);
  const toggleSnap = useTEMStore((s) => s.toggleSnap);
  const togglePaperGuides = useTEMStore((s) => s.togglePaperGuides);
  const toggleDataSheet = useTEMStore((s) => s.toggleDataSheet);
  const togglePropertyPanel = useTEMStore((s) => s.togglePropertyPanel);
  const toggleCommentMode = useTEMStore((s) => s.toggleCommentMode);
  const toggleBoxIds = useTEMStore((s) => s.toggleBoxIds);
  const toggleLegend = useTEMStore((s) => s.toggleLegend);
  const legendVisible = useTEMStore((s) => s.doc.settings.legend.alwaysVisible);
  const togglePeriodLabels = useTEMStore((s) => s.togglePeriodLabels);
  const periodLabelsVisible = useTEMStore((s) => s.doc.settings.periodLabels.alwaysVisible);
  const timeArrowVisible = useTEMStore((s) => s.doc.settings.timeArrow.alwaysVisible);
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

  return (
    <>
      <RibbonGroup title="表示">
        <RibbonButton label={view.showGrid ? 'グリッド ✓' : 'グリッド'} icon="⊞" onClick={toggleGrid} />
        <RibbonButton label={view.snapEnabled ? 'スナップ ✓' : 'スナップ'} icon="⊡" onClick={toggleSnap} />
        <RibbonButton label={view.showPaperGuides ? '用紙枠 ✓' : '用紙枠'} icon="▭" onClick={togglePaperGuides} />
        <RibbonButton label={view.showBoxIds ? 'ID ✓' : 'ID'} icon="🏷" onClick={toggleBoxIds} />
      </RibbonGroup>
      <RibbonGroup title="図要素">
        <RibbonButton label={timeArrowVisible ? '時間矢印 ✓' : '時間矢印'} icon="→" onClick={toggleTimeArrow} />
        <RibbonButton label={legendVisible ? '凡例 ✓' : '凡例'} icon="📋" onClick={toggleLegend} />
        <RibbonButton label={periodLabelsVisible ? '時期 ✓' : '時期'} icon="🏷" onClick={togglePeriodLabels} />
        <RibbonButton label="時期編集..." icon="📝" onClick={onOpenPeriodLabels} />
      </RibbonGroup>
      <RibbonGroup title="パネル">
        <RibbonButton label={view.dataSheetVisible ? 'データ ✓' : 'データ'} icon="🗂" onClick={toggleDataSheet} />
        <RibbonButton label={view.propertyPanelVisible ? 'プロパティ ✓' : 'プロパティ'} icon="⚙" onClick={togglePropertyPanel} />
        <RibbonButton label={view.commentMode ? 'コメント ✓' : 'コメント'} icon="💬" onClick={toggleCommentMode} />
      </RibbonGroup>
    </>
  );
}

function OutputTab() {
  const doc = useTEMStore((s) => s.doc);
  const getActiveSheet = () => doc.sheets.find((s) => s.id === doc.activeSheetId);

  const handleExportPNG = async () => {
    try {
      const { exportToPNG } = await import('../utils/exportImage');
      const name = doc.metadata.title || 'TEMer';
      await exportToPNG('diagram-canvas', `${name}.png`, 2);
    } catch (e) {
      alert('PNG出力に失敗しました: ' + (e as Error).message);
    }
  };
  const handleExportSVG = async () => {
    try {
      const { exportToSVG } = await import('../utils/exportImage');
      const name = doc.metadata.title || 'TEMer';
      await exportToSVG('diagram-canvas', `${name}.svg`);
    } catch (e) {
      alert('SVG出力に失敗しました: ' + (e as Error).message);
    }
  };
  const handleExportPPTX = async () => {
    try {
      const { exportToPPTX } = await import('../utils/exportPPT');
      const sheet = getActiveSheet();
      if (!sheet) return;
      const name = doc.metadata.title || 'TEMer';
      await exportToPPTX(sheet.boxes, sheet.lines, {
        filename: `${name}.pptx`,
        sheet,
        layout: doc.settings.layout,
        timeArrowSettings: doc.settings.timeArrow,
        includeTimeArrow: doc.settings.timeArrow.autoInsert,
        legendSettings: doc.settings.legend,
        includeLegend: doc.settings.legend.includeInExport,
      });
    } catch (e) {
      alert('PPTX出力に失敗しました: ' + (e as Error).message);
    }
  };

  return (
    <>
      <RibbonGroup title="エクスポート">
        <RibbonButton label="PNG" icon="🖼" onClick={handleExportPNG} />
        <RibbonButton label="SVG" icon="📐" onClick={handleExportSVG} />
        <RibbonButton label="PPTX" icon="📊" onClick={handleExportPPTX} />
        <RibbonButton label="PDF" icon="📄" onClick={() => alert('PDF出力は次のPhaseで実装')} />
      </RibbonGroup>
      <RibbonGroup title="高度">
        <RibbonButton label="横分割出力" icon="|||" onClick={() => alert('横分割出力は次のPhaseで実装')} />
        <RibbonButton label="論文用レポート" icon="📝" onClick={() => alert('論文用レポートは次のPhaseで実装')} />
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
}: {
  label: string;
  icon: string;
  onClick?: () => void;
}) {
  return (
    <button className="ribbon-btn" onClick={onClick} title={label}>
      <span className="ribbon-btn-icon">{icon}</span>
      <span className="ribbon-btn-label">{label}</span>
    </button>
  );
}
