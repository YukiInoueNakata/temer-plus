import { describe, it, expect } from 'vitest';
import { clipPolylineToRect } from './lineClip';

const R = { x: 0, y: 0, width: 100, height: 100 };

describe('clipPolylineToRect', () => {
  it('returns empty when polyline fully outside rect', () => {
    const pts = [{ x: 150, y: 10 }, { x: 180, y: 50 }];
    expect(clipPolylineToRect(pts, R)).toEqual([]);
  });

  it('returns the polyline unchanged when fully inside', () => {
    const pts = [{ x: 10, y: 10 }, { x: 80, y: 80 }];
    const pieces = clipPolylineToRect(pts, R);
    expect(pieces.length).toBe(1);
    expect(pieces[0].endsAtOriginalEnd).toBe(true);
    expect(pieces[0].points.length).toBe(2);
    expect(pieces[0].points[0]).toEqual({ x: 10, y: 10 });
    expect(pieces[0].points[1]).toEqual({ x: 80, y: 80 });
  });

  it('clips a single segment crossing the right edge — no arrowhead', () => {
    const pts = [{ x: 10, y: 50 }, { x: 200, y: 50 }];
    const pieces = clipPolylineToRect(pts, R);
    expect(pieces.length).toBe(1);
    expect(pieces[0].endsAtOriginalEnd).toBe(false);
    expect(pieces[0].points[0]).toEqual({ x: 10, y: 50 });
    expect(pieces[0].points[1].x).toBeCloseTo(100, 3);
  });

  it('clips a single segment crossing the left edge — arrow at original end remains', () => {
    const pts = [{ x: -50, y: 50 }, { x: 80, y: 50 }];
    const pieces = clipPolylineToRect(pts, R);
    expect(pieces.length).toBe(1);
    expect(pieces[0].endsAtOriginalEnd).toBe(true);
    expect(pieces[0].points[0].x).toBeCloseTo(0, 3);
    expect(pieces[0].points[1]).toEqual({ x: 80, y: 50 });
  });

  it('splits an L字 polyline that re-enters the rect into two pieces', () => {
    // L字: in → out top → back in via another segment
    const pts = [
      { x: 10, y: 50 },
      { x: 10, y: -50 },   // goes out top
      { x: 90, y: -50 },   // stays outside
      { x: 90, y: 80 },    // comes back in from top
    ];
    const pieces = clipPolylineToRect(pts, R);
    // First piece: 10,50 → 10,0 (exit)
    // Second piece: 90,0 → 90,80 (entry, ends at original end)
    expect(pieces.length).toBe(2);
    expect(pieces[0].endsAtOriginalEnd).toBe(false);
    expect(pieces[1].endsAtOriginalEnd).toBe(true);
    // Last piece ends at original end point
    expect(pieces[1].points[pieces[1].points.length - 1]).toEqual({ x: 90, y: 80 });
  });

  it('handles polyline with the last segment fully outside', () => {
    const pts = [
      { x: 10, y: 50 },
      { x: 80, y: 50 },
      { x: 150, y: 50 },  // segment exits
    ];
    const pieces = clipPolylineToRect(pts, R);
    expect(pieces.length).toBe(1);
    expect(pieces[0].endsAtOriginalEnd).toBe(false);
    // First point inside preserved
    expect(pieces[0].points[0]).toEqual({ x: 10, y: 50 });
    // Last point clipped at x=100
    const last = pieces[0].points[pieces[0].points.length - 1];
    expect(last.x).toBeCloseTo(100, 3);
  });
});
