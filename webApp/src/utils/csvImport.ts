// ============================================================================
// CSV インポート用ユーティリティ
// - papaparse でパース、自動ヘッダ検出、列マッピング
// - Box のみ対応（Line / SDSG は将来対応）
// ============================================================================

import Papa from 'papaparse';
import type { Box, BoxType, Line, TextOrientation } from '../types';

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
