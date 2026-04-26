import { describe, it, expect, beforeEach } from 'vitest';
import {
  BUILTIN_PRESETS,
  DEFAULT_EXPORT_OUTPUT,
  deleteUserPreset,
  getBuiltinPreset,
  loadUserPresets,
  sanitizePreset,
  saveUserPreset,
  updateUserPreset,
  type ExportPresetOptions,
} from './exportPresets';
import { DEFAULT_EXPORT_TRANSFORM } from './exportTransform';

const STORAGE_KEY = 'temer:export-presets';

beforeEach(() => {
  localStorage.clear();
});

describe('組み込みプリセット', () => {
  it('全プリセットが id / name / options を持つ', () => {
    expect(BUILTIN_PRESETS.length).toBeGreaterThan(0);
    for (const p of BUILTIN_PRESETS) {
      expect(p.id).toMatch(/^builtin-/);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.builtin).toBe(true);
      expect(p.options.transform).toBeDefined();
      expect(p.options.output).toBeDefined();
      expect(p.options.output.includeIds).toBeDefined();
    }
  });

  it('id は重複しない', () => {
    const ids = BUILTIN_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('getBuiltinPreset で取得できる', () => {
    const p = getBuiltinPreset('builtin-conf-16-9');
    expect(p).toBeDefined();
    expect(p?.options.transform.paperSize).toBe('16:9');
  });

  it('未知 id は undefined を返す', () => {
    expect(getBuiltinPreset('builtin-not-exist')).toBeUndefined();
  });

  it('印刷品質確認用は ID バッジが ON', () => {
    const p = getBuiltinPreset('builtin-print-check');
    expect(p?.options.output.includeIds.box).toBe(true);
    expect(p?.options.output.includeIds.sdsg).toBe(true);
    expect(p?.options.output.includeIds.line).toBe(true);
    expect(p?.options.output.includeGrid).toBe(true);
    expect(p?.options.output.includePaperGuides).toBe(true);
  });

  it('学会発表 16:9 は文字 +2pt', () => {
    const p = getBuiltinPreset('builtin-conf-16-9');
    expect(p?.options.transform.fontSizeDelta).toBe(2);
    expect(p?.options.transform.paperSize).toBe('16:9');
  });
});

describe('ユーザプリセット永続化', () => {
  const sampleOptions = (): ExportPresetOptions => ({
    transform: { ...DEFAULT_EXPORT_TRANSFORM, fontSizeDelta: 5 },
    output: { ...DEFAULT_EXPORT_OUTPUT, background: 'transparent' },
  });

  it('初期状態は空配列', () => {
    expect(loadUserPresets()).toEqual([]);
  });

  it('保存して読み出せる', () => {
    saveUserPreset('My Preset', sampleOptions(), '説明');
    const loaded = loadUserPresets();
    expect(loaded.length).toBe(1);
    expect(loaded[0].name).toBe('My Preset');
    expect(loaded[0].description).toBe('説明');
    expect(loaded[0].builtin).toBe(false);
    expect(loaded[0].options.transform.fontSizeDelta).toBe(5);
    expect(loaded[0].options.output.background).toBe('transparent');
  });

  it('id は "user-" プレフィックスで生成', () => {
    saveUserPreset('Foo', sampleOptions());
    const loaded = loadUserPresets();
    expect(loaded[0].id).toMatch(/^user-/);
  });

  it('複数保存しても順序が保たれる', () => {
    saveUserPreset('A', sampleOptions());
    saveUserPreset('B', sampleOptions());
    saveUserPreset('C', sampleOptions());
    const loaded = loadUserPresets();
    expect(loaded.map((p) => p.name)).toEqual(['A', 'B', 'C']);
  });

  it('空名はエラー', () => {
    expect(() => saveUserPreset('', sampleOptions())).toThrow();
    expect(() => saveUserPreset('   ', sampleOptions())).toThrow();
  });

  it('updateUserPreset で名前を変更', () => {
    const after = saveUserPreset('Old', sampleOptions());
    const id = after[0].id;
    updateUserPreset(id, { name: 'New' });
    const loaded = loadUserPresets();
    expect(loaded[0].name).toBe('New');
  });

  it('updateUserPreset で options を上書き', () => {
    const after = saveUserPreset('P', sampleOptions());
    const id = after[0].id;
    updateUserPreset(id, {
      options: {
        transform: { ...DEFAULT_EXPORT_TRANSFORM, fontSizeDelta: 99 },
        output: DEFAULT_EXPORT_OUTPUT,
      },
    });
    const loaded = loadUserPresets();
    expect(loaded[0].options.transform.fontSizeDelta).toBe(99);
  });

  it('削除できる', () => {
    saveUserPreset('A', sampleOptions());
    const after = saveUserPreset('B', sampleOptions());
    deleteUserPreset(after[1].id);
    const loaded = loadUserPresets();
    expect(loaded.map((p) => p.name)).toEqual(['A']);
  });

  it('存在しない id の削除は no-op', () => {
    saveUserPreset('A', sampleOptions());
    deleteUserPreset('user-nonexistent');
    const loaded = loadUserPresets();
    expect(loaded.length).toBe(1);
  });
});

describe('localStorage 不正データの安全な読込', () => {
  it('JSON 破損は空配列', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json');
    expect(loadUserPresets()).toEqual([]);
  });

  it('配列でない値は空配列', () => {
    localStorage.setItem(STORAGE_KEY, '{"foo":1}');
    expect(loadUserPresets()).toEqual([]);
  });

  it('一部の不正な要素は除外、有効なものは残す', () => {
    const valid = {
      id: 'user-x',
      name: 'Valid',
      builtin: false,
      options: { transform: DEFAULT_EXPORT_TRANSFORM, output: DEFAULT_EXPORT_OUTPUT },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify([valid, null, 'string', { id: 1 }, { id: 'x' }]));
    const loaded = loadUserPresets();
    expect(loaded.length).toBe(1);
    expect(loaded[0].name).toBe('Valid');
  });

  it('未知のフィールドは無視され、不足分は既定値で埋まる', () => {
    const dirty = {
      id: 'user-x',
      name: 'Partial',
      options: {
        transform: { paperSize: '16:9', fontSizeDelta: 3, unknownField: 'x' },
        output: { background: 'white' },
      },
    };
    const sanitized = sanitizePreset(dirty);
    expect(sanitized).not.toBeNull();
    expect(sanitized?.options.transform.paperSize).toBe('16:9');
    expect(sanitized?.options.transform.fontSizeDelta).toBe(3);
    // 不足分は既定値
    expect(sanitized?.options.transform.fontSizeScale).toBe(1);
    expect(sanitized?.options.output.includeIds.box).toBe(false);
    expect(sanitized?.options.output.pdfMargin).toBe(0.3);
  });

  it('builtin フラグはユーザ保存では常に false に強制', () => {
    const evil = {
      id: 'user-evil',
      name: '偽の組み込み',
      builtin: true,
      options: { transform: DEFAULT_EXPORT_TRANSFORM, output: DEFAULT_EXPORT_OUTPUT },
    };
    const sanitized = sanitizePreset(evil);
    expect(sanitized?.builtin).toBe(false);
  });

  it('pdfMargin は 0..2 にクランプ', () => {
    const dirty = {
      id: 'user-x',
      name: 'X',
      options: { transform: {}, output: { pdfMargin: 99 } },
    };
    const sanitized = sanitizePreset(dirty);
    expect(sanitized?.options.output.pdfMargin).toBe(2);
  });

  it('id / name 欠損は null', () => {
    expect(sanitizePreset({ name: 'No id' })).toBeNull();
    expect(sanitizePreset({ id: 'x' })).toBeNull();
    expect(sanitizePreset({ id: 'x', name: '   ' })).toBeNull();
  });
});

describe('保存される options のディープコピー', () => {
  it('保存後に元 options を変更しても永続データは独立', () => {
    const opts: ExportPresetOptions = {
      transform: { ...DEFAULT_EXPORT_TRANSFORM, fontSizeDelta: 10 },
      output: { ...DEFAULT_EXPORT_OUTPUT, includeIds: { box: true, sdsg: false, line: false } },
    };
    saveUserPreset('Iso', opts);
    opts.transform.fontSizeDelta = 999;
    opts.output.includeIds.box = false;
    const loaded = loadUserPresets();
    expect(loaded[0].options.transform.fontSizeDelta).toBe(10);
    expect(loaded[0].options.output.includeIds.box).toBe(true);
  });
});
