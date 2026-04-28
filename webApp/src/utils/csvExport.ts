// ============================================================================
// CSV エクスポート用ユーティリティ
// - Box / Line / SDSG / 時期ラベル の 4 エンティティを CSV 化
// - 出力した CSV はそのまま CSVImportDialog で再インポート可能
// - BOM 付き UTF-8 で Excel 互換
// ============================================================================

import type { Box, Line, SDSG, PeriodLabel } from '../types';
import { LEVEL_PX } from '../store/defaults';

const BOM = '﻿';

function escapeCsvField(v: string | number | undefined | null): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(headers: string[], rows: Array<Array<string | number | undefined | null>>): string {
  const lines: string[] = [];
  lines.push(headers.map(escapeCsvField).join(','));
  for (const r of rows) {
    lines.push(r.map(escapeCsvField).join(','));
  }
  return BOM + lines.join('\r\n') + '\r\n';
}

// Box の x/y を Time/Item Level に逆変換（csvImport の x = timeLevel*levelPx, y = -itemLevel*levelPx）
function boxToLevels(b: Box, levelPx = LEVEL_PX): { timeLevel: number; itemLevel: number } {
  return {
    timeLevel: Number((b.x / levelPx).toFixed(3)),
    itemLevel: Number((-b.y / levelPx).toFixed(3)),
  };
}

export function exportBoxesToCsv(boxes: Box[], levelPx = LEVEL_PX): string {
  const headers = ['id', 'type', 'label', 'timeLevel', 'itemLevel', 'width', 'height', 'subLabel', 'description'];
  const rows = boxes.map((b) => {
    const { timeLevel, itemLevel } = boxToLevels(b, levelPx);
    return [
      b.id, b.type, b.label, timeLevel, itemLevel,
      b.width, b.height, b.subLabel ?? '', b.description ?? '',
    ];
  });
  return rowsToCsv(headers, rows);
}

export function exportLinesToCsv(lines: Line[]): string {
  const headers = ['id', 'type', 'shape', 'from', 'to', 'label', 'description'];
  const rows = lines.map((l) => [
    l.id, l.type, l.shape, l.from, l.to, l.label ?? '', l.description ?? '',
  ]);
  return rowsToCsv(headers, rows);
}

export function exportSDSGsToCsv(sdsgs: SDSG[]): string {
  const headers = [
    'id', 'type', 'label',
    'attachedTo', 'attachedTo2', 'anchorMode',
    'spaceMode', 'subLabel', 'description',
  ];
  const rows = sdsgs.map((s) => [
    s.id, s.type, s.label,
    s.attachedTo, s.attachedTo2 ?? '', s.anchorMode ?? '',
    s.spaceMode ?? '', s.subLabel ?? '', s.description ?? '',
  ]);
  return rowsToCsv(headers, rows);
}

export function exportPeriodLabelsToCsv(periodLabels: PeriodLabel[]): string {
  const headers = ['id', 'position', 'label'];
  const rows = periodLabels.map((p) => [p.id, p.position, p.label]);
  return rowsToCsv(headers, rows);
}
