// ============================================================================
// ラベル部分装飾タグのパースとレンダリング
//
// サポートタグ:
//   <b>...</b>           太字
//   <i>...</i>           斜体
//   <u>...</u>           下線
//   <s>...</s>           取消線
//   <size=14>...</size>  フォントサイズ(px)
//   <color=#ff0000>...</color>  文字色
//   <font=Meiryo>...</font>     フォントファミリ（値にダブルクォートなし／簡易）
//
// 属性値はダブルクォート省略可。
//   <size=14>OK</size>
//   <size="14">OK</size>
//   <color=#ff0000>OK</color>
//   <color="#ff0000">OK</color>
//   <font=Meiryo>OK</font>
//   <font="Yu Mincho, serif">OK</font>
//
// ネスト可: <b>太い <i>斜体</i> 続き</b>
// 閉じタグが一致しない場合はタグを文字として表示。
// ============================================================================

import type { ReactNode } from 'react';

// 縦書き時に 90°回転すべき文字（半角ハイフン類）
const ROTATE_CHARS = new Set([
  '-', '\u2010', '\u2011', '\u2012', '\u2013', '\u2014', '\uFF0D', '\u2212',
]);

export interface RichTextOpts {
  vertical?: boolean;
  // 縦書き時の半角英数向き（親要素の text-orientation と揃える用、ここでは参考）
  asciiUpright?: boolean;
}

type Style = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
};

type Token =
  | { kind: 'text'; value: string }
  | { kind: 'open'; tag: string; value?: string }
  | { kind: 'close'; tag: string };

const TAG_NAMES = ['b', 'i', 'u', 's', 'size', 'color', 'font'];

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = src.length;
  let buf = '';
  const flush = () => {
    if (buf) {
      out.push({ kind: 'text', value: buf });
      buf = '';
    }
  };
  while (i < n) {
    const ch = src[i];
    if (ch === '<') {
      // 試しにタグ構文を読む
      // 閉じタグ: </name>
      // 開きタグ: <name> または <name=value>
      const closeMatch = src.slice(i).match(/^<\/([a-zA-Z]+)>/);
      if (closeMatch) {
        const tag = closeMatch[1].toLowerCase();
        if (TAG_NAMES.includes(tag)) {
          flush();
          out.push({ kind: 'close', tag });
          i += closeMatch[0].length;
          continue;
        }
      }
      // 開きタグ: 属性値はクォート有/無に対応、>まで
      const openMatch = src.slice(i).match(/^<([a-zA-Z]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^>]*)))?\s*>/);
      if (openMatch) {
        const tag = openMatch[1].toLowerCase();
        if (TAG_NAMES.includes(tag)) {
          const value = openMatch[3] ?? openMatch[4] ?? openMatch[5];
          flush();
          out.push({ kind: 'open', tag, value: value?.trim() });
          i += openMatch[0].length;
          continue;
        }
      }
      // 合致しなければリテラル扱い
      buf += ch;
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

function applyOpen(style: Style, tag: string, value?: string): Style {
  switch (tag) {
    case 'b': return { ...style, bold: true };
    case 'i': return { ...style, italic: true };
    case 'u': return { ...style, underline: true };
    case 's': return { ...style, strike: true };
    case 'size': {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) return { ...style, fontSize: n };
      return style;
    }
    case 'color': {
      if (value) return { ...style, color: value };
      return style;
    }
    case 'font': {
      if (value) return { ...style, fontFamily: value };
      return style;
    }
    default:
      return style;
  }
}

function styleToCss(st: Style): React.CSSProperties {
  const css: React.CSSProperties = {};
  if (st.bold) css.fontWeight = 700;
  if (st.italic) css.fontStyle = 'italic';
  if (st.underline || st.strike) {
    const deco: string[] = [];
    if (st.underline) deco.push('underline');
    if (st.strike) deco.push('line-through');
    css.textDecoration = deco.join(' ');
  }
  if (st.fontSize != null) css.fontSize = st.fontSize;
  if (st.color) css.color = st.color;
  if (st.fontFamily) css.fontFamily = st.fontFamily;
  return css;
}

