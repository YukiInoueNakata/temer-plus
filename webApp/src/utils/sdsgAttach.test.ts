import { describe, it, expect } from 'vitest';
import { resolveAttachedAnchor, anchorCenter } from './sdsgAttach';
import type { Box, Line, SDSG } from '../types';

const b = (id: string, x: number, y: number, width = 100, height = 50): Box => ({
  id, type: 'normal', label: id, x, y, width, height,
});
const line = (id: string, from: string, to: string): Line => ({
  id, type: 'RLine', from, to, connectionMode: 'center-to-center', shape: 'straight',
});
const sg = (attachedTo: string, attachedType: 'box' | 'line' = 'box'): SDSG => ({
  id: 'SD1', type: 'SD', label: 'SD', attachedTo, attachedType, itemOffset: 0, timeOffset: 0,
});
// レガシー（attachedType 未指定）動作確認用
const sgLegacy = (attachedTo: string): SDSG => ({
  id: 'SD1', type: 'SD', label: 'SD', attachedTo, itemOffset: 0, timeOffset: 0,
} as unknown as SDSG);

describe('resolveAttachedAnchor', () => {
  const boxA = b('A', 0, 0);
  const boxB = b('B', 200, 0);
  const L = line('L1', 'A', 'B');
  const boxMap = new Map<string, Box>([['A', boxA], ['B', boxB]]);
  const lineMap = new Map<string, Line>([['L1', L]]);

  it('resolves attachedType=box → box anchor', () => {
    const r = resolveAttachedAnchor(sg('A', 'box'), boxMap, lineMap);
    expect(r).toEqual({ kind: 'box', box: boxA });
  });

  it('resolves attachedType=line → line anchor + from/to', () => {
    const r = resolveAttachedAnchor(sg('L1', 'line'), boxMap, lineMap);
    expect(r?.kind).toBe('line');
    if (r?.kind === 'line') {
      expect(r.line).toBe(L);
      expect(r.from).toBe(boxA);
      expect(r.to).toBe(boxB);
    }
  });

  it('falls back when attachedType is undefined (legacy) — box first', () => {
    const r = resolveAttachedAnchor(sgLegacy('A'), boxMap, lineMap);
    expect(r).toEqual({ kind: 'box', box: boxA });
  });

  it('falls back to line when attachedType is undefined and not a box', () => {
    const r = resolveAttachedAnchor(sgLegacy('L1'), boxMap, lineMap);
    expect(r?.kind).toBe('line');
  });

  it('returns null when attachedTo does not exist anywhere', () => {
    expect(resolveAttachedAnchor(sg('Z'), boxMap, lineMap)).toBeNull();
  });

  it('returns null for line-attached when endpoint boxes are missing', () => {
    const badLine: Line = { ...line('L2', 'X', 'Y') };
    const limLineMap = new Map<string, Line>([['L2', badLine]]);
    const r = resolveAttachedAnchor(sg('L2', 'line'), boxMap, limLineMap);
    expect(r).toBeNull();
  });
});

describe('anchorCenter', () => {
  const boxA = b('A', 0, 0, 100, 50);
  const boxB = b('B', 200, 100, 100, 50);

  it('returns box center for box anchor', () => {
    expect(anchorCenter({ kind: 'box', box: boxA })).toEqual({ x: 50, y: 25 });
  });

  it('returns midpoint of from/to centers for line anchor', () => {
    const L = line('L1', 'A', 'B');
    expect(anchorCenter({ kind: 'line', line: L, from: boxA, to: boxB })).toEqual({
      x: (50 + 250) / 2, y: (25 + 125) / 2,
    });
  });
});
