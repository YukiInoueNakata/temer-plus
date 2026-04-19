// ============================================================================
// ラベルテキストから Box サイズを計測するユーティリティ
// - 非表示の div に描画して getBoundingClientRect で実測
// - 部分装飾タグを含んでいる可能性に備え、stripTags したプレーンテキストで計測
// ============================================================================

import { stripTags } from './richText';

export interface MeasureOpts {
  fontSize: number;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  vertical?: boolean;      // 縦書き
  maxWidth?: number;       // 横書き時の折返し上限
  maxHeight?: number;      // 縦書き時の折返し上限
  padding?: number;        // 上下左右 padding（既定 8）
}

export interface Size {
  width: number;
  height: number;
}

let measureDiv: HTMLDivElement | null = null;

function getMeasureDiv(): HTMLDivElement {
  if (measureDiv && document.body.contains(measureDiv)) return measureDiv;
  const el = document.createElement('div');
  el.id = '__temer_measure__';
  el.style.position = 'absolute';
  el.style.visibility = 'hidden';
  el.style.pointerEvents = 'none';
  el.style.whiteSpace = 'pre-wrap';
  el.style.wordBreak = 'break-word';
  el.style.top = '-99999px';
  el.style.left = '-99999px';
  el.style.padding = '0';
  el.style.margin = '0';
  el.style.boxSizing = 'border-box';
  el.style.display = 'inline-block';
  document.body.appendChild(el);
  measureDiv = el;
  return el;
}

/**
 * ラベル文字列のサイズを計測する（padding 含む、px 単位）。
 * richText タグは stripTags して計測する（視覚的にはほぼ同一と仮定）。
 */
export function measureLabel(text: string, opts: MeasureOpts): Size {
  const el = getMeasureDiv();
  const pad = opts.padding ?? 8;
  el.style.fontSize = `${opts.fontSize}px`;
  el.style.fontFamily = opts.fontFamily ?? 'inherit';
  el.style.fontWeight = opts.bold ? '700' : '400';
  el.style.fontStyle = opts.italic ? 'italic' : 'normal';
  el.style.writingMode = opts.vertical ? 'vertical-rl' : 'horizontal-tb';
  // 折返し上限
  if (opts.vertical) {
    el.style.maxWidth = '';
    el.style.maxHeight = opts.maxHeight != null ? `${Math.max(1, opts.maxHeight - pad * 2)}px` : '';
  } else {
    el.style.maxHeight = '';
    el.style.maxWidth = opts.maxWidth != null ? `${Math.max(1, opts.maxWidth - pad * 2)}px` : '';
  }
  el.textContent = stripTags(text) || ' ';
  const r = el.getBoundingClientRect();
  return {
    width: Math.ceil(r.width) + pad * 2,
    height: Math.ceil(r.height) + pad * 2,
  };
}

/**
 * autoFitBoxMode に従ってラベルに合わせた Box サイズを求める。
 * 指定された固定辺は保持し、他辺だけを「必要なら増やす」方向に更新する。
 * すでに十分な余裕がある場合は返却値は入力 width/height と同じ。
 */
export function computeAutoFitSize(
  text: string,
  currentWidth: number,
  currentHeight: number,
  mode: 'width-fixed' | 'height-fixed',
  opts: MeasureOpts,
): Size {
  if (mode === 'width-fixed') {
    // 横幅を固定し、必要なら高さだけ伸ばす
    const m = measureLabel(text, { ...opts, maxWidth: currentWidth });
    return { width: currentWidth, height: Math.max(currentHeight, m.height) };
  }
  // height-fixed
  const m = measureLabel(text, { ...opts, maxHeight: currentHeight });
  return { width: Math.max(currentWidth, m.width), height: currentHeight };
}

/**
 * 最小 Fit: テキストがぴったり収まるサイズを求める（制約なしで実測）。
 * 複数行のラベル（\n 含む）も考慮される。
 */
export function computeFitToLabelSize(text: string, opts: MeasureOpts): Size {
  return measureLabel(text, opts);
}
