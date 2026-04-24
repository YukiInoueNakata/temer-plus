// ============================================================================
// Liang-Barsky polyline clipping
// 分割エクスポート時、直線/折れ線を page.inner 矩形にクリップする。
// 出力: 可視区間が複数 piece に分割されうる。各 piece は endsAtOriginalEnd
// フラグで「矢印頭を描くべきか」を示す (元 polyline の末端と一致する piece のみ true)。
// ============================================================================

export interface Pt { x: number; y: number; }
export interface Rect { x: number; y: number; width: number; height: number; }

export interface ClipSegResult {
  p0: Pt;
  p1: Pt;
  clippedStart: boolean;
  clippedEnd: boolean;
}

export function clipSegmentLB(p0: Pt, p1: Pt, rect: Rect): ClipSegResult | null {
  const xMin = rect.x, xMax = rect.x + rect.width;
  const yMin = rect.y, yMax = rect.y + rect.height;
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  const pArr = [-dx, dx, -dy, dy];
  const qArr = [p0.x - xMin, xMax - p0.x, p0.y - yMin, yMax - p0.y];
  let tA = 0, tB = 1;
  for (let i = 0; i < 4; i++) {
    if (Math.abs(pArr[i]) < 1e-9) {
      if (qArr[i] < 0) return null;
      continue;
    }
    const r = qArr[i] / pArr[i];
    if (pArr[i] < 0) {
      if (r > tB) return null;
      if (r > tA) tA = r;
    } else {
      if (r < tA) return null;
      if (r < tB) tB = r;
    }
  }
  return {
    p0: { x: p0.x + tA * dx, y: p0.y + tA * dy },
    p1: { x: p0.x + tB * dx, y: p0.y + tB * dy },
    clippedStart: tA > 1e-6,
    clippedEnd: tB < 1 - 1e-6,
  };
}

export interface ClippedPiece {
  points: Pt[];
  endsAtOriginalEnd: boolean;
}

export function clipPolylineToRect(pts: Pt[], rect: Rect): ClippedPiece[] {
  const pieces: ClippedPiece[] = [];
  if (pts.length < 2) return pieces;
  const eq = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 1e-4 && Math.abs(a.y - b.y) < 1e-4;
  const origEnd = pts[pts.length - 1];

  let buffer: Pt[] = [];
  const flush = (endsAtOriginalEnd: boolean) => {
    if (buffer.length >= 2) pieces.push({ points: buffer, endsAtOriginalEnd });
    buffer = [];
  };

  for (let i = 0; i < pts.length - 1; i++) {
    const clip = clipSegmentLB(pts[i], pts[i + 1], rect);
    if (!clip) {
      flush(false);
      continue;
    }
    if (buffer.length === 0) {
      buffer.push(clip.p0, clip.p1);
    } else {
      const last = buffer[buffer.length - 1];
      if (eq(last, clip.p0)) {
        buffer.push(clip.p1);
      } else {
        flush(false);
        buffer = [clip.p0, clip.p1];
      }
    }
    if (clip.clippedEnd) flush(false);
  }
  if (buffer.length > 0) {
    const last = buffer[buffer.length - 1];
    flush(eq(last, origEnd));
  }
  return pieces;
}
