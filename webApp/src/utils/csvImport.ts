// ============================================================================
// CSV インポート用ユーティリティ
// - papaparse でパース、自動ヘッダ検出、列マッピング
// - Box / Line / SDSG / 時期ラベルの 4 エンティティに対応
// ============================================================================

import Papa from 'papaparse';
import type { Box, BoxType, Line, LineType, LineShape, SDSG, SDSGType, PeriodLabel, TextOrientation } from '../types';

export type CsvFieldKind =
  | 'ignore'
  | 'label'
  | 'type'
  | 'timeLevel'
  | 'itemLevel'
  | 'id'
  | 'subLabel'
  | 'description'
  | 'width'
  | 'height';

export const FIELD_LABELS: Record<CsvFieldKind, string> = {
  ignore: '（無視）',
  label: 'ラベル',
  type: '種別',
  timeLevel: 'Time Level',
  itemLevel: 'Item Level',
  id: 'ID',
  subLabel: 'サブラベル',
  description: '説明',
  width: '幅',
  height: '高さ',
};

/** 種別キーワード辞書（日英両対応。小文字で比較） */
export const TYPE_DICT: Record<string, BoxType> = {
  // 英名（そのまま）
  'normal': 'normal',
  'bfp': 'BFP',
  'efp': 'EFP',
  'p-efp': 'P-EFP',
  'pefp': 'P-EFP',
  'p_efp': 'P-EFP',
  'opp': 'OPP',
  'annotation': 'annotation',
  '2nd-efp': '2nd-EFP',
  '2ndefp': '2nd-EFP',
  'p-2nd-efp': 'P-2nd-EFP',
  // 日本語
  '通常': 'normal',
  '経験': 'normal',
  'イベント': 'normal',
  '出来事': 'normal',
  '分岐点': 'BFP',
  '等至点': 'EFP',
  '両極化等至点': 'P-EFP',
  '両極化': 'P-EFP',
  '必須通過点': 'OPP',
  '潜在経験': 'annotation',
  '想定': 'annotation',
  '第二等至点': '2nd-EFP',
  '両極化第二等至点': 'P-2nd-EFP',
};

export function mapBoxType(raw: string): BoxType {
  const key = (raw ?? '').trim().toLowerCase();
  if (!key) return 'normal';
  if (TYPE_DICT[key]) return TYPE_DICT[key];
  // 日本語は lowercase しても同じなので直接引く
  if (TYPE_DICT[raw.trim()]) return TYPE_DICT[raw.trim()];
  return 'normal';
}

// ----------------------------------------------------------------------------
// パース
// ----------------------------------------------------------------------------

export interface ParsedCsv {
  rows: string[][];        // 2 次元生データ
  probableHeader: boolean; // 1 行目がヘッダと推定されるか
  delimiter: string;
}

export function parseCsvText(text: string): ParsedCsv {
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: 'greedy',
    delimiter: '',           // 自動判定
  });
  const rows = (result.data ?? []).map((r) => r.map((c) => (c ?? '').toString()));
  const delim = (result.meta as { delimiter?: string }).delimiter ?? ',';
  // ヘッダ推定: 1 行目に非数値のセルがあればヘッダ
  let probableHeader = false;
  if (rows.length > 0) {
    const first = rows[0];
    const allNonNumeric = first.every((c) => c !== '' && !/^-?\d+(?:\.\d+)?$/.test(c.trim()));
    const hasHeaderKeyword = first.some((c) => /^(label|type|id|time|item|sub|description|種別|ラベル|時間|位置|説明|サブ)/i.test(c.trim()));
    probableHeader = allNonNumeric || hasHeaderKeyword;
  }
  return { rows, probableHeader, delimiter: delim };
}

export async function parseCsvFile(file: File): Promise<ParsedCsv> {
  const text = await file.text();
  // BOM 除去
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  return parseCsvText(clean);
}

// ----------------------------------------------------------------------------
// 列名からの自動マッピング推定
// ----------------------------------------------------------------------------

