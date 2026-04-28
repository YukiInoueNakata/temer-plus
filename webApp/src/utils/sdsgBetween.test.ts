import { describe, it, expect } from 'vitest';
import { pickBetweenAnchors } from './sdsgBetween';
import type { Box } from '../types';

const b = (id: string, x: number, y: number, w = 100, h = 50): Box => ({
  id, type: 'normal', label: id, x, y, width: w, height: h,
});

describe('pickBetweenAnchors', () => {
  it('returns null for fewer than 2 boxes', () => {
    expect(pickBetweenAnchors([], true)).toBeNull();
    expect(pickBetweenAnchors([b('A', 0, 0)], true)).toBeNull();
  });

  it('horizontal: picks min/max by x for 2 boxes', () => {
    const r = pickBetweenAnchors([b('A', 100, 0), b('B', 0, 0)], true);
    expect(r).toEqual({ lowBoxId: 'B', highBoxId: 'A' });
  });

  it('horizontal: picks Time 軸両端 from 3 or more boxes', () => {
    const boxes = [b('mid', 200, 0), b('right', 500, 0), b('left', 50, 0), b('mid2', 300, 0)];
    const r = pickBetweenAnchors(boxes, true);
    expect(r).toEqual({ lowBoxId: 'left', highBoxId: 'right' });
  });

  it('vertical: picks min/max by y', () => {
    const boxes = [b('top', 0, 50), b('mid', 0, 200), b('bottom', 0, 500)];
    const r = pickBetweenAnchors(boxes, false);
    expect(r).toEqual({ lowBoxId: 'top', highBoxId: 'bottom' });
  });

  it('horizontal: stable order for ties (uses input order)', () => {
    const boxes = [b('first', 100, 0), b('second', 100, 0), b('third', 100, 0)];
    const r = pickBetweenAnchors(boxes, true);
    expect(r).toEqual({ lowBoxId: 'first', highBoxId: 'third' });
  });

  it('horizontal axis ignores y differences', () => {
    const boxes = [b('lowX_highY', 0, 999), b('highX_lowY', 500, 0)];
    const r = pickBetweenAnchors(boxes, true);
    expect(r).toEqual({ lowBoxId: 'lowX_highY', highBoxId: 'highX_lowY' });
  });
});
