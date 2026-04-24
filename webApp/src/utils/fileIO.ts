// ============================================================================
// File I/O - .tem ファイルの保存/読込 + IndexedDB 自動バックアップ
// ============================================================================

import { get, set, del } from 'idb-keyval';
import type { TEMDocument } from '../types';

const AUTO_BACKUP_KEY = 'temer-autosave';
const AUTO_BACKUP_META_KEY = 'temer-autosave-meta';
const BACKUP_INTERVAL_MS = 30_000; // 30秒

// ============================================================================
// File System Access API detection
// ============================================================================

type FileHandleLike = {
  name: string;
  createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }>;
  getFile: () => Promise<File>;
};

function supportsFSAccess(): boolean {
  return 'showSaveFilePicker' in window && 'showOpenFilePicker' in window;
}

// ============================================================================
// Save
// ============================================================================

export async function saveToFile(
  doc: TEMDocument,
  existingHandle?: FileHandleLike | null
): Promise<FileHandleLike | null> {
  const json = JSON.stringify(doc, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const suggestedName = sanitizeFileName(doc.metadata.title || 'Untitled') + '.tem';

  if (supportsFSAccess()) {
    try {
      let handle: FileHandleLike;
      if (existingHandle) {
        handle = existingHandle;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        handle = await (window as any).showSaveFilePicker({
          suggestedName,
          types: [{
            description: 'TEMer Document',
            accept: { 'application/json': ['.tem'] },
          }],
        });
      }
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return handle;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null;
      console.error('File System Access save failed, falling back to download:', e);
    }
  }

  // Fallback: download
  downloadBlob(blob, suggestedName);
  return null;
}

// ============================================================================
// Load
// ============================================================================

export async function loadFromFile(): Promise<{ doc: TEMDocument; handle: FileHandleLike | null } | null> {
  if (supportsFSAccess()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{
          description: 'TEMer Document',
          accept: { 'application/json': ['.tem'] },
        }],
      });
      const file = await handle.getFile();
      const text = await file.text();
      const doc = validateAndParse(text);
      return { doc, handle };
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null;
      throw e;
    }
  }

  // Fallback: <input type="file">
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.tem,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const text = await file.text();
      try {
        const doc = validateAndParse(text);
        resolve({ doc, handle: null });
      } catch (e) {
        alert('ファイルの読み込みに失敗しました: ' + (e as Error).message);
        resolve(null);
      }
    };
    input.click();
  });
}

function validateAndParse(text: string): TEMDocument {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object') throw new Error('無効なJSONです');
  if (!Array.isArray(data.sheets)) throw new Error('sheets フィールドがありません');
  if (!data.settings) throw new Error('settings フィールドがありません');
  if (!data.metadata) throw new Error('metadata フィールドがありません');
  // version 互換性チェック（簡易）
  if (data.version && data.version !== '0.3') {
    console.warn(`Version mismatch: file=${data.version}, app=0.3. 可能な範囲で読み込みます。`);
  }
  // Legacy 互換: Sheet.annotations → Sheet.notes（未実装だったが型だけ存在）
  for (const sh of data.sheets) {
    if (sh && Array.isArray(sh.annotations) && !sh.notes) {
      sh.notes = sh.annotations;
      delete sh.annotations;
    }
    if (sh && !Array.isArray(sh.notes)) sh.notes = [];
    // SDSG.attachedType が未設定のものを補完 (旧ファイル互換)
    if (sh && Array.isArray(sh.sdsg) && Array.isArray(sh.boxes) && Array.isArray(sh.lines)) {
      const boxIds = new Set<string>(sh.boxes.map((b: { id: string }) => b.id));
      for (const sg of sh.sdsg) {
        if (sg && !sg.attachedType && typeof sg.attachedTo === 'string') {
          sg.attachedType = boxIds.has(sg.attachedTo) ? 'box' : 'line';
        }
      }
    }
  }
  return data as TEMDocument;
}

// ============================================================================
// Utilities
// ============================================================================

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\/\\:*?"<>|]/g, '_').trim() || 'Untitled';
}

// ============================================================================
// IndexedDB Auto-backup
// ============================================================================

export interface AutoBackupMeta {
  savedAt: string;   // ISO 8601
  title: string;
  version: string;
}

export async function saveAutoBackup(doc: TEMDocument): Promise<void> {
  await set(AUTO_BACKUP_KEY, doc);
  const meta: AutoBackupMeta = {
    savedAt: new Date().toISOString(),
    title: doc.metadata.title,
    version: doc.version,
  };
  await set(AUTO_BACKUP_META_KEY, meta);
}

export async function loadAutoBackup(): Promise<{ doc: TEMDocument; meta: AutoBackupMeta } | null> {
  const [doc, meta] = await Promise.all([
    get<TEMDocument>(AUTO_BACKUP_KEY),
    get<AutoBackupMeta>(AUTO_BACKUP_META_KEY),
  ]);
  if (!doc || !meta) return null;
  return { doc, meta };
}

export async function clearAutoBackup(): Promise<void> {
  await del(AUTO_BACKUP_KEY);
  await del(AUTO_BACKUP_META_KEY);
}

export { BACKUP_INTERVAL_MS };
