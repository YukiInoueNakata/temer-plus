// ============================================================================
// Line のパス計算（3 形状共通）
// - straight: 2 点 直線 (p0 → p1)
// - elbow:    4 点 L字 (p0 → p1 → p2 → p3)
// - curve:    4 点 三次 Bezier (p0 → cp1 → cp2 → p3)
//
// 前提: from/to は resolveLineDirection で swap 済みのものを受け取る
// 座標規約: 横型 time=x / item=-y、縦型 time=y / item=+x
// ============================================================================

import type { Box, Line, LayoutDirection } from '../types';

export interface Pt { x: number; y: number; }

export type LinePathKind = 'straight' | 'elbow' | 'curve';

export interface LinePath {
  kind: LinePathKind;
  points: Pt[];   // straight=2pt / elbow=4pt / curve=4pt (p0 cp1 cp2 p3)
}

/**
 * from の forward-time 辺中点、to の backward-time 辺中点を計算。
 * startOffset* / endOffset* を既に適用した座標を返す。
 */
export function computeEndpoints(
  line: {
    startOffsetTime?: number;
    endOffsetTime?: number;
    startOffsetItem?: number;
    endOffsetItem?: number;
  },
  fromBox: Box,
  toBox: Box,
  layout: LayoutDirection,
): { p0: Pt; p3: Pt } {
  const isH = layout === 'horizontal';
  const fx0 = isH ? fromBox.x + fromBox.width : fromBox.x + fromBox.width / 2;
  const fy0 = isH ? fromBox.y + fromBox.height / 2 : fromBox.y + fromBox.height;
  const tx0 = isH ? toBox.x : toBox.x + toBox.width / 2;
  const ty0 = isH ? toBox.y + toBox.height / 2 : toBox.y;

  const sOffT = line.startOffsetTime ?? 0;
  const eOffT = line.endOffsetTime ?? 0;
  const sOffI = line.startOffsetItem ?? 0;
  const eOffI = line.endOffsetItem ?? 0;
  // 横型: Time=+x, Item=-y / 縦型: Time=+y, Item=+x
  const sDx = isH ? sOffT : sOffI;
  const sDy = isH ? -sOffI : sOffT;
  const eDx = isH ? eOffT : eOffI;
  const eDy = isH ? -eOffI : eOffT;

  return {
    p0: { x: fx0 + sDx, y: fy0 + sDy },
    p3: { x: tx0 + eDx, y: ty0 + eDy },
  };
}

/**
 * 形状別パス生成のメイン。
 * line.shape を参照して straight / elbow / curve / (legacy) を分岐。
 * from/to は swap 済み前提。
 */
export function computeLinePath(
  line: Line,
  fromBox: Box,
  toBox: Box,
  layout: LayoutDirection,
): LinePath {
  const { p0, p3 } = computeEndpoints(line, fromBox, toBox, layout);

  // legacy: connectionMode='horizontal' → shape='elbow' として扱う
  const shape = resolveEffectiveShape(line);

  if (shape === 'elbow') {
    const bendRatio = clamp01(line.elbowBendRatio ?? 0.5);
    const isH = layout === 'horizontal';
    if (isH) {
      const bendX = p0.x + (p3.x - p0.x) * bendRatio;
      return {
        kind: 'elbow',
        points: [
          p0,
          { x: bendX, y: p0.y },
          { x: bendX, y: p3.y },
          p3,
        ],
      };
    }
    // vertical
    const bendY = p0.y + (p3.y - p0.y) * bendRatio;
    return {
      kind: 'elbow',
      points: [
        p0,
        { x: p0.x, y: bendY },
        { x: p3.x, y: bendY },
        p3,
      ],
    };
  }

  if (shape === 'curve') {
    const intensity = clamp01(line.curveIntensity ?? 0.5);
    const isH = layout === 'horizontal';
    if (isH) {
      const dx = p3.x - p0.x;
      return {
        kind: 'curve',
        points: [
          p0,
          { x: p0.x + dx * intensity, y: p0.y },
          { x: p3.x - dx * intensity, y: p3.y },
          p3,
        ],
      };
    }
    const dy = p3.y - p0.y;
    return {
      kind: 'curve',
      points: [
        p0,
        { x: p0.x, y: p0.y + dy * intensity },
        { x: p3.x, y: p3.y - dy * intensity },
        p3,
      ],
    };
  }

  // straight (default)
  return { kind: 'straight', points: [p0, p3] };
}

