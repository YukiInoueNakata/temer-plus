import { describe, it, expect } from 'vitest';
import {
  computeLinePath,
  resolveEffectiveShape,
  applyLinePathMargins,
  toSvgPath,
  sampleCurveToSegments,
} from './linePath';
import type { Box, Line } from '../types';

function box(id: string, x: number, y: number, w = 100, h = 50): Box {
  return { id, type: 'normal', label: id, x, y, width: w, height: h };
}

function line(overrides: Partial<Line> = {}): Line {
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

describe('resolveEffectiveShape', () => {
  it('既定は straight', () => {
    expect(resolveEffectiveShape(line())).toBe('straight');
  });
  it('elbow は elbow', () => {
    expect(resolveEffectiveShape(line({ shape: 'elbow' }))).toBe('elbow');
  });
  it('curve は curve', () => {
    expect(resolveEffectiveShape(line({ shape: 'curve' }))).toBe('curve');
  });
  it('legacy connectionMode=horizontal は elbow として解釈', () => {
    expect(resolveEffectiveShape(line({ connectionMode: 'horizontal' }))).toBe('elbow');
  });
});

describe('computeLinePath straight', () => {
  it('横型: from 右辺中点 → to 左辺中点', () => {
    const a = box('A', 0, 0);        // right=100, mid y=25
    const b = box('B', 300, 100);    // left=300, mid y=125
    const p = computeLinePath(line(), a, b, 'horizontal');
    expect(p.kind).toBe('straight');
    expect(p.points).toEqual([{ x: 100, y: 25 }, { x: 300, y: 125 }]);
  });
  it('縦型: from 下辺中点 → to 上辺中点', () => {
    const a = box('A', 0, 0);        // bottom=50, mid x=50
    const b = box('B', 100, 300);    // top=300, mid x=150
    const p = computeLinePath(line(), a, b, 'vertical');
    expect(p.points).toEqual([{ x: 50, y: 50 }, { x: 150, y: 300 }]);
  });
});

describe('computeLinePath elbow', () => {
  it('横型 bendRatio=0.5: 中央で折れる 4 点', () => {
    const a = box('A', 0, 0);
    const b = box('B', 300, 100);
    const p = computeLinePath(line({ shape: 'elbow', elbowBendRatio: 0.5 }), a, b, 'horizontal');
    expect(p.kind).toBe('elbow');
    // p0=(100,25), bendX=100+(300-100)*0.5=200
    expect(p.points).toEqual([
      { x: 100, y: 25 },
      { x: 200, y: 25 },
      { x: 200, y: 125 },
      { x: 300, y: 125 },
    ]);
  });
  it('横型 bendRatio=0.2: 左寄り', () => {
    const a = box('A', 0, 0);
    const b = box('B', 300, 100);
    const p = computeLinePath(line({ shape: 'elbow', elbowBendRatio: 0.2 }), a, b, 'horizontal');
    // bendX = 100 + 200*0.2 = 140
    expect(p.points[1].x).toBe(140);
    expect(p.points[2].x).toBe(140);
  });
  it('縦型: bend は y 軸基準', () => {
    const a = box('A', 0, 0);
    const b = box('B', 100, 300);
    const p = computeLinePath(line({ shape: 'elbow', elbowBendRatio: 0.5 }), a, b, 'vertical');
    // p0=(50,50), p3=(150,300), bendY=50+(300-50)*0.5=175
    expect(p.points[1]).toEqual({ x: 50, y: 175 });
    expect(p.points[2]).toEqual({ x: 150, y: 175 });
  });
});

describe('computeLinePath curve', () => {
  it('横型 curveIntensity=0.5: 制御点は時間軸沿いに配置', () => {
    const a = box('A', 0, 0);
    const b = box('B', 300, 100);
    const p = computeLinePath(line({ shape: 'curve', curveIntensity: 0.5 }), a, b, 'horizontal');
    expect(p.kind).toBe('curve');
    // p0=(100,25), p3=(300,125), dx=200
    // cp1=(100+200*0.5, 25)=(200,25), cp2=(300-200*0.5, 125)=(200,125)
    expect(p.points).toEqual([
      { x: 100, y: 25 },
      { x: 200, y: 25 },
      { x: 200, y: 125 },
      { x: 300, y: 125 },
    ]);
  });
});

describe('applyLinePathMargins', () => {
  it('margin=0 は素通し', () => {
    const p = computeLinePath(line(), box('A', 0, 0), box('B', 300, 0), 'horizontal');
    expect(applyLinePathMargins(p, 0, 0)).toBe(p);
  });
  it('straight: 両端が縮む', () => {
    const p = computeLinePath(line(), box('A', 0, 0), box('B', 300, 0), 'horizontal');
    const m = applyLinePathMargins(p, 10, 10);
    // p0=(100,25), p1=(300,25), len=200
    expect(m.points[0].x).toBeCloseTo(110);
    expect(m.points[1].x).toBeCloseTo(290);
  });
  it('elbow: 最初と最後のセグメントが縮む、中間は不変', () => {
    const p = computeLinePath(line({ shape: 'elbow', elbowBendRatio: 0.5 }),
      box('A', 0, 0), box('B', 300, 100), 'horizontal');
    const m = applyLinePathMargins(p, 10, 10);
    // 最初セグメント (100,25)→(200,25), p0 が +10 に
    expect(m.points[0].x).toBeCloseTo(110);
    expect(m.points[0].y).toBeCloseTo(25);
    // bend 点は不変
    expect(m.points[1]).toEqual(p.points[1]);
    expect(m.points[2]).toEqual(p.points[2]);
    // 最後セグメント (200,125)→(300,125), p3 が -10 に
    expect(m.points[3].x).toBeCloseTo(290);
  });
});

describe('toSvgPath', () => {
  it('straight は M..L', () => {
    const p = computeLinePath(line(), box('A', 0, 0), box('B', 300, 0), 'horizontal');
    expect(toSvgPath(p)).toBe('M 100 25 L 300 25');
  });
  it('elbow は M..L..L..L', () => {
    const p = computeLinePath(line({ shape: 'elbow' }),
      box('A', 0, 0), box('B', 300, 100), 'horizontal');
    expect(toSvgPath(p)).toMatch(/^M \d+ \d+ L \d+ \d+ L \d+ \d+ L \d+ \d+$/);
  });
  it('curve は M..C', () => {
    const p = computeLinePath(line({ shape: 'curve' }),
      box('A', 0, 0), box('B', 300, 100), 'horizontal');
    expect(toSvgPath(p)).toMatch(/^M \d+ \d+ C \d+ \d+ \d+ \d+ \d+ \d+$/);
  });
});

describe('sampleCurveToSegments', () => {
  it('12 sections で 13 点返す', () => {
    const p = computeLinePath(line({ shape: 'curve' }),
      box('A', 0, 0), box('B', 300, 100), 'horizontal');
    const pts = sampleCurveToSegments(p, 12);
    expect(pts.length).toBe(13);
    expect(pts[0]).toEqual(p.points[0]);
    expect(pts[12].x).toBeCloseTo(p.points[3].x);
    expect(pts[12].y).toBeCloseTo(p.points[3].y);
  });
});
