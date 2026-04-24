// ============================================================================
// DecorationEditor - ラベル装飾 UI の再利用可能な小コンポーネント群
// PropertyPanel の Box/SDSG の ラベル / タイプラベル / サブラベル タブで
// 重複していたフォント・色・揃え UI を抽出したもの。
//
// 各 Row は (value, onChange) の最小インターフェースで、undefined を渡せば
// 複数選択時の「（混在）」プレースホルダが自動表示される。
// ============================================================================

import type { TextAlign, VerticalAlign } from '../types';
import { FONT_OPTIONS } from '../store/defaults';
import { ColorPicker } from './ColorPicker';

// ----------------------------------------------------------------------------
// FontFamilyRow
// ----------------------------------------------------------------------------

export function FontFamilyRow({
  value,
  onChange,
  label = 'フォント',
  emptyOptionLabel,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  label?: string;
  /** 設定時に空値の選択肢を追加表示 (例: '（UI 既定）' '（Box本体と同じ）') */
  emptyOptionLabel?: string;
}) {
  return (
    <div className="prop-row">
      <label>{label}</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        {value === undefined && <option value="">（混在）</option>}
        {emptyOptionLabel && <option value="">{emptyOptionLabel}</option>}
        {FONT_OPTIONS.map((f) => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>
    </div>
  );
}

// ----------------------------------------------------------------------------
// FontSizeRow
// ----------------------------------------------------------------------------

export function FontSizeRow({
  value,
  onChange,
  label = 'フォントサイズ',
  placeholder = 13,
  min = 6,
  max = 60,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  label?: string;
  /** 混在時の表示値 (UI 既定のサイズ) */
  placeholder?: number;
  min?: number;
  max?: number;
}) {
  return (
    <div className="prop-row">
      <label>{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={value ?? placeholder}
        placeholder={value === undefined ? '（混在）' : ''}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

// ----------------------------------------------------------------------------
// BoldItalicUnderlineRow
// ----------------------------------------------------------------------------

export function BoldItalicUnderlineRow({
  bold,
  italic,
  underline,
  onBoldToggle,
  onItalicToggle,
  onUnderlineToggle,
  label = '装飾',
}: {
  bold: boolean | undefined;
  italic: boolean | undefined;
  /** undefined の場合、下線ボタンを表示しない */
  underline?: boolean | undefined;
  onBoldToggle: (next: boolean) => void;
  onItalicToggle: (next: boolean) => void;
  /** 省略時、下線ボタンを表示しない */
  onUnderlineToggle?: (next: boolean) => void;
  label?: string;
}) {
  return (
    <div className="prop-row">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          className={bold ? 'style-btn active' : 'style-btn'}
          onClick={() => onBoldToggle(!bold)}
          title="太字"
        ><b>B</b></button>
        <button
          className={italic ? 'style-btn active' : 'style-btn'}
          onClick={() => onItalicToggle(!italic)}
          title="斜体"
        ><i>I</i></button>
        {onUnderlineToggle && (
          <button
            className={underline ? 'style-btn active' : 'style-btn'}
            onClick={() => onUnderlineToggle(!underline)}
            title="下線"
          ><u>U</u></button>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// ColorRow
// ----------------------------------------------------------------------------

export function ColorRow({
  label,
  value,
  onChange,
  allowNone,
  defaultLabel,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  /** true: 透明 / なし 選択肢を許可 */
  allowNone?: boolean;
  /** 既定値表示ラベル (例: "既定 (#222)") */
  defaultLabel?: string;
}) {
  return (
    <div className="prop-row">
      <label>{label}</label>
      <ColorPicker
        value={value}
        onChange={onChange}
        allowNone={allowNone}
        defaultLabel={defaultLabel}
      />
    </div>
  );
}

// ----------------------------------------------------------------------------
// TextAlignRow
// ----------------------------------------------------------------------------

export function TextAlignRow({
  value,
  onChange,
  label = '左右方向の揃え',
}: {
  value: TextAlign | undefined;
  onChange: (v: TextAlign) => void;
  label?: string;
}) {
  return (
    <div className="prop-row">
      <label>{label}</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value as TextAlign)}
      >
        {value === undefined && <option value="">（混在）</option>}
        <option value="left">左揃え</option>
        <option value="center">中央</option>
        <option value="right">右揃え</option>
      </select>
    </div>
  );
}

// ----------------------------------------------------------------------------
// VerticalAlignRow
// ----------------------------------------------------------------------------

export function VerticalAlignRow({
  value,
  onChange,
  label = '上下方向の揃え',
}: {
  value: VerticalAlign | undefined;
  onChange: (v: VerticalAlign) => void;
  label?: string;
}) {
  return (
    <div className="prop-row">
      <label>{label}</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value as VerticalAlign)}
      >
        {value === undefined && <option value="">（混在）</option>}
        <option value="top">上揃え</option>
        <option value="middle">中央</option>
        <option value="bottom">下揃え</option>
      </select>
    </div>
  );
}
