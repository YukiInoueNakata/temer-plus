import { describe, it, expect } from 'vitest';
import {
  xyToTimeLevel,
  xyToItemLevel,
  levelToXY,
  setTimeLevelOnly,
  setItemLevelOnly,
} from './coords';

describe('coords: 横型レイアウト', () => {
  it('TimeLevel は x / 100', () => {
    expect(xyToTimeLevel(300, 50, 'horizontal')).toBe(3);
    expect(xyToTimeLevel(-200, 0, 'horizontal')).toBe(-2);
  });
  it('ItemLevel は -y / 100（UP=+ のため flip）', () => {
    expect(xyToItemLevel(0, -200, 'horizontal')).toBe(2);
    expect(xyToItemLevel(0, 100, 'horizontal')).toBe(-1);
  });
  it('levelToXY 横型: time=x, item=-y', () => {
    expect(levelToXY(3, 2, 'horizontal')).toEqual({ x: 300, y: -200 });
  });
  it('setTimeLevelOnly は x のみ変化', () => {
    expect(setTimeLevelOnly(100, 50, 5, 'horizontal')).toEqual({ x: 500, y: 50 });
  });
  it('setItemLevelOnly は y を flip して更新', () => {
    expect(setItemLevelOnly(100, 50, 3, 'horizontal')).toEqual({ x: 100, y: -300 });
  });
});

describe('coords: 縦型レイアウト', () => {
  it('TimeLevel は y / 100', () => {
    expect(xyToTimeLevel(50, 400, 'vertical')).toBe(4);
  });
  it('ItemLevel は x / 100（RIGHT=+ 自然）', () => {
    expect(xyToItemLevel(200, 0, 'vertical')).toBe(2);
  });
  it('levelToXY 縦型: item=x, time=y', () => {
    expect(levelToXY(3, 2, 'vertical')).toEqual({ x: 200, y: 300 });
  });
});