export function guessFieldKind(header: string): CsvFieldKind {
  const h = header.trim().toLowerCase();
  if (!h) return 'ignore';
  if (/^(label|ラベル|名前|name)$/.test(h)) return 'label';
  if (/^(type|種別|種類|kind)$/.test(h)) return 'type';
  if (/^(time|time[_ ]?level|時間|時間レベル|timelevel)$/i.test(h)) return 'timeLevel';
  if (/^(item|item[_ ]?level|項目|項目レベル|itemlevel)$/i.test(h)) return 'itemLevel';
  if (/^(id|識別)$/i.test(h)) return 'id';
  if (/^(sub|sub[_ ]?label|subtitle|サブ|サブラベル)$/i.test(h)) return 'subLabel';
  if (/^(desc|description|説明)$/i.test(h)) return 'description';
  if (/^(width|w|幅)$/i.test(h)) return 'width';
  if (/^(height|h|高さ)$/i.test(h)) return 'height';
  return 'ignore';
}

// ----------------------------------------------------------------------------
// Box 配列生成
// ----------------------------------------------------------------------------

export interface ImportOptions {
  mapping: CsvFieldKind[];               // 列ごとのフィールド割当（列数と同じ長さ）
  hasHeader: boolean;                    // 1 行目を飛ばす
  defaultType: BoxType;                  // type 列がない/空の場合
  defaultWidth: number;
  defaultHeight: number;
  defaultFontSize: number;
  defaultTextOrientation?: TextOrientation; // 通常 Box 挿入と揃えるため layout 由来で渡す
  // 挿入位置計算
  startTimeLevel: number;                // timeLevel 列がない場合の開始値
  baseItemLevel: number;                 // itemLevel 列がない場合の値
  // 後続の自動接続
  autoConnect: boolean;
  connectLineType: 'RLine' | 'XLine';
  // 既存 ID との衝突時の扱い: 新 ID 採番
  existingIds: Set<string>;
  // レイアウト方向（Level → px 変換用）
  levelPx: number;                       // 通常 100
}

export interface ImportResult {
  boxes: Box[];
  lines: Line[];          // autoConnect 時の順次接続
  errors: string[];       // スキップ/警告
}

/**
 * パース済み rows から Box 配列を生成する
 */
export function buildBoxesFromRows(rows: string[][], opts: ImportOptions): ImportResult {
  const boxes: Box[] = [];
  const lines: Line[] = [];
  const errors: string[] = [];
  const mappingIndex: Partial<Record<CsvFieldKind, number>> = {};
  opts.mapping.forEach((k, i) => {
    if (k !== 'ignore') mappingIndex[k] = i;
  });

  const data = opts.hasHeader ? rows.slice(1) : rows;
  const localIds = new Set<string>(opts.existingIds);
  const typeCounter: Partial<Record<BoxType, number>> = {};

  const uniqueId = (base: string): string => {
    if (!localIds.has(base)) {
      localIds.add(base);
      return base;
    }
    let n = 2;
    while (localIds.has(`${base}_${n}`)) n++;
    const id = `${base}_${n}`;
    localIds.add(id);
    return id;
  };

  const autoIdFor = (type: BoxType): string => {
    const prefix = type === 'normal' ? 'Item'
      : type === 'BFP' ? 'BFP'
      : type === 'EFP' ? 'EFP'
      : type === 'P-EFP' ? 'P_EFP'
      : type === 'OPP' ? 'OPP'
      : type === 'annotation' ? 'Latent'
      : type === '2nd-EFP' ? 'EFP2'
      : 'P_EFP2';
    typeCounter[type] = (typeCounter[type] ?? 0) + 1;
    return uniqueId(`${prefix}${typeCounter[type]}`);
  };

  const cell = (row: string[], kind: CsvFieldKind): string | undefined => {
    const i = mappingIndex[kind];
    if (i == null) return undefined;
    return row[i];
  };

  data.forEach((row, rowIdx) => {
    const labelRaw = cell(row, 'label');
    const label = (labelRaw ?? '').trim();
    if (!label) {
      errors.push(`行 ${rowIdx + 1 + (opts.hasHeader ? 1 : 0)}: ラベルが空のためスキップ`);
      return;
    }

    // type
    const typeRaw = cell(row, 'type');
    const type = typeRaw ? mapBoxType(typeRaw) : opts.defaultType;

    // ID
    const idRaw = cell(row, 'id');
    const id = idRaw ? uniqueId(idRaw.trim()) : autoIdFor(type);

    // timeLevel / itemLevel
    const tlRaw = cell(row, 'timeLevel');
    const ilRaw = cell(row, 'itemLevel');
    const timeLevel = tlRaw && tlRaw.trim() !== ''
      ? Number(tlRaw)
      : opts.startTimeLevel + boxes.length;
    const itemLevel = ilRaw && ilRaw.trim() !== ''
      ? Number(ilRaw)
      : opts.baseItemLevel;
    if (!isFinite(timeLevel) || !isFinite(itemLevel)) {
      errors.push(`行 ${rowIdx + 1}: Level が数値でないためスキップ`);
      return;
    }

    // width / height
    const wRaw = cell(row, 'width');
    const hRaw = cell(row, 'height');
    const width = wRaw ? Math.max(10, Number(wRaw)) : opts.defaultWidth;
    const height = hRaw ? Math.max(10, Number(hRaw)) : opts.defaultHeight;

    // 座標（ユーザ座標: Level → px、item は layout 依存だがここでは storage y = -itemLevel * LEVEL_PX、
    //       x = timeLevel * LEVEL_PX という単純対応でインポート。レイアウト方向による変換は呼び出し側で）
    const x = timeLevel * opts.levelPx;
    const y = -itemLevel * opts.levelPx;

    const subLabel = cell(row, 'subLabel')?.trim() || undefined;
    const description = cell(row, 'description')?.trim() || undefined;

    const b: Box = {
      id,
      type,
      label,
      x,
      y,
      width,
      height,
      ...(opts.defaultTextOrientation ? { textOrientation: opts.defaultTextOrientation } : {}),
      ...(subLabel ? { subLabel } : {}),
      ...(description ? { description } : {}),
      style: { fontSize: opts.defaultFontSize },
    };
    boxes.push(b);
  });

  // 順次接続
  if (opts.autoConnect && boxes.length >= 2) {
    const linePrefix = opts.connectLineType === 'XLine' ? 'XL_' : 'RL_';
    for (let i = 0; i < boxes.length - 1; i++) {
      lines.push({
        id: `${linePrefix}csv_${i + 1}`,
        type: opts.connectLineType,
        from: boxes[i].id,
        to: boxes[i + 1].id,
        connectionMode: 'center-to-center',
        shape: 'straight',
      });
    }
  }

  return { boxes, lines, errors };
}

