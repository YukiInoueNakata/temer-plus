// ============================================================================
// Zustand store - 複数シート + undo/redo + 選択管理 + ビューステート
// ============================================================================

import { create } from 'zustand';
import { temporal } from 'zundo';
import { produce } from 'immer';
import type {
  TEMDocument,
  ViewState,
  Selection,
  Sheet,
  Box,
  Line,
  SDSG,
  PeriodLabel,
  HistoryEntry,
} from '../types';
import {
  createSampleDocument,
  createEmptySheet,
  DEFAULT_VIEW_STATE,
  LEVEL_PX,
  genBoxId,
  genBoxIdByType,
  genLineId,
  genSDSGId,
  genCommentId,
  genPeriodId,
  genSheetId,
} from './defaults';

interface DocumentState {
  doc: TEMDocument;
}

interface UIState {
  view: ViewState;
  selection: Selection;
  fileHandle: FileSystemFileHandle | null;  // For File System Access API
  dirty: boolean;                             // Unsaved changes
}

interface Actions {
  // Document-level
  loadDocument: (doc: TEMDocument) => void;
  resetDocument: () => void;
  markSaved: () => void;

  // Sheet management
  addSheet: (name?: string) => string;
  removeSheet: (sheetId: string) => void;
  renameSheet: (sheetId: string, name: string) => void;
  setActiveSheet: (sheetId: string) => void;
  reorderSheets: (sheetIds: string[]) => void;
  duplicateSheet: (sheetId: string) => string;

  // Box operations
  addBox: (partial?: Partial<Box>, sheetId?: string) => string;
  updateBox: (id: string, patch: Partial<Box>) => void;
  updateBoxes: (ids: string[], patch: Partial<Box>) => void;
  removeBox: (id: string) => void;
  removeBoxes: (ids: string[]) => void;

  // Line operations
  addLine: (from: string, to: string, patch?: Partial<Line>) => string;
  updateLine: (id: string, patch: Partial<Line>) => void;
  updateLines: (ids: string[], patch: Partial<Line>) => void;
  removeLine: (id: string) => void;
  removeLines: (ids: string[]) => void;

  // SDSG operations
  addSDSG: (partial: Partial<SDSG> & { type: 'SD' | 'SG'; attachedTo: string }) => string;
  updateSDSG: (id: string, patch: Partial<SDSG>) => void;
  removeSDSG: (id: string) => void;

  // Comment
  addComment: (targetId: string, text: string, author?: string) => string;
  resolveComment: (id: string) => void;
  removeComment: (id: string) => void;

  // Period label
  addPeriodLabel: (label: string, position: number) => string;
  updatePeriodLabel: (id: string, patch: Partial<PeriodLabel>) => void;
  removePeriodLabel: (id: string) => void;

  // Cross-sheet clipboard (simple in-memory for now)
  copyToClipboard: () => void;
  pasteFromClipboard: (targetSheetId?: string) => void;

  // Z-order
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  bringForward: (id: string) => void;
  sendBackward: (id: string) => void;

  // Selection
  selectSingle: (type: 'box' | 'line' | 'sdsg' | 'annotation', id: string) => void;
  toggleSelect: (type: 'box' | 'line' | 'sdsg' | 'annotation', id: string) => void;
  setSelection: (boxIds: string[], lineIds?: string[], sdsgIds?: string[]) => void;
  clearSelection: () => void;
  selectAll: () => void;

  // ID rename
  renameBoxId: (oldId: string, newId: string) => boolean;

  // Sequential line creation
  addSequentialLines: (boxIds: string[], type?: 'RLine' | 'XLine') => void;

  // 2 Box の位置を入替 + 両者を直接つなぐLineのfrom/toを反転
  // 「イベント順序が逆だと気づいたとき」向け
  swapBoxes: (box1Id: string, box2Id: string) => void;
  // 位置入替 + 全てのLine/SDSG/Commentで A↔B 参照を交換
  // 「2つのBoxの役割全体を入れ替えたいとき」向け
  swapBoxesFullLinks: (box1Id: string, box2Id: string) => void;

