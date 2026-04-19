// ============================================================================
// PropertyPanel - Right sidebar (Figma-style)
// ============================================================================

import { useState, useEffect } from 'react';
import { useTEMStore, useActiveSheet } from '../store/store';
import type { Box, BoxType, TextAlign, VerticalAlign, SDSG, Line, AutoFitBoxMode } from '../types';
import { BOX_TYPE_LABELS, FONT_OPTIONS } from '../store/defaults';
import { SELECTABLE_BOX_TYPES } from '../utils/typeDisplay';
import { xyToTimeLevel, xyToItemLevel, setTimeLevelOnly, setItemLevelOnly } from '../utils/coords';

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
        {!hasSelection && <EmptyState />}
        {selectedBoxes.length > 0 && <BoxProperties boxes={selectedBoxes} />}
        {selectedLines.length > 0 && <LineProperties lines={selectedLines} />}
        {selectedSDSGs.length > 0 && <SDSGProperties sdsgs={selectedSDSGs} />}
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

function BoxProperties({ boxes }: { boxes: Box[] }) {
  const updateBox = useTEMStore((s) => s.updateBox);
  const updateBoxes = useTEMStore((s) => s.updateBoxes);
  const removeBoxes = useTEMStore((s) => s.removeBoxes);
  const renameBoxId = useTEMStore((s) => s.renameBoxId);
  const changeBoxType = useTEMStore((s) => s.changeBoxType);
  const levelStep = useTEMStore((s) => s.doc.settings.levelStep);
  const layout = useTEMStore((s) => s.doc.settings.layout);

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
            if (!isMulti) {
              // 単一選択: ID も自動更新
              changeBoxType(first.id, newType);
            } else {
              // 複数選択: 型のみ一括変更（IDは各自の接頭辞ルールに違反する可能性あり、警告省略）
              ids.forEach((id) => changeBoxType(id, newType));
            }
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
          <label>ラベル</label>
          <textarea
            value={first.label}
            onChange={(e) => updateBox(first.id, { label: e.target.value })}
            rows={2}
          />
        </div>
      )}

      {!isMulti && (
        <div className="prop-row">
          <label>位置（Time_Level / Item_Level）</label>
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
        <label>水平揃え</label>
        <select
          value={commonTextAlign ?? ''}
          onChange={(e) => updateBoxes(ids, { style: { ...first.style, textAlign: e.target.value as TextAlign } })}
        >
          {commonTextAlign === undefined && <option value="">（混在）</option>}
          <option value="left">左</option>
          <option value="center">中央</option>
          <option value="right">右</option>
        </select>
      </div>

      <div className="prop-row">
        <label>垂直揃え</label>
        <select
          value={commonVAlign ?? ''}
          onChange={(e) => updateBoxes(ids, { style: { ...first.style, verticalAlign: e.target.value as VerticalAlign } })}
        >
          {commonVAlign === undefined && <option value="">（混在）</option>}
          <option value="top">上</option>
          <option value="middle">中央</option>
          <option value="bottom">下</option>
        </select>
      </div>

      <div className="prop-row">
        <label>装飾</label>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className={commonBold ? 'style-btn active' : 'style-btn'}
            onClick={() => updateBoxes(ids, { style: { ...first.style, bold: !commonBold } })}
          ><b>B</b></button>
          <button
            className={commonItalic ? 'style-btn active' : 'style-btn'}
            onClick={() => updateBoxes(ids, { style: { ...first.style, italic: !commonItalic } })}
          ><i>I</i></button>
          <button
            className={commonUnderline ? 'style-btn active' : 'style-btn'}
            onClick={() => updateBoxes(ids, { style: { ...first.style, underline: !commonUnderline } })}
          ><u>U</u></button>
        </div>
      </div>

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

      {/* Box 自動拡張 */}
      <h5 style={{ margin: '10px 0 4px', fontSize: '0.92em', color: '#555' }}>Box 自動調整</h5>
      <div className="prop-row">
        <label>自動拡張モード</label>
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
      <div className="prop-row" style={{ flexWrap: 'wrap', gap: 4, justifyContent: 'flex-start' }}>
        <button
          className="ribbon-btn-small"
          onClick={() => useTEMStore.getState().fitBoxesToLabel(ids)}
          title="現在のラベル文字数に合わせて Box サイズを最小化"
        >
          文字に合わせる
        </button>
        {isMulti && (
          <>
            <button
              className="ribbon-btn-small"
              onClick={() => useTEMStore.getState().matchBoxesSize(ids, 'width')}
              title="先頭の Box の幅に揃える"
            >
              幅揃え
            </button>
            <button
              className="ribbon-btn-small"
              onClick={() => useTEMStore.getState().matchBoxesSize(ids, 'height')}
              title="先頭の Box の高さに揃える"
            >
              高さ揃え
            </button>
            <button
              className="ribbon-btn-small"
              onClick={() => useTEMStore.getState().matchBoxesSize(ids, 'both')}
              title="先頭の Box の幅と高さに揃える"
            >
              サイズ揃え
            </button>
            <button
              className="ribbon-btn-small"
              onClick={() => useTEMStore.getState().matchBoxesFontSize(ids)}
              title="先頭の Box の文字サイズに揃える"
            >
              文字サイズ揃え
            </button>
          </>
        )}
      </div>

      {/* IDバッジ位置調整 */}
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

      {/* サブラベル */}
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
        <label>サブラベル フォントサイズ</label>
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
        <label>サブラベル位置調整 X / Y</label>
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

      {/* サブラベル 縦書きASCII */}
      <div className="prop-row">
        <label>サブラベルの半角英数向き（縦型）</label>
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

      {/* タイプラベル 個別設定 */}
      <h5 style={{ margin: '10px 0 4px', fontSize: '0.92em', color: '#555' }}>タイプラベル（種別バッジ）</h5>
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
  const isMulti = sdsgs.length > 1;
  const first = sdsgs[0];

  return (
    <div className="prop-section">
      <h4>SD/SG {isMulti && <span className="multi-badge">{sdsgs.length}個</span>}</h4>
      {!isMulti && (
        <>
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
            <label>ラベル</label>
            <input value={first.label} onChange={(e) => updateSDSG(first.id, { label: e.target.value })} />
          </div>
          <div className="prop-row">
            <label>紐付け対象ID</label>
            <input value={first.attachedTo} readOnly style={{ fontFamily: 'monospace', fontSize: '0.85em' }} />
          </div>
          <div className="prop-row">
            <label>時間オフセット (px)</label>
            <input
              type="number"
              value={first.timeOffset ?? 0}
              onChange={(e) => updateSDSG(first.id, { timeOffset: Number(e.target.value) })}
            />
          </div>
          <div className="prop-row">
            <label>項目オフセット (px)</label>
            <input
              type="number"
              value={first.itemOffset ?? 0}
              onChange={(e) => updateSDSG(first.id, { itemOffset: Number(e.target.value) })}
            />
          </div>
          <div className="prop-row">
            <label>サイズ W / H</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="number"
                value={first.width ?? 70}
                onChange={(e) => updateSDSG(first.id, { width: Number(e.target.value) })}
              />
              <input
                type="number"
                value={first.height ?? 40}
                onChange={(e) => updateSDSG(first.id, { height: Number(e.target.value) })}
              />
            </div>
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
          <h5 style={{ margin: '10px 0 4px', fontSize: '0.92em', color: '#555' }}>サブラベル</h5>
          <div className="prop-row">
            <label>サブラベル</label>
            <input
              type="text"
              value={first.subLabel ?? ''}
              onChange={(e) => updateSDSG(first.id, { subLabel: e.target.value })}
            />
          </div>
          <div className="prop-row">
            <label>サブラベル フォントサイズ</label>
            <input
              type="number"
              min={6}
              max={40}
              value={first.subLabelFontSize ?? 10}
              onChange={(e) => updateSDSG(first.id, { subLabelFontSize: Number(e.target.value) })}
            />
          </div>
          <div className="prop-row">
            <label>サブラベル位置 X / Y</label>
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
        始点・終点オフセット
      </h5>
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

      <div className="prop-row">
        <button className="danger-btn" onClick={() => removeLines(ids)}>削除</button>
      </div>
    </div>
  );
}
