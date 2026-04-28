import { describe, it, expect } from 'vitest';
import {
  buildLinesFromRows,
  buildSDSGsFromRows,
  buildPeriodLabelsFromRows,
  guessLineFieldKind,
  guessSDSGFieldKind,
  guessPeriodLabelFieldKind,
  mapLineType,
  mapLineShape,
  mapSDSGType,
  type LineCsvFieldKind,
  type SDSGCsvFieldKind,
  type PeriodLabelCsvFieldKind,
} from './csvImport';

describe('Line CSV import', () => {
  const validBoxIds = new Set(['A', 'B', 'C']);

  it('basic from/to/type rows', () => {
    const mapping: LineCsvFieldKind[] = ['from', 'to', 'type'];
    const r = buildLinesFromRows(
      [['A', 'B', 'RLine'], ['B', 'C', 'XLine']],
      { mapping, hasHeader: false, defaultType: 'RLine', defaultShape: 'straight', existingIds: new Set(), validBoxIds },
    );
    expect(r.errors).toEqual([]);
    expect(r.lines.length).toBe(2);
    expect(r.lines[0].from).toBe('A');
    expect(r.lines[0].to).toBe('B');
    expect(r.lines[0].type).toBe('RLine');
    expect(r.lines[1].type).toBe('XLine');
  });

  it('shape mapping (Japanese / English)', () => {
    expect(mapLineShape('curve')).toBe('curve');
    expect(mapLineShape('L字')).toBe('elbow');
    expect(mapLineShape('直線')).toBe('straight');
    expect(mapLineShape('')).toBe('straight'); // fallback
  });

  it('type mapping', () => {
    expect(mapLineType('実線')).toBe('RLine');
    expect(mapLineType('点線')).toBe('XLine');
    expect(mapLineType('dashed')).toBe('XLine');
  });

  it('skips when from/to is missing or unknown', () => {
    const mapping: LineCsvFieldKind[] = ['from', 'to'];
    const r = buildLinesFromRows(
      [['A', ''], ['X', 'A'], ['A', 'B']],
      { mapping, hasHeader: false, defaultType: 'RLine', defaultShape: 'straight', existingIds: new Set(), validBoxIds },
    );
    expect(r.errors.length).toBe(2);
    expect(r.lines.length).toBe(1);
    expect(r.lines[0].from).toBe('A');
    expect(r.lines[0].to).toBe('B');
  });

  it('autogenerates ids with type prefix', () => {
    const mapping: LineCsvFieldKind[] = ['from', 'to', 'type'];
    const r = buildLinesFromRows(
      [['A', 'B', 'RLine'], ['B', 'C', 'XLine']],
      { mapping, hasHeader: false, defaultType: 'RLine', defaultShape: 'straight', existingIds: new Set(), validBoxIds },
    );
    expect(r.lines[0].id.startsWith('RL')).toBe(true);
    expect(r.lines[1].id.startsWith('XL')).toBe(true);
  });

  it('field kind guess', () => {
    expect(guessLineFieldKind('from')).toBe('from');
    expect(guessLineFieldKind('始点')).toBe('from');
    expect(guessLineFieldKind('終点')).toBe('to');
    expect(guessLineFieldKind('Type')).toBe('type');
    expect(guessLineFieldKind('形状')).toBe('shape');
  });
});