  // Box挿入: 2選択間に挿入
  // - simple: 既存Box位置を変えず、A-B間にN個を均等配置。A→Bの矢印があれば A→C1→..→CN→B に分割
  // - expand-shift: AからCへのレベル差と CからBへのレベル差を指定。複数挿入時は内側Box間はレベル1。
  //   B以降のBoxをすべて増分だけシフト。矢印も分割。
  insertBoxesBetween: (
    startId: string,
    endId: string,
    count: number,
    mode: 'simple' | 'expand-shift',
    options?: {
      deltaAtoC?: number;   // expand-shift: Aから最初の新Boxまでのレベル差
      deltaCtoB?: number;   // expand-shift: 最後の新BoxからBまでのレベル差
    }
  ) => void;

  // 指定Box以降のBoxすべてを任意のレベル数シフトする
  // pivot Box自身は動かさず、時間軸上で pivot より後ろにあるBoxのみ移動
  shiftBoxesAfter: (pivotBoxId: string, deltaLevel: number) => void;

  // View
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  toggleDataSheet: () => void;
  togglePropertyPanel: () => void;
  toggleGrid: () => void;
  toggleSnap: () => void;
  togglePaperGuides: () => void;
  toggleCommentMode: () => void;
  toggleBoxIds: () => void;
  setCanvasMode: (mode: 'move' | 'select') => void;
  setDataSheetWidth: (width: number) => void;
  setGridSnap: (enabled: boolean) => void;

  // Settings
  setLayout: (layout: 'horizontal' | 'vertical') => void;
  setLocale: (locale: 'ja' | 'en') => void;
  setUIFontSize: (size: number) => void;

  // History (separate from undo/redo - persists in file)
  pushHistory: (entry: Omit<HistoryEntry, 'timestamp'>) => void;

  // File handle
  setFileHandle: (handle: FileSystemFileHandle | null) => void;
}

type Store = DocumentState & UIState & Actions;

// Helper: get active sheet from doc
const getActiveSheet = (doc: TEMDocument): Sheet | undefined =>
  doc.sheets.find((s) => s.id === doc.activeSheetId);

// Helper: mutate active sheet
const mutateActiveSheet = (doc: TEMDocument, mutator: (sheet: Sheet) => void): TEMDocument =>
  produce(doc, (draft) => {
    const sheet = draft.sheets.find((s) => s.id === draft.activeSheetId);
    if (sheet) mutator(sheet);
    draft.metadata.modifiedAt = new Date().toISOString();
  });

// Helper: find and mutate a specific sheet
const mutateSheet = (doc: TEMDocument, sheetId: string, mutator: (sheet: Sheet) => void): TEMDocument =>
  produce(doc, (draft) => {
    const sheet = draft.sheets.find((s) => s.id === sheetId);
    if (sheet) mutator(sheet);
    draft.metadata.modifiedAt = new Date().toISOString();
  });

// In-memory clipboard
let clipboard: {
  boxes: Box[];
  lines: Line[];
  sdsg: SDSG[];
} | null = null;

// ----------------------------------------------------------------------------
// Store implementation
// ----------------------------------------------------------------------------

