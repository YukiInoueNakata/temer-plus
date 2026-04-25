// ============================================================================
// PropertyPanel - Right sidebar (Figma-style)
// ============================================================================

import { useState, useEffect, useRef } from 'react';
import { useTEMStore, useActiveSheet } from '../store/store';
import type { Box, BoxType, SDSG, Line, AutoFitBoxMode } from '../types';
import { BOX_TYPE_LABELS } from '../store/defaults';
import {
  FontFamilyRow,
  FontSizeRow,
  BoldItalicUnderlineRow,
  ColorRow,
  TextAlignRow,
  VerticalAlignRow,
} from './DecorationEditor';
import { isSDSGOutOfRange } from '../utils/sdsgSpaceLayout';
import { SELECTABLE_BOX_TYPES } from '../utils/typeDisplay';
import { xyToTimeLevel, xyToItemLevel, setTimeLevelOnly, setItemLevelOnly } from '../utils/coords';
import { RichTextToolbar } from './RichTextToolbar';
import { produce } from 'immer';
import { ColorPicker } from './ColorPicker';
import { CollapsibleSection } from './CollapsibleSection';

interface PropertyPanelProps {
  onOpenLegendSettings?: () => void;
}

export function PropertyPanel({ onOpenLegendSettings }: PropertyPanelProps = {}) {
  const visible = useTEMStore((s) => s.view.propertyPanelVisible);
  const toggle = useTEMStore((s) => s.togglePropertyPanel);
  const selection = useTEMStore((s) => s.selection);
  const sheet = useActiveSheet();
  const width = useTEMStore((s) => s.view.propertyPanelWidth);
  const setWidth = useTEMStore((s) => s.setPropertyPanelWidth);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      const panel = document.querySelector('.property-panel') as HTMLElement | null;
      if (!panel) return;
      const right = panel.getBoundingClientRect().right;
      const newWidth = Math.max(50, Math.min(900, right - e.clientX));
      setWidth(newWidth);
    };
    const onUp = () => setResizing(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing, setWidth]);

  if (!visible) {
    return (
      <div className="panel-collapsed right" onClick={toggle} title="プロパティを表示">
        <span style={{ writingMode: 'vertical-rl', fontWeight: 600, color: '#444', letterSpacing: '0.1em' }}>
          プロパティ
        </span>
      </div>
    );
  }

  if (!sheet) return null;

  const selectedBoxes = sheet.boxes.filter((b) => selection.boxIds.includes(b.id));
  const selectedLines = sheet.lines.filter((l) => selection.lineIds.includes(l.id));
  const selectedSDSGs = sheet.sdsg.filter((s) => selection.sdsgIds.includes(s.id));
  const hasSelection = selectedBoxes.length > 0 || selectedLines.length > 0 || selectedSDSGs.length > 0;

  return (
    <div className="property-panel" style={{ width }}>
      <div
        className="panel-resizer left"
        onMouseDown={(e) => { e.preventDefault(); setResizing(true); }}
        title="幅を調整"
      />
      <div className="panel-header">
        <span>▼ プロパティ {hasSelection && `(${selectedBoxes.length + selectedLines.length})`}</span>
        <button className="panel-toggle" onClick={toggle} title="最小化">×</button>
      </div>
      <div className="panel-body">
        {!hasSelection && !selection.legendSelected && <EmptyState />}
        {selection.legendSelected && <LegendProperties onOpenSettings={onOpenLegendSettings} />}
        {selectedBoxes.length > 0 && <BoxProperties boxes={selectedBoxes} />}
        {selectedLines.length > 0 && <LineProperties lines={selectedLines} />}
        {selectedSDSGs.length > 0 && <SDSGProperties sdsgs={selectedSDSGs} />}
      </div>
    </div>
  );
}

