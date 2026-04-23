// ============================================================================
// PropertyPanel - Right sidebar (Figma-style)
// ============================================================================

import { useState, useEffect, useRef } from 'react';
import { useTEMStore, useActiveSheet } from '../store/store';
import type { Box, BoxType, TextAlign, VerticalAlign, SDSG, Line, AutoFitBoxMode } from '../types';
import { BOX_TYPE_LABELS, FONT_OPTIONS } from '../store/defaults';
import { SELECTABLE_BOX_TYPES } from '../utils/typeDisplay';
import { xyToTimeLevel, xyToItemLevel, setTimeLevelOnly, setItemLevelOnly } from '../utils/coords';
import { RichTextToolbar } from './RichTextToolbar';
import { LegendSettingsSection } from './SettingsDialog';

export function PropertyPanel() {
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
        {selection.legendSelected && <LegendProperties />}
        {selectedBoxes.length > 0 && <BoxProperties boxes={selectedBoxes} />}
        {selectedLines.length > 0 && <LineProperties lines={selectedLines} />}
        {selectedSDSGs.length > 0 && <SDSGProperties sdsgs={selectedSDSGs} />}
      </div>
    </div>
  );
}

// ============================================================================
// 凡例選択時のプロパティ
// ============================================================================
function LegendProperties() {
  return (
    <div className="prop-section">
      <h4>凡例</h4>
      <p className="hint" style={{ marginTop: 0 }}>
        凡例の表示対象・タイトル・レイアウト・背景・項目別を編集できます。
        キャンバス上でドラッグすると位置を動かせます。
      </p>
      <LegendSettingsSection />
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
        <div className="prop-row">
          <label>IDバッジ フォントサイズ</label>
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
          <label>IDバッジ位置調整 X / Y</label>
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
      </>}

      {/* ========== ラベル ========== */}
      {tab === 'label' && <>
        {!isMulti && <LabelWithToolbar box={first} updateBox={updateBox} />}
        <div className="prop-row">
          <label>フォント</label>
          <select
            value={commonFontFamily ?? ''}
            onChange={(e) => updateBoxes(ids, { style: { ...first.style, fontFamily: e.target.value } })}
          >
            {commonFontFamily === undefined && <option value="">（混在）</option>}
            {FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
        <div className="prop-row">
          <label>フォントサイズ</label>
          <input
            type="number"
            min={6}
            max={60}
            value={commonFontSize ?? 13}
            placeholder={commonFontSize === undefined ? '（混在）' : ''}
            onChange={(e) => updateBoxes(ids, { style: { ...first.style, fontSize: Number(e.target.value) } })}
          />
        </div>
        <div className="prop-row">
          <label>装飾</label>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={commonBold ? 'style-btn active' : 'style-btn'}
              onClick={() => updateBoxes(ids, { style: { ...first.style, bold: !commonBold } })}><b>B</b></button>
            <button className={commonItalic ? 'style-btn active' : 'style-btn'}
              onClick={() => updateBoxes(ids, { style: { ...first.style, italic: !commonItalic } })}><i>I</i></button>
            <button className={commonUnderline ? 'style-btn active' : 'style-btn'}
              onClick={() => updateBoxes(ids, { style: { ...first.style, underline: !commonUnderline } })}><u>U</u></button>
          </div>
        </div>
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
        <div className="prop-row">
          <label>左右方向の揃え</label>
          <select
            value={commonTextAlign ?? ''}
            onChange={(e) => updateBoxes(ids, { style: { ...first.style, textAlign: e.target.value as TextAlign } })}
          >
            {commonTextAlign === undefined && <option value="">（混在）</option>}
            <option value="left">左揃え</option>
            <option value="center">中央</option>
            <option value="right">右揃え</option>
          </select>
        </div>
        <div className="prop-row">
          <label>上下方向の揃え</label>
          <select
            value={commonVAlign ?? ''}
            onChange={(e) => updateBoxes(ids, { style: { ...first.style, verticalAlign: e.target.value as VerticalAlign } })}
          >
            {commonVAlign === undefined && <option value="">（混在）</option>}
            <option value="top">上揃え</option>
            <option value="middle">中央</option>
            <option value="bottom">下揃え</option>
          </select>
        </div>
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
        <div className="prop-row">
          <label>フォントサイズ</label>
          <input
            type="number"
            min={6}
            max={40}
            value={getCommon(boxes, 'typeLabelFontSize') ?? 11}
            placeholder={getCommon(boxes, 'typeLabelFontSize') === undefined ? '（混在）' : ''}
            onChange={(e) => updateBoxes(ids, { typeLabelFontSize: Number(e.target.value) })}
          />
        </div>
        <div className="prop-row">
          <label>フォント</label>
          <select
            value={getCommon(boxes, 'typeLabelFontFamily') ?? ''}
            onChange={(e) => updateBoxes(ids, { typeLabelFontFamily: e.target.value || undefined })}
          >
            <option value="">（Box本体と同じ）</option>
            {FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
        <div className="prop-row">
          <label>装飾</label>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className={getCommon(boxes, 'typeLabelBold') !== false ? 'style-btn active' : 'style-btn'}
              onClick={() => updateBoxes(ids, { typeLabelBold: getCommon(boxes, 'typeLabelBold') === false })}
              title="太字"
            ><b>B</b></button>
            <button
              className={getCommon(boxes, 'typeLabelItalic') ? 'style-btn active' : 'style-btn'}
              onClick={() => updateBoxes(ids, { typeLabelItalic: !getCommon(boxes, 'typeLabelItalic') })}
              title="斜体"
            ><i>I</i></button>
          </div>
        </div>
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
        <h5 style={{ margin: '14px 0 4px', fontSize: '0.92em', color: '#555' }}>論文レポート用</h5>
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
  const removeSDSG = useTEMStore((s) => s.removeSDSG);
  const setSDSGSpaceMode = useTEMStore((s) => s.setSDSGSpaceMode);
  const sdsgSpace = useTEMStore((s) => s.doc.settings.sdsgSpace);
  const sdsgLayout = useTEMStore((s) => s.doc.settings.layout);
  const sheet = useActiveSheet();
  const isMulti = sdsgs.length > 1;
  const first = sdsgs[0];
  const [tab, setTab] = useState<PropTab>('basic');
  const isH = sdsgLayout === 'horizontal';
  const topBandLabel = isH ? '上部 (SD) に配置' : '右側 (SD) に配置';
  const bottomBandLabel = isH ? '下部 (SG) に配置' : '左側 (SG) に配置';

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
              <label>紐付け対象ID</label>
              <input value={first.attachedTo} readOnly style={{ fontFamily: 'monospace', fontSize: '0.85em' }} />
            </div>

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
                  <label>幅 (px)</label>
                  <input
                    type="number"
                    value={first.spaceWidth ?? first.width ?? 70}
                    onChange={(e) => updateSDSG(first.id, { spaceWidth: Number(e.target.value) })}
                  />
                </div>
                <div className="prop-row">
                  <label>高さ (px)</label>
                  <input
                    type="number"
                    value={first.spaceHeight ?? first.height ?? 40}
                    onChange={(e) => updateSDSG(first.id, { spaceHeight: Number(e.target.value) })}
                  />
                </div>
              </>
            )}

            {/* attached モード固有の設定 */}
            {(first.spaceMode == null || first.spaceMode === 'attached') && (
              <>
                <div className="prop-row">
                  <label>アンカー方式</label>
                  <select
                    value={first.anchorMode ?? 'single'}
                    onChange={(e) => {
                      const mode = e.target.value as 'single' | 'between';
                      if (mode === 'between' && !first.attachedTo2) {
                        alert('between モードには 2 つ目の対象 Box の指定が必要です。下の「2 つ目の対象」で選択してください');
                      }
                      updateSDSG(first.id, { anchorMode: mode });
                    }}
                  >
                    <option value="single">single（単一 Box / Line に紐付け）</option>
                    <option value="between">between（2 アイテム間）</option>
                  </select>
                </div>
                {first.anchorMode === 'between' && (
                  <>
                    <div className="prop-row">
                      <label>2 つ目の対象</label>
                      {sheet ? (
                        <select
                          value={first.attachedTo2 ?? ''}
                          onChange={(e) => updateSDSG(first.id, { attachedTo2: e.target.value || undefined })}
                        >
                          <option value="">（未指定）</option>
                          {sheet.boxes
                            .filter((b) => b.id !== first.attachedTo)
                            .map((b) => (
                              <option key={b.id} value={b.id}>{b.id}: {b.label}</option>
                            ))}
                        </select>
                      ) : null}
                    </div>
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
                  </>
                )}
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
              </>
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

          {/* ========== ラベル ========== */}
          {tab === 'label' && <>
            <div className="prop-row">
              <label>ラベル</label>
              <input value={first.label} onChange={(e) => updateSDSG(first.id, { label: e.target.value })} />
            </div>
            <div className="prop-row">
              <label>フォント</label>
              <select
                value={first.style?.fontFamily ?? ''}
                onChange={(e) => updateSDSG(first.id, { style: { ...first.style, fontFamily: e.target.value || undefined } })}
              >
                <option value="">（UI 既定）</option>
                {FONT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
            <div className="prop-row">
              <label>フォントサイズ</label>
              <input
                type="number"
                min={6}
                max={40}
                value={first.style?.fontSize ?? 11}
                onChange={(e) => updateSDSG(first.id, { style: { ...first.style, fontSize: Number(e.target.value) } })}
              />
            </div>
            <div className="prop-row">
              <label>装飾</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className={first.style?.bold !== false ? 'style-btn active' : 'style-btn'}
                  onClick={() => updateSDSG(first.id, { style: { ...first.style, bold: !(first.style?.bold !== false) } })}
                  title="太字"><b>B</b></button>
                <button className={first.style?.italic ? 'style-btn active' : 'style-btn'}
                  onClick={() => updateSDSG(first.id, { style: { ...first.style, italic: !first.style?.italic } })}
                  title="斜体"><i>I</i></button>
                <button className={first.style?.underline ? 'style-btn active' : 'style-btn'}
                  onClick={() => updateSDSG(first.id, { style: { ...first.style, underline: !first.style?.underline } })}
                  title="下線"><u>U</u></button>
              </div>
            </div>
            <div className="prop-row">
              <label>文字色</label>
              <input
                type="color"
                value={first.style?.color ?? '#222222'}
                onChange={(e) => updateSDSG(first.id, { style: { ...first.style, color: e.target.value } })}
              />
            </div>
            <div className="prop-row">
              <label>背景色</label>
              <input
                type="color"
                value={first.style?.backgroundColor ?? '#ffffff'}
                onChange={(e) => updateSDSG(first.id, { style: { ...first.style, backgroundColor: e.target.value } })}
              />
            </div>
            <div className="prop-row">
              <label>枠線色</label>
              <input
                type="color"
                value={first.style?.borderColor ?? '#333333'}
                onChange={(e) => updateSDSG(first.id, { style: { ...first.style, borderColor: e.target.value } })}
              />
            </div>
            <div className="prop-row">
              <label>左右方向の揃え</label>
              <select
                value={first.style?.textAlign ?? 'center'}
                onChange={(e) => updateSDSG(first.id, { style: { ...first.style, textAlign: e.target.value as TextAlign } })}
              >
                <option value="left">左揃え</option>
                <option value="center">中央</option>
                <option value="right">右揃え</option>
              </select>
            </div>
            <div className="prop-row">
              <label>上下方向の揃え</label>
              <select
                value={first.style?.verticalAlign ?? 'middle'}
                onChange={(e) => updateSDSG(first.id, { style: { ...first.style, verticalAlign: e.target.value as VerticalAlign } })}
              >
                <option value="top">上揃え</option>
                <option value="middle">中央</option>
                <option value="bottom">下揃え</option>
              </select>
            </div>
            <div className="prop-row">
              <label>ASCII縦向き（縦型レイアウト）</label>
              <input
                type="checkbox"
                checked={first.asciiUpright ?? true}
                onChange={(e) => updateSDSG(first.id, { asciiUpright: e.target.checked })}
              />
            </div>
          </>}

          {/* ========== タイプラベル（種別バッジ SD/SG） ========== */}
          {tab === 'idLabel' && <>
            <p className="hint" style={{ marginTop: 0 }}>
              SD/SG 種別を表すバッジの装飾です。連番表記を ON にすると複数のとき自動で連番化（SD1, SD2, …）。
            </p>
            <div className="prop-row">
              <label>連番表記</label>
              <input
                type="checkbox"
                checked={first.typeLabelNumbered !== false}
                onChange={(e) => updateSDSG(first.id, { typeLabelNumbered: e.target.checked ? undefined : false })}
                title="OFF にすると SD / SG のみ表示（連番を付けない）"
              />
            </div>
            <div className="prop-row">
              <label>フォントサイズ</label>
              <input
                type="number"
                min={6}
                max={40}
                value={first.typeLabelFontSize ?? 11}
                onChange={(e) => updateSDSG(first.id, { typeLabelFontSize: Number(e.target.value) })}
              />
            </div>
            <div className="prop-row">
              <label>フォント</label>
              <select
                value={first.typeLabelFontFamily ?? ''}
                onChange={(e) => updateSDSG(first.id, { typeLabelFontFamily: e.target.value || undefined })}
              >
                <option value="">（本文と同じ）</option>
                {FONT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
            <div className="prop-row">
              <label>装飾</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className={first.typeLabelBold !== false ? 'style-btn active' : 'style-btn'}
                  onClick={() => updateSDSG(first.id, { typeLabelBold: !(first.typeLabelBold !== false) })}
                  title="太字"><b>B</b></button>
                <button className={first.typeLabelItalic ? 'style-btn active' : 'style-btn'}
                  onClick={() => updateSDSG(first.id, { typeLabelItalic: !first.typeLabelItalic })}
                  title="斜体"><i>I</i></button>
              </div>
            </div>
            <div className="prop-row">
              <label>ASCII縦向き（縦型レイアウト）</label>
              <input
                type="checkbox"
                checked={first.typeLabelAsciiUpright ?? (first.asciiUpright ?? true)}
                onChange={(e) => updateSDSG(first.id, { typeLabelAsciiUpright: e.target.checked })}
              />
            </div>
          </>}

          {/* ========== サブラベル ========== */}
          {tab === 'subLabel' && <>
            <div className="prop-row">
              <label>サブラベル</label>
              <input
                type="text"
                value={first.subLabel ?? ''}
                onChange={(e) => updateSDSG(first.id, { subLabel: e.target.value })}
              />
            </div>
            <div className="prop-row">
              <label>フォントサイズ</label>
              <input
                type="number"
                min={6}
                max={40}
                value={first.subLabelFontSize ?? 10}
                onChange={(e) => updateSDSG(first.id, { subLabelFontSize: Number(e.target.value) })}
              />
            </div>
            <div className="prop-row">
              <label>位置 X / Y</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  type="number"
                  value={first.subLabelOffsetX ?? 0}
                  onChange={(e) => updateSDSG(first.id, { subLabelOffsetX: Number(e.target.value) })}
                />
                <input
                  type="number"
                  value={first.subLabelOffsetY ?? 0}
                  onChange={(e) => updateSDSG(first.id, { subLabelOffsetY: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="prop-row">
              <label>ASCII縦向き（縦型レイアウト）</label>
              <input
                type="checkbox"
                checked={first.subLabelAsciiUpright ?? (first.asciiUpright ?? true)}
                onChange={(e) => updateSDSG(first.id, { subLabelAsciiUpright: e.target.checked })}
              />
            </div>
          </>}

          {/* ========== 自動調整 ========== */}
          {tab === 'autoFit' && <>
            <p className="hint" style={{ marginTop: 0, color: '#888' }}>
              SD/SG の自動調整は今後実装予定です。
            </p>
          </>}
        </>
      )}
      <div className="prop-row">
        <button className="danger-btn" onClick={() => sdsgs.forEach((s) => removeSDSG(s.id))}>削除</button>
      </div>
    </div>
  );
}

function LineProperties({ lines }: { lines: Line[] }) {
  const updateLines = useTEMStore((s) => s.updateLines);
  const removeLines = useTEMStore((s) => s.removeLines);

  const isMulti = lines.length > 1;
  const first = lines[0];
  const ids = lines.map((l) => l.id);

  const commonType = lines.every((l) => l.type === first.type) ? first.type : undefined;
  const commonMode = lines.every((l) => l.connectionMode === first.connectionMode) ? first.connectionMode : undefined;
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

      <div className="prop-row">
        <label>線種</label>
        <select value={commonType ?? ''} onChange={(e) => updateLines(ids, { type: e.target.value as 'RLine' | 'XLine' })}>
          {commonType === undefined && <option value="">（混在）</option>}
          <option value="RLine">実線（実現径路）</option>
          <option value="XLine">点線（未実現径路）</option>
        </select>
      </div>

      <div className="prop-row">
        <label>接続</label>
        <select value={commonMode ?? ''} onChange={(e) => updateLines(ids, { connectionMode: e.target.value as 'center-to-center' | 'horizontal' })}>
          {commonMode === undefined && <option value="">（混在）</option>}
          <option value="center-to-center">中点→中点</option>
          <option value="horizontal">水平接続</option>
        </select>
      </div>

      <div className="prop-row">
        <label>形状</label>
        <select value={commonShape ?? ''} onChange={(e) => updateLines(ids, { shape: e.target.value as 'straight' | 'curve' })}>
          {commonShape === undefined && <option value="">（混在）</option>}
          <option value="straight">直線</option>
          <option value="curve">曲線</option>
        </select>
      </div>

      <h5 style={{ margin: '10px 0 4px', fontSize: '0.92em', color: '#555' }}>
        角度モード
      </h5>
      <div className="prop-row">
        <label>角度モード</label>
        <input
          type="checkbox"
          checked={!!commonAngleMode}
          ref={(el) => { if (el) el.indeterminate = commonAngleMode === undefined; }}
          onChange={(e) => updateLines(ids, { angleMode: e.target.checked })}
        />
      </div>
      <div className="prop-row">
        <label>角度 (°)</label>
        <input
          type="number"
          min={-85}
          max={85}
          step={1}
          value={commonAngleDeg ?? 0}
          placeholder={commonAngleDeg === undefined ? '（混在）' : ''}
          disabled={!allAngleOn}
          onChange={(e) => {
            const v = Math.max(-85, Math.min(85, Number(e.target.value) || 0));
            updateLines(ids, { angleDeg: v });
          }}
          title="-85〜85°。時間軸方向 0° を基準、正で視覚的に上（横型）/右（縦型）に傾く"
        />
      </div>

      <h5 style={{ margin: '10px 0 4px', fontSize: '0.92em', color: '#555' }}>
        始点・終点オフセット
      </h5>
      {allAngleOn && (
        <p className="hint" style={{ margin: '0 0 4px', fontSize: '0.82em', color: '#888' }}>
          角度モード中は Time/Item オフセットは無効（角度で端点が決まるため）。マージンのみ有効。
        </p>
      )}
      <div className="prop-row">
        <label>始点 Time / Item (px)</label>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            type="number"
            value={commonStartOffTime ?? 0}
            placeholder={commonStartOffTime === undefined ? '混在' : ''}
            disabled={allAngleOn}
            onChange={(e) => updateLines(ids, { startOffsetTime: Number(e.target.value) })}
          />
          <input
            type="number"
            value={commonStartOffItem ?? 0}
            placeholder={commonStartOffItem === undefined ? '混在' : ''}
            disabled={allAngleOn}
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
            disabled={allAngleOn}
            onChange={(e) => updateLines(ids, { endOffsetTime: Number(e.target.value) })}
          />
          <input
            type="number"
            value={commonEndOffItem ?? 0}
            placeholder={commonEndOffItem === undefined ? '混在' : ''}
            disabled={allAngleOn}
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
          onChange={(e) => updateLines(ids, { startMargin: Number(e.target.value) })}
        />
      </div>
      <div className="prop-row">
        <label>終点マージン (方向沿い px)</label>
        <input
          type="number"
          value={commonEndMargin ?? 0}
          placeholder={commonEndMargin === undefined ? '（混在）' : ''}
          onChange={(e) => updateLines(ids, { endMargin: Number(e.target.value) })}
        />
      </div>

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

      <div className="prop-row">
        <button className="danger-btn" onClick={() => removeLines(ids)}>削除</button>
      </div>
    </div>
  );
}