/**
 * 縦書き時に半角ハイフン類を 90°回転させて表示するための分割
 */
function splitVerticalText(text: string, keyPrefix: string): ReactNode[] {
  const result: ReactNode[] = [];
  let buf = '';
  let idx = 0;
  const flush = () => {
    if (buf) {
      result.push(buf);
      buf = '';
    }
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') {
      flush();
      result.push(<br key={`${keyPrefix}-br-${idx++}`} />);
    } else if (ROTATE_CHARS.has(ch)) {
      flush();
      result.push(
        <span
          key={`${keyPrefix}-r-${idx++}`}
          style={{ display: 'inline-block', transform: 'rotate(90deg)', transformOrigin: 'center' }}
        >
          {ch}
        </span>
      );
    } else {
      buf += ch;
    }
  }
  flush();
  return result;
}

/**
 * タグ付き文字列を React ノードに変換する。
 * 各テキスト片は <span style=...> でスタイルを当てる。
 * - vertical=false: 改行 \n を <br/> に変換
 * - vertical=true: 上記 + 半角ハイフン類を 90°回転
 */
export function renderRichText(src: string | undefined, opts?: RichTextOpts): ReactNode {
  if (!src) return null;
  const vertical = !!opts?.vertical;
  const tokens = tokenize(src);

  const frames: { tag: string | null; style: Style; children: ReactNode[] }[] = [
    { tag: null, style: {}, children: [] },
  ];

  const top = () => frames[frames.length - 1];

  const pushText = (text: string) => {
    const st = top().style;
    const keyPrefix = `t-${top().children.length}`;
    const pieces: ReactNode[] = vertical
      ? splitVerticalText(text, keyPrefix)
      : text.split('\n').flatMap((ln, idx) => {
          const out: ReactNode[] = [];
          if (idx > 0) out.push(<br key={`${keyPrefix}-br-${idx}`} />);
          if (ln) out.push(ln);
          return out;
        });
    if (Object.keys(st).length > 0) {
      top().children.push(
        <span key={`s-${top().children.length}`} style={styleToCss(st)}>
          {pieces}
        </span>
      );
    } else {
      pieces.forEach((p) => top().children.push(p));
    }
  };

  for (const tk of tokens) {
    if (tk.kind === 'text') {
      pushText(tk.value);
    } else if (tk.kind === 'open') {
      const parent = top();
      frames.push({
        tag: tk.tag,
        style: applyOpen(parent.style, tk.tag, tk.value),
        children: [],
      });
    } else if (tk.kind === 'close') {
      // 対応する開きを探す（マッチしなければテキスト扱いで無視）
      const idx = [...frames].reverse().findIndex((f) => f.tag === tk.tag);
      if (idx === -1) continue;
      // idx は末尾からの位置
      const real = frames.length - 1 - idx;
      // real が top でない場合、不整合だが単純に閉じる
      while (frames.length - 1 > real) {
        // 不整合スタックを解消
        const f = frames.pop()!;
        top().children.push(
          <span key={`u-${top().children.length}`} style={styleToCss(f.style)}>
            {f.children}
          </span>
        );
      }
      const f = frames.pop()!;
      top().children.push(
        <span key={`c-${top().children.length}`} style={styleToCss(f.style)}>
          {f.children}
        </span>
      );
    }
  }

  // 未閉じのフレームをフラッシュ
  while (frames.length > 1) {
    const f = frames.pop()!;
    top().children.push(
      <span key={`f-${top().children.length}`} style={styleToCss(f.style)}>
        {f.children}
      </span>
    );
  }

  return <>{frames[0].children}</>;
}

/**
 * プレーンテキスト化（タグを除去）。Box サイズ計算等で使用。
 */
export function stripTags(src: string | undefined): string {
  if (!src) return '';
  let out = '';
  const tokens = tokenize(src);
  for (const tk of tokens) {
    if (tk.kind === 'text') out += tk.value;
  }
  return out;
}