// ============================================================================
// Line インポート
// ============================================================================

export type LineCsvFieldKind = 'ignore' | 'id' | 'from' | 'to' | 'type' | 'shape' | 'label' | 'description';

export const LINE_FIELD_LABELS: Record<LineCsvFieldKind, string> = {
  ignore: '（無視）',
  id: 'ID',
  from: 'From',
  to: 'To',
  type: '種別 (RLine/XLine)',
  shape: '形状 (straight/elbow/curve)',
  label: 'ラベル',
  description: '説明',
};

export function guessLineFieldKind(header: string): LineCsvFieldKind {
  const h = header.trim().toLowerCase();
  if (!h) return 'ignore';
  if (/^(id|識別)$/i.test(h)) return 'id';
  if (/^(from|始点|起点)$/i.test(h)) return 'from';
  if (/^(to|終点)$/i.test(h)) return 'to';
  if (/^(type|種別|種類|kind)$/i.test(h)) return 'type';
  if (/^(shape|形状)$/i.test(h)) return 'shape';
  if (/^(label|ラベル|名前|name)$/i.test(h)) return 'label';
  if (/^(desc|description|説明)$/i.test(h)) return 'description';
  return 'ignore';
}

const LINE_TYPE_DICT: Record<string, LineType> = {
  rline: 'RLine', solid: 'RLine', '実線': 'RLine', '実線矢印': 'RLine',
  xline: 'XLine', dashed: 'XLine', dotted: 'XLine', '点線': 'XLine', '点線矢印': 'XLine', '破線': 'XLine',
};
const LINE_SHAPE_DICT: Record<string, LineShape> = {
  straight: 'straight', '直線': 'straight',
  elbow: 'elbow', l: 'elbow', 'l字': 'elbow', '折れ線': 'elbow',
  curve: 'curve', '曲線': 'curve', bezier: 'curve',
};

export function mapLineType(raw: string): LineType {
  const key = (raw ?? '').trim().toLowerCase();
  return LINE_TYPE_DICT[key] ?? 'RLine';
}

