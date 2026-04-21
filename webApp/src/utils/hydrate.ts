// ============================================================================
// ドキュメント hydration: 読込時に settings のデフォルト値をマージ
// - 旧 .tem ファイル読込時、新しい設定項目が undefined のまま読み込まれるのを防ぐ
// - DEFAULT_SETTINGS を deep merge して欠損項目を埋める
// ============================================================================

import type { TEMDocument, ProjectSettings } from '../types';
import { DEFAULT_SETTINGS } from '../store/defaults';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 再帰的に src と defaults をマージ。既存値優先、欠損は defaults で補完 */
function deepMergeDefaults<T>(src: T, defaults: T): T {
  if (!isPlainObject(src) || !isPlainObject(defaults)) {
    return (src === undefined ? defaults : src) as T;
  }
  const result: Record<string, unknown> = { ...defaults };
  for (const key of Object.keys(src)) {
    const s = (src as Record<string, unknown>)[key];
    const d = (defaults as Record<string, unknown>)[key];
    if (s === undefined) {
      result[key] = d;
    } else if (isPlainObject(s) && isPlainObject(d)) {
      result[key] = deepMergeDefaults(s, d);
    } else {
      result[key] = s;
    }
  }
  return result as T;
}

/** settings に不足している項目を DEFAULT_SETTINGS からマージ */
export function hydrateSettings(settings: Partial<ProjectSettings>): ProjectSettings {
  return deepMergeDefaults(settings as ProjectSettings, DEFAULT_SETTINGS);
}

/** TEMDocument 全体のバリデーション + 欠損補完 */
export function hydrateDocument(doc: TEMDocument): TEMDocument {
  return {
    ...doc,
    settings: hydrateSettings(doc.settings ?? {}),
  };
}
