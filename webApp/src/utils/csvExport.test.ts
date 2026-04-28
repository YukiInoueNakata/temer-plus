import { describe, it, expect } from 'vitest';
import {
  exportBoxesToCsv,
  exportLinesToCsv,
  exportSDSGsToCsv,
  exportPeriodLabelsToCsv,
} from './csvExport';
import {
  parseCsvText,
  buildBoxesFromRows,
  buildLinesFromRows,
  buildSDSGsFromRows,
  buildPeriodLabelsFromRows,
} from './csvImport';
import type { Box, Line, SDSG, PeriodLabel } from '../types';
import { LEVEL_PX } from '../store/defaults';

const boxes: Box[] = [
  { id: 'A', type: 'normal', label: 'Item A', x: 0, y: 0, width: 100, height: 50 },
  { id: 'B', type: 'BFP', label: '分岐, 点', x: 200, y: -100, width: 60, height: 100 },
];
const lines: Line[] = [
  { id: 'RL_1', type: 'RLine', from: 'A', to: 'B', connectionMode: 'center-to-center', shape: 'straight' },
];
const sdsgs: SDSG[] = [
  { id: 'SD1', type: 'SD', label: 'SD', attachedTo: 'B', attachedType: 'box', itemOffset: 0, timeOffset: 0 },
];
const periodLabels: PeriodLabel[] = [
  { id: 'PL1', position: 1.5, label: '時期1' },
];

describe('CSV export', () => {
  it('exports boxes with BOM and CSV-escaped fields', () => {
    const csv = exportBoxesToCsv(boxes);
    // BOM ヘッダ
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    // ヘッダ行に "id"
    expect(csv).toContain('id,type,label');
    // カンマを含む label がクォートされる
    expect(csv).toContain('"分岐, 点"');
  });

  it('round-trips boxes through export → parse → buildBoxes', () => {
    const csv = exportBoxesToCsv(boxes);
    const parsed = parseCsvText(csv);
    const r = buildBoxesFromRows(parsed.rows, {
      mapping: ['id', 'type', 'label', 'timeLevel', 'itemLevel', 'width', 'height', 'subLabel', 'description'],
      hasHeader: true,
      defaultType: 'normal',
      defaultWidth: 100, defaultHeight: 50,
      defaultFontSize: 11,
      startTimeLevel: 0, baseItemLevel: 0,
      autoConnect: false,
      connectLineType: 'RLine',
      existingIds: new Set(),
      levelPx: LEVEL_PX,
    });
    expect(r.errors).toEqual([]);
    expect(r.boxes.length).toBe(2);
    expect(r.boxes[0].id).toBe('A');
    expect(r.boxes[1].label).toBe('分岐, 点');
    // Time/Item Level の往復は LEVEL_PX 倍率で復元される
    expect(r.boxes[0].x).toBe(0);
    expect(r.boxes[1].x).toBe(200);
  });

  it('round-trips lines', () => {
    const csv = exportLinesToCsv(lines);
    const parsed = parseCsvText(csv);
    const r = buildLinesFromRows(parsed.rows, {
      mapping: ['id', 'type', 'shape', 'from', 'to', 'label', 'description'],
      hasHeader: true,
      defaultType: 'RLine',
      defaultShape: 'straight',
      existingIds: new Set(),
      validBoxIds: new Set(['A', 'B']),
    });
    expect(r.errors).toEqual([]);
    expect(r.lines.length).toBe(1);
    expect(r.lines[0].from).toBe('A');
    expect(r.lines[0].to).toBe('B');
    expect(r.lines[0].type).toBe('RLine');
  });

  it('round-trips sdsgs', () => {
    const csv = exportSDSGsToCsv(sdsgs);
    const parsed = parseCsvText(csv);
    const r = buildSDSGsFromRows(parsed.rows, {
      mapping: ['id', 'type', 'label', 'attachedTo', 'attachedTo2', 'anchorMode', 'spaceMode', 'subLabel', 'description'],
      hasHeader: true,
      existingIds: new Set(),
      validBoxIds: new Set(['B']),
      validLineIds: new Set(),
    });
    expect(r.errors).toEqual([]);
    expect(r.sdsgs.length).toBe(1);
    expect(r.sdsgs[0].type).toBe('SD');
    expect(r.sdsgs[0].attachedTo).toBe('B');
  });

  it('round-trips period labels', () => {
    const csv = exportPeriodLabelsToCsv(periodLabels);
    const parsed = parseCsvText(csv);
    const r = buildPeriodLabelsFromRows(parsed.rows, {
      mapping: ['id', 'position', 'label'],
      hasHeader: true,
      existingIds: new Set(),
    });
    expect(r.errors).toEqual([]);
    expect(r.periodLabels.length).toBe(1);
    expect(r.periodLabels[0].position).toBe(1.5);
    expect(r.periodLabels[0].label).toBe('時期1');
  });

  it('empty arrays produce header-only CSV', () => {
    expect(exportBoxesToCsv([])).toMatch(/^﻿id,type,label,timeLevel,itemLevel,width,height,subLabel,description\r\n$/);
    expect(exportLinesToCsv([])).toMatch(/^﻿id,type,shape,from,to,label,description\r\n$/);
  });
});