export function mapLineShape(raw: string): LineShape {
  const key = (raw ?? '').trim().toLowerCase();
  return LINE_SHAPE_DICT[key] ?? 'straight';
}

export interface LineImportOptions {
  mapping: LineCsvFieldKind[];
  hasHeader: boolean;
  defaultType: LineType;
  defaultShape: LineShape;
  existingIds: Set<string>;
  validBoxIds: Set<string>;          // from/to の妥当性チェック用
}

export interface LineImportResult {
  lines: Line[];
  errors: string[];
}

export function buildLinesFromRows(rows: string[][], opts: LineImportOptions): LineImportResult {
  const lines: Line[] = [];
  const errors: string[] = [];
  const mappingIndex: Partial<Record<LineCsvFieldKind, number>> = {};
  opts.mapping.forEach((k, i) => {
    if (k !== 'ignore') mappingIndex[k] = i;
  });
  const data = opts.hasHeader ? rows.slice(1) : rows;
  const localIds = new Set<string>(opts.existingIds);
  let counter = 0;

  const uniqueId = (base: string): string => {
    if (!localIds.has(base)) { localIds.add(base); return base; }
    let n = 2;
    while (localIds.has(`${base}_${n}`)) n++;
    const id = `${base}_${n}`;
    localIds.add(id);
    return id;
  };

  const cell = (row: string[], kind: LineCsvFieldKind): string | undefined => {
    const i = mappingIndex[kind];
    return i == null ? undefined : row[i];
  };

  data.forEach((row, idx) => {
    const rowNum = idx + 1 + (opts.hasHeader ? 1 : 0);
    const from = (cell(row, 'from') ?? '').trim();
    const to = (cell(row, 'to') ?? '').trim();
    if (!from || !to) {
      errors.push(`行 ${rowNum}: from/to が空のためスキップ`);
      return;
    }
    if (!opts.validBoxIds.has(from)) {
      errors.push(`行 ${rowNum}: from=${from} に該当する Box がないためスキップ`);
      return;
    }
    if (!opts.validBoxIds.has(to)) {
      errors.push(`行 ${rowNum}: to=${to} に該当する Box がないためスキップ`);
      return;
    }
    const typeRaw = cell(row, 'type');
    const type = typeRaw ? mapLineType(typeRaw) : opts.defaultType;
    const shapeRaw = cell(row, 'shape');
    const shape = shapeRaw ? mapLineShape(shapeRaw) : opts.defaultShape;
    const idRaw = cell(row, 'id');
    counter++;
    const id = idRaw ? uniqueId(idRaw.trim()) : uniqueId(`${type === 'XLine' ? 'XL' : 'RL'}_csv_${counter}`);
    const label = cell(row, 'label')?.trim() || undefined;
    const description = cell(row, 'description')?.trim() || undefined;
    lines.push({
      id, type, from, to,
      connectionMode: 'center-to-center',
      shape,
      ...(label ? { label } : {}),
      ...(description ? { description } : {}),
    });
  });
  return { lines, errors };
}

// ============================================================================
// SDSG インポート
// ============================================================================

export type SDSGCsvFieldKind =
  | 'ignore' | 'id' | 'type' | 'label'
  | 'attachedTo' | 'attachedTo2' | 'anchorMode'
  | 'spaceMode' | 'subLabel' | 'description';

export const SDSG_FIELD_LABELS: Record<SDSGCsvFieldKind, string> = {
  ignore: '（無視）',
  id: 'ID',
  type: '種別 (SD/SG)',
  label: 'ラベル',
  attachedTo: '紐付け対象 (attachedTo)',
  attachedTo2: '2 つ目の対象 (attachedTo2)',
  anchorMode: 'アンカー方式 (single/between)',
  spaceMode: '配置モード (attached/band-top/band-bottom)',
  subLabel: 'サブラベル',
  description: '説明',
};

