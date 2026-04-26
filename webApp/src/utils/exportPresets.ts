// ============================================================================
// エクスポートプリセット
// - 用途別の出力設定 (ExportTransform + 出力固有オプション) を組として保存
// - 組み込みプリセット: 学会発表 / 論文 / スライド / 印刷品質確認
// - ユーザプリセット: localStorage 永続化
// ============================================================================

import { DEFAULT_EXPORT_TRANSFORM, type ExportTransform } from './exportTransform';

export interface ExportOutputOptions {
  background: 'white' | 'transparent';
  includeGrid: boolean;
  includePaperGuides: boolean;
  includeIds: { box: boolean; sdsg: boolean; line: boolean };
  pdfMargin: number;
}

export const DEFAULT_EXPORT_OUTPUT: ExportOutputOptions = {
  background: 'white',
  includeGrid: false,
  includePaperGuides: false,
  includeIds: { box: false, sdsg: false, line: false },
  pdfMargin: 0.3,
};

export interface ExportPresetOptions {
  transform: ExportTransform;
  output: ExportOutputOptions;
}

export interface ExportPreset {
  id: string;
  name: string;
  description?: string;
  builtin: boolean;
  options: ExportPresetOptions;
}

const STORAGE_KEY = 'temer:export-presets';

// ----------------------------------------------------------------------------
// 組み込みプリセット
// ----------------------------------------------------------------------------

function makeOptions(
  transform: Partial<ExportTransform>,
  output: Partial<ExportOutputOptions> = {},
): ExportPresetOptions {
  return {
    transform: { ...DEFAULT_EXPORT_TRANSFORM, ...transform },
    output: {
      ...DEFAULT_EXPORT_OUTPUT,
      ...output,
      includeIds: { ...DEFAULT_EXPORT_OUTPUT.includeIds, ...(output.includeIds ?? {}) },
    },
  };
}

export const BUILTIN_PRESETS: ExportPreset[] = [
  {
    id: 'builtin-default',
    name: '既定（A4 横）',
    description: '初期値。微調整なし、A4 横、両方フィット',
    builtin: true,
    options: makeOptions({
      paperSize: 'A4-landscape',
      fitMode: 'fit-both',
    }),
  },
  {
    id: 'builtin-conf-16-9',
    name: '学会発表（16:9 スライド）',
    description: '16:9 スライド向け。文字 +2pt、線 +0.5、両方フィット',
    builtin: true,
    options: makeOptions({
      paperSize: '16:9',
      fitMode: 'fit-both',
      fontSizeDelta: 2,
      lineStrokeWidthDelta: 0.5,
      boxBorderWidthDelta: 0.5,
      typeLabelFontSizeDelta: 1,
    }),
  },
  {
    id: 'builtin-conf-4-3',
    name: '学会発表（4:3 スライド）',
    description: '4:3 スライド向け。文字 +2pt、線 +0.5',
    builtin: true,
    options: makeOptions({
      paperSize: '4:3',
      fitMode: 'fit-both',
      fontSizeDelta: 2,
      lineStrokeWidthDelta: 0.5,
      boxBorderWidthDelta: 0.5,
      typeLabelFontSizeDelta: 1,
    }),
  },
  {
    id: 'builtin-paper-a4-landscape',
    name: '論文向け（A4 横）',
    description: '論文掲載向け。A4 横、文字サイズ等倍、白背景',
    builtin: true,
    options: makeOptions({
      paperSize: 'A4-landscape',
      fitMode: 'fit-both',
    }),
  },
  {
    id: 'builtin-paper-a4-portrait',
    name: '論文向け（A4 縦）',
    description: '論文掲載向け。A4 縦、文字サイズ等倍、白背景',
    builtin: true,
    options: makeOptions({
      paperSize: 'A4-portrait',
      fitMode: 'fit-both',
    }),
  },
  {
    id: 'builtin-slide-large',
    name: 'スライド向け（大文字）',
    description: '会場後方からも読めるよう文字 +4pt、線太め',
    builtin: true,
    options: makeOptions({
      paperSize: '16:9',
      fitMode: 'fit-both',
      fontSizeDelta: 4,
      fontSizeScale: 1.05,
      lineStrokeWidthDelta: 1,
      boxBorderWidthDelta: 1,
      typeLabelFontSizeDelta: 2,
      subLabelFontSizeDelta: 1,
    }),
  },
  {
    id: 'builtin-print-check',
    name: '印刷品質確認用（ID 表示）',
    description: 'ID バッジ ON、用紙枠 ON、グリッド ON で検証用に',
    builtin: true,
    options: makeOptions(
      {
        paperSize: 'A4-landscape',
        fitMode: 'fit-both',
      },
      {
        includeGrid: true,
        includePaperGuides: true,
        includeIds: { box: true, sdsg: true, line: true },
      },
    ),
  },
];

