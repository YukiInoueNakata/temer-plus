// ============================================================================
// 縦書きテキスト補正
// - writingMode: vertical-rl + textOrientation: upright の環境では
//   半角ハイフン（- U+002D / ‐ U+2010 / － U+FF0D / − U+2212）が横棒のままになる。
//   これを 90°回転させて縦書きと整合させる。
//   長音「ー U+30FC」も同様に対応（既に upright の場合はブラウザが縦向きに倒すが、
//   mixed の場合にも補正したいので共通処理）。
// ============================================================================

import type { ReactNode } from 'react';

const ROTATE_CHARS = new Set([
  '-',       // U+002D HYPHEN-MINUS
  '\u2010',  // HYPHEN
  '\u2011',  // NON-BREAKING HYPHEN
  '\u2012',  // FIGURE DASH
  '\u2013',  // EN DASH
  '\u2014',  // EM DASH
  '\uFF0D',  // FULLWIDTH HYPHEN-MINUS
  '\u2212',  // MINUS SIGN
]);

/**
 * 縦書き時に半角ハイフン等を 90°回転させて描画する。
 * vertical=false の場合はそのまま text を返す。
 */
export function renderVerticalAwareText(text: string, vertical: boolean): ReactNode {
  if (!vertical || !text) return text;
  const parts: ReactNode[] = [];
  let buf = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ROTATE_CHARS.has(ch)) {
      if (buf) {
        parts.push(buf);
        buf = '';
      }
      parts.push(
        <span
          key={i}
          style={{
            display: 'inline-block',
            transform: 'rotate(90deg)',
            // 縦書き時の位置調整
            transformOrigin: 'center',
          }}
        >
          {ch}
        </span>
      );
    } else {
      buf += ch;
    }
  }
  if (buf) parts.push(buf);
  return parts;
}
