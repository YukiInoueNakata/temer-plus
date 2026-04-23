import { describe, it, expect } from 'vitest';
import {
  resolveLineDirection,
  clampAngleDeg,
  computeAngleEndpoints,
} from './lineDirection';
import type { Box, Line } from '../types';

function makeBox(id: string, x: number, y: number, w = 100, h = 50): Box {
  return {
    id,
    type: 'normal',
    label: id,
    x,
    y,
    width: w,
    height: h,
  };
}

function makeLine(overrides: Partial<Line> = {}): Line {
  return {
    id: 'RL_1',
    type: 'RLine',
    from: 'A',
    to: 'B',
    connectionMode: 'center-to-center',
    shape: 'straight',
    ...overrides,
  };
}

describe('resolveLineDirection', () => {
  it('横型: from が to より前なら入れ替えなし', () => {
    const a = makeBox('A', 0, 0);
    const b = makeBox('B', 200, 0);
    const r = resolveLineDirection(makeLine(), a, b, 'horizontal');
    expect(r.swapped).toBe(false);
    expect(r.from.id).toBe('A');
    expect(r.to.id).toBe('B');
  });

  it('横型: from が to より後ろなら入れ替え', () => {
    const a = makeBox('A', 500, 0);
    const b = makeBox('B', 100, 0);
    const r = resolveLineDirection(makeLine(), a, b, 'horizontal');
    expect(r.swapped).toBe(true);
    expect(r.from.id).toBe('B');
    expect(r.to.id).toBe('A');
  });

  it('縦型: from が to より下（Time 後方）なら入れ替え', () => {
    const a = makeBox('A', 0, 500);
    const b = makeBox('B', 0, 100);
    const r = resolveLineDirection(makeLine(), a, b, 'vertical');
    expect(r.swapped).toBe(true);
    expect(r.from.id).toBe('B');
  });

  it('同 Time レベルなら入れ替えなし（ユーザ指定順）', () => {
    const a = makeBox('A', 100, 0);
    const b = makeBox('B', 100, 200);
    const r = resolveLineDirection(makeLine(), a, b, 'horizontal');
    expect(r.swapped).toBe(false);
    expect(r.from.id).toBe('A');
  });

  it('swap 時に start/end の margin と offset が交換される', () => {
    const a = makeBox('A', 500, 0);
    const b = makeBox('B', 100, 0);
    const r = resolveLineDirection(
      makeLine({
        startMargin: 3,
        endMargin: 7,
        startOffsetTime: 11,
        endOffsetTime: 13,
        startOffsetItem: 17,
        endOffsetItem: 19,
      }),
      a,
      b,
      'horizontal',
    );
    expect(r.swapped).toBe(true);
    expect(r.startMargin).toBe(7);
    expect(r.endMargin).toBe(3);
    expect(r.startOffsetTime).toBe(13);
    expect(r.endOffsetTime).toBe(11);
    expect(r.startOffsetItem).toBe(19);
    expect(r.endOffsetItem).toBe(17);
  });
});

describe('clampAngleDeg', () => {
  it('範囲内はそのまま', () => {
    expect(clampAngleDeg(0)).toBe(0);
    expect(clampAngleDeg(30)).toBe(30);
    expect(clampAngleDeg(-45)).toBe(-45);
  });
  it('範囲外はクランプ', () => {
    expect(clampAngleDeg(86)).toBe(85);
    expect(clampAngleDeg(-86)).toBe(-85);
    expect(clampAngleDeg(1000)).toBe(85);
  });
  it('undefined / NaN は 0', () => {
    expect(clampAngleDeg(undefined)).toBe(0);
    expect(clampAngleDeg(NaN)).toBe(0);
  });
});

describe('computeAngleEndpoints', () => {
  it('横型 θ=0 は水平: end.y = start.y', () => {
    const a = makeBox('A', 0, 0, 100, 50);    // right=100, mid y=25
    const b = makeBox('B', 300, 200, 100, 50); // left=300
    const e = computeAngleEndpoints(a, b, 0, 'horizontal');
    expect(e.sx).toBe(100);
    expect(e.sy).toBe(25);
    expect(e.ex).toBe(300);
    expect(e.ey).toBeCloseTo(25);
  });

  it('横型 θ=+45 は上傾き: dx=200 → end.y = 25 - 200*tan45 = -175', () => {
    const a = makeBox('A', 0, 0, 100, 50);
    const b = makeBox('B', 300, 0, 100, 50);
    const e = computeAngleEndpoints(a, b, 45, 'horizontal');
    expect(e.ey).toBeCloseTo(25 - 200);
  });

  it('横型 θ=-45 は下傾き: end.y = 25 + 200', () => {
    const a = makeBox('A', 0, 0, 100, 50);
    const b = makeBox('B', 300, 0, 100, 50);
    const e = computeAngleEndpoints(a, b, -45, 'horizontal');
    expect(e.ey).toBeCloseTo(25 + 200);
  });

  it('縦型 θ=0 は垂直: end.x = start.x', () => {
    const a = makeBox('A', 0, 0, 100, 50);    // bottom=50, mid x=50
    const b = makeBox('B', 200, 300, 100, 50); // top=300
    const e = computeAngleEndpoints(a, b, 0, 'vertical');
    expect(e.sx).toBe(50);
    expect(e.sy).toBe(50);
    expect(e.ex).toBeCloseTo(50);
    expect(e.ey).toBe(300);
  });

  it('縦型 θ=+45: dy=250 → end.x = 50 + 250*tan45 = 300', () => {
    const a = makeBox('A', 0, 0, 100, 50);
    const b = makeBox('B', 0, 300, 100, 50);
    const e = computeAngleEndpoints(a, b, 45, 'vertical');
    expect(e.ex).toBeCloseTo(50 + 250);
  });

  it('範囲外角度はクランプ適用される', () => {
    const a = makeBox('A', 0, 0, 100, 50);
    const b = makeBox('B', 300, 0, 100, 50);
    const e86 = computeAngleEndpoints(a, b, 86, 'horizontal');
    const e85 = computeAngleEndpoints(a, b, 85, 'horizontal');
    expect(e86.ey).toBeCloseTo(e85.ey);
  });
});
