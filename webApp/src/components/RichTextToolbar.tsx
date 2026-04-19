// ============================================================================
// RichTextToolbar - textarea に対し選択範囲を装飾タグで囲むツールバー
// 対応タグ: <b>/<i>/<u>/<s>/<size=N>/<color=#...>/<font=Name>
// ============================================================================

import type { RefObject } from 'react';

export interface RichTextToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (next: string) => void;
  compact?: boolean;
}

type Wrap = { open: string; close: string };

export function RichTextToolbar({ textareaRef, value, onChange, compact }: RichTextToolbarProps) {
  const applyWrap = (wrap: Wrap) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const sel = value.slice(start, end);
    const newVal =
      value.slice(0, start) + wrap.open + sel + wrap.close + value.slice(end);
    onChange(newVal);
    // カーソルを挿入範囲内に
    setTimeout(() => {
      if (!el) return;
      el.focus();
      const cursorStart = start + wrap.open.length;
      const cursorEnd = cursorStart + sel.length;
      el.setSelectionRange(cursorStart, cursorEnd);
    }, 0);
  };

  const btnStyle: React.CSSProperties = {
    padding: compact ? '2px 6px' : '3px 8px',
    fontSize: compact ? '0.82em' : '0.88em',
    border: '1px solid #ccc',
    background: '#fff',
    borderRadius: 3,
    cursor: 'pointer',
    lineHeight: 1.1,
  };

  const askSize = () => {
    const input = prompt('フォントサイズ (px)', '14');
    if (!input) return;
    const n = Number(input);
    if (!isFinite(n) || n <= 0) return;
    applyWrap({ open: `<size=${n}>`, close: '</size>' });
  };
  const askColor = () => {
    const input = prompt('色 (#ff0000 など)', '#cc0000');
    if (!input) return;
    applyWrap({ open: `<color=${input}>`, close: '</color>' });
  };
  const askFont = () => {
    const input = prompt('フォント名', 'Meiryo');
    if (!input) return;
    applyWrap({ open: `<font="${input}">`, close: '</font>' });
  };

  return (
    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 4 }}>
      <button
        type="button"
        style={{ ...btnStyle, fontWeight: 700 }}
        onClick={() => applyWrap({ open: '<b>', close: '</b>' })}
        title="太字"
      >
        B
      </button>
      <button
        type="button"
        style={{ ...btnStyle, fontStyle: 'italic' }}
        onClick={() => applyWrap({ open: '<i>', close: '</i>' })}
        title="斜体"
      >
        I
      </button>
      <button
        type="button"
        style={{ ...btnStyle, textDecoration: 'underline' }}
        onClick={() => applyWrap({ open: '<u>', close: '</u>' })}
        title="下線"
      >
        U
      </button>
      <button
        type="button"
        style={{ ...btnStyle, textDecoration: 'line-through' }}
        onClick={() => applyWrap({ open: '<s>', close: '</s>' })}
        title="取消線"
      >
        S
      </button>
      <button type="button" style={btnStyle} onClick={askSize} title="文字サイズ">
        Aa
      </button>
      <button type="button" style={btnStyle} onClick={askColor} title="文字色">
        🎨
      </button>
      <button type="button" style={btnStyle} onClick={askFont} title="フォント">
        Fn
      </button>
    </div>
  );
}