export function guessSDSGFieldKind(header: string): SDSGCsvFieldKind {
  const h = header.trim().toLowerCase();
  if (!h) return 'ignore';
  if (/^(id|識別)$/i.test(h)) return 'id';
  if (/^(type|種別|種類|kind)$/i.test(h)) return 'type';
  if (/^(label|ラベル|名前|name)$/i.test(h)) return 'label';
  if (/^(attached.?to2|attachedto2|対象2|対象 ?2)$/i.test(h)) return 'attachedTo2';
  if (/^(attached.?to|attachedto|対象|紐付け|紐付け対象)$/i.test(h)) return 'attachedTo';
  if (/^(anchor|anchormode|アンカー|アンカー方式)$/i.test(h)) return 'anchorMode';
  if (/^(space|spacemode|配置|配置モード|モード)$/i.test(h)) return 'spaceMode';
  if (/^(sub|sub[_ ]?label|サブ|サブラベル)$/i.test(h)) return 'subLabel';
  if (/^(desc|description|説明)$/i.test(h)) return 'description';
  return 'ignore';
}

const SDSG_TYPE_DICT: Record<string, SDSGType> = {
  sd: 'SD', '社会的方向': 'SD', '社会的方向づけ': 'SD',
  sg: 'SG', '社会的ガイド': 'SG',
};

export function mapSDSGType(raw: string): SDSGType {
  const key = (raw ?? '').trim().toLowerCase();
  return SDSG_TYPE_DICT[key] ?? (SDSG_TYPE_DICT[raw.trim()] ?? 'SD');
}

export interface SDSGImportOptions {
  mapping: SDSGCsvFieldKind[];
  hasHeader: boolean;
  existingIds: Set<string>;
  validBoxIds: Set<string>;
  validLineIds: Set<string>;
}

export interface SDSGImportResult {
  sdsgs: SDSG[];
  errors: string[];
}

export function buildSDSGsFromRows(rows: string[][], opts: SDSGImportOptions): SDSGImportResult {
  const sdsgs: SDSG[] = [];
  const errors: string[] = [];
  const mappingIndex: Partial<Record<SDSGCsvFieldKind, number>> = {};
  opts.mapping.forEach((k, i) => {
    if (k !== 'ignore') mappingIndex[k] = i;
  });
  const data = opts.hasHeader ? rows.slice(1) : rows;
  const localIds = new Set<string>(opts.existingIds);
  let sdCount = 0, sgCount = 0;

  const uniqueId = (base: string): string => {
    if (!localIds.has(base)) { localIds.add(base); return base; }
    let n = 2;
    while (localIds.has(`${base}_${n}`)) n++;
    const id = `${base}_${n}`;
    localIds.add(id);
    return id;
  };

  const cell = (row: string[], kind: SDSGCsvFieldKind): string | undefined => {
    const i = mappingIndex[kind];
    return i == null ? undefined : row[i];
  };

  const resolveAttachedType = (id: string): 'box' | 'line' | null => {
    if (opts.validBoxIds.has(id)) return 'box';
    if (opts.validLineIds.has(id)) return 'line';
    return null;
  };

  data.forEach((row, idx) => {
    const rowNum = idx + 1 + (opts.hasHeader ? 1 : 0);
    const attachedTo = (cell(row, 'attachedTo') ?? '').trim();
    if (!attachedTo) {
      errors.push(`行 ${rowNum}: attachedTo が空のためスキップ`);
      return;
    }
    const attachedType = resolveAttachedType(attachedTo);
    if (!attachedType) {
      errors.push(`行 ${rowNum}: attachedTo=${attachedTo} に該当する Box/Line がないためスキップ`);
      return;
    }
    const typeRaw = cell(row, 'type');
    const type = typeRaw ? mapSDSGType(typeRaw) : 'SD';
    const idRaw = cell(row, 'id');
    let id: string;
    if (idRaw) {
      id = uniqueId(idRaw.trim());
    } else {
      if (type === 'SD') { sdCount++; id = uniqueId(`SD${sdCount}`); }
      else { sgCount++; id = uniqueId(`SG${sgCount}`); }
    }
    const label = cell(row, 'label')?.trim() || type;
    const at2Raw = (cell(row, 'attachedTo2') ?? '').trim();
    const attachedTo2 = at2Raw || undefined;
    if (attachedTo2 && !resolveAttachedType(attachedTo2)) {
      errors.push(`行 ${rowNum}: attachedTo2=${attachedTo2} に該当する Box/Line がないため undefined 扱い`);
    }
    const anchorRaw = (cell(row, 'anchorMode') ?? '').trim().toLowerCase();
    const anchorMode: 'single' | 'between' | undefined = anchorRaw === 'between'
      ? 'between'
      : anchorRaw === 'single'
        ? 'single'
        : (attachedTo2 ? 'between' : undefined);
    const spaceRaw = (cell(row, 'spaceMode') ?? '').trim().toLowerCase().replace(/_/g, '-');
    const spaceMode: 'attached' | 'band-top' | 'band-bottom' | undefined =
      spaceRaw === 'band-top' || spaceRaw === 'top' ? 'band-top'
      : spaceRaw === 'band-bottom' || spaceRaw === 'bottom' ? 'band-bottom'
      : spaceRaw === 'attached' ? 'attached'
      : undefined;
    const subLabel = cell(row, 'subLabel')?.trim() || undefined;
    const description = cell(row, 'description')?.trim() || undefined;
    sdsgs.push({
      id, type, label,
      attachedTo, attachedType,
      ...(attachedTo2 && resolveAttachedType(attachedTo2) ? { attachedTo2 } : {}),
      ...(anchorMode ? { anchorMode } : {}),
      ...(spaceMode ? { spaceMode } : {}),
      itemOffset: 0,
      timeOffset: 0,
      ...(subLabel ? { subLabel } : {}),
      ...(description ? { description } : {}),
    });
  });
  return { sdsgs, errors };
}