/** shape 値の解釈（legacy connectionMode 対応） */
export function resolveEffectiveShape(line: Line): LinePathKind {
  if (line.shape === 'elbow') return 'elbow';
  if (line.shape === 'curve') return 'curve';
  // legacy: 旧 shape='straight' + connectionMode='horizontal' を elbow に
  if (line.connectionMode === 'horizontal') return 'elbow';
  return 'straight';
}

/** startMargin / endMargin を適用した path を返す（形状別に端を縮短） */
export function applyLinePathMargins(
  path: LinePath,
  startMargin: number,
  endMargin: number,
): LinePath {
  if (startMargin === 0 && endMargin === 0) return path;

  if (path.kind === 'straight') {
    const [a, b] = path.points;
    return { kind: 'straight', points: [shrinkFromStart(a, b, startMargin), shrinkFromStart(b, a, endMargin)] };
  }

  if (path.kind === 'elbow') {
    const [a, b, c, d] = path.points;
    const aNew = shrinkFromStart(a, b, startMargin);
    const dNew = shrinkFromStart(d, c, endMargin);
    return { kind: 'elbow', points: [aNew, b, c, dNew] };
  }

  // curve: Bezier を t パラメータで再計算するのが厳密だが、端点を接線方向に微動する近似で OK
  const [a, cp1, cp2, d] = path.points;
  const aNew = shrinkFromStart(a, cp1, startMargin);
  const dNew = shrinkFromStart(d, cp2, endMargin);
  return { kind: 'curve', points: [aNew, cp1, cp2, dNew] };
}

/** SVG path 文字列を生成 */
export function toSvgPath(path: LinePath): string {
  const pts = path.points;
  if (path.kind === 'straight') {
    return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  }
  if (path.kind === 'elbow') {
    return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y} L ${pts[2].x} ${pts[2].y} L ${pts[3].x} ${pts[3].y}`;
  }
  // curve
  return `M ${pts[0].x} ${pts[0].y} C ${pts[1].x} ${pts[1].y} ${pts[2].x} ${pts[2].y} ${pts[3].x} ${pts[3].y}`;
}

/** 曲線を N セグメントに近似して返す（PPTX 用の多セグメント line 描画） */
export function sampleCurveToSegments(path: LinePath, steps = 12): Pt[] {
  if (path.kind !== 'curve') return path.points;
  const [p0, cp1, cp2, p3] = path.points;
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push(cubicBezier(p0, cp1, cp2, p3, t));
  }
  return out;
}

// ---------- 内部ヘルパ ----------
function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0.5;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/** p0 から p1 方向に margin 分だけ縮めた点を返す */
function shrinkFromStart(p0: Pt, p1: Pt, margin: number): Pt {
  if (margin <= 0) return p0;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const m = Math.min(margin, len * 0.9);  // セグメント長の 90% を上限として clamp
  return { x: p0.x + (dx / len) * m, y: p0.y + (dy / len) * m };
}

function cubicBezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const b0 = u * u * u;
  const b1 = 3 * u * u * t;
  const b2 = 3 * u * t * t;
  const b3 = t * t * t;
  return {
    x: p0.x * b0 + p1.x * b1 + p2.x * b2 + p3.x * b3,
    y: p0.y * b0 + p1.y * b1 + p2.y * b2 + p3.y * b3,
  };
}