// ============================================================================
// 凡例選択時のプロパティ（軽量 UI。詳細は SettingsDialog > 凡例 タブへ）
// ============================================================================
function LegendProperties({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const doc = useTEMStore((s) => s.doc);
  const lg = doc.settings.legend;
  const layout = doc.settings.layout;
  const updateLegend = (patch: Partial<typeof lg>) => {
    useTEMStore.setState((state) => ({
      doc: produce(state.doc, (d) => {
        d.settings.legend = { ...d.settings.legend, ...patch };
      }),
      dirty: true,
    }));
  };
  const updatePosition = (which: 'x' | 'y', v: number) => {
    useTEMStore.setState((state) => ({
      doc: produce(state.doc, (d) => {
        d.settings.legend.position = { ...d.settings.legend.position, [which]: v };
      }),
      dirty: true,
    }));
  };

  const columnsKey = layout === 'vertical' ? 'columnsVertical' : 'columnsHorizontal';
  const currentCols = (lg[columnsKey] ?? lg.columns) ?? 1;

  return (
    <div className="prop-section">
      <h4>凡例</h4>
      <p className="hint" style={{ marginTop: 0, fontSize: '0.82em' }}>
        キャンバス上でドラッグ、または下の数値で位置調整。詳細は「詳細設定」から。
      </p>
      <div className="prop-row">
        <label>エクスポートに含める</label>
        <input
          type="checkbox"
          checked={lg.includeInExport !== false}
          onChange={(e) => updateLegend({ includeInExport: e.target.checked })}
        />
      </div>
      <div className="prop-row">
        <label>タイトル表示</label>
        <input
          type="checkbox"
          checked={lg.showTitle !== false}
          onChange={(e) => updateLegend({ showTitle: e.target.checked })}
        />
      </div>
      {lg.showTitle !== false && (
        <div className="prop-row">
          <label>タイトル</label>
          <input
            type="text"
            value={lg.title ?? ''}
            onChange={(e) => updateLegend({ title: e.target.value })}
            placeholder="凡例"
          />
        </div>
      )}
      <div className="prop-row">
        <label>位置 X / Y</label>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            type="number"
            value={lg.position?.x ?? 0}
            onChange={(e) => updatePosition('x', Number(e.target.value))}
            style={{ width: 70 }}
            title="px"
          />
          <input
            type="number"
            value={lg.position?.y ?? 0}
            onChange={(e) => updatePosition('y', Number(e.target.value))}
            style={{ width: 70 }}
          />
        </div>
      </div>
      <div className="prop-row">
        <label>列数（{layout === 'vertical' ? '縦型' : '横型'}）</label>
        <input
          type="number"
          min={1}
          max={6}
          step={1}
          value={currentCols}
          onChange={(e) => updateLegend({ [columnsKey]: Math.max(1, Number(e.target.value) || 1) } as Partial<typeof lg>)}
          style={{ width: 70 }}
        />
      </div>
      <div className="prop-row">
        <label>説明文を表示</label>
        <input
          type="checkbox"
          checked={lg.showDescriptions === true}
          onChange={(e) => updateLegend({ showDescriptions: e.target.checked })}
          title="各項目の説明文を横に並べる（幅が増える）"
        />
      </div>
      <div className="prop-row" style={{ justifyContent: 'flex-start', gap: 6, marginTop: 8 }}>
        {onOpenSettings && (
          <button
            className="ribbon-btn-small"
            onClick={onOpenSettings}
            title="背景色 / 枠線 / フォント / 項目別ラベル上書き 等の詳細設定"
          >
            詳細設定...
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="prop-empty">
      <p>図形を選択するとプロパティが表示されます</p>
      <p style={{ fontSize: '0.92em', color: '#888', marginTop: 12 }}>
        Tip: キャンバスで Box や Line をクリック（Shift+クリックで追加選択）
      </p>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function getCommon<T, K extends keyof T>(items: T[], key: K): T[K] | undefined {
  if (items.length === 0) return undefined;
  const first = items[0][key];
  return items.every((item) => item[key] === first) ? first : undefined;
}

function getCommonStyle<K extends keyof NonNullable<Box['style']>>(
  items: Box[],
  key: K
): NonNullable<Box['style']>[K] | undefined {
  if (items.length === 0) return undefined;
  const first = items[0].style?.[key];
  return items.every((item) => item.style?.[key] === first) ? first : undefined;
}

// ============================================================================
// Box Properties
// ============================================================================

// ラベル入力欄 + 装飾ツールバー（単一選択時のみ使用）
function LabelWithToolbar({ box, updateBox }: {
  box: Box;
  updateBox: (id: string, patch: Partial<Box>) => void;
}) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  return (
    <div className="prop-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 4 }}>
      <label>ラベル</label>
      <RichTextToolbar
        textareaRef={taRef}
        value={box.label}
        onChange={(next) => updateBox(box.id, { label: next })}
        compact
      />
      <textarea
        ref={taRef}
        value={box.label}
        onChange={(e) => updateBox(box.id, { label: e.target.value })}
        rows={3}
        style={{ width: '100%', resize: 'vertical' }}
      />
      <div style={{ fontSize: '0.75em', color: '#888' }}>
        例: これは &lt;b&gt;重要&lt;/b&gt; な &lt;color=#cc0000&gt;分岐点&lt;/color&gt;
      </div>
    </div>
  );
}

type PropTab = 'basic' | 'label' | 'idLabel' | 'subLabel' | 'autoFit';
type LineTab = 'basic' | 'endpoint' | 'info';

function BoxProperties({ boxes }: { boxes: Box[] }) {
  const updateBox = useTEMStore((s) => s.updateBox);
  const updateBoxes = useTEMStore((s) => s.updateBoxes);
  const removeBoxes = useTEMStore((s) => s.removeBoxes);
  const renameBoxId = useTEMStore((s) => s.renameBoxId);
  const changeBoxType = useTEMStore((s) => s.changeBoxType);
  const levelStep = useTEMStore((s) => s.doc.settings.levelStep);
  const layout = useTEMStore((s) => s.doc.settings.layout);
  const [tab, setTab] = useState<PropTab>('basic');

  const isMulti = boxes.length > 1;
  const first = boxes[0];
  const ids = boxes.map((b) => b.id);

  const commonType = getCommon(boxes, 'type');
  const commonWidth = getCommon(boxes, 'width');
  const commonHeight = getCommon(boxes, 'height');
  const commonOrientation = getCommon(boxes, 'textOrientation') ?? 'horizontal';
  const commonBold = getCommonStyle(boxes, 'bold');
  const commonItalic = getCommonStyle(boxes, 'italic');
  const commonUnderline = getCommonStyle(boxes, 'underline');
  const commonFontSize = getCommonStyle(boxes, 'fontSize');
  const commonFontFamily = getCommonStyle(boxes, 'fontFamily');
  const commonTextAlign = getCommonStyle(boxes, 'textAlign');
  const commonVAlign = getCommonStyle(boxes, 'verticalAlign');
  const commonSubLabel = getCommon(boxes, 'subLabel');
  const commonSubLabelFS = getCommon(boxes, 'subLabelFontSize');
  const commonSubOffX = getCommon(boxes, 'subLabelOffsetX');
  const commonSubOffY = getCommon(boxes, 'subLabelOffsetY');

  const handleRenameId = () => {
    if (isMulti) return;
    const newId = prompt('新しいIDを入力', first.id);
    if (!newId || newId === first.id) return;
    const ok = renameBoxId(first.id, newId);
    if (!ok) alert('IDの変更に失敗しました（重複または無効なID）');
  };

  const renderNumInput = (
    label: string,
    common: number | undefined,
    onChange: (v: number) => void,
    min?: number,
    max?: number,
  ) => (
    <div className="prop-row">
      <label>{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={common === undefined ? '' : common}
        placeholder={common === undefined ? '（混在）' : ''}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!isNaN(v)) onChange(v);
        }}
      />
    </div>
  );

  return (
    <div className="prop-section">
      <h4>Box {isMulti && <span className="multi-badge">{boxes.length}個</span>}</h4>

      <div className="settings-tabs" style={{ marginBottom: 8, padding: 0 }}>
        <button className={tab === 'basic' ? 'settings-tab active' : 'settings-tab'} onClick={() => setTab('basic')}>基本</button>
        <button className={tab === 'label' ? 'settings-tab active' : 'settings-tab'} onClick={() => setTab('label')}>ラベル</button>
        <button className={tab === 'idLabel' ? 'settings-tab active' : 'settings-tab'} onClick={() => setTab('idLabel')}>タイプラベル</button>
        <button className={tab === 'subLabel' ? 'settings-tab active' : 'settings-tab'} onClick={() => setTab('subLabel')}>サブラベル</button>
        <button className={tab === 'autoFit' ? 'settings-tab active' : 'settings-tab'} onClick={() => setTab('autoFit')}>自動調整</button>
      </div>

      {/* ========== 基本 ========== */}
      {tab === 'basic' && <>
        {!isMulti && (
          <div className="prop-row">
            <label>ID</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <input value={first.id} readOnly style={{ flex: 1, fontFamily: 'monospace' }} />
              <button className="style-btn" onClick={handleRenameId} title="ID変更">✎</button>
            </div>
          </div>
        )}
        <div className="prop-row">
          <label>種別{!isMulti && <span style={{ fontSize: '0.85em', color: '#888', marginLeft: 6 }}>（変更時にID自動更新）</span>}</label>
          <select
            value={commonType ?? ''}
            onChange={(e) => {
              const newType = e.target.value as BoxType;
              if (!isMulti) changeBoxType(first.id, newType);
              else ids.forEach((id) => changeBoxType(id, newType));
            }}
          >
            {commonType === undefined && <option value="">（混在）</option>}
            {SELECTABLE_BOX_TYPES.map((t) => (
              <option key={t} value={t}>{BOX_TYPE_LABELS[t].ja}</option>
            ))}
          </select>
        </div>
        {!isMulti && (
          <div className="prop-row">
            <label>位置（Time / Item Level）</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="number"
                step={levelStep}
                value={xyToTimeLevel(first.x, first.y, layout).toFixed(1)}
                onChange={(e) => {
                  const newPos = setTimeLevelOnly(first.x, first.y, Number(e.target.value), layout);
                  updateBox(first.id, newPos);
                }}
                title={layout === 'horizontal' ? 'Time_Level (→+)' : 'Time_Level (↓+)'}
              />
              <input
                type="number"
                step={levelStep}
                value={xyToItemLevel(first.x, first.y, layout).toFixed(1)}
                onChange={(e) => {
                  const newPos = setItemLevelOnly(first.x, first.y, Number(e.target.value), layout);
                  updateBox(first.id, newPos);
                }}
                title={layout === 'horizontal' ? 'Item_Level (↑+)' : 'Item_Level (→+)'}
              />
            </div>
          </div>
        )}
        {renderNumInput('幅 (px)', commonWidth, (v) => updateBoxes(ids, { width: v }), 20, 1000)}
        {renderNumInput('高さ (px)', commonHeight, (v) => updateBoxes(ids, { height: v }), 20, 1000)}
        <CollapsibleSection title="IDバッジ" sectionKey="box-basic-id-badge" compact defaultOpen={false}>
          <div className="prop-row">
            <label>フォントサイズ</label>
            <input
              type="number"
              min={6}
              max={40}
              value={getCommon(boxes, 'idFontSize') ?? 10}
              placeholder={getCommon(boxes, 'idFontSize') === undefined ? '（混在）' : ''}
              onChange={(e) => updateBoxes(ids, { idFontSize: Number(e.target.value) })}
            />
          </div>
          <div className="prop-row">
            <label>位置調整 X / Y</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="number"
                value={getCommon(boxes, 'idOffsetX') ?? 0}
                placeholder={getCommon(boxes, 'idOffsetX') === undefined ? '混在' : ''}
                onChange={(e) => updateBoxes(ids, { idOffsetX: Number(e.target.value) })}
              />
              <input
                type="number"
                value={getCommon(boxes, 'idOffsetY') ?? 0}
                placeholder={getCommon(boxes, 'idOffsetY') === undefined ? '混在' : ''}
                onChange={(e) => updateBoxes(ids, { idOffsetY: Number(e.target.value) })}
              />
            </div>
          </div>
        </CollapsibleSection>
      </>}

      {/* ========== ラベル ========== */}
      {tab === 'label' && <>
        {!isMulti && <LabelWithToolbar box={first} updateBox={updateBox} />}
        <FontFamilyRow
          value={commonFontFamily}
          onChange={(v) => updateBoxes(ids, { style: { ...first.style, fontFamily: v } })}
        />
        <FontSizeRow
          value={commonFontSize}
          onChange={(v) => updateBoxes(ids, { style: { ...first.style, fontSize: v } })}
        />
        <BoldItalicUnderlineRow
          bold={commonBold}
          italic={commonItalic}
          underline={commonUnderline}
          onBoldToggle={(v) => updateBoxes(ids, { style: { ...first.style, bold: v } })}
          onItalicToggle={(v) => updateBoxes(ids, { style: { ...first.style, italic: v } })}
          onUnderlineToggle={(v) => updateBoxes(ids, { style: { ...first.style, underline: v } })}
        />
        <ColorRow
          label="文字色"
          value={first.style?.color}
          onChange={(c) => updateBoxes(ids, { style: { ...first.style, color: c } })}
          defaultLabel="既定 (#222)"
        />
        <ColorRow
          label="背景色"
          value={first.style?.backgroundColor}
          onChange={(c) => updateBoxes(ids, { style: { ...first.style, backgroundColor: c } })}
          allowNone
          defaultLabel="既定 (白)"
        />
        <ColorRow
          label="枠線色"
          value={first.style?.borderColor}
          onChange={(c) => updateBoxes(ids, { style: { ...first.style, borderColor: c } })}
          allowNone
          defaultLabel="既定 (#222)"
        />
        <div className="prop-row">
          <label>テキスト方向</label>
          <select
            value={commonOrientation}
            onChange={(e) => updateBoxes(ids, { textOrientation: e.target.value as 'horizontal' | 'vertical' })}
          >
            <option value="horizontal">横書き</option>
            <option value="vertical">縦書き</option>
          </select>
        </div>
        {commonOrientation === 'vertical' && (
          <div className="prop-row">
            <label>半角英数の向き（縦書き時）</label>
            <select
              value={getCommon(boxes, 'asciiUpright') === undefined ? '' : (getCommon(boxes, 'asciiUpright') ? 'upright' : 'mixed')}
              onChange={(e) => updateBoxes(ids, { asciiUpright: e.target.value === 'upright' })}
            >
              {getCommon(boxes, 'asciiUpright') === undefined && <option value="">（混在）</option>}
              <option value="upright">縦向き（上下に積む）</option>
              <option value="mixed">横倒し（伝統的）</option>
            </select>
          </div>
        )}
        <TextAlignRow
          value={commonTextAlign}
          onChange={(v) => updateBoxes(ids, { style: { ...first.style, textAlign: v } })}
        />
        <VerticalAlignRow
          value={commonVAlign}
          onChange={(v) => updateBoxes(ids, { style: { ...first.style, verticalAlign: v } })}
        />
      </>}

      {/* ========== タイプラベル（種別バッジ） ========== */}
      {tab === 'idLabel' && <>
        <p className="hint" style={{ marginTop: 0 }}>
          Box 種別を表すバッジの装飾です。連番表記を ON にすると同種別 Box が複数のとき自動連番:<br />
          EFP / P-EFP: "EFP" → "2nd EFP" → "3rd EFP" … / その他: "OPP-1" / "BFP-2" …
        </p>
        <div className="prop-row">
          <label>連番表記</label>
          <input
            type="checkbox"
            checked={getCommon(boxes, 'typeLabelNumbered') !== false}
            onChange={(e) => updateBoxes(ids, { typeLabelNumbered: e.target.checked ? undefined : false })}
            title="OFF にすると種別名のみ表示（例: OPP-1 → OPP）"
          />
        </div>
        <FontSizeRow
          value={getCommon(boxes, 'typeLabelFontSize')}
          onChange={(v) => updateBoxes(ids, { typeLabelFontSize: v })}
          fallbackValue={11}
          max={40}
        />
        <FontFamilyRow
          value={getCommon(boxes, 'typeLabelFontFamily')}
          onChange={(v) => updateBoxes(ids, { typeLabelFontFamily: v })}
          emptyOptionLabel="（Box本体と同じ）"
        />
        <BoldItalicUnderlineRow
          bold={getCommon(boxes, 'typeLabelBold') !== false}
          italic={!!getCommon(boxes, 'typeLabelItalic')}
          onBoldToggle={(v) => updateBoxes(ids, { typeLabelBold: v })}
          onItalicToggle={(v) => updateBoxes(ids, { typeLabelItalic: v })}
        />
        <div className="prop-row">
          <label>半角英数向き（縦型）</label>
          <select
            value={getCommon(boxes, 'typeLabelAsciiUpright') === undefined
              ? ''
              : (getCommon(boxes, 'typeLabelAsciiUpright') ? 'upright' : 'mixed')}
            onChange={(e) => updateBoxes(ids, { typeLabelAsciiUpright: e.target.value === 'upright' })}
          >
            {getCommon(boxes, 'typeLabelAsciiUpright') === undefined && <option value="">（Box本体と同じ）</option>}
            <option value="upright">縦向き</option>
            <option value="mixed">横倒し</option>
          </select>
        </div>
        <ColorRow
          label="文字色"
          value={getCommon(boxes, 'typeLabelColor')}
          onChange={(c) => updateBoxes(ids, { typeLabelColor: c })}
          defaultLabel="既定 (#222)"
        />
        <ColorRow
          label="背景色"
          value={getCommon(boxes, 'typeLabelBackgroundColor')}
          onChange={(c) => updateBoxes(ids, { typeLabelBackgroundColor: c })}
          allowNone
          defaultLabel="既定 (透明)"
        />
        <ColorRow
          label="枠線色"
          value={getCommon(boxes, 'typeLabelBorderColor')}
          onChange={(c) => updateBoxes(ids, { typeLabelBorderColor: c })}
          allowNone
          defaultLabel="既定 (枠なし)"
        />
        <div className="prop-row">
          <label>枠線太さ (px)</label>
          <input
            type="number"
            min={0}
            max={5}
            step={0.5}
            value={getCommon(boxes, 'typeLabelBorderWidth') ?? 0}
            placeholder={getCommon(boxes, 'typeLabelBorderWidth') === undefined ? '混在' : ''}
            onChange={(e) => updateBoxes(ids, { typeLabelBorderWidth: Number(e.target.value) })}
            title="0 = 枠線なし"
          />
        </div>
      </>}

      {/* ========== サブラベル ========== */}
      {tab === 'subLabel' && <>
        <div className="prop-row">
          <label>サブラベル（協力者ID等）</label>
          <input
            type="text"
            value={!isMulti ? (first.subLabel ?? '') : (commonSubLabel ?? '')}
            placeholder={isMulti && commonSubLabel === undefined ? '（混在）' : '例: Aさん'}
            onChange={(e) => updateBoxes(ids, { subLabel: e.target.value })}
          />
        </div>
        <div className="prop-row">
          <label>フォントサイズ</label>
          <input
            type="number"
            min={6}
            max={40}
            value={commonSubLabelFS ?? 10}
            placeholder={commonSubLabelFS === undefined ? '（混在）' : ''}
            onChange={(e) => updateBoxes(ids, { subLabelFontSize: Number(e.target.value) })}
          />
        </div>
        <div className="prop-row">
          <label>位置調整 X / Y</label>
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              type="number"
              value={commonSubOffX ?? 0}
              placeholder={commonSubOffX === undefined ? '混在' : ''}
              onChange={(e) => updateBoxes(ids, { subLabelOffsetX: Number(e.target.value) })}
            />
            <input
              type="number"
              value={commonSubOffY ?? 0}
              placeholder={commonSubOffY === undefined ? '混在' : ''}
              onChange={(e) => updateBoxes(ids, { subLabelOffsetY: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="prop-row">
          <label>半角英数の向き（縦型）</label>
          <select
            value={getCommon(boxes, 'subLabelAsciiUpright') === undefined
              ? ''
              : (getCommon(boxes, 'subLabelAsciiUpright') ? 'upright' : 'mixed')}
            onChange={(e) => updateBoxes(ids, { subLabelAsciiUpright: e.target.value === 'upright' })}
          >
            {getCommon(boxes, 'subLabelAsciiUpright') === undefined && <option value="">（Box本体と同じ）</option>}
            <option value="upright">縦向き（上下積み）</option>
            <option value="mixed">横倒し（伝統的）</option>
          </select>
        </div>
        <ColorRow
          label="文字色"
          value={getCommon(boxes, 'subLabelColor')}
          onChange={(c) => updateBoxes(ids, { subLabelColor: c })}
          defaultLabel="既定 (#555)"
        />
        <ColorRow
          label="背景色"
          value={getCommon(boxes, 'subLabelBackgroundColor')}
          onChange={(c) => updateBoxes(ids, { subLabelBackgroundColor: c })}
          allowNone
          defaultLabel="既定 (白半透明)"
        />
        <ColorRow
          label="枠線色"
          value={getCommon(boxes, 'subLabelBorderColor')}
          onChange={(c) => updateBoxes(ids, { subLabelBorderColor: c })}
          allowNone
          defaultLabel="既定 (枠なし)"
        />
        <div className="prop-row">
          <label>枠線太さ (px)</label>
          <input
            type="number"
            min={0}
            max={5}
            step={0.5}
            value={getCommon(boxes, 'subLabelBorderWidth') ?? 0}
            placeholder={getCommon(boxes, 'subLabelBorderWidth') === undefined ? '混在' : ''}
            onChange={(e) => updateBoxes(ids, { subLabelBorderWidth: Number(e.target.value) })}
            title="0 = 枠線なし"
          />
        </div>
      </>}

      {/* ========== 自動調整 ========== */}
      {tab === 'autoFit' && <>
        <div className="prop-row">
          <label>文字サイズを自動調整</label>
          <input
            type="checkbox"
            checked={getCommon(boxes, 'autoFitText') === true}
            onChange={(e) => updateBoxes(ids, { autoFitText: e.target.checked })}
            title="Box に収まる最大サイズへ文字を縮小・拡大"
          />
        </div>
        <div className="prop-row">
          <label>Box 自動拡張モード</label>
          <select
            value={getCommon(boxes, 'autoFitBoxMode') ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              updateBoxes(ids, { autoFitBoxMode: v === '' ? undefined : (v as AutoFitBoxMode) });
            }}
          >
            <option value="">（全体既定に従う）</option>
            <option value="none">自動拡張なし</option>
            <option value="width-fixed">横幅固定で高さ自動</option>
            <option value="height-fixed">高さ固定で横幅自動</option>
          </select>
        </div>
        <p className="hint" style={{ margin: 0 }}>
          文字サイズ自動調整が ON のとき自動拡張モードは停止します（同時有効不可）
        </p>
        <div className="prop-row" style={{ flexWrap: 'wrap', gap: 4, justifyContent: 'flex-start' }}>
          <button className="ribbon-btn-small"
            onClick={() => useTEMStore.getState().fitBoxesToLabel(ids)}
            title="現在のラベル文字数に合わせて Box サイズを最小化">Box を文字に合わせる</button>
          <button className="ribbon-btn-small"
            onClick={() => useTEMStore.getState().fitBoxesTextToBox(ids)}
            title="Box のサイズに合わせて文字サイズを自動調整（1 回適用）">文字を Box に合わせる</button>
          {isMulti && (
            <>
              <button className="ribbon-btn-small"
                onClick={() => useTEMStore.getState().matchBoxesSize(ids, 'width')}>幅揃え</button>
              <button className="ribbon-btn-small"
                onClick={() => useTEMStore.getState().matchBoxesSize(ids, 'height')}>高さ揃え</button>
              <button className="ribbon-btn-small"
                onClick={() => useTEMStore.getState().matchBoxesSize(ids, 'both')}>サイズ揃え</button>
              <button className="ribbon-btn-small"
                onClick={() => useTEMStore.getState().matchBoxesFontSize(ids)}>文字サイズ揃え</button>
            </>
          )}
        </div>
        <CollapsibleSection title="論文レポート用" sectionKey="box-autofit-paper-report" compact defaultOpen={false}>
          {!isMulti && (
            <div className="prop-row" style={{ alignItems: 'flex-start' }}>
              <label>説明文</label>
              <textarea
                value={first.description ?? ''}
                onChange={(e) => updateBoxes([first.id], { description: e.target.value })}
                style={{ width: '100%', minHeight: 60, resize: 'vertical' }}
                placeholder="この Box の意味・解釈（論文レポートに出力）"
              />
            </div>
          )}
          <div className="prop-row">
            <label>説明不要（自明）</label>
            <input
              type="checkbox"
              checked={getCommon(boxes, 'noDescriptionNeeded') === true}
              onChange={(e) => updateBoxes(ids, { noDescriptionNeeded: e.target.checked })}
            />
          </div>
        </CollapsibleSection>
      </>}

      <div className="prop-row">
        <button className="danger-btn" onClick={() => removeBoxes(ids)}>削除</button>
      </div>
    </div>
  );
}

// ============================================================================
// SDSG Properties
// ============================================================================
function SDSGProperties({ sdsgs }: { sdsgs: SDSG[] }) {
  const updateSDSG = useTEMStore((s) => s.updateSDSG);
  const updateSDSGs = useTEMStore((s) => s.updateSDSGs);
  const matchSDSGsSize = useTEMStore((s) => s.matchSDSGsSize);
  const matchSDSGsFontSize = useTEMStore((s) => s.matchSDSGsFontSize);
  const removeSDSG = useTEMStore((s) => s.removeSDSG);
  const setSDSGSpaceMode = useTEMStore((s) => s.setSDSGSpaceMode);
  const sdsgSpace = useTEMStore((s) => s.doc.settings.sdsgSpace);
  const sdsgLayout = useTEMStore((s) => s.doc.settings.layout);
  const sheet = useActiveSheet();
  const isMulti = sdsgs.length > 1;
  const first = sdsgs[0];
  const ids = sdsgs.map((s) => s.id);
  const [tab, setTab] = useState<PropTab>('basic');

  // 複数選択対応用の共通値（ラベル / idLabel / subLabel タブで使用）
  const commonFont = getCommonStyle(sdsgs as unknown as Box[], 'fontFamily');
  const commonFS = getCommonStyle(sdsgs as unknown as Box[], 'fontSize');
  const commonBold = getCommonStyle(sdsgs as unknown as Box[], 'bold');
  const commonItalic = getCommonStyle(sdsgs as unknown as Box[], 'italic');
  const commonUnderline = getCommonStyle(sdsgs as unknown as Box[], 'underline');
  const commonTextColor = getCommonStyle(sdsgs as unknown as Box[], 'color');
  const commonBg = getCommonStyle(sdsgs as unknown as Box[], 'backgroundColor');
  const commonBorder = getCommonStyle(sdsgs as unknown as Box[], 'borderColor');
  const commonTextAlign = getCommonStyle(sdsgs as unknown as Box[], 'textAlign');
  const commonVAlign = getCommonStyle(sdsgs as unknown as Box[], 'verticalAlign');
  const commonAscii = getCommon(sdsgs, 'asciiUpright');

  const commonTLFontSize = getCommon(sdsgs, 'typeLabelFontSize');
  const commonTLFontFamily = getCommon(sdsgs, 'typeLabelFontFamily');
  const commonTLBold = getCommon(sdsgs, 'typeLabelBold');
  const commonTLItalic = getCommon(sdsgs, 'typeLabelItalic');
  const commonTLNumbered = getCommon(sdsgs, 'typeLabelNumbered');
  const commonTLAscii = getCommon(sdsgs, 'typeLabelAsciiUpright');
  const commonTLColor = getCommon(sdsgs, 'typeLabelColor');
  const commonTLBg = getCommon(sdsgs, 'typeLabelBackgroundColor');
  const commonTLBorderColor = getCommon(sdsgs, 'typeLabelBorderColor');
  const commonTLBorderWidth = getCommon(sdsgs, 'typeLabelBorderWidth');

  const commonSubFS = getCommon(sdsgs, 'subLabelFontSize');
  const commonSubOffX = getCommon(sdsgs, 'subLabelOffsetX');
  const commonSubOffY = getCommon(sdsgs, 'subLabelOffsetY');
  const commonSubAscii = getCommon(sdsgs, 'subLabelAsciiUpright');
  const commonSubColor = getCommon(sdsgs, 'subLabelColor');
  const commonSubBg = getCommon(sdsgs, 'subLabelBackgroundColor');
  const commonSubBorderColor = getCommon(sdsgs, 'subLabelBorderColor');
  const commonSubBorderWidth = getCommon(sdsgs, 'subLabelBorderWidth');
  const isH = sdsgLayout === 'horizontal';
  const topBandLabel = isH ? '上部 (SD) に配置' : '右側 (SD) に配置';
  const bottomBandLabel = isH ? '下部 (SG) に配置' : '左側 (SG) に配置';

  // outOfRange 判定 (選択中の SDSG いずれかが帯からはみ出しているか)
  const projectSettings = useTEMStore((s) => s.doc.settings);
  const outOfRangeSDSGs = sheet
    ? sdsgs.filter((sg) => isSDSGOutOfRange(sg, sheet, sdsgLayout, projectSettings))
    : [];
  const hasOutOfRange = outOfRangeSDSGs.length > 0;
  const firstOutBand = outOfRangeSDSGs[0]
    ? (outOfRangeSDSGs[0].spaceMode === 'band-top' ? 'top' : 'bottom')
    : null;
  const updateBandPatch = (which: 'top' | 'bottom', patch: Partial<NonNullable<typeof projectSettings.sdsgSpace>['bands']['top']>) => {
    useTEMStore.setState((state) => ({
      doc: produce(state.doc, (d) => {
        if (!d.settings.sdsgSpace) return;
        d.settings.sdsgSpace.bands[which] = { ...d.settings.sdsgSpace.bands[which], ...patch };
      }),
    }));
  };
  const fixEnableAutoExpand = () => {
    if (!firstOutBand) return;
    updateBandPatch(firstOutBand, { autoExpandHeight: true, heightMode: 'manual' });
  };
  const fixEnableShrink = () => {
    if (!firstOutBand) return;
    updateBandPatch(firstOutBand, { shrinkToFitRow: true });
  };
  const fixDecreaseRow = () => {
    outOfRangeSDSGs.forEach((sg) => {
      const cur = sg.spaceRowOverride ?? 0;
      updateSDSG(sg.id, { spaceRowOverride: Math.max(0, cur - 1) });
    });
  };

  const changeSpaceMode = (newMode: 'attached' | 'band-top' | 'band-bottom') => {
    const ids = sdsgs.map((s) => s.id);
    // 種別と帯の組合せチェック
    const allowMismatched = sdsgSpace?.allowMismatchedPlacement ?? false;
    if (!allowMismatched) {
      const blocked = sdsgs.find(
        (s) =>
          (newMode === 'band-top' && s.type === 'SG') ||
          (newMode === 'band-bottom' && s.type === 'SD'),
      );
      if (blocked) {
        alert(
          `既定では SD は上部(SD)帯のみ、SG は下部(SG)帯のみ配置可能です。\n逆向きに配置するには設定 > SD/SG 配置 で「組合せ制限を解除」を ON にしてください。`,
        );
        return;
      }
    }
    if (!confirm('配置モードを変更すると、時間/項目オフセットと帯内 Inset がリセットされます。よろしいですか?')) return;
    setSDSGSpaceMode(ids, newMode);
  };

  return (
    <div className="prop-section">
      <h4>SD/SG {isMulti && <span className="multi-badge">{sdsgs.length}個</span>}</h4>

      <div className="settings-tabs" style={{ marginBottom: 8, padding: 0 }}>
        <button className={tab === 'basic' ? 'settings-tab active' : 'settings-tab'} onClick={() => setTab('basic')}>基本</button>
        <button className={tab === 'label' ? 'settings-tab active' : 'settings-tab'} onClick={() => setTab('label')}>ラベル</button>
        <button className={tab === 'idLabel' ? 'settings-tab active' : 'settings-tab'} onClick={() => setTab('idLabel')}>タイプラベル</button>
        <button className={tab === 'subLabel' ? 'settings-tab active' : 'settings-tab'} onClick={() => setTab('subLabel')}>サブラベル</button>
        <button className={tab === 'autoFit' ? 'settings-tab active' : 'settings-tab'} onClick={() => setTab('autoFit')}>自動調整</button>
      </div>

      {!isMulti && (
        <>
          {/* ========== 基本 ========== */}
          {tab === 'basic' && <>
            <div className="prop-row">
              <label>ID</label>
              <input value={first.id} readOnly style={{ fontFamily: 'monospace', fontSize: '0.85em' }} />
            </div>
            <div className="prop-row">
              <label>種別</label>
              <select
                value={first.type}
                onChange={(e) => updateSDSG(first.id, { type: e.target.value as 'SD' | 'SG' })}
              >
                <option value="SD">SD (社会的方向づけ)</option>
                <option value="SG">SG (社会的ガイド)</option>
              </select>
            </div>
            <div className="prop-row">
              <label>紐付け対象 (attachedTo)</label>
              {sheet ? (
                <select
                  value={first.attachedTo}
                  onChange={(e) => updateSDSG(first.id, { attachedTo: e.target.value })}
                  style={{ fontFamily: 'monospace', fontSize: '0.85em' }}
                >
                  {/* 現在値が Box / Line どちらにも無い場合の救済 */}
                  {!sheet.boxes.some((b) => b.id === first.attachedTo)
                    && !sheet.lines.some((l) => l.id === first.attachedTo) && (
                    <option value={first.attachedTo}>（現: {first.attachedTo}）</option>
                  )}
                  <optgroup label="Box">
                    {sheet.boxes.map((b) => (
                      <option key={b.id} value={b.id}>Box: {b.id} — {b.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Line">
                    {sheet.lines.map((l) => (
                      <option key={l.id} value={l.id}>Line: {l.id}</option>
                    ))}
                  </optgroup>
                </select>
              ) : null}
            </div>

            {/* アンカー方式（band/attached どちらでも表示。band + between も可） */}
            <div className="prop-row">
              <label>アンカー方式</label>
              <select
                value={first.anchorMode ?? 'single'}
                onChange={(e) => {
                  const mode = e.target.value as 'single' | 'between';
                  if (mode === 'between' && !first.attachedTo2) {
                    alert('between モードには 2 つ目の対象の指定が必要です。下の「2 つ目の対象」で選択してください');
                  }
                  updateSDSG(first.id, { anchorMode: mode });
                }}
              >
                <option value="single">single（単一）</option>
                <option value="between">between（2 アイテム間）</option>
              </select>
            </div>
            {first.anchorMode === 'between' && (
              <div className="prop-row">
                <label>2 つ目の対象 (attachedTo2)</label>
                {sheet ? (
                  <select
                    value={first.attachedTo2 ?? ''}
                    onChange={(e) => updateSDSG(first.id, { attachedTo2: e.target.value || undefined })}
                    style={{ fontFamily: 'monospace', fontSize: '0.85em' }}
                  >
                    <option value="">（未指定）</option>
                    <optgroup label="Box">
                      {sheet.boxes.filter((b) => b.id !== first.attachedTo).map((b) => (
                        <option key={b.id} value={b.id}>Box: {b.id} — {b.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Line">
                      {sheet.lines.filter((l) => l.id !== first.attachedTo).map((l) => (
                        <option key={l.id} value={l.id}>Line: {l.id}</option>
                      ))}
                    </optgroup>
                  </select>
                ) : null}
              </div>
            )}
            {first.anchorMode === 'between' && (
              <div className="prop-row">
                <label>幅の定義</label>
                <select
                  value={first.betweenMode ?? 'edge-to-edge'}
                  onChange={(e) => updateSDSG(first.id, { betweenMode: e.target.value as 'edge-to-edge' | 'center-to-center' })}
                >
                  <option value="edge-to-edge">Box 端から Box 端まで（既定）</option>
                  <option value="center-to-center">Box 中心から Box 中心まで</option>
                </select>
              </div>
            )}

            {/* 配置方式 */}
            <div className="prop-row">
              <label>配置方式</label>
              <select
                value={(first.spaceMode === 'band-top' || first.spaceMode === 'band-bottom') ? 'band' : 'attached'}
                onChange={(e) => {
                  const val = e.target.value as 'attached' | 'band';
                  if (val === 'attached') {
                    changeSpaceMode('attached');
                  } else {
                    const target = first.type === 'SD' ? 'band-top' : 'band-bottom';
                    changeSpaceMode(target);
                  }
                }}
              >
                <option value="attached">attached（Box に追従）</option>
                <option value="band">band（専用帯に配置）</option>
              </select>
            </div>

            {/* band モード固有の設定 */}
            {(first.spaceMode === 'band-top' || first.spaceMode === 'band-bottom') && (
              <>
                <div className="prop-row">
                  <label>帯位置</label>
                  <select
                    value={first.spaceMode}
                    onChange={(e) => changeSpaceMode(e.target.value as 'band-top' | 'band-bottom')}
                  >
                    <option value="band-top">{topBandLabel}</option>
                    <option value="band-bottom">{bottomBandLabel}</option>
                  </select>
                </div>
                {!sdsgSpace?.enabled && (
                  <div className="prop-row" style={{ padding: 6, background: '#fff8e1', border: '1px solid #ffc107', borderRadius: 4 }}>
                    <span style={{ fontSize: '0.85em', color: '#856404' }}>
                      ⚠ SD/SG 配置機能が OFF です。band モード変更時に自動で ON になります。
                    </span>
                  </div>
                )}
                {first.anchorMode === 'between' && (
                  <div className="prop-row" style={{ padding: 6, background: '#e3f2fd', border: '1px solid #2196f3', borderRadius: 4 }}>
                    <span style={{ fontSize: '0.82em', color: '#0d47a1' }}>
                      ℹ between + band 組合せ: 時間軸方向の幅は 2 Box 間のスパンで自動計算されます (spaceWidth/spaceHeight の時間軸値は無視)。
                      row と spaceInsetItem で アイテム軸配置を制御できます。
                    </span>
                  </div>
                )}
                {hasOutOfRange && (
                  <div
                    className="prop-row"
                    style={{
                      padding: 8,
                      background: '#fdecea',
                      border: '1px solid #e74c3c',
                      borderRadius: 4,
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 6,
                    }}
                  >
                    <span style={{ fontSize: '0.85em', color: '#a02722', fontWeight: 'bold' }}>
                      ⚠ 帯からはみ出しています（{outOfRangeSDSGs.length}件）
                    </span>
                    <span style={{ fontSize: '0.78em', color: '#5b1a17' }}>
                      row 数が帯の高さを超えています。以下のいずれかで解消:
                    </span>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <button
                        className="ribbon-btn-small"
                        onClick={fixEnableAutoExpand}
                        title="帯を縦方向に自動拡張 (manual heightMode に切替 + autoExpandHeight ON)"
                      >帯を拡張</button>
                      <button
                        className="ribbon-btn-small"
                        onClick={fixEnableShrink}
                        title="SDSG を row span に合わせて自動圧縮 (shrinkToFitRow ON)"
                      >SDSG を圧縮</button>
                      <button
                        className="ribbon-btn-small"
                        onClick={fixDecreaseRow}
                        title="選択中 SDSG の row を 1 つ内側 (Box 寄り) へ"
                      >row を内側へ</button>
                    </div>
                  </div>
                )}
                <CollapsibleSection title="帯モード詳細" sectionKey="sdsg-basic-band-detail" compact defaultOpen={true}>
                <div className="prop-row">
                  <label>帯内 Row 指定</label>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={first.spaceRowOverride ?? ''}
                      placeholder="自動"
                      onChange={(e) => {
                        const v = e.target.value;
                        updateSDSG(first.id, { spaceRowOverride: v === '' ? undefined : Math.max(0, Number(v)) });
                      }}
                      style={{ width: 60 }}
                      title="帯内で割り当てる row を手動指定（0=最内側 Box 群寄り、大きいほど外側）。空欄で自動整列"
                    />
                    <button className="ribbon-btn-small"
                      onClick={() => {
                        const cur = first.spaceRowOverride ?? 0;
                        updateSDSG(first.id, { spaceRowOverride: Math.max(0, cur - 1) });
                      }}
                      title="row を 1 つ内側（Box 群寄り）へ">↑</button>
                    <button className="ribbon-btn-small"
                      onClick={() => {
                        const cur = first.spaceRowOverride ?? 0;
                        updateSDSG(first.id, { spaceRowOverride: cur + 1 });
                      }}
                      title="row を 1 つ外側へ">↓</button>
                    <button className="ribbon-btn-small"
                      onClick={() => updateSDSG(first.id, { spaceRowOverride: undefined })}
                      title="自動整列に戻す">自動</button>
                  </div>
                </div>
                <div className="prop-row">
                  <label>帯内 Time オフセット (px)</label>
                  <input
                    type="number"
                    step={0.5}
                    value={first.spaceInsetTime ?? 0}
                    onChange={(e) => updateSDSG(first.id, { spaceInsetTime: Number(e.target.value) })}
                  />
                </div>
                <div className="prop-row">
                  <label>帯内 Item オフセット (px)</label>
                  <input
                    type="number"
                    step={0.5}
                    value={first.spaceInsetItem ?? 0}
                    onChange={(e) => updateSDSG(first.id, { spaceInsetItem: Number(e.target.value) })}
                  />
                </div>
                <div className="prop-row">
                  <label>{isH ? '幅 (時間軸, px)' : '幅 (アイテム軸, px)'}</label>
                  <input
                    type="number"
                    value={first.spaceWidth ?? first.width ?? 70}
                    onChange={(e) => updateSDSG(first.id, { spaceWidth: Number(e.target.value) })}
                    title={isH
                      ? '時間軸方向の SDSG 幅。attached Box の幅に制約されないので、前後 Box を跨いで広げられる'
                      : 'アイテム軸方向の SDSG 幅。row span が自動クランプする場合があります (shrinkToFitRow)'}
                  />
                </div>
                <div className="prop-row">
                  <label>{isH ? '高さ (アイテム軸, px)' : '高さ (時間軸, px)'}</label>
                  <input
                    type="number"
                    value={first.spaceHeight ?? first.height ?? 40}
                    onChange={(e) => updateSDSG(first.id, { spaceHeight: Number(e.target.value) })}
                    title={isH
                      ? 'アイテム軸方向の SDSG 高さ。row span が自動クランプする場合があります (shrinkToFitRow)'
                      : '時間軸方向の SDSG 高さ。attached Box の高さに制約されないので、前後 Box を跨いで広げられる'}
                  />
                </div>
                <p className="hint" style={{ margin: '0 0 6px', fontSize: '0.8em', color: '#666' }}>
                  {isH
                    ? '幅=時間軸方向、高さ=アイテム軸方向。attached Box の幅を超える値を設定すれば、前後 Box を跨いだ帯内 SDSG も可能。'
                    : '幅=アイテム軸方向、高さ=時間軸方向。attached Box の高さを超える値を設定すれば、前後 Box を跨いだ帯内 SDSG も可能。'}
                </p>
                </CollapsibleSection>
              </>
            )}

            {/* attached モード固有の設定（attachedTo2 / anchorMode / betweenMode は上の共通 UI を使用） */}
            {(first.spaceMode == null || first.spaceMode === 'attached') && (
              <CollapsibleSection title="attached モード詳細" sectionKey="sdsg-basic-attached-detail" compact defaultOpen={true}>
                <div className="prop-row">
                  <label>時間オフセット (px)</label>
                  <input
                    type="number"
                    step={0.5}
                    value={first.timeOffset ?? 0}
                    onChange={(e) => updateSDSG(first.id, { timeOffset: Number(e.target.value) })}
                  />
                </div>
                <div className="prop-row">
                  <label>項目オフセット (px)</label>
                  <input
                    type="number"
                    step={0.5}
                    value={first.itemOffset ?? 0}
                    onChange={(e) => updateSDSG(first.id, { itemOffset: Number(e.target.value) })}
                  />
                </div>
                <div className="prop-row">
                  <label>幅 (px)</label>
                  <input
                    type="number"
                    value={first.width ?? 70}
                    onChange={(e) => updateSDSG(first.id, { width: Number(e.target.value) })}
                    title={first.anchorMode === 'between' ? '※ between モードでは Time 軸方向は自動計算のためこの値は無視されます' : ''}
                  />
                </div>
                <div className="prop-row">
                  <label>高さ (px)</label>
                  <input
                    type="number"
                    value={first.height ?? 40}
                    onChange={(e) => updateSDSG(first.id, { height: Number(e.target.value) })}
                  />
                </div>
              </CollapsibleSection>
            )}

            <div className="prop-row">
              <label>矩形部分の比率</label>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input
                  type="range"
                  min={0.1}
                  max={0.9}
                  step={0.05}
                  value={first.rectRatio ?? 0.55}
                  onChange={(e) => updateSDSG(first.id, { rectRatio: Number(e.target.value) })}
                  style={{ width: 90 }}
                />
                <input
                  type="number"
                  min={0.1}
                  max={0.9}
                  step={0.05}
                  value={first.rectRatio ?? 0.55}
                  onChange={(e) => updateSDSG(first.id, { rectRatio: Number(e.target.value) })}
                  style={{ width: 60 }}
                />
              </div>
            </div>
          </>}
          <div className="prop-row">
            <label>IDバッジ フォントサイズ</label>
            <input
              type="number"
              min={6}
              max={40}
              value={getCommon(sdsgs, 'idFontSize') ?? 9}
              placeholder={getCommon(sdsgs, 'idFontSize') === undefined ? '（混在）' : ''}
              onChange={(e) => updateSDSGs(ids, { idFontSize: Number(e.target.value) })}
            />
          </div>
          <div className="prop-row">
            <label>IDバッジ位置調整 X / Y</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="number"
                value={getCommon(sdsgs, 'idOffsetX') ?? 0}
                placeholder={getCommon(sdsgs, 'idOffsetX') === undefined ? '混在' : ''}
                onChange={(e) => updateSDSGs(ids, { idOffsetX: Number(e.target.value) })}
              />
              <input
                type="number"
                value={getCommon(sdsgs, 'idOffsetY') ?? 0}
                placeholder={getCommon(sdsgs, 'idOffsetY') === undefined ? '混在' : ''}
                onChange={(e) => updateSDSGs(ids, { idOffsetY: Number(e.target.value) })}
              />
            </div>
          </div>
        </>
      )}

      {/* ========== ラベル ========== (複数選択対応) */}
      {tab === 'label' && (<>
        {!isMulti && (
          <div className="prop-row">
            <label>ラベル</label>
            <input value={first.label} onChange={(e) => updateSDSG(first.id, { label: e.target.value })} />
          </div>
        )}
        <FontFamilyRow
          value={commonFont}
          onChange={(v) => updateSDSGs(ids, { style: { fontFamily: v } })}
          emptyOptionLabel="（UI 既定）"
        />
        <FontSizeRow
          value={commonFS}
          onChange={(v) => updateSDSGs(ids, { style: { fontSize: v } })}
          fallbackValue={11}
          max={40}
        />
        <BoldItalicUnderlineRow
          bold={commonBold !== false}
          italic={!!commonItalic}
          underline={!!commonUnderline}
          onBoldToggle={(v) => updateSDSGs(ids, { style: { bold: v } })}
          onItalicToggle={(v) => updateSDSGs(ids, { style: { italic: v } })}
          onUnderlineToggle={(v) => updateSDSGs(ids, { style: { underline: v } })}
        />
        <ColorRow
          label="文字色"
          value={commonTextColor}
          onChange={(c) => updateSDSGs(ids, { style: { color: c } })}
          defaultLabel="既定 (#222)"
        />
        <ColorRow
          label="背景色"
          value={commonBg}
          onChange={(c) => updateSDSGs(ids, { style: { backgroundColor: c } })}
          allowNone
          defaultLabel="既定 (白)"
        />
        <ColorRow
          label="枠線色"
          value={commonBorder}
          onChange={(c) => updateSDSGs(ids, { style: { borderColor: c } })}
          allowNone
          defaultLabel="既定 (#333)"
        />
        <TextAlignRow
          value={commonTextAlign}
          onChange={(v) => updateSDSGs(ids, { style: { textAlign: v } })}
        />
        <VerticalAlignRow
          value={commonVAlign}
          onChange={(v) => updateSDSGs(ids, { style: { verticalAlign: v } })}
        />
        <div className="prop-row">
          <label>ASCII縦向き（縦型レイアウト）</label>
          <input
            type="checkbox"
            checked={commonAscii ?? true}
            ref={(el) => { if (el) el.indeterminate = commonAscii === undefined; }}
            onChange={(e) => updateSDSGs(ids, { asciiUpright: e.target.checked })}
          />
        </div>
      </>)}

      {/* ========== タイプラベル（種別バッジ SD/SG） ========== (複数選択対応) */}
      {tab === 'idLabel' && (<>
        <p className="hint" style={{ marginTop: 0 }}>
          SD/SG 種別を表すバッジの装飾です。連番表記を ON にすると複数のとき自動で連番化（SD1, SD2, …）。
        </p>
        <div className="prop-row">
          <label>連番表記</label>
          <input
            type="checkbox"
            checked={commonTLNumbered !== false}
            ref={(el) => { if (el) el.indeterminate = commonTLNumbered === undefined; }}
            onChange={(e) => updateSDSGs(ids, { typeLabelNumbered: e.target.checked ? undefined : false })}
            title="OFF にすると SD / SG のみ表示（連番を付けない）"
          />
        </div>
        <FontSizeRow
          value={commonTLFontSize}
          onChange={(v) => updateSDSGs(ids, { typeLabelFontSize: v })}
          fallbackValue={11}
          max={40}
        />
        <FontFamilyRow
          value={commonTLFontFamily}
          onChange={(v) => updateSDSGs(ids, { typeLabelFontFamily: v })}
          emptyOptionLabel="（本文と同じ）"
        />
        <BoldItalicUnderlineRow
          bold={commonTLBold !== false}
          italic={!!commonTLItalic}
          onBoldToggle={(v) => updateSDSGs(ids, { typeLabelBold: v })}
          onItalicToggle={(v) => updateSDSGs(ids, { typeLabelItalic: v })}
        />
        <div className="prop-row">
          <label>ASCII縦向き（縦型レイアウト）</label>
          <input
            type="checkbox"
            checked={commonTLAscii ?? (commonAscii ?? true)}
            ref={(el) => { if (el) el.indeterminate = commonTLAscii === undefined; }}
            onChange={(e) => updateSDSGs(ids, { typeLabelAsciiUpright: e.target.checked })}
          />
        </div>
        <ColorRow
          label="文字色"
          value={commonTLColor}
          onChange={(c) => updateSDSGs(ids, { typeLabelColor: c })}
          defaultLabel="既定 (#222)"
        />
        <ColorRow
          label="背景色"
          value={commonTLBg}
          onChange={(c) => updateSDSGs(ids, { typeLabelBackgroundColor: c })}
          allowNone
          defaultLabel="既定 (透明)"
        />
        <ColorRow
          label="枠線色"
          value={commonTLBorderColor}
          onChange={(c) => updateSDSGs(ids, { typeLabelBorderColor: c })}
          allowNone
          defaultLabel="既定 (枠なし)"
        />
        <div className="prop-row">
          <label>枠線太さ (px)</label>
          <input
            type="number"
            min={0}
            max={5}
            step={0.5}
            value={commonTLBorderWidth ?? 0}
            placeholder={commonTLBorderWidth === undefined ? '（混在）' : ''}
            onChange={(e) => updateSDSGs(ids, { typeLabelBorderWidth: Number(e.target.value) })}
            title="0 = 枠線なし"
          />
        </div>
      </>)}

      {/* ========== サブラベル ========== (複数選択対応) */}
      {tab === 'subLabel' && (<>
        {!isMulti && (
          <div className="prop-row">
            <label>サブラベル</label>
            <input
              type="text"
              value={first.subLabel ?? ''}
              onChange={(e) => updateSDSG(first.id, { subLabel: e.target.value })}
            />
          </div>
        )}
        {isMulti && (
          <p className="hint" style={{ margin: '0 0 4px', fontSize: '0.82em', color: '#888' }}>
            ラベル本文は単一選択時のみ編集できます（現在 {sdsgs.length} 個選択中）。
          </p>
        )}
        <div className="prop-row">
          <label>フォントサイズ</label>
          <input
            type="number"
            min={6}
            max={40}
            value={commonSubFS ?? 10}
            placeholder={commonSubFS === undefined ? '（混在）' : ''}
            onChange={(e) => updateSDSGs(ids, { subLabelFontSize: Number(e.target.value) })}
          />
        </div>
        <div className="prop-row">
          <label>位置 X / Y</label>
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              type="number"
              value={commonSubOffX ?? 0}
              placeholder={commonSubOffX === undefined ? '混在' : ''}
              onChange={(e) => updateSDSGs(ids, { subLabelOffsetX: Number(e.target.value) })}
            />
            <input
              type="number"
              value={commonSubOffY ?? 0}
              placeholder={commonSubOffY === undefined ? '混在' : ''}
              onChange={(e) => updateSDSGs(ids, { subLabelOffsetY: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="prop-row">
          <label>ASCII縦向き（縦型レイアウト）</label>
          <input
            type="checkbox"
            checked={commonSubAscii ?? (commonAscii ?? true)}
            ref={(el) => { if (el) el.indeterminate = commonSubAscii === undefined; }}
            onChange={(e) => updateSDSGs(ids, { subLabelAsciiUpright: e.target.checked })}
          />
        </div>
        <ColorRow
          label="文字色"
          value={commonSubColor}
          onChange={(c) => updateSDSGs(ids, { subLabelColor: c })}
          defaultLabel="既定 (#555)"
        />
        <ColorRow
          label="背景色"
          value={commonSubBg}
          onChange={(c) => updateSDSGs(ids, { subLabelBackgroundColor: c })}
          allowNone
          defaultLabel="既定 (白半透明)"
        />
        <ColorRow
          label="枠線色"
          value={commonSubBorderColor}
          onChange={(c) => updateSDSGs(ids, { subLabelBorderColor: c })}
          allowNone
          defaultLabel="既定 (枠なし)"
        />
        <div className="prop-row">
          <label>枠線太さ (px)</label>
          <input
            type="number"
            min={0}
            max={5}
            step={0.5}
            value={commonSubBorderWidth ?? 0}
            placeholder={commonSubBorderWidth === undefined ? '（混在）' : ''}
            onChange={(e) => updateSDSGs(ids, { subLabelBorderWidth: Number(e.target.value) })}
            title="0 = 枠線なし"
          />
        </div>
      </>)}

      {/* ========== 自動調整 ========== (複数選択バッチ操作) */}
      {tab === 'autoFit' && (<>
        {!isMulti && (
          <p className="hint" style={{ marginTop: 0, color: '#888' }}>
            複数の SD/SG を選択すると「幅揃え」「高さ揃え」「サイズ揃え」「文字サイズ揃え」のバッチ操作が行えます。
          </p>
        )}
        {isMulti && (
          <>
            <p className="hint" style={{ marginTop: 0 }}>
              選択した {sdsgs.length} 個の SD/SG に対するバッチ操作。基準は先頭（選択順の最初）の値。
              band モードは spaceWidth/spaceHeight、attached は width/height に反映されます。
            </p>
            <div className="prop-row" style={{ flexWrap: 'wrap', gap: 4, justifyContent: 'flex-start' }}>
              <button className="ribbon-btn-small"
                onClick={() => matchSDSGsSize(ids, 'width')}>幅揃え</button>
              <button className="ribbon-btn-small"
                onClick={() => matchSDSGsSize(ids, 'height')}>高さ揃え</button>
              <button className="ribbon-btn-small"
                onClick={() => matchSDSGsSize(ids, 'both')}>サイズ揃え</button>
              <button className="ribbon-btn-small"
                onClick={() => matchSDSGsFontSize(ids)}>文字サイズ揃え</button>
            </div>
          </>
        )}
      </>)}

      <div className="prop-row">
        <button className="danger-btn" onClick={() => sdsgs.forEach((s) => removeSDSG(s.id))}>削除</button>
      </div>
    </div>
  );
}

function LineProperties({ lines }: { lines: Line[] }) {
  const updateLines = useTEMStore((s) => s.updateLines);
  const removeLines = useTEMStore((s) => s.removeLines);
  const sheet = useActiveSheet();
  const [tab, setTab] = useState<LineTab>('basic');

  const isMulti = lines.length > 1;
  const first = lines[0];
  const ids = lines.map((l) => l.id);

  const commonType = lines.every((l) => l.type === first.type) ? first.type : undefined;
  const commonShape = lines.every((l) => l.shape === first.shape) ? first.shape : undefined;
  const commonStartMargin = getCommon(lines, 'startMargin');
  const commonEndMargin = getCommon(lines, 'endMargin');
  const commonStartOffTime = getCommon(lines, 'startOffsetTime');
  const commonEndOffTime = getCommon(lines, 'endOffsetTime');
  const commonStartOffItem = getCommon(lines, 'startOffsetItem');
  const commonEndOffItem = getCommon(lines, 'endOffsetItem');
  const commonAngleMode = lines.every((l) => (l.angleMode ?? false) === (first.angleMode ?? false))
    ? !!first.angleMode
    : undefined;
  const commonAngleDeg = getCommon(lines, 'angleDeg');
  const allAngleOn = lines.every((l) => l.angleMode);

  return (
    <div className="prop-section">
      <h4>Line {isMulti && <span className="multi-badge">{lines.length}個</span>}</h4>

      <div className="settings-tabs" style={{ marginBottom: 8, padding: 0 }}>
        <button className={tab === 'basic' ? 'settings-tab active' : 'settings-tab'} onClick={() => setTab('basic')}>基本</button>
        <button className={tab === 'endpoint' ? 'settings-tab active' : 'settings-tab'} onClick={() => setTab('endpoint')}>端点</button>
        <button className={tab === 'info' ? 'settings-tab active' : 'settings-tab'} onClick={() => setTab('info')}>詳細</button>
      </div>

      {tab === 'basic' && <>
      <div className="prop-row">
        <label>線種</label>
        <select value={commonType ?? ''} onChange={(e) => updateLines(ids, { type: e.target.value as 'RLine' | 'XLine' })}>
          {commonType === undefined && <option value="">（混在）</option>}
          <option value="RLine">実線（実現径路）</option>
          <option value="XLine">点線（未実現径路）</option>
        </select>
      </div>

      <div className="prop-row">
        <label>形状</label>
        <select
          value={commonShape ?? ''}
          onChange={(e) => updateLines(ids, { shape: e.target.value as 'straight' | 'elbow' | 'curve' })}
        >
          {commonShape === undefined && <option value="">（混在）</option>}
          <option value="straight">直線</option>
          <option value="elbow">L字接続</option>
          <option value="curve">曲線</option>
        </select>
      </div>
      {commonShape === 'elbow' && (
        <div className="prop-row">
          <label>L字 中継位置 (0〜1)</label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={getCommon(lines, 'elbowBendRatio') ?? 0.5}
            placeholder={getCommon(lines, 'elbowBendRatio') === undefined ? '（混在）' : ''}
            onChange={(e) => {
              const v = Math.max(0, Math.min(1, Number(e.target.value) || 0));
              updateLines(ids, { elbowBendRatio: v });
            }}
            title="折れ位置の比率。0 = from 寄り / 0.5 = 中央 / 1 = to 寄り"
          />
        </div>
      )}
      {commonShape === 'curve' && (
        <>
          <div className="prop-row">
            <label>曲率 (0〜1)</label>
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={getCommon(lines, 'curveIntensity') ?? 0.5}
              placeholder={getCommon(lines, 'curveIntensity') === undefined ? '（混在）' : ''}
              disabled={lines.some((l) => l.controlPoints && l.controlPoints.length >= 2)}
              onChange={(e) => {
                const v = Math.max(0, Math.min(1, Number(e.target.value) || 0));
                updateLines(ids, { curveIntensity: v });
              }}
              title="0=ほぼ直線、0.5=標準、1=大きく膨らむ。制御点を手動設定中は無効"
            />
          </div>
          <div className="prop-row">
            <label>制御点</label>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: '0.82em', color: '#666' }}>
                {lines.some((l) => l.controlPoints && l.controlPoints.length >= 2)
                  ? '手動設定中（Canvas のハンドルでドラッグ編集可）'
                  : '自動（曲率から算出）'}
              </span>
              <button
                className="ribbon-btn-small"
                onClick={() => updateLines(ids, { controlPoints: undefined })}
                disabled={!lines.some((l) => l.controlPoints && l.controlPoints.length >= 2)}
                title="制御点の手動設定を解除して曲率計算に戻す"
              >
                自動に戻す
              </button>
            </div>
          </div>
        </>
      )}

      {(() => {
        const firstColor = first.style?.color;
        const commonLineColor = lines.every((l) => l.style?.color === firstColor) ? firstColor : undefined;
        const firstWidth = first.style?.strokeWidth;
        const commonWidth = lines.every((l) => l.style?.strokeWidth === firstWidth) ? firstWidth : undefined;
        return (
          <>
            <div className="prop-row">
              <label>線の色</label>
              <ColorPicker
                value={commonLineColor}
                onChange={(c) => updateLines(ids, { style: { ...first.style, color: c } })}
                defaultLabel="既定 (#222)"
              />
            </div>
            <div className="prop-row">
              <label>線の太さ (px)</label>
              <input
                type="number"
                min={0.5}
                max={6}
                step={0.5}
                value={commonWidth ?? 1.5}
                placeholder={commonWidth === undefined ? '（混在）' : ''}
                onChange={(e) => updateLines(ids, { style: { ...first.style, strokeWidth: Number(e.target.value) } })}
              />
            </div>
          </>
        );
      })()}

      </>}

      {tab === 'endpoint' && <>
      <CollapsibleSection title="角度モード" sectionKey="line-angle" compact defaultOpen={true}>
        <div className="prop-row">
          <label>角度モード</label>
          <input
            type="checkbox"
            checked={!!commonAngleMode}
            ref={(el) => { if (el) el.indeterminate = commonAngleMode === undefined; }}
            disabled={commonShape === 'elbow' || commonShape === 'curve'}
            onChange={(e) => updateLines(ids, { angleMode: e.target.checked })}
          />
        </div>
        {(commonShape === 'elbow' || commonShape === 'curve') && (
          <p className="hint" style={{ margin: '0 0 4px', fontSize: '0.82em', color: '#888' }}>
            L字 / 曲線形状中は角度モードは無効です。
          </p>
        )}
        <div className="prop-row">
          <label>角度 (°)</label>
          <input
            type="number"
            min={-85}
            max={85}
            step={1}
            value={commonAngleDeg ?? 0}
            placeholder={commonAngleDeg === undefined ? '（混在）' : ''}
            disabled={!allAngleOn || commonShape === 'elbow' || commonShape === 'curve'}
            onChange={(e) => {
              const v = Math.max(-85, Math.min(85, Number(e.target.value) || 0));
              updateLines(ids, { angleDeg: v });
            }}
            title="-85〜85°。時間軸方向 0° を基準、正で視覚的に上（横型）/右（縦型）に傾く"
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="始点・終点オフセット" sectionKey="line-offset" compact>
        {allAngleOn && (
          <p className="hint" style={{ margin: '0 0 4px', fontSize: '0.82em', color: '#888' }}>
            角度モード中はオフセットで端点を調整。マージン（方向沿い）は無効。
          </p>
        )}
        <div className="prop-row">
          <label>始点 Time / Item (px)</label>
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              type="number"
              value={commonStartOffTime ?? 0}
              placeholder={commonStartOffTime === undefined ? '混在' : ''}
              onChange={(e) => updateLines(ids, { startOffsetTime: Number(e.target.value) })}
            />
            <input
              type="number"
              value={commonStartOffItem ?? 0}
              placeholder={commonStartOffItem === undefined ? '混在' : ''}
              onChange={(e) => updateLines(ids, { startOffsetItem: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="prop-row">
          <label>終点 Time / Item (px)</label>
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              type="number"
              value={commonEndOffTime ?? 0}
              placeholder={commonEndOffTime === undefined ? '混在' : ''}
              onChange={(e) => updateLines(ids, { endOffsetTime: Number(e.target.value) })}
            />
            <input
              type="number"
              value={commonEndOffItem ?? 0}
              placeholder={commonEndOffItem === undefined ? '混在' : ''}
              onChange={(e) => updateLines(ids, { endOffsetItem: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="prop-row">
          <label>始点マージン (方向沿い px)</label>
          <input
            type="number"
            value={commonStartMargin ?? 0}
            placeholder={commonStartMargin === undefined ? '（混在）' : ''}
            disabled={allAngleOn}
            onChange={(e) => updateLines(ids, { startMargin: Number(e.target.value) })}
          />
        </div>
        <div className="prop-row">
          <label>終点マージン (方向沿い px)</label>
          <input
            type="number"
            value={commonEndMargin ?? 0}
            placeholder={commonEndMargin === undefined ? '（混在）' : ''}
            disabled={allAngleOn}
            onChange={(e) => updateLines(ids, { endMargin: Number(e.target.value) })}
          />
        </div>
      </CollapsibleSection>
      </>}

      {tab === 'info' && <>
      {!isMulti && (
        <>
          <div className="prop-row">
            <label>ID</label>
            <input value={first.id} readOnly style={{ fontFamily: 'monospace', fontSize: '0.85em' }} />
          </div>
          <div className="prop-row">
            <label>From → To</label>
            <div style={{ fontSize: '0.85em', color: '#666', fontFamily: 'monospace' }}>
              {first.from} → {first.to}
            </div>
          </div>
          {(() => {
            const siblings = sheet?.lines.filter((l) => l.from === first.from && l.to === first.to) ?? [];
            if (siblings.length <= 1) return null;
            const index = siblings.findIndex((l) => l.id === first.id);
            return (
              <div className="prop-row">
                <label>並列位置</label>
                <div style={{ fontSize: '0.85em', color: '#666' }}>
                  {index + 1} 本目 / {siblings.length} 本（同一 from→to）
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* 論文用 description */}
      <h5 style={{ margin: '10px 0 4px', fontSize: '0.92em', color: '#555' }}>論文レポート用</h5>
      {!isMulti && (
        <div className="prop-row" style={{ alignItems: 'flex-start' }}>
          <label>説明文</label>
          <textarea
            value={first.description ?? ''}
            onChange={(e) => updateLines([first.id], { description: e.target.value })}
            style={{ width: '100%', minHeight: 60, resize: 'vertical' }}
            placeholder="この Line の意味・解釈（論文レポートに出力）"
          />
        </div>
      )}
      <div className="prop-row">
        <label>説明不要（自明）</label>
        <input
          type="checkbox"
          checked={getCommon(lines, 'noDescriptionNeeded') === true}
          onChange={(e) => updateLines(ids, { noDescriptionNeeded: e.target.checked })}
        />
      </div>

      <CollapsibleSection title="IDバッジ" sectionKey="line-id-badge" compact defaultOpen={false}>
        <div className="prop-row">
          <label>フォントサイズ</label>
          <input
            type="number"
            min={6}
            max={40}
            value={getCommon(lines, 'idFontSize') ?? 9}
            placeholder={getCommon(lines, 'idFontSize') === undefined ? '（混在）' : ''}
            onChange={(e) => updateLines(ids, { idFontSize: Number(e.target.value) })}
          />
        </div>
        <div className="prop-row">
          <label>位置調整 X / Y</label>
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              type="number"
              value={getCommon(lines, 'idOffsetX') ?? 0}
              placeholder={getCommon(lines, 'idOffsetX') === undefined ? '混在' : ''}
              onChange={(e) => updateLines(ids, { idOffsetX: Number(e.target.value) })}
            />
            <input
              type="number"
              value={getCommon(lines, 'idOffsetY') ?? -12}
              placeholder={getCommon(lines, 'idOffsetY') === undefined ? '混在' : ''}
              onChange={(e) => updateLines(ids, { idOffsetY: Number(e.target.value) })}
            />
          </div>
        </div>
      </CollapsibleSection>
      </>}

      <div className="prop-row">
        <button className="danger-btn" onClick={() => removeLines(ids)}>削除</button>
      </div>
    </div>
  );
}