export function getBuiltinPreset(id: string): ExportPreset | undefined {
  return BUILTIN_PRESETS.find((p) => p.id === id);
}

// ----------------------------------------------------------------------------
// ユーザプリセット (localStorage)
// ----------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function sanitizeTransform(v: unknown): ExportTransform {
  const base = { ...DEFAULT_EXPORT_TRANSFORM };
  if (!isPlainObject(v)) return base;
  // 値の型が合うものだけマージ。未知 / 不正値は既定で埋める
  for (const key of Object.keys(base) as (keyof ExportTransform)[]) {
    const incoming = v[key];
    if (incoming === undefined) continue;
    if (typeof incoming === typeof (base as Record<string, unknown>)[key]) {
      (base as Record<string, unknown>)[key] = incoming;
    }
  }
  return base;
}

function sanitizeOutput(v: unknown): ExportOutputOptions {
  const out: ExportOutputOptions = {
    ...DEFAULT_EXPORT_OUTPUT,
    includeIds: { ...DEFAULT_EXPORT_OUTPUT.includeIds },
  };
  if (!isPlainObject(v)) return out;
  if (v.background === 'white' || v.background === 'transparent') out.background = v.background;
  if (typeof v.includeGrid === 'boolean') out.includeGrid = v.includeGrid;
  if (typeof v.includePaperGuides === 'boolean') out.includePaperGuides = v.includePaperGuides;
  if (typeof v.pdfMargin === 'number' && Number.isFinite(v.pdfMargin)) {
    out.pdfMargin = Math.max(0, Math.min(2, v.pdfMargin));
  }
  if (isPlainObject(v.includeIds)) {
    if (typeof v.includeIds.box === 'boolean') out.includeIds.box = v.includeIds.box;
    if (typeof v.includeIds.sdsg === 'boolean') out.includeIds.sdsg = v.includeIds.sdsg;
    if (typeof v.includeIds.line === 'boolean') out.includeIds.line = v.includeIds.line;
  }
  return out;
}

export function sanitizePreset(v: unknown): ExportPreset | null {
  if (!isPlainObject(v)) return null;
  const id = typeof v.id === 'string' ? v.id : null;
  const name = typeof v.name === 'string' ? v.name.trim() : null;
  if (!id || !name) return null;
  const description = typeof v.description === 'string' ? v.description : undefined;
  const opts = isPlainObject(v.options) ? v.options : null;
  return {
    id,
    name,
    description,
    builtin: false, // ユーザ保存は常に false（builtin フラグはユーザが操作不可）
    options: {
      transform: sanitizeTransform(opts?.transform),
      output: sanitizeOutput(opts?.output),
    },
  };
}

export function loadUserPresets(): ExportPreset[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: ExportPreset[] = [];
    for (const item of parsed) {
      const sanitized = sanitizePreset(item);
      if (sanitized) out.push(sanitized);
    }
    return out;
  } catch {
    return [];
  }
}

function persistUserPresets(presets: ExportPreset[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // quota / private mode 等は黙って無視
  }
}

function genUserId(): string {
  return `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function saveUserPreset(
  name: string,
  options: ExportPresetOptions,
  description?: string,
): ExportPreset[] {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('プリセット名を入力してください');
  const presets = loadUserPresets();
  const preset: ExportPreset = {
    id: genUserId(),
    name: trimmed,
    description,
    builtin: false,
    options: {
      transform: { ...options.transform },
      output: {
        ...options.output,
        includeIds: { ...options.output.includeIds },
      },
    },
  };
  presets.push(preset);
  persistUserPresets(presets);
  return presets;
}

export function updateUserPreset(
  id: string,
  patch: { name?: string; description?: string; options?: ExportPresetOptions },
): ExportPreset[] {
  const presets = loadUserPresets();
  const idx = presets.findIndex((p) => p.id === id);
  if (idx < 0) return presets;
  const cur = presets[idx];
  presets[idx] = {
    ...cur,
    name: patch.name?.trim() || cur.name,
    description: patch.description ?? cur.description,
    options: patch.options
      ? {
          transform: { ...patch.options.transform },
          output: {
            ...patch.options.output,
            includeIds: { ...patch.options.output.includeIds },
          },
        }
      : cur.options,
  };
  persistUserPresets(presets);
  return presets;
}

export function deleteUserPreset(id: string): ExportPreset[] {
  const presets = loadUserPresets().filter((p) => p.id !== id);
  persistUserPresets(presets);
  return presets;
}
