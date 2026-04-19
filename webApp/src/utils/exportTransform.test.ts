import { describe, it, expect } from 'vitest';
import {
  computeFitScale,
  applyExportTransform,
  DEFAULT_EXPORT_TRANSFORM,
} from './exportTransform';
import { createSampleDocument } from '../store/defaults';

describe('computeFitScale', () => {
  it('manual モードは 1 を返す', () => {
    const s = computeFitScale(
      { width: 1000, height: 500 },
      'A4',
      'manual',
      0.05,
    );
    expect(s).toBe(1);
  });
  it('fit-both: 両方に収まる min 倍率', () => {
    const s = computeFitScale(
      { width: 2000, height: 1000 },
      'A4-landscape',
      'fit-both',
      0,
    );
    // A4 短辺 794、長辺 1123 px。bbox は 2000×1000 → 横長なのでbboxを収めるには 小さい方を採用
    // 実際の期待値はフィット計算次第
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(1);
  });
  it('fit-width は fit-both より大きいことがある', () => {
    const bothScale = computeFitScale({ width: 100, height: 2000 }, 'A4-landscape', 'fit-both', 0);
    const widthScale = computeFitScale({ width: 100, height: 2000 }, 'A4-landscape', 'fit-width', 0);
    expect(widthScale).toBeGreaterThanOrEqual(bothScale);
  });
});

describe('applyExportTransform: 不変性', () => {
  it('元の doc を変更しない（deep copy）', () => {
    const doc = createSampleDocument();
    const origSheet = JSON.parse(JSON.stringify(doc.sheets[0]));
    applyExportTransform(doc, {
      ...DEFAULT_EXPORT_TRANSFORM,
      globalScale: 2,
    });
    // 元 doc のシートは変わらない
    expect(doc.sheets[0]).toEqual(origSheet);
  });
  it('globalScale=2 で Box の座標・サイズが 2 倍', () => {
    const doc = createSampleDocument();
    const b0 = doc.sheets[0].boxes[0];
    const { doc: newDoc } = applyExportTransform(doc, {
      ...DEFAULT_EXPORT_TRANSFORM,
      fitMode: 'manual',
      globalScale: 2,
    });
    const nb0 = newDoc.sheets[0].boxes[0];
    expect(nb0.x).toBeCloseTo(b0.x * 2);
    expect(nb0.width).toBeCloseTo(b0.width * 2);
  });
  it('fontSizeDelta が Box の style.fontSize に加算される', () => {
    const doc = createSampleDocument();
    const origFS = doc.sheets[0].boxes[0].style?.fontSize ?? doc.settings.defaultFontSize;
    const { doc: newDoc } = applyExportTransform(doc, {
      ...DEFAULT_EXPORT_TRANSFORM,
      fitMode: 'manual',
      globalScale: 1,
      fontSizeDelta: 4,
    });
    const newFS = newDoc.sheets[0].boxes[0].style?.fontSize;
    expect(newFS).toBeCloseTo(origFS + 4);
  });
});