// ============================================================================
// 時期ラベル インポート
// ============================================================================

export type PeriodLabelCsvFieldKind = 'ignore' | 'id' | 'position' | 'label';

export const PERIOD_LABEL_FIELD_LABELS: Record<PeriodLabelCsvFieldKind, string> = {
  ignore: '（無視）',
  id: 'ID',
  position: '位置 (Time Level)',
  label: 'ラベル',
};

export function guessPeriodLabelFieldKind(header: string): PeriodLabelCsvFieldKind {
  const h = header.trim().toLowerCase();
  if (!h) return 'ignore';
  if (/^(id|識別)$/i.test(h)) return 'id';
  if (/^(position|pos|time|時間|位置)$/i.test(h)) return 'position';
  if (/^(label|ラベル|名前|name|時期)$/i.test(h)) return 'label';
  return 'ignore';
}

export interface PeriodLabelImportOptions {
  mapping: PeriodLabelCsvFieldKind[];
  hasHeader: boolean;
  existingIds: Set<string>;
}

export interface PeriodLabelImportResult {
  periodLabels: PeriodLabel[];
  errors: string[];
}

export function buildPeriodLabelsFromRows(
  rows: string[][],
  opts: PeriodLabelImportOptions,
): PeriodLabelImportResult {
  const periodLabels: PeriodLabel[] = [];
  const errors: string[] = [];
  const mappingIndex: Partial<Record<PeriodLabelCsvFieldKind, number>> = {};
  opts.mapping.forEach((k, i) => {
    if (k !== 'ignore') mappingIndex[k] = i;
  });
  const data = opts.hasHeader ? rows.slice(1) : rows;
  const localIds = new Set<string>(opts.existingIds);
  let counter = 0;

  const uniqueId = (base: string): string => {
    if (!localIds.has(base)) { localIds.add(base); return base; }
    let n = 2;
    while (localIds.has(`${base}_${n}`)) n++;
    const id = `${base}_${n}`;
    localIds.add(id);
    return id;
  };

  const cell = (row: string[], kind: PeriodLabelCsvFieldKind): string | undefined => {
    const i = mappingIndex[kind];
    return i == null ? undefined : row[i];
  };

  data.forEach((row, idx) => {
    const rowNum = idx + 1 + (opts.hasHeader ? 1 : 0);
    const label = (cell(row, 'label') ?? '').trim();
    if (!label) {
      errors.push(`行 ${rowNum}: ラベルが空のためスキップ`);
      return;
    }
    const posRaw = (cell(row, 'position') ?? '').trim();
    const position = posRaw === '' ? NaN : Number(posRaw);
    if (!isFinite(position)) {
      errors.push(`行 ${rowNum}: 位置 (position) が数値でないためスキップ`);
      return;
    }
    const idRaw = cell(row, 'id');
    counter++;
    const id = idRaw ? uniqueId(idRaw.trim()) : uniqueId(`PL_csv_${counter}`);
    periodLabels.push({ id, position, label });
  });
  return { periodLabels, errors };
}
