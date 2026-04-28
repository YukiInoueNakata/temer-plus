// ============================================================================
// SDSG between-anchor selection / resolution
// - pickBetweenAnchors: 複数 Box から between モード用の 2 アイテム
//   （Time 軸最小・最大）を抽出
// - resolveBetweenEndpoint: between の片端 (attachedTo / attachedTo2) を
//   Box または Line に解決して、Time 軸範囲と Item 軸中心の取得しやすい形に
//   正規化する。Line は from/to Box の中点・幅 0 として扱う
// - 横型レイアウト = x 軸が Time、縦型 = y 軸が Time
// - 同値の場合は配列出現順で安定ソート（先頭優先）
// ============================================================================

import type { Box, Line } from '../types';

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

/**
 * between モードの 1 端点を Box / Line に解決し、Time 軸方向の範囲と Item 軸方向の中心を返す。
 * - Box: 通常通り x/y/width/height を使う
 * - Line: from/to の各 Box 中心の中点を 1 点として扱う（Time 軸方向の幅は 0）
 * Box が見つからない・Line が解決不能なら null。
 */
export interface BetweenEndpoint {
  /** Time 軸方向の手前端（横型なら x、縦型なら y） */
  timeStart: number;
  /** Time 軸方向のサイズ（Box は width/height、Line は 0） */
  timeSize: number;
  /** Item 軸方向の中心（横型なら y、縦型なら x） */
  itemCenter: number;
}

export function resolveBetweenEndpoint(
  id: string,
  boxById: Map<string, Box>,
  lineById: Map<string, Line>,
  isHorizontal: boolean,
): BetweenEndpoint | null {
  const box = boxById.get(id);
  if (box) {
    return isHorizontal
      ? { timeStart: box.x, timeSize: box.width, itemCenter: box.y + box.height / 2 }
      : { timeStart: box.y, timeSize: box.height, itemCenter: box.x + box.width / 2 };
  }
  const line = lineById.get(id);
  if (line) {
    const from = boxById.get(line.from);
    const to = boxById.get(line.to);
    if (!from || !to) return null;
    const fromCx = from.x + from.width / 2;
    const fromCy = from.y + from.height / 2;
    const toCx = to.x + to.width / 2;
    const toCy = to.y + to.height / 2;
    const cx = (fromCx + toCx) / 2;
    const cy = (fromCy + toCy) / 2;
    return isHorizontal
      ? { timeStart: cx, timeSize: 0, itemCenter: cy }
      : { timeStart: cy, timeSize: 0, itemCenter: cx };
  }
  return null;
}