describe('SDSG CSV import', () => {
  const validBoxIds = new Set(['BFP1', 'EFP1']);
  const validLineIds = new Set(['RL_1']);

  it('basic SD/SG to attached Box', () => {
    const mapping: SDSGCsvFieldKind[] = ['type', 'attachedTo', 'label'];
    const r = buildSDSGsFromRows(
      [['SD', 'BFP1', '社会的方向 1'], ['SG', 'BFP1', '社会的ガイド 1']],
      { mapping, hasHeader: false, existingIds: new Set(), validBoxIds, validLineIds },
    );
    expect(r.errors).toEqual([]);
    expect(r.sdsgs[0].type).toBe('SD');
    expect(r.sdsgs[0].attachedTo).toBe('BFP1');
    expect(r.sdsgs[0].attachedType).toBe('box');
    expect(r.sdsgs[1].type).toBe('SG');
  });

  it('attaches to Line when id matches a line', () => {
    const mapping: SDSGCsvFieldKind[] = ['type', 'attachedTo'];
    const r = buildSDSGsFromRows(
      [['SD', 'RL_1']],
      { mapping, hasHeader: false, existingIds: new Set(), validBoxIds, validLineIds },
    );
    expect(r.sdsgs[0].attachedType).toBe('line');
  });

  it('between mode with attachedTo2', () => {
    const mapping: SDSGCsvFieldKind[] = ['type', 'attachedTo', 'attachedTo2'];
    const r = buildSDSGsFromRows(
      [['SD', 'BFP1', 'EFP1']],
      { mapping, hasHeader: false, existingIds: new Set(), validBoxIds, validLineIds },
    );
    expect(r.sdsgs[0].anchorMode).toBe('between');
    expect(r.sdsgs[0].attachedTo2).toBe('EFP1');
  });

  it('explicit anchorMode=single overrides default between', () => {
    const mapping: SDSGCsvFieldKind[] = ['type', 'attachedTo', 'attachedTo2', 'anchorMode'];
    const r = buildSDSGsFromRows(
      [['SD', 'BFP1', 'EFP1', 'single']],
      { mapping, hasHeader: false, existingIds: new Set(), validBoxIds, validLineIds },
    );
    expect(r.sdsgs[0].anchorMode).toBe('single');
  });

  it('spaceMode parsing', () => {
    const mapping: SDSGCsvFieldKind[] = ['type', 'attachedTo', 'spaceMode'];
    const r = buildSDSGsFromRows(
      [['SD', 'BFP1', 'band-top'], ['SG', 'BFP1', 'band_bottom'], ['SD', 'BFP1', 'attached']],
      { mapping, hasHeader: false, existingIds: new Set(), validBoxIds, validLineIds },
    );
    expect(r.sdsgs[0].spaceMode).toBe('band-top');
    expect(r.sdsgs[1].spaceMode).toBe('band-bottom');
    expect(r.sdsgs[2].spaceMode).toBe('attached');
  });

  it('skips when attachedTo is missing or unknown', () => {
    const mapping: SDSGCsvFieldKind[] = ['type', 'attachedTo'];
    const r = buildSDSGsFromRows(
      [['SD', ''], ['SD', 'unknown'], ['SD', 'BFP1']],
      { mapping, hasHeader: false, existingIds: new Set(), validBoxIds, validLineIds },
    );
    expect(r.errors.length).toBe(2);
    expect(r.sdsgs.length).toBe(1);
  });

  it('mapSDSGType for ja/en', () => {
    expect(mapSDSGType('SD')).toBe('SD');
    expect(mapSDSGType('sg')).toBe('SG');
    expect(mapSDSGType('社会的方向')).toBe('SD');
    expect(mapSDSGType('社会的ガイド')).toBe('SG');
  });

  it('field kind guess', () => {
    expect(guessSDSGFieldKind('attachedTo')).toBe('attachedTo');
    expect(guessSDSGFieldKind('attachedTo2')).toBe('attachedTo2');
    expect(guessSDSGFieldKind('種別')).toBe('type');
    expect(guessSDSGFieldKind('対象')).toBe('attachedTo');
    expect(guessSDSGFieldKind('対象2')).toBe('attachedTo2');
  });
});

describe('Period label CSV import', () => {
  it('basic position/label rows', () => {
    const mapping: PeriodLabelCsvFieldKind[] = ['position', 'label'];
    const r = buildPeriodLabelsFromRows(
      [['1', '時期1'], ['3.5', '時期2']],
      { mapping, hasHeader: false, existingIds: new Set() },
    );
    expect(r.errors).toEqual([]);
    expect(r.periodLabels.length).toBe(2);
    expect(r.periodLabels[0].position).toBe(1);
    expect(r.periodLabels[1].position).toBe(3.5);
  });

  it('skips when label or position is missing/invalid', () => {
    const mapping: PeriodLabelCsvFieldKind[] = ['position', 'label'];
    const r = buildPeriodLabelsFromRows(
      [['1', ''], ['x', 'A'], ['2', '時期A']],
      { mapping, hasHeader: false, existingIds: new Set() },
    );
    expect(r.errors.length).toBe(2);
    expect(r.periodLabels.length).toBe(1);
  });

  it('field kind guess', () => {
    expect(guessPeriodLabelFieldKind('position')).toBe('position');
    expect(guessPeriodLabelFieldKind('時間')).toBe('position');
    expect(guessPeriodLabelFieldKind('時期')).toBe('label');
  });
});
