// ============================================================================
// ページ分割（長辺方向分割）用ヘルパー
// - 横型レイアウト: x 軸方向に N 分割（境界線は縦方向）
// - 縦型レイアウト: y 軸方向に N 分割（境界線は横方向）
// - overlap は各ページの端に両側 overlap_px 分の余白を加えた描画窓
// - 用紙ストリップ原点規約は既存 `PaperGuideOverlay` (Canvas.tsx:1218-1219) と一致
//     横型: originX=0,            originY=-paperHeight/2
//     縦型: originX=-paperWidth/2, originY=0
// ============================================================================

import type { LayoutDirection } from '../types';

export interface PageBounds {
  index: number;
  // 描画窓（overlap 込み）— 各フォーマットで「この矩形を 1 ページに描画」する対象
  x: number;
  y: number;
  width: number;
  height: number;
  // 用紙本体の範囲（overlap 抜き）
  innerX: number;
  innerY: number;
  innerWidth: number;
  innerHeight: number;
}

export interface PageLayoutInput {
  paperWidth: number;        // world px
  paperHeight: number;       // world px
  layout: LayoutDirection;
  pageCount: number;         // 1 = 分割なし
  overlapPx: number;         // 各ページの隣接側に付ける余白（両端側ページは片側のみ）
  /** ストリップ原点を上書きしたい場合（既定は Canvas 規約） */
  originX?: number;
  originY?: number;
}

/**
 * 均等 N 分割のページ境界を算出。
 * モデル: **ステップ = paperSize − overlap**（隣接ページで overlap 分を共有）
 *  - 各ページの内側（出力される範囲）は `paperWidth × paperHeight`
 *  - 隣接ページの内側が overlap 分重なる
 *  - overlap = 0 なら綺麗な N 分割
 * ストリップ全体の長さ = paperW × 1 + (N-1) × (paperW − overlap)
 */
export function computePageBounds(input: PageLayoutInput): PageBounds[] {
  const { paperWidth, paperHeight, layout, overlapPx } = input;
  const n = Math.max(1, Math.floor(input.pageCount));
  const isH = layout === 'horizontal';
  const originX = input.originX ?? (isH ? 0 : -paperWidth / 2);
  const originY = input.originY ?? (isH ? -paperHeight / 2 : 0);
  const pages: PageBounds[] = [];
  for (let i = 0; i < n; i++) {
    if (isH) {
      // step = paperWidth - overlap。単一ページ時(n=1)は step 未使用
      const step = paperWidth - overlapPx;
      const innerX = originX + step * i;
      const innerY = originY;
      pages.push({
        index: i,
        x: innerX,
        y: innerY,
        width: paperWidth,
        height: paperHeight,
        innerX,
        innerY,
        innerWidth: paperWidth,
        innerHeight: paperHeight,
      });
    } else {
      const step = paperHeight - overlapPx;
      const innerX = originX;
      const innerY = originY + step * i;
      pages.push({
        index: i,
        x: innerX,
        y: innerY,
        width: paperWidth,
        height: paperHeight,
        innerX,
        innerY,
        innerWidth: paperWidth,
        innerHeight: paperHeight,
      });
    }
  }
  return pages;
}

/** rect が page の描画窓に重なるか（端接触は true） */
export function rectIntersectsPage(
  rect: { x: number; y: number; width: number; height: number },
  page: PageBounds,
): boolean {
  return !(
    rect.x + rect.width < page.x ||
    rect.x > page.x + page.width ||
    rect.y + rect.height < page.y ||
    rect.y > page.y + page.height
  );
}

/** rect が page の「内側（用紙本体）」に完全に収まるか */
export function rectInsidePageInner(
  rect: { x: number; y: number; width: number; height: number },
  page: PageBounds,
): boolean {
  return (
    rect.x >= page.innerX &&
    rect.x + rect.width <= page.innerX + page.innerWidth &&
    rect.y >= page.innerY &&
    rect.y + rect.height <= page.innerY + page.innerHeight
  );
}

/**
 * ストリップ全体の bbox（全ページを包含する矩形）。
 * プレビューの fit 計算等で使用。
 */
export function computeStripBounds(input: PageLayoutInput): { x: number; y: number; width: number; height: number } {
  const pages = computePageBounds(input);
  if (pages.length === 0) {
    const isH = input.layout === 'horizontal';
    return {
      x: isH ? 0 : -input.paperWidth / 2,
      y: isH ? -input.paperHeight / 2 : 0,
      width: input.paperWidth,
      height: input.paperHeight,
    };
  }
  const first = pages[0];
  const last = pages[pages.length - 1];
  return {
    x: Math.min(first.innerX, last.innerX),
    y: Math.min(first.innerY, last.innerY),
    width: Math.max(first.innerX + first.innerWidth, last.innerX + last.innerWidth) - Math.min(first.innerX, last.innerX),
    height: Math.max(first.innerY + first.innerHeight, last.innerY + last.innerHeight) - Math.min(first.innerY, last.innerY),
  };
}
