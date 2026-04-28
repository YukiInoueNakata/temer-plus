// ============================================================================
// SDSG between-anchor selection
// 複数 Box から between モード用の 2 アイテム（Time 軸最小・最大）を抽出
// 横型レイアウト = x 軸が Time、縦型 = y 軸が Time
// 同値の場合は配列出現順で安定ソート（先頭優先）
// ============================================================================

import type { Box } from '../types';

export interface BetweenAnchorPair {
  lowBoxId: string;
  highBoxId: string;
}

export function pickBetweenAnchors(boxes: Box[], isHorizontal: boolean): BetweenAnchorPair | null {
  if (boxes.length < 2) return null;
  const indexed = boxes.map((b, i) => ({ b, i }));
  const key = isHorizontal ? 'x' : 'y';
  const sorted = [...indexed].sort((p, q) => {
    const d = (p.b[key] as number) - (q.b[key] as number);
    if (d !== 0) return d;
    return p.i - q.i;
  });
  return {
    lowBoxId: sorted[0].b.id,
    highBoxId: sorted[sorted.length - 1].b.id,
  };
}