export const useTEMStore = create<Store>()(
  temporal(
    (set, get) => ({
      // Initial state
      doc: createSampleDocument(),
      view: DEFAULT_VIEW_STATE,
      selection: { sheetId: '', boxIds: [], lineIds: [], sdsgIds: [], annotationIds: [] },
      fileHandle: null,
      dirty: false,

      // --- Document-level ---
      loadDocument: (doc) => set({ doc, dirty: false, selection: { sheetId: doc.activeSheetId, boxIds: [], lineIds: [], sdsgIds: [], annotationIds: [] } }),
      resetDocument: () => set({ doc: createSampleDocument(), dirty: false }),
      markSaved: () => set({ dirty: false }),

      // --- Sheet management ---
      addSheet: (name) => {
        const id = genSheetId();
        set((state) =>
          produce(state, (draft) => {
            const sheet = createEmptySheet(name ?? `Sheet ${draft.doc.sheets.length + 1}`, draft.doc.sheets.length);
            sheet.id = id;
            draft.doc.sheets.push(sheet);
            draft.doc.activeSheetId = id;
            draft.dirty = true;
          })
        );
        return id;
      },
      removeSheet: (sheetId) => {
        set((state) =>
          produce(state, (draft) => {
            if (draft.doc.sheets.length <= 1) return;
            draft.doc.sheets = draft.doc.sheets.filter((s) => s.id !== sheetId);
            if (draft.doc.activeSheetId === sheetId) {
              draft.doc.activeSheetId = draft.doc.sheets[0].id;
            }
            draft.dirty = true;
          })
        );
      },
      renameSheet: (sheetId, name) => {
        set((state) =>
          produce(state, (draft) => {
            const sheet = draft.doc.sheets.find((s) => s.id === sheetId);
            if (sheet) sheet.name = name;
            draft.dirty = true;
          })
        );
      },
      setActiveSheet: (sheetId) => {
        set((state) =>
          produce(state, (draft) => {
            draft.doc.activeSheetId = sheetId;
            draft.selection = { sheetId, boxIds: [], lineIds: [], sdsgIds: [], annotationIds: [] };
          })
        );
      },
      reorderSheets: (sheetIds) => {
        set((state) =>
          produce(state, (draft) => {
            draft.doc.sheets.sort((a, b) => sheetIds.indexOf(a.id) - sheetIds.indexOf(b.id));
            draft.doc.sheets.forEach((s, i) => { s.order = i; });
            draft.dirty = true;
          })
        );
      },
      duplicateSheet: (sheetId) => {
        const newId = genSheetId();
        set((state) =>
          produce(state, (draft) => {
            const orig = draft.doc.sheets.find((s) => s.id === sheetId);
            if (!orig) return;
            const copy: Sheet = JSON.parse(JSON.stringify(orig));
            copy.id = newId;
            copy.name = `${orig.name} (copy)`;
            copy.order = draft.doc.sheets.length;
            draft.doc.sheets.push(copy);
            draft.doc.activeSheetId = newId;
            draft.dirty = true;
          })
        );
        return newId;
      },

      // --- Box operations ---
      addBox: (partial, sheetId) => {
        const state = get();
        const targetSheetId = sheetId ?? state.doc.activeSheetId;
        const sheet = state.doc.sheets.find((s) => s.id === targetSheetId);
        const type = partial?.type ?? 'normal';
        const id = partial?.id ?? (sheet ? genBoxIdByType(type, sheet.boxes.map((b) => b.id)) : genBoxId());
        set((s) => {
          const layout = s.doc.settings.layout;
          // 横型レイアウト→縦書きBox (縦長60×100)
          // 縦型レイアウト→横書きBox (横長100×50)
          const defaultTextOrientation = layout === 'horizontal' ? 'vertical' : 'horizontal';
          const defaultWidth = layout === 'horizontal' ? 60 : 100;
          const defaultHeight = layout === 'horizontal' ? 100 : 50;
          return {
            doc: mutateSheet(s.doc, targetSheetId, (sh) => {
              const last = sh.boxes[sh.boxes.length - 1];
              const defaults: Box = {
                id,
                type: 'normal',
                label: '新規Box',
                x: last ? last.x + (layout === 'horizontal' ? 150 : 0) : 200,
                y: last ? last.y + (layout === 'horizontal' ? 0 : 150) : 200,
                width: defaultWidth,
                height: defaultHeight,
                textOrientation: defaultTextOrientation,
              };
              sh.boxes.push({ ...defaults, ...partial, id });
            }),
            dirty: true,
          };
        });
        return id;
      },
      updateBox: (id, patch) => {
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            const idx = sheet.boxes.findIndex((b) => b.id === id);
            if (idx >= 0) Object.assign(sheet.boxes[idx], patch);
          }),
          dirty: true,
        }));
      },
      updateBoxes: (ids, patch) => {
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            sheet.boxes.forEach((b) => {
              if (ids.includes(b.id)) Object.assign(b, patch);
            });
          }),
          dirty: true,
        }));
      },
      removeBox: (id) => {
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            sheet.boxes = sheet.boxes.filter((b) => b.id !== id);
            sheet.lines = sheet.lines.filter((l) => l.from !== id && l.to !== id);
            sheet.sdsg = sheet.sdsg.filter((s) => s.attachedTo !== id);
          }),
          dirty: true,
        }));
      },
      removeBoxes: (ids) => {
        const set_ = new Set(ids);
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            sheet.boxes = sheet.boxes.filter((b) => !set_.has(b.id));
            sheet.lines = sheet.lines.filter((l) => !set_.has(l.from) && !set_.has(l.to));
            sheet.sdsg = sheet.sdsg.filter((s) => !set_.has(s.attachedTo));
          }),
          dirty: true,
        }));
      },

      // --- Line operations ---
      addLine: (from, to, patch) => {
        const id = patch?.id ?? genLineId();
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            const defaults: Line = {
              id,
              type: 'RLine',
              from,
              to,
              connectionMode: 'center-to-center',
              shape: 'straight',
            };
            sheet.lines.push({ ...defaults, ...patch, id, from, to });
          }),
          dirty: true,
        }));
        return id;
      },
      updateLine: (id, patch) => {
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            const idx = sheet.lines.findIndex((l) => l.id === id);
            if (idx >= 0) Object.assign(sheet.lines[idx], patch);
          }),
          dirty: true,
        }));
      },
      updateLines: (ids, patch) => {
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            sheet.lines.forEach((l) => {
              if (ids.includes(l.id)) Object.assign(l, patch);
            });
          }),
          dirty: true,
        }));
      },
      removeLine: (id) => {
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            sheet.lines = sheet.lines.filter((l) => l.id !== id);
          }),
          dirty: true,
        }));
      },
      removeLines: (ids) => {
        const set_ = new Set(ids);
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            sheet.lines = sheet.lines.filter((l) => !set_.has(l.id));
          }),
          dirty: true,
        }));
      },

      // --- SDSG operations ---
      addSDSG: (partial) => {
        const id = partial.id ?? genSDSGId();
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            const defaults: SDSG = {
              id,
              type: partial.type,
              label: partial.type,
              attachedTo: partial.attachedTo,
              itemOffset: partial.type === 'SD' ? -80 : 80,
              timeOffset: 0,
            };
            sheet.sdsg.push({ ...defaults, ...partial, id });
          }),
          dirty: true,
        }));
        return id;
      },
      updateSDSG: (id, patch) => {
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            const idx = sheet.sdsg.findIndex((s) => s.id === id);
            if (idx >= 0) Object.assign(sheet.sdsg[idx], patch);
          }),
          dirty: true,
        }));
      },
      removeSDSG: (id) => {
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            sheet.sdsg = sheet.sdsg.filter((s) => s.id !== id);
          }),
          dirty: true,
        }));
      },

      // --- Comment ---
      addComment: (targetId, text, author) => {
        const id = genCommentId();
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            sheet.comments.push({
              id,
              targetId,
              text,
              author,
              createdAt: new Date().toISOString(),
              resolved: false,
            });
          }),
          dirty: true,
        }));
        return id;
      },
      resolveComment: (id) => {
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            const c = sheet.comments.find((x) => x.id === id);
            if (c) c.resolved = true;
          }),
          dirty: true,
        }));
      },
      removeComment: (id) => {
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            sheet.comments = sheet.comments.filter((c) => c.id !== id);
          }),
          dirty: true,
        }));
      },

      // --- Period label ---
      addPeriodLabel: (label, position) => {
        const id = genPeriodId();
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            sheet.periodLabels.push({ id, label, position });
          }),
          dirty: true,
        }));
        return id;
      },
      updatePeriodLabel: (id, patch) => {
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            const idx = sheet.periodLabels.findIndex((p) => p.id === id);
            if (idx >= 0) Object.assign(sheet.periodLabels[idx], patch);
          }),
          dirty: true,
        }));
      },
      removePeriodLabel: (id) => {
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            sheet.periodLabels = sheet.periodLabels.filter((p) => p.id !== id);
          }),
          dirty: true,
        }));
      },

      // --- Clipboard ---
      copyToClipboard: () => {
        const state = get();
        const sheet = getActiveSheet(state.doc);
        if (!sheet) return;
        const { boxIds, lineIds, sdsgIds } = state.selection;
        clipboard = {
          boxes: sheet.boxes.filter((b) => boxIds.includes(b.id)),
          lines: sheet.lines.filter((l) => lineIds.includes(l.id)),
          sdsg: sheet.sdsg.filter((s) => sdsgIds.includes(s.id)),
        };
      },
      pasteFromClipboard: (targetSheetId) => {
        if (!clipboard) return;
        set((state) => {
          const sid = targetSheetId ?? state.doc.activeSheetId;
          const idMap = new Map<string, string>();
          return {
            doc: mutateSheet(state.doc, sid, (sheet) => {
              // 旧Excelマクロ準拠のID規則で新規ID生成
              clipboard!.boxes.forEach((b) => {
                const newId = genBoxIdByType(b.type, sheet.boxes.map((x) => x.id));
                idMap.set(b.id, newId);
                sheet.boxes.push({ ...b, id: newId, x: b.x + 20, y: b.y + 20 });
              });
              clipboard!.lines.forEach((l) => {
                const newId = genLineId();
                const newFrom = idMap.get(l.from) ?? l.from;
                const newTo = idMap.get(l.to) ?? l.to;
                sheet.lines.push({ ...l, id: newId, from: newFrom, to: newTo });
              });
              clipboard!.sdsg.forEach((s) => {
                const newId = genSDSGId();
                const newAttached = idMap.get(s.attachedTo) ?? s.attachedTo;
                sheet.sdsg.push({ ...s, id: newId, attachedTo: newAttached });
              });
            }),
            dirty: true,
          };
        });
      },

      // --- Z-order (for boxes mainly) ---
      bringToFront: (id) => {
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            const maxZ = Math.max(
              0,
              ...sheet.boxes.map((b) => b.zIndex ?? 0),
              ...sheet.lines.map((l) => l.zIndex ?? 0),
            );
            const b = sheet.boxes.find((x) => x.id === id);
            if (b) b.zIndex = maxZ + 1;
            const l = sheet.lines.find((x) => x.id === id);
            if (l) l.zIndex = maxZ + 1;
          }),
          dirty: true,
        }));
      },
      sendToBack: (id) => {
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            const minZ = Math.min(
              0,
              ...sheet.boxes.map((b) => b.zIndex ?? 0),
              ...sheet.lines.map((l) => l.zIndex ?? 0),
            );
            const b = sheet.boxes.find((x) => x.id === id);
            if (b) b.zIndex = minZ - 1;
            const l = sheet.lines.find((x) => x.id === id);
            if (l) l.zIndex = minZ - 1;
          }),
          dirty: true,
        }));
      },
      bringForward: (id) => {
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            const b = sheet.boxes.find((x) => x.id === id);
            if (b) b.zIndex = (b.zIndex ?? 0) + 1;
            const l = sheet.lines.find((x) => x.id === id);
            if (l) l.zIndex = (l.zIndex ?? 0) + 1;
          }),
          dirty: true,
        }));
      },
      sendBackward: (id) => {
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            const b = sheet.boxes.find((x) => x.id === id);
            if (b) b.zIndex = (b.zIndex ?? 0) - 1;
            const l = sheet.lines.find((x) => x.id === id);
            if (l) l.zIndex = (l.zIndex ?? 0) - 1;
          }),
          dirty: true,
        }));
      },

      // --- Selection ---
      selectSingle: (type, id) => {
        set((state) => ({
          selection: {
            sheetId: state.doc.activeSheetId,
            boxIds: type === 'box' ? [id] : [],
            lineIds: type === 'line' ? [id] : [],
            sdsgIds: type === 'sdsg' ? [id] : [],
            annotationIds: type === 'annotation' ? [id] : [],
          },
        }));
      },
      toggleSelect: (type, id) => {
        set((state) => {
          const key = `${type}Ids` as 'boxIds' | 'lineIds' | 'sdsgIds' | 'annotationIds';
          const ids = state.selection[key];
          const newIds = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
          return {
            selection: {
              ...state.selection,
              sheetId: state.doc.activeSheetId,
              [key]: newIds,
            },
          };
        });
      },
      setSelection: (boxIds, lineIds = [], sdsgIds = []) => {
        set((state) => ({
          selection: {
            sheetId: state.doc.activeSheetId,
            boxIds,
            lineIds,
            sdsgIds,
            annotationIds: [],
          },
        }));
      },
      clearSelection: () => {
        set((state) => ({
          selection: {
            sheetId: state.doc.activeSheetId,
            boxIds: [], lineIds: [], sdsgIds: [], annotationIds: [],
          },
        }));
      },
      selectAll: () => {
        set((state) => {
          const sheet = getActiveSheet(state.doc);
          if (!sheet) return state;
          return {
            selection: {
              sheetId: state.doc.activeSheetId,
              boxIds: sheet.boxes.map((b) => b.id),
              lineIds: sheet.lines.map((l) => l.id),
              sdsgIds: sheet.sdsg.map((s) => s.id),
              annotationIds: sheet.annotations.map((a) => a.id),
            },
          };
        });
      },

      // --- ID rename (updates all references) ---
      renameBoxId: (oldId, newId) => {
        if (!newId || oldId === newId) return false;
        // Check uniqueness across all sheets
        const state = get();
        for (const sheet of state.doc.sheets) {
          if (sheet.boxes.some((b) => b.id === newId)) {
            return false;  // ID conflict
          }
        }
        set((s) => ({
          doc: produce(s.doc, (d) => {
            d.sheets.forEach((sheet) => {
              sheet.boxes.forEach((b) => { if (b.id === oldId) b.id = newId; });
              sheet.lines.forEach((l) => {
                if (l.from === oldId) l.from = newId;
                if (l.to === oldId) l.to = newId;
              });
              sheet.sdsg.forEach((sg) => { if (sg.attachedTo === oldId) sg.attachedTo = newId; });
              sheet.comments.forEach((c) => { if (c.targetId === oldId) c.targetId = newId; });
            });
            d.metadata.modifiedAt = new Date().toISOString();
          }),
          selection: s.selection.boxIds.includes(oldId)
            ? { ...s.selection, boxIds: s.selection.boxIds.map((id) => (id === oldId ? newId : id)) }
            : s.selection,
          dirty: true,
        }));
        return true;
      },

      // --- 2 Box 入れ替え（直接のみ）---
      // 位置(x, y)を入替 + 両者を直接つなぐLineのfrom/toを反転
      // 時系列フロー（矢印方向）が保たれる
      swapBoxes: (box1Id, box2Id) => {
        if (box1Id === box2Id) return;
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            const b1 = sheet.boxes.find((b) => b.id === box1Id);
            const b2 = sheet.boxes.find((b) => b.id === box2Id);
            if (!b1 || !b2) return;
            const tmpX = b1.x; const tmpY = b1.y;
            b1.x = b2.x; b1.y = b2.y;
            b2.x = tmpX; b2.y = tmpY;
            sheet.lines.forEach((l) => {
              if ((l.from === box1Id && l.to === box2Id) ||
                  (l.from === box2Id && l.to === box1Id)) {
                const tmpFrom = l.from;
                l.from = l.to;
                l.to = tmpFrom;
              }
            });
          }),
          dirty: true,
        }));
      },

      // --- 2 Box 入れ替え（全リンク含む）---
      // 位置(x, y)を入替 + 全ての Line / SDSG / Comment で A↔B 参照を完全交換
      // 「2つのBoxのロール全体を入れ替えたいとき」向け（チェーン順序の大幅変更など）
      swapBoxesFullLinks: (box1Id, box2Id) => {
        if (box1Id === box2Id) return;
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            const b1 = sheet.boxes.find((b) => b.id === box1Id);
            const b2 = sheet.boxes.find((b) => b.id === box2Id);
            if (!b1 || !b2) return;
            // 位置入替
            const tmpX = b1.x; const tmpY = b1.y;
            b1.x = b2.x; b1.y = b2.y;
            b2.x = tmpX; b2.y = tmpY;
            // 全 Line で A ↔ B 参照交換
            sheet.lines.forEach((l) => {
              if (l.from === box1Id) l.from = box2Id;
              else if (l.from === box2Id) l.from = box1Id;
              if (l.to === box1Id) l.to = box2Id;
              else if (l.to === box2Id) l.to = box1Id;
            });
            // 全 SDSG で attachedTo 交換
            sheet.sdsg.forEach((s) => {
              if (s.attachedTo === box1Id) s.attachedTo = box2Id;
              else if (s.attachedTo === box2Id) s.attachedTo = box1Id;
            });
            // 全 Comment で targetId 交換
            sheet.comments.forEach((c) => {
              if (c.targetId === box1Id) c.targetId = box2Id;
              else if (c.targetId === box2Id) c.targetId = box1Id;
            });
          }),
          dirty: true,
        }));
      },

      // --- Box挿入: 2選択間に ---
      insertBoxesBetween: (startId, endId, count, mode, options) => {
        if (count < 1) return;
        set((state) => {
          return {
            doc: mutateActiveSheet(state.doc, (sheet) => {
              const start = sheet.boxes.find((b) => b.id === startId);
              const end = sheet.boxes.find((b) => b.id === endId);
              if (!start || !end) return;

              const layout = state.doc.settings.layout;
              const getTime = (b: { x: number; y: number }) => layout === 'horizontal' ? b.x : b.y;
              const getItem = (b: { x: number; y: number }) => layout === 'horizontal' ? b.y : b.x;
              const setPos = (b: { x: number; y: number }, time: number, item: number) => {
                if (layout === 'horizontal') { b.x = time; b.y = item; }
                else { b.x = item; b.y = time; }
              };

              const newBoxIds: string[] = [];
              const startItem = getItem(start);
              const endItem = getItem(end);

              if (mode === 'simple') {
                // 位置変更なし、A-B間にcount個を均等補間
                for (let i = 1; i <= count; i++) {
                  const t = i / (count + 1);
                  const newTime = getTime(start) + (getTime(end) - getTime(start)) * t;
                  const newItem = startItem + (endItem - startItem) * t;
                  const newId = genBoxIdByType('normal', sheet.boxes.map((b) => b.id));
                  const newBox: Box = {
                    id: newId, type: 'normal', label: `挿入${i}`,
                    x: 0, y: 0, width: start.width, height: start.height,
                    textOrientation: start.textOrientation,
                  };
                  setPos(newBox, newTime, newItem);
                  sheet.boxes.push(newBox);
                  newBoxIds.push(newId);
                }
              } else {
                // expand-shift:
                // Aから最初の新Boxまで deltaAtoC レベル
                // 内側の新Box間は 1 レベル
                // 最後の新BoxからBまで deltaCtoB レベル
                // B以降のBoxをすべてシフト
                const deltaAtoC = options?.deltaAtoC ?? 1;
                const deltaCtoB = options?.deltaCtoB ?? 1;
                const startLevel = getTime(start) / LEVEL_PX;
                const oldEndLevel = getTime(end) / LEVEL_PX;
                // 最後の新Boxのレベル = startLevel + deltaAtoC + (count - 1)
                const lastNewLevel = startLevel + deltaAtoC + (count - 1);
                const newEndLevel = lastNewLevel + deltaCtoB;
                const shift = newEndLevel - oldEndLevel;

                // 既存Boxをシフト（Bより後ろのみ、startとend自身は除く）
                sheet.boxes.forEach((b) => {
                  if (b.id === startId || b.id === endId) return;
                  const bLevel = getTime(b) / LEVEL_PX;
                  if (bLevel > oldEndLevel) {
                    const item = getItem(b);
                    setPos(b, (bLevel + shift) * LEVEL_PX, item);
                  }
                });

                // end を新レベルに移動
                setPos(end, newEndLevel * LEVEL_PX, endItem);

                // 新Boxを挿入
                for (let i = 0; i < count; i++) {
                  const newLevel = startLevel + deltaAtoC + i;
                  const t = count > 1 ? i / (count - 1) : 0.5;
                  const newItem = startItem + (endItem - startItem) * t;
                  const newId = genBoxIdByType('normal', sheet.boxes.map((b) => b.id));
                  const newBox: Box = {
                    id: newId, type: 'normal', label: `挿入${i + 1}`,
                    x: 0, y: 0, width: start.width, height: start.height,
                    textOrientation: start.textOrientation,
                  };
                  setPos(newBox, newLevel * LEVEL_PX, newItem);
                  sheet.boxes.push(newBox);
                  newBoxIds.push(newId);
                }
              }

              // 矢印分割: A→B を A→C1→C2→...→CN→B に、B→A も逆順で同様に
              const linesToSplit = sheet.lines.filter((l) =>
                (l.from === startId && l.to === endId) ||
                (l.from === endId && l.to === startId)
              );
              linesToSplit.forEach((origLine) => {
                const isForward = origLine.from === startId;
                const { type, style, connectionMode, shape } = origLine;
                // 元Lineを削除
                const idx = sheet.lines.indexOf(origLine);
                if (idx >= 0) sheet.lines.splice(idx, 1);
                // チェーン構築
                const chain = isForward
                  ? [startId, ...newBoxIds, endId]
                  : [endId, ...[...newBoxIds].reverse(), startId];
                for (let i = 0; i < chain.length - 1; i++) {
                  sheet.lines.push({
                    id: genLineId(),
                    type,
                    from: chain[i],
                    to: chain[i + 1],
                    connectionMode,
                    shape,
                    style,
                  });
                }
              });
            }),
            dirty: true,
          };
        });
      },

      // --- 指定Box以降のBoxをシフト ---
      shiftBoxesAfter: (pivotBoxId, deltaLevel) => {
        if (deltaLevel === 0) return;
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            const pivot = sheet.boxes.find((b) => b.id === pivotBoxId);
            if (!pivot) return;
            const layout = state.doc.settings.layout;
            const pivotLevel = (layout === 'horizontal' ? pivot.x : pivot.y) / LEVEL_PX;
            const shiftPx = deltaLevel * LEVEL_PX;
            sheet.boxes.forEach((b) => {
              if (b.id === pivotBoxId) return;
              const bLevel = (layout === 'horizontal' ? b.x : b.y) / LEVEL_PX;
              if (bLevel > pivotLevel) {
                if (layout === 'horizontal') b.x += shiftPx;
                else b.y += shiftPx;
              }
            });
          }),
          dirty: true,
        }));
      },

      // --- Sequential line creation ---
      addSequentialLines: (boxIds, type = 'RLine') => {
        if (boxIds.length < 2) return;
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            for (let i = 0; i < boxIds.length - 1; i++) {
              const from = boxIds[i];
              const to = boxIds[i + 1];
              sheet.lines.push({
                id: genLineId(),
                type,
                from,
                to,
                connectionMode: 'center-to-center',
                shape: 'straight',
              });
            }
          }),
          dirty: true,
        }));
      },

      // --- View ---
      setZoom: (zoom) => set((state) => ({ view: { ...state.view, zoom } })),
      setPan: (panX, panY) => set((state) => ({ view: { ...state.view, panX, panY } })),
      toggleDataSheet: () => set((state) => ({ view: { ...state.view, dataSheetVisible: !state.view.dataSheetVisible } })),
      togglePropertyPanel: () => set((state) => ({ view: { ...state.view, propertyPanelVisible: !state.view.propertyPanelVisible } })),
      toggleGrid: () => set((state) => ({ view: { ...state.view, showGrid: !state.view.showGrid } })),
      toggleSnap: () => set((state) => ({ view: { ...state.view, snapEnabled: !state.view.snapEnabled } })),
      togglePaperGuides: () => set((state) => ({ view: { ...state.view, showPaperGuides: !state.view.showPaperGuides } })),
      toggleCommentMode: () => set((state) => ({ view: { ...state.view, commentMode: !state.view.commentMode } })),
      toggleBoxIds: () => set((state) => ({ view: { ...state.view, showBoxIds: !state.view.showBoxIds } })),
      setCanvasMode: (canvasMode) => set((state) => ({ view: { ...state.view, canvasMode } })),
      setDataSheetWidth: (dataSheetWidth) => set((state) => ({ view: { ...state.view, dataSheetWidth } })),
      setGridSnap: (enabled) => set((state) => ({
        doc: produce(state.doc, (d) => { d.settings.snap.gridSnap = enabled; }),
      })),

      // --- Settings ---
      setLayout: (layout) => {
        set((state) => {
          const currentLayout = state.doc.settings.layout;
          if (currentLayout === layout) return state;
          // レイアウト切替時: 全Box の x/y, width/height をスワップ
          // (時間軸が90度回転し、Box も縦長⇔横長に)
          return {
            doc: produce(state.doc, (d) => {
              d.settings.layout = layout;
              d.metadata.modifiedAt = new Date().toISOString();
              d.sheets.forEach((sheet) => {
                sheet.boxes.forEach((b) => {
                  const tmpPos = b.x; b.x = b.y; b.y = tmpPos;
                  const tmpSize = b.width; b.width = b.height; b.height = tmpSize;
                  b.textOrientation = layout === 'horizontal' ? 'vertical' : 'horizontal';
                });
              });
            }),
            dirty: true,
          };
        });
      },
      setLocale: (locale) => {
        set((state) => ({
          doc: produce(state.doc, (d) => { d.settings.locale = locale; }),
        }));
      },
      setUIFontSize: (size) => {
        const clamped = Math.max(10, Math.min(40, size));
        set((state) => ({
          doc: produce(state.doc, (d) => { d.settings.uiFontSize = clamped; }),
        }));
      },

      // --- History ---
      pushHistory: (entry) => {
        set((state) => ({
          doc: produce(state.doc, (d) => {
            d.history.push({ ...entry, timestamp: new Date().toISOString() });
            if (d.history.length > 50) d.history = d.history.slice(-50);
          }),
        }));
      },

      // --- File handle ---
      setFileHandle: (handle) => set({ fileHandle: handle }),
    }),
    {
      // zundo options: only track doc, not view/selection
      partialize: (state) => ({ doc: state.doc } as Pick<Store, 'doc'>),
      limit: 100,
      equality: (a, b) => JSON.stringify(a.doc) === JSON.stringify(b.doc),
    }
  )
);

// Convenience hook to get active sheet
export const useActiveSheet = (): Sheet | undefined => {
  return useTEMStore((s) => s.doc.sheets.find((sh) => sh.id === s.doc.activeSheetId));
};

// Undo/redo helpers (zundo provides these on temporal)
export const useUndo = () => useTEMStore.temporal.getState().undo;
export const useRedo = () => useTEMStore.temporal.getState().redo;
