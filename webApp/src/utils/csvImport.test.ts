import { describe, it, expect } from 'vitest';
import {
  parseCsvText,
  guessFieldKind,
  mapBoxType,
  buildBoxesFromRows,
  TYPE_DICT,
} from './csvImport';

describe('parseCsvText', () => {
  it('ヘッダと値をパースできる', () => {
    const r = parseCsvText('label,type\nA,normal\nB,BFP\n');
    expect(r.rows.length).toBe(3);
    expect(r.rows[0]).toEqual(['label', 'type']);
    expect(r.rows[1]).toEqual(['A', 'normal']);
  });
  it('ヘッダ候補を検出（全列非数値）', () => {
    const r = parseCsvText('label,type\nA,BFP\n');
    expect(r.probableHeader).toBe(true);
  });
  it('ラベルだけの 1 列はヘッダ判定しない可能性もあるが、数値以外ならヘッダに', () => {
    const r = parseCsvText('item1\nitem2\n');
    // 1 行目が非数値であれば header 候補になる
    expect(r.probableHeader).toBe(true);
  });
  it('数値だけの 1 行目はヘッダでない', () => {
    const r = parseCsvText('1,2,3\n4,5,6\n');
    expect(r.probableHeader).toBe(false);
  });
});

describe('guessFieldKind', () => {
  it('label 推定', () => {
    expect(guessFieldKind('label')).toBe('label');
    expect(guessFieldKind('ラベル')).toBe('label');
  });
  it('type 推定', () => {
    expect(guessFieldKind('type')).toBe('type');
    expect(guessFieldKind('種別')).toBe('type');
  });
  it('timeLevel / itemLevel 推定', () => {
    expect(guessFieldKind('timeLevel')).toBe('timeLevel');
    expect(guessFieldKind('time')).toBe('timeLevel');
    expect(guessFieldKind('item')).toBe('itemLevel');
  });
  it('不明な列は ignore', () => {
    expect(guessFieldKind('foo')).toBe('ignore');
  });
});

describe('mapBoxType: 種別マッピング', () => {
  it('英名', () => {
    expect(mapBoxType('BFP')).toBe('BFP');
    expect(mapBoxType('EFP')).toBe('EFP');
    expect(mapBoxType('P-EFP')).toBe('P-EFP');
    expect(mapBoxType('OPP')).toBe('OPP');
  });
  it('日本語', () => {
    expect(mapBoxType('分岐点')).toBe('BFP');
    expect(mapBoxType('等至点')).toBe('EFP');
    expect(mapBoxType('両極化等至点')).toBe('P-EFP');
    expect(mapBoxType('必須通過点')).toBe('OPP');
    expect(mapBoxType('潜在経験')).toBe('annotation');
  });
  it('不明は normal', () => {
    expect(mapBoxType('xxx')).toBe('normal');
    expect(mapBoxType('')).toBe('normal');
  });
});

describe('TYPE_DICT の整合性', () => {
  it('主要な日本語が網羅されている', () => {
    expect(TYPE_DICT['分岐点']).toBe('BFP');
    expect(TYPE_DICT['等至点']).toBe('EFP');
  });
});

describe('buildBoxesFromRows', () => {
  const baseOpts = {
    mapping: ['label' as const, 'type' as const],
    hasHeader: true,
    defaultType: 'normal' as const,
    defaultWidth: 100,
    defaultHeight: 50,
    defaultFontSize: 13,
    startTimeLevel: 0,
    baseItemLevel: 0,
    autoConnect: false,
    connectLineType: 'RLine' as const,
    existingIds: new Set<string>(),
    levelPx: 100,
  };

  it('ヘッダ行をスキップ', () => {
    const rows = [['label', 'type'], ['A', 'normal'], ['B', 'BFP']];
    const r = buildBoxesFromRows(rows, baseOpts);
    expect(r.boxes.length).toBe(2);
    expect(r.boxes[0].label).toBe('A');
    expect(r.boxes[0].type).toBe('normal');
    expect(r.boxes[1].type).toBe('BFP');
  });

  it('ラベル空はスキップ', () => {
    const rows = [['label', 'type'], ['', 'BFP'], ['A', 'BFP']];
    const r = buildBoxesFromRows(rows, baseOpts);
    expect(r.boxes.length).toBe(1);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('Time/Item 列がない場合 startTimeLevel から順に配置', () => {
    const rows = [['label'], ['A'], ['B'], ['C']];
    const r = buildBoxesFromRows(rows, {
      ...baseOpts,
      mapping: ['label' as const],
      hasHeader: true,
      startTimeLevel: 5,
    });
    expect(r.boxes[0].x).toBe(5 * 100);
    expect(r.boxes[1].x).toBe(6 * 100);
    expect(r.boxes[2].x).toBe(7 * 100);
  });

  it('autoConnect で RLine が生成される', () => {
    const rows = [['label'], ['A'], ['B'], ['C']];
    const r = buildBoxesFromRows(rows, {
      ...baseOpts,
      mapping: ['label' as const],
      autoConnect: true,
    });
    expect(r.lines.length).toBe(2);
    expect(r.lines[0].type).toBe('RLine');
    expect(r.lines[0].id.startsWith('RL_')).toBe(true);
  });

  it('XLine オプション', () => {
    const rows = [['label'], ['A'], ['B']];
    const r = buildBoxesFromRows(rows, {
      ...baseOpts,
      mapping: ['label' as const],
      autoConnect: true,
      connectLineType: 'XLine',
    });
    expect(r.lines[0].type).toBe('XLine');
    expect(r.lines[0].id.startsWith('XL_')).toBe(true);
  });

  it('ID が既存と重複したらユニーク化', () => {
    const rows = [['label', 'id'], ['A', 'Item1']];
    const r = buildBoxesFromRows(rows, {
      ...baseOpts,
      mapping: ['label' as const, 'id' as const],
      existingIds: new Set(['Item1']),
    });
    expect(r.boxes[0].id).not.toBe('Item1');
    expect(r.boxes[0].id.startsWith('Item1_')).toBe(true);
  });
});
