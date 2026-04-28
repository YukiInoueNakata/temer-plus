import { describe, it, expect, beforeEach } from 'vitest';
import {
  BUILTIN_THEMES,
  loadUserThemes,
  saveUserTheme,
  updateUserTheme,
  deleteUserTheme,
  sanitizeTheme,
  themeToJsonString,
  themesToJsonString,
  parseThemesFromJson,
  type BoxStyleTheme,
  type BoxTypePresetMap,
} from './boxThemes';

const STORAGE_KEY = 'temer:box-style-themes';

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
});

describe('BUILTIN_THEMES', () => {
  it('contains several builtin themes with builtin=true, monochrome at first', () => {
    expect(BUILTIN_THEMES.length).toBeGreaterThanOrEqual(4);
    expect(BUILTIN_THEMES.every((t) => t.builtin === true)).toBe(true);
    expect(BUILTIN_THEMES[0].id).toBe('theme-monochrome');
    expect(BUILTIN_THEMES.find((t) => t.id === 'theme-default')).toBeUndefined();
  });
});

describe('user theme persistence', () => {
  it('saveUserTheme adds and load returns it', () => {
    const presets: BoxTypePresetMap = { normal: { backgroundColor: '#abcdef' } };
    const t = saveUserTheme('My Theme', presets);
    expect(t.builtin).toBe(false);
    const loaded = loadUserThemes();
    expect(loaded.length).toBe(1);
    expect(loaded[0].name).toBe('My Theme');
    expect(loaded[0].presets.normal?.backgroundColor).toBe('#abcdef');
  });

  it('updateUserTheme replaces by id', () => {
    const t = saveUserTheme('A', { normal: { color: '#111111' } });
    const updated = updateUserTheme(t.id, 'A2', { BFP: { color: '#222222' } });
    expect(updated?.name).toBe('A2');
    const loaded = loadUserThemes();
    expect(loaded[0].name).toBe('A2');
    expect(loaded[0].presets.BFP?.color).toBe('#222222');
    expect(loaded[0].presets.normal).toBeUndefined();
  });

  it('deleteUserTheme removes by id', () => {
    const t1 = saveUserTheme('A', {});
    saveUserTheme('B', {});
    deleteUserTheme(t1.id);
    const loaded = loadUserThemes();
    expect(loaded.length).toBe(1);
    expect(loaded[0].name).toBe('B');
  });

  it('builtin flag is forced false for user themes', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([
      { id: 'x', name: 'evil', builtin: true, presets: {} },
    ]));
    const loaded = loadUserThemes();
    // sanitize forces builtin=false; loadUserThemes filters !builtin so this entry passes
    expect(loaded.length).toBe(1);
    expect(loaded[0].builtin).toBe(false);
  });

  it('rejects malformed storage gracefully', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json');
    expect(loadUserThemes()).toEqual([]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ not: 'an array' }));
    expect(loadUserThemes()).toEqual([]);
  });
});

describe('sanitizeTheme', () => {
  it('clamps invalid values', () => {
    const t = sanitizeTheme({
      id: 'x', name: ' My ',
      presets: {
        normal: {
          borderStyle: 'invalid',  // dropped
          borderWidth: -5,         // clamped to 0
          shape: 'circle',         // dropped
          backgroundColor: '#fff',
          fontSize: 9999,          // clamped to 80
          bold: 'yes',             // dropped (not boolean)
        },
        unknownType: { color: 'red' }, // dropped (invalid box type)
      },
    });
    expect(t).not.toBeNull();
    expect(t!.name).toBe('My');
    expect(t!.presets.normal?.borderStyle).toBeUndefined();
    expect(t!.presets.normal?.borderWidth).toBe(0);
    expect(t!.presets.normal?.shape).toBeUndefined();
    expect(t!.presets.normal?.backgroundColor).toBe('#fff');
    expect(t!.presets.normal?.fontSize).toBe(80);
    expect(t!.presets.normal?.bold).toBeUndefined();
    expect((t!.presets as Record<string, unknown>).unknownType).toBeUndefined();
  });

  it('returns null for non-object', () => {
    expect(sanitizeTheme(null)).toBeNull();
    expect(sanitizeTheme(123)).toBeNull();
    expect(sanitizeTheme('text')).toBeNull();
  });
});

describe('JSON serialize / parse round-trip', () => {
  const sample: BoxStyleTheme = {
    id: 'theme-test',
    name: 'Sample',
    description: 'desc',
    presets: {
      normal: { backgroundColor: '#ffffff', borderColor: '#000000' },
      BFP: { borderWidth: 2.0, borderStyle: 'dashed' },
    },
  };

  it('themeToJsonString -> parseThemesFromJson preserves content', () => {
    const json = themeToJsonString(sample);
    const r = parseThemesFromJson(json);
    expect(r.length).toBe(1);
    expect(r[0].name).toBe('Sample');
    expect(r[0].presets.normal?.backgroundColor).toBe('#ffffff');
    expect(r[0].presets.BFP?.borderWidth).toBe(2.0);
    expect(r[0].builtin).toBe(false);
  });

  it('themesToJsonString -> parseThemesFromJson with multiple', () => {
    const json = themesToJsonString([sample, { ...sample, name: 'B' }]);
    const r = parseThemesFromJson(json);
    expect(r.length).toBe(2);
    expect(r.map((t) => t.name)).toEqual(['Sample', 'B']);
  });

  it('parseThemesFromJson accepts presets-only format (legacy)', () => {
    const r = parseThemesFromJson(JSON.stringify({ normal: { color: '#123456' } }));
    expect(r.length).toBe(1);
    expect(r[0].presets.normal?.color).toBe('#123456');
    expect(r[0].name).toBe('読み込まれたテーマ');
  });

  it('parseThemesFromJson accepts single-theme format', () => {
    const r = parseThemesFromJson(JSON.stringify({ name: 'X', presets: { OPP: { borderWidth: 3 } } }));
    expect(r.length).toBe(1);
    expect(r[0].name).toBe('X');
  });

  it('parseThemesFromJson returns [] for invalid input', () => {
    expect(parseThemesFromJson('not-json')).toEqual([]);
    expect(parseThemesFromJson('123')).toEqual([]);
    expect(parseThemesFromJson(JSON.stringify({ random: 'object' }))).toEqual([]);
  });
});
