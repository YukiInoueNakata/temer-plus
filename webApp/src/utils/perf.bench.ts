// ============================================================================
// perf.bench.ts - 大規模図向けパフォーマンスベンチマーク
//   実行: npx vitest bench
// ============================================================================

import { describe, bench } from 'vitest';
import type { Sheet, Box, Line, SDSG } from '../types';
import { DEFAULT_SETTINGS } from '../store/defaults';
import { computeSDSGBandLayout } from './sdsgSpaceLayout';
import { computeContentBounds } from './fitBounds';

function makeBoxes(n: number): Box[] {
  const boxes: Box[] = [];
  const cols = 20;
  for (let i = 0; i < n; i++) {
    boxes.push({
      id: `box-${i}`,
      type: 'normal',
      label: `Box ${i}`,
      x: (i % cols) * 120,
      y: Math.floor(i / cols) * 80,
      width: 100,
      height: 50,
    });
  }
  return boxes;
}

function makeLines(boxes: Box[]): Line[] {
  const lines: Line[] = [];
  for (let i = 0; i < boxes.length - 1; i++) {
    if (i % 3 === 2) continue;
    lines.push({
      id: `line-${i}`,
      type: i % 5 === 0 ? 'XLine' : 'RLine',
      from: boxes[i].id,
      to: boxes[i + 1].id,
      connectionMode: 'center-to-center',
      shape: 'straight',
    });
  }
  return lines;
}

function makeSDSGs(boxes: Box[]): SDSG[] {
  const sdsgs: SDSG[] = [];
  const stride = Math.max(5, Math.floor(boxes.length / 30));
  for (let i = 0, k = 0; i < boxes.length; i += stride, k++) {
    const isSD = k % 2 === 0;
    sdsgs.push({
      id: `sdsg-${k}`,
      type: isSD ? 'SD' : 'SG',
      label: isSD ? 'SD' : 'SG',
      attachedTo: boxes[i].id,
      attachedType: 'box',
      itemOffset: 0,
      timeOffset: 0,
      width: 70,
      height: 40,
      spaceMode: isSD ? 'band-top' : 'band-bottom',
    });
  }
  return sdsgs;
}

function makeSheet(boxCount: number): Sheet {
  return {
    id: `bench-${boxCount}`,
    name: `Bench ${boxCount}`,
    type: 'individual',
    order: 0,
    boxes: makeBoxes(boxCount),
    lines: makeLines(makeBoxes(boxCount)),
    sdsg: makeSDSGs(makeBoxes(boxCount)),
    notes: [],
    comments: [],
    periodLabels: [],
  };
}

const SIZES = [50, 100, 300, 500, 1000] as const;
const sheets = new Map<number, Sheet>(SIZES.map((n) => [n, makeSheet(n)]));

describe('perf: computeSDSGBandLayout', () => {
  for (const n of SIZES) {
    const sheet = sheets.get(n)!;
    bench(`${n} boxes`, () => {
      computeSDSGBandLayout(sheet, 'horizontal', DEFAULT_SETTINGS);
    });
  }
});

describe('perf: computeContentBounds', () => {
  for (const n of SIZES) {
    const sheet = sheets.get(n)!;
    bench(`${n} boxes`, () => {
      computeContentBounds(sheet, 'horizontal', DEFAULT_SETTINGS);
    });
  }
});
