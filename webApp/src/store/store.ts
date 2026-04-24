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
  createEmptyDocument,
  createEmptySheet,
  DEFAULT_VIEW_STATE,
  writeSnapEnabled,
  LEVEL_PX,
  genBoxId,
  genBoxIdByType,
  genLineId,
  genSDSGId,
  genCommentId,
  genPeriodId,
  genSheetId,
} from './defaults';
import { computeFitToLabelSize, computeFitFontSize } from '../utils/boxFit';
import { hydrateDocument } from '../utils/hydrate';

interface DocumentState {
  doc: TEMDocument;
}

export type FitMode = 'all' | 'width' | 'height';

interface UIState {
  view: ViewState;
  selection: Selection;
  fileHandle: FileSystemFileHandle | null;  // For File System Access API
  dirty: boolean;                             // Unsaved changes
  // Canvas に fit を要求するシグナル（カウンタ更新で購読側が再実行）
  fitCounter: number;
  fitMode: FitMode | null;
}

export interface PasteAtOptions {
  /** 挿入モード:
   *   - 'offset' (既定): 元座標 +20px
   *   - 'midpoint': 前後 Box の Time 軸中間に均等配置（Box のみ対応、SDSG は offset にフォールバック）
   */
  mode?: 'offset' | 'midpoint';
  /** midpoint モード時、前側の参照 Box ID（DataSheet の並び順が時系列と一致しないとき明示指定） */
  prevBoxId?: string;
  /** midpoint モード時、後側の参照 Box ID */
  nextBoxId?: string;
}

interface Actions {
  // Document-level
  loadDocument: (doc: TEMDocument) => void;
  importSheetsFromDocument: (src: TEMDocument) => void;  // 他ドキュメントのシートを現ドキュメントに追加
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
  fitBoxesToLabel: (ids: string[], mode?: 'both' | 'width' | 'height') => void;   // ラベルに合わせて Box サイズを最小 Fit
  fitBoxesTextToBox: (ids: string[]) => void; // Box サイズに合わせて文字サイズを調整（1回適用）
  // 選択 Box のサイズ/文字サイズを統一
  matchBoxesSize: (ids: string[], mode: 'width' | 'height' | 'both', basis?: 'first' | 'max' | 'min') => void;
  matchBoxesFontSize: (ids: string[], basis?: 'first' | 'max' | 'min') => void;
  // シート全体のリサイズ（実データを変更）
  // scale は単一倍率 or { xScale, yScale } の独立倍率
  // mode:
  //   'full'           = Box 座標・サイズ・フォント全てスケール（既定）
  //   'preserve-size'  = Box サイズ・フォント維持、位置のみスケール（preserveBoxSize 相当）
  //   'size-only'      = 位置は維持、Box サイズ・フォントのみスケール（NEW）
  resizeActiveSheet: (
    scale: number | { xScale: number; yScale: number },
    opts?: { includeFontSize?: boolean; mode?: 'full' | 'preserve-size' | 'size-only' }
  ) => void;
  // Box / Line の始終点オフセット / SDSG を一括で timeLevel/itemLevel 方向に平行移動
  // （時期区分・時間矢印・凡例は不変）
  shiftActiveSheetContent: (deltaTimeLevel: number, deltaItemLevel: number) => void;
  shiftSelectedBoxes: (ids: string[], deltaTimeLevel: number, deltaItemLevel: number) => void;
  // CSV インポート: Box/Line を一括追加（シフト挿入対応）
  importBoxes: (
    newBoxes: Box[],
    newLines: Line[],
    opts?: {
      targetSheetId?: string;           // 未指定ならアクティブシート
      insertAfterBoxId?: string;        // 指定 Box の直後に挿入 → それ以降の Box を右シフト
      insertBeforeBoxId?: string;       // 指定 Box の直前に挿入 → そちら以降を右シフト
      gap?: number;                     // シフト時の Box 間ギャップ（px）
    }
  ) => void;

  // Line operations
  addLine: (from: string, to: string, patch?: Partial<Line>) => string;
  updateLine: (id: string, patch: Partial<Line>) => void;
  updateLines: (ids: string[], patch: Partial<Line>) => void;
  removeLine: (id: string) => void;
  removeLines: (ids: string[]) => void;

  // SDSG operations
  addSDSG: (partial: Partial<SDSG> & { type: 'SD' | 'SG'; attachedTo: string }) => string;
  updateSDSG: (id: string, patch: Partial<SDSG>) => void;
  updateSDSGs: (ids: string[], patch: Partial<SDSG>) => void;
  matchSDSGsSize: (ids: string[], mode: 'width' | 'height' | 'both', basis?: 'first' | 'max' | 'min') => void;
  matchSDSGsFontSize: (ids: string[], basis?: 'first' | 'max' | 'min') => void;
  // SDSG の配置モード切替（band-top/band-bottom/attached）+ offset リセット
  setSDSGSpaceMode: (ids: string[], mode: 'attached' | 'band-top' | 'band-bottom') => void;
  // 全 SD/SG を種別別に帯配置へ一括適用
  placeAllSDSGToBands: (
    sdTarget: 'none' | 'top' | 'bottom',
    sgTarget: 'none' | 'top' | 'bottom',
  ) => void;
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
  pasteFromClipboardAt: (kind: 'box' | 'sdsg', index: number, options?: PasteAtOptions) => void;
  getClipboardInfo: () => { boxCount: number; lineCount: number; sdsgCount: number };

  // Z-order
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  bringForward: (id: string) => void;
  sendBackward: (id: string) => void;

  // Selection
  selectSingle: (type: 'box' | 'line' | 'sdsg' | 'note', id: string) => void;
  toggleSelect: (type: 'box' | 'line' | 'sdsg' | 'note', id: string) => void;
  setSelection: (boxIds: string[], lineIds?: string[], sdsgIds?: string[], opts?: { legendSelected?: boolean }) => void;
  selectLegend: () => void;
  clearSelection: () => void;
  selectAll: () => void;

  // ID rename
  renameBoxId: (oldId: string, newId: string) => boolean;

  // 型変更 + ID自動更新（新しい型の接頭辞で自動採番、参照も追従）
  changeBoxType: (boxId: string, newType: string) => void;

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
  toggleSDSGIds: () => void;
  toggleLineIds: () => void;
  /** 全 ID バッジ (Box/SDSG/Line) の一括 ON/OFF */
  toggleAllIds: () => void;
  toggleTopRuler: () => void;
  toggleLeftRuler: () => void;
  toggleLegend: () => void;
  requestFit: (mode: FitMode) => void;
  togglePeriodLabels: () => void;
  setCanvasMode: (mode: 'move' | 'pointer' | 'select') => void;
  setDataSheetWidth: (width: number) => void;
  setPropertyPanelWidth: (width: number) => void;
  setGridSnap: (enabled: boolean) => void;

  // Settings
  setLayout: (layout: 'horizontal' | 'vertical') => void;
  setLocale: (locale: 'ja' | 'en') => void;
  setUIFontSize: (size: number) => void;
  setRibbonFontSize: (size: number) => void;
  setGridPx: (px: number) => void;
  setDefaultBoxSize: (size: { width?: number; height?: number }) => void;
  setDefaultFontSize: (size: number) => void;

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
      selection: { sheetId: '', boxIds: [], lineIds: [], sdsgIds: [], noteIds: [] },
      fileHandle: null,
      dirty: false,
      fitCounter: 0,
      fitMode: null,

      // --- Document-level ---
      loadDocument: (doc) => {
        // 旧フォーマットの .tem ファイルで不足している settings 項目を defaults で補完
        const hydrated = hydrateDocument(doc);
        set({
          doc: hydrated,
          dirty: false,
          selection: { sheetId: hydrated.activeSheetId, boxIds: [], lineIds: [], sdsgIds: [], noteIds: [] },
        });
      },
      importSheetsFromDocument: (src) => {
        set((state) => {
          // 既存 ID と衝突しないよう、新ドキュメントのシート ID にサフィックス付与
          const existingSheetIds = new Set(state.doc.sheets.map((s) => s.id));
          const existingOrder = state.doc.sheets.reduce((m, s) => Math.max(m, s.order), -1);
          const newSheets = src.sheets.map((sh, i) => {
            let id = sh.id;
            let n = 2;
            while (existingSheetIds.has(id)) {
              id = `${sh.id}_${n++}`;
            }
            existingSheetIds.add(id);
            return { ...sh, id, order: existingOrder + 1 + i };
          });
          const firstNewId = newSheets[0]?.id ?? state.doc.activeSheetId;
          return {
            doc: {
              ...state.doc,
              sheets: [...state.doc.sheets, ...newSheets],
              activeSheetId: firstNewId,
            },
            dirty: true,
          };
        });
      },
      resetDocument: () => set({ doc: createEmptyDocument(), dirty: false }),
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
            draft.selection = { sheetId, boxIds: [], lineIds: [], sdsgIds: [], noteIds: [] };
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
        // 基準Box: 選択中Boxが優先、なければ最後の Box
        let refBox: Box | undefined;
        if (sheet && state.selection.boxIds.length > 0) {
          const selId = state.selection.boxIds[state.selection.boxIds.length - 1];
          refBox = sheet.boxes.find((b) => b.id === selId);
        }
        if (!refBox && sheet) {
          refBox = sheet.boxes[sheet.boxes.length - 1];
        }
        set((s) => {
          const layout = s.doc.settings.layout;
          const defaultTextOrientation = layout === 'horizontal' ? 'vertical' : 'horizontal';
          // defaultBoxSize は横型想定。縦型では -90° 回転に合わせて W/H を swap
          const baseW = s.doc.settings.defaultBoxSize.width;
          const baseH = s.doc.settings.defaultBoxSize.height;
          const defaultWidth = layout === 'horizontal' ? baseW : baseH;
          const defaultHeight = layout === 'horizontal' ? baseH : baseW;
          return {
            doc: mutateSheet(s.doc, targetSheetId, (sh) => {
              const defaults: Box = {
                id,
                type: 'normal',
                label: '新規Box',
                x: refBox ? refBox.x + (layout === 'horizontal' ? 150 : 0) : 200,
                y: refBox ? refBox.y + (layout === 'horizontal' ? 0 : 150) : 200,
                width: defaultWidth,
                height: defaultHeight,
                textOrientation: defaultTextOrientation,
              };
              sh.boxes.push({ ...defaults, ...partial, id });
            }),
            // 挿入した Box を選択状態にする（キャンバスでも反映）
            selection: { ...s.selection, boxIds: [id], lineIds: [], sdsgIds: [], noteIds: [] },
            dirty: true,
          };
        });
        return id;
      },
      updateBox: (id, patch) => {
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            const idx = sheet.boxes.findIndex((b) => b.id === id);
            if (idx < 0) return;
            const oldW = sheet.boxes[idx].width;
            const oldH = sheet.boxes[idx].height;
            Object.assign(sheet.boxes[idx], patch);
            const dw = sheet.boxes[idx].width - oldW;
            const dh = sheet.boxes[idx].height - oldH;
            // Box サイズが変わったら、attached SD/SG の offset を縁からの距離が保たれるよう補正
            if (dw !== 0 || dh !== 0) {
              const isH = state.doc.settings.layout === 'horizontal';
              const timeDelta = isH ? dw : dh;   // 時間軸方向のサイズ変化
              const itemDelta = isH ? dh : dw;   // 項目軸方向のサイズ変化
              sheet.sdsg.forEach((sg) => {
                if (sg.attachedTo !== id) return;
                const to = sg.timeOffset ?? 0;
                const io = sg.itemOffset ?? 0;
                if (timeDelta !== 0 && to !== 0) {
                  sg.timeOffset = to + Math.sign(to) * timeDelta / 2;
                }
                if (itemDelta !== 0 && io !== 0) {
                  sg.itemOffset = io + Math.sign(io) * itemDelta / 2;
                }
              });
            }
          }),
          dirty: true,
        }));
      },
      updateBoxes: (ids, patch) => {
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            const isH = state.doc.settings.layout === 'horizontal';
            sheet.boxes.forEach((b) => {
              if (!ids.includes(b.id)) return;
              const oldW = b.width;
              const oldH = b.height;
              Object.assign(b, patch);
              const dw = b.width - oldW;
              const dh = b.height - oldH;
              if (dw === 0 && dh === 0) return;
              const timeDelta = isH ? dw : dh;
              const itemDelta = isH ? dh : dw;
              sheet.sdsg.forEach((sg) => {
                if (sg.attachedTo !== b.id) return;
                const to = sg.timeOffset ?? 0;
                const io = sg.itemOffset ?? 0;
                if (timeDelta !== 0 && to !== 0) {
                  sg.timeOffset = to + Math.sign(to) * timeDelta / 2;
                }
                if (itemDelta !== 0 && io !== 0) {
                  sg.itemOffset = io + Math.sign(io) * itemDelta / 2;
                }
              });
            });
          }),
          dirty: true,
        }));
      },
      fitBoxesToLabel: (ids, mode = 'both') => {
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            sheet.boxes.forEach((b) => {
              if (!ids.includes(b.id)) return;
              const isVert = b.textOrientation === 'vertical';
              const measureOpts = {
                fontSize: b.style?.fontSize ?? state.doc.settings.defaultFontSize,
                fontFamily: b.style?.fontFamily,
                bold: b.style?.bold,
                italic: b.style?.italic,
                vertical: isVert,
                padding: 8,
              };
              // mode 別: 幅合わせは高さ固定で横を詰める、高さ合わせは逆、both は素の最小 Fit
              let target: { width: number; height: number };
              if (mode === 'width') {
                target = computeFitToLabelSize(b.label, { ...measureOpts, maxHeight: b.height });
                target.height = b.height;
              } else if (mode === 'height') {
                target = computeFitToLabelSize(b.label, { ...measureOpts, maxWidth: b.width });
                target.width = b.width;
              } else {
                target = computeFitToLabelSize(b.label, measureOpts);
              }
              // 左辺中点を固定: x は不変、y は中心維持
              const cy = b.y + b.height / 2;
              b.width = Math.max(20, target.width);
              b.height = Math.max(20, target.height);
              b.y = cy - b.height / 2;
            });
          }),
          dirty: true,
        }));
      },
      fitBoxesTextToBox: (ids) => {
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            sheet.boxes.forEach((b) => {
              if (!ids.includes(b.id)) return;
              const fs = computeFitFontSize(b.label, b.width, b.height, {
                fontFamily: b.style?.fontFamily,
                bold: b.style?.bold,
                italic: b.style?.italic,
                vertical: b.textOrientation === 'vertical',
                padding: 8,
                minSize: 6,
                maxSize: 72,
              });
              b.style = { ...(b.style ?? {}), fontSize: fs };
            });
          }),
          dirty: true,
        }));
      },
      matchBoxesSize: (ids, mode, basis = 'first') => {
        if (ids.length < 2) return;
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            const targets = sheet.boxes.filter((b) => ids.includes(b.id));
            if (targets.length < 2) return;
            // 選択順（ids 順）を保つため ids で並べ替え
            const ordered = ids
              .map((id) => targets.find((b) => b.id === id))
              .filter((b): b is typeof targets[number] => !!b);
            const widths = ordered.map((b) => b.width);
            const heights = ordered.map((b) => b.height);
            const targetW = basis === 'max' ? Math.max(...widths)
              : basis === 'min' ? Math.min(...widths)
              : ordered[0].width;
            const targetH = basis === 'max' ? Math.max(...heights)
              : basis === 'min' ? Math.min(...heights)
              : ordered[0].height;
            ordered.forEach((b) => {
              // 左辺中点を固定: x 不変、高さ変更時は中心 y 維持
              const cy = b.y + b.height / 2;
              if (mode === 'width' || mode === 'both') b.width = targetW;
              if (mode === 'height' || mode === 'both') {
                b.height = targetH;
                b.y = cy - b.height / 2;
              }
            });
          }),
          dirty: true,
        }));
      },
      importBoxes: (newBoxes, newLines, opts) => {
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            const layout = state.doc.settings.layout;
            const isH = layout === 'horizontal';
            const gap = opts?.gap ?? 20;

            // 挿入後のシフト対象 Box を決める
            let shiftFromTime = Infinity;
            if (opts?.insertAfterBoxId) {
              const anchor = sheet.boxes.find((b) => b.id === opts.insertAfterBoxId);
              if (anchor) {
                shiftFromTime = isH
                  ? anchor.x + anchor.width
                  : anchor.y + anchor.height;
              }
            } else if (opts?.insertBeforeBoxId) {
              const anchor = sheet.boxes.find((b) => b.id === opts.insertBeforeBoxId);
              if (anchor) {
                shiftFromTime = isH ? anchor.x : anchor.y;
              }
            }

            if (shiftFromTime !== Infinity && newBoxes.length > 0) {
              // 新 Box の time 方向サイズ合計（配置に必要な幅）
              const minNew = newBoxes.reduce(
                (m, b) => Math.min(m, isH ? b.x : b.y),
                Infinity,
              );
              const maxNew = newBoxes.reduce(
                (m, b) => Math.max(m, isH ? b.x + b.width : b.y + b.height),
                -Infinity,
              );
              const newSpan = Math.max(0, maxNew - minNew) + gap * 2;
              // 既存 Box で shiftFromTime 以降は newSpan 分シフト
              sheet.boxes.forEach((b) => {
                const t = isH ? b.x : b.y;
                if (t >= shiftFromTime) {
                  if (isH) b.x += newSpan;
                  else b.y += newSpan;
                }
              });
              // 時期ラベルもシフト
              sheet.periodLabels.forEach((p) => {
                const pos_px = p.position * 100; // LEVEL_PX
                if (pos_px >= shiftFromTime) {
                  p.position = (pos_px + newSpan) / 100;
                }
              });
              // 新 Box を挿入位置にオフセット
              const offset = shiftFromTime + gap - minNew;
              newBoxes.forEach((b) => {
                if (isH) b.x += offset;
                else b.y += offset;
              });
            }

            sheet.boxes.push(...newBoxes);
            sheet.lines.push(...newLines);
          }),
          dirty: true,
        }));
      },
      shiftActiveSheetContent: (deltaTimeLevel, deltaItemLevel) => {
        if (deltaTimeLevel === 0 && deltaItemLevel === 0) return;
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            const isH = state.doc.settings.layout === 'horizontal';
            const dxPx = deltaTimeLevel * LEVEL_PX;
            const dyPx = -deltaItemLevel * LEVEL_PX; // user's Item UP=+ → storage y DOWN=+
            // 横型: Time→x, Item→-y
            // 縦型: Time→y, Item→x
            const boxDx = isH ? dxPx : -dyPx;
            const boxDy = isH ? dyPx : dxPx;
            sheet.boxes.forEach((b) => {
              b.x += boxDx;
              b.y += boxDy;
            });
            // SDSG は attachedTo に追従するので不要（offset は相対値）
            // 時期区分・時間矢印・凡例は変更しない（要望通り）
          }),
          dirty: true,
        }));
      },
      shiftSelectedBoxes: (ids, deltaTimeLevel, deltaItemLevel) => {
        if (deltaTimeLevel === 0 && deltaItemLevel === 0) return;
        if (ids.length === 0) return;
        const idSet = new Set(ids);
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            const isH = state.doc.settings.layout === 'horizontal';
            const dxPx = deltaTimeLevel * LEVEL_PX;
            const dyPx = -deltaItemLevel * LEVEL_PX;
            const boxDx = isH ? dxPx : -dyPx;
            const boxDy = isH ? dyPx : dxPx;
            sheet.boxes.forEach((b) => {
              if (!idSet.has(b.id)) return;
              b.x += boxDx;
              b.y += boxDy;
            });
          }),
          dirty: true,
        }));
      },
      resizeActiveSheet: (scale, opts) => {
        const xScale = typeof scale === 'number' ? scale : scale.xScale;
        const yScale = typeof scale === 'number' ? scale : scale.yScale;
        if (!isFinite(xScale) || !isFinite(yScale) || xScale <= 0 || yScale <= 0) return;
        if (xScale === 1 && yScale === 1) return;
        const includeFontSize = opts?.includeFontSize ?? true;
        const mode = opts?.mode ?? 'full';
        const scalePositions = mode !== 'size-only';
        const scaleSize = mode !== 'preserve-size';
        const scaleFont = scaleSize && includeFontSize;
        // 実際の倍率
        const posXS = scalePositions ? xScale : 1;
        const posYS = scalePositions ? yScale : 1;
        const sizeXS = scaleSize ? xScale : 1;
        const sizeYS = scaleSize ? yScale : 1;
        // フォント: x/y 異なる場合は min（縮小寄り）
        const fontScale = scaleFont ? Math.min(xScale, yScale) : 1;
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            const isH = state.doc.settings.layout === 'horizontal';
            sheet.boxes.forEach((b) => {
              // サイズ変化時は中心固定で w/h 更新（位置維持モードで期待通り）
              const cx = b.x + b.width / 2;
              const cy = b.y + b.height / 2;
              b.x *= posXS;
              b.y *= posYS;
              b.width *= sizeXS;
              b.height *= sizeYS;
              if (mode === 'size-only') {
                // 位置維持: 中心を元の中心に合わせ直す
                b.x = cx - b.width / 2;
                b.y = cy - b.height / 2;
              }
              if (fontScale !== 1) {
                const curFS = b.style?.fontSize ?? state.doc.settings.defaultFontSize;
                b.style = { ...(b.style ?? {}), fontSize: Math.max(6, curFS * fontScale) };
                if (b.typeLabelFontSize != null) {
                  b.typeLabelFontSize = Math.max(6, b.typeLabelFontSize * fontScale);
                }
                if (b.subLabelFontSize != null) {
                  b.subLabelFontSize = Math.max(6, b.subLabelFontSize * fontScale);
                }
              }
            });
            sheet.sdsg.forEach((sg) => {
              if (scaleSize) {
                if (sg.width != null) sg.width *= sizeXS;
                if (sg.height != null) sg.height *= sizeYS;
              }
              // SDSG オフセット: 位置スケール時のみ乗算
              if (scalePositions) {
                const timeScale = isH ? xScale : yScale;
                const itemScale = isH ? yScale : xScale;
                sg.timeOffset = (sg.timeOffset ?? 0) * timeScale;
                sg.itemOffset = (sg.itemOffset ?? 0) * itemScale;
              }
              if (fontScale !== 1) {
                if (sg.style?.fontSize != null) {
                  sg.style = { ...sg.style, fontSize: Math.max(6, sg.style.fontSize * fontScale) };
                }
                if (sg.typeLabelFontSize != null) {
                  sg.typeLabelFontSize = Math.max(6, sg.typeLabelFontSize * fontScale);
                }
                if (sg.subLabelFontSize != null) {
                  sg.subLabelFontSize = Math.max(6, sg.subLabelFontSize * fontScale);
                }
              }
            });
            // 時期ラベル: position は Time_Level。位置スケール時のみ倍率適用
            if (scalePositions) {
              const periodScale = isH ? xScale : yScale;
              sheet.periodLabels.forEach((p) => { p.position = p.position * periodScale; });
            }
          }),
          dirty: true,
        }));
      },
      matchBoxesFontSize: (ids, basis = 'first') => {
        if (ids.length < 2) return;
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            const defaultFS = state.doc.settings.defaultFontSize;
            const targets = sheet.boxes.filter((b) => ids.includes(b.id));
            if (targets.length < 2) return;
            const ordered = ids
              .map((id) => targets.find((b) => b.id === id))
              .filter((b): b is typeof targets[number] => !!b);
            const sizes = ordered.map((b) => b.style?.fontSize ?? defaultFS);
            const targetSize = basis === 'max' ? Math.max(...sizes)
              : basis === 'min' ? Math.min(...sizes)
              : sizes[0];
            ordered.forEach((b) => {
              b.style = { ...(b.style ?? {}), fontSize: targetSize };
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
            // attachedTo2 が削除された Box を参照している場合は single モードに戻す
            sheet.sdsg.forEach((s) => {
              if (s.attachedTo2 === id) {
                s.attachedTo2 = undefined;
                s.anchorMode = 'single';
              }
            });
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
            sheet.sdsg.forEach((s) => {
              if (s.attachedTo2 && set_.has(s.attachedTo2)) {
                s.attachedTo2 = undefined;
                s.anchorMode = 'single';
              }
            });
          }),
          dirty: true,
        }));
      },

      // --- Line operations ---
      addLine: (from, to, patch) => {
        const state = get();
        const sheet = state.doc.sheets.find((s) => s.id === state.doc.activeSheetId);
        const lineType = patch?.type ?? 'RLine';
        const prefix = lineType === 'XLine' ? 'XL_' : 'RL_';
        const existingIds = sheet?.lines.map((l) => l.id) ?? [];
        const pattern = new RegExp(`^${prefix}(\\d+)$`);
        let maxN = 0;
        existingIds.forEach((id) => {
          const m = id.match(pattern);
          if (m) {
            const n = parseInt(m[1], 10);
            if (n > maxN) maxN = n;
          }
        });
        const id = patch?.id ?? `${prefix}${maxN + 1}`;

        // 同 from→to の既存 Line 数を数え、2 本目以降は Item 軸方向に ±5 ずつずらす
        // パターン: 1本目=0、2本目=+5、3本目=-5、4本目=+10、5本目=-10 …
        const duplicateCount = sheet?.lines.filter((l) => l.from === from && l.to === to).length ?? 0;
        const autoOffsetItem = duplicateCount === 0
          ? 0
          : (duplicateCount % 2 === 1 ? 1 : -1) * 5 * Math.ceil(duplicateCount / 2);

        set((st) => ({
          doc: mutateActiveSheet(st.doc, (sh) => {
            const defaults: Line = {
              id,
              type: lineType,
              from,
              to,
              connectionMode: 'center-to-center',
              shape: 'straight',
            };
            // 自動オフセット（autoPatch）→ patch の順で spread するため、
            // 明示的に startOffsetItem / endOffsetItem を指定した場合はユーザ値が勝つ
            const autoPatch: Partial<Line> = autoOffsetItem !== 0
              ? { startOffsetItem: autoOffsetItem, endOffsetItem: autoOffsetItem }
              : {};
            sh.lines.push({ ...defaults, ...autoPatch, ...patch, id, from, to });
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
        // ID は種別+連番（SD1, SD2, SG1, SG2...）
        const state = get();
        const sheet = state.doc.sheets.find((s) => s.id === state.doc.activeSheetId);
        const existingIds = sheet?.sdsg.map((s) => s.id) ?? [];
        const prefix = partial.type; // SD / SG
        const pattern = new RegExp(`^${prefix}(\\d+)$`);
        let maxN = 0;
        existingIds.forEach((id) => {
          const m = id.match(pattern);
          if (m) {
            const n = parseInt(m[1], 10);
            if (n > maxN) maxN = n;
          }
        });
        const id = partial.id ?? `${prefix}${maxN + 1}`;
        set((st) => ({
          doc: mutateActiveSheet(st.doc, (sh) => {
            // itemOffset 既定は layout に依存:
            //   横型: IL+ = y-（上方向）。SD は +IL 方向なので itemOff=-80（y 減）。
            //   縦型: IL+ = x+（右方向）。SD は +IL 方向なので itemOff=+80（x 増）。
            const layout = st.doc.settings.layout;
            const sdItemOff = layout === 'horizontal' ? -80 : 80;
            const sgItemOff = -sdItemOff;
            // attachedType を推定（明示指定があればそれを使用）
            const attachedType: 'box' | 'line' = partial.attachedType
              ?? (sh.boxes.some((b) => b.id === partial.attachedTo) ? 'box' : 'line');
            const defaults: SDSG = {
              id,
              type: partial.type,
              label: partial.type,
              attachedTo: partial.attachedTo,
              attachedType,
              itemOffset: partial.type === 'SD' ? sdItemOff : sgItemOff,
              timeOffset: 0,
              width: 70,
              height: 40,
            };
            sh.sdsg.push({ ...defaults, ...partial, id, attachedType });
          }),
          // addBox と同様に、挿入した SDSG を自動選択状態に
          selection: {
            ...st.selection,
            boxIds: [],
            lineIds: [],
            sdsgIds: [id],
            noteIds: [],
            legendSelected: false,
          },
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
      updateSDSGs: (ids, patch) => {
        const set_ = new Set(ids);
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            sheet.sdsg.forEach((s) => {
              if (!set_.has(s.id)) return;
              // style 系の patch は既存 style とマージ
              if (patch.style) {
                s.style = { ...(s.style ?? {}), ...patch.style };
              }
              // それ以外は通常 assign。style を 2 重代入しないため style を除く
              const { style: _, ...rest } = patch;
              Object.assign(s, rest);
            });
          }),
          dirty: true,
        }));
      },
      matchSDSGsSize: (ids, mode, basis = 'first') => {
        if (ids.length < 2) return;
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            const targets = sheet.sdsg.filter((s) => ids.includes(s.id));
            if (targets.length < 2) return;
            const ordered = ids
              .map((id) => targets.find((s) => s.id === id))
              .filter((s): s is typeof targets[number] => !!s);
            // band モード時は spaceWidth/spaceHeight、attached 時は width/height を基準に
            const getW = (s: SDSG) =>
              (s.spaceMode === 'band-top' || s.spaceMode === 'band-bottom')
                ? (s.spaceWidth ?? s.width ?? 70)
                : (s.width ?? 70);
            const getH = (s: SDSG) =>
              (s.spaceMode === 'band-top' || s.spaceMode === 'band-bottom')
                ? (s.spaceHeight ?? s.height ?? 40)
                : (s.height ?? 40);
            const widths = ordered.map(getW);
            const heights = ordered.map(getH);
            const targetW = basis === 'max' ? Math.max(...widths)
              : basis === 'min' ? Math.min(...widths)
              : widths[0];
            const targetH = basis === 'max' ? Math.max(...heights)
              : basis === 'min' ? Math.min(...heights)
              : heights[0];
            ordered.forEach((s) => {
              const isBand = s.spaceMode === 'band-top' || s.spaceMode === 'band-bottom';
              if (mode === 'width' || mode === 'both') {
                if (isBand) s.spaceWidth = targetW;
                else s.width = targetW;
              }
              if (mode === 'height' || mode === 'both') {
                if (isBand) s.spaceHeight = targetH;
                else s.height = targetH;
              }
            });
          }),
          dirty: true,
        }));
      },
      matchSDSGsFontSize: (ids, basis = 'first') => {
        if (ids.length < 2) return;
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            const targets = sheet.sdsg.filter((s) => ids.includes(s.id));
            if (targets.length < 2) return;
            const ordered = ids
              .map((id) => targets.find((s) => s.id === id))
              .filter((s): s is typeof targets[number] => !!s);
            const sizes = ordered.map((s) => s.style?.fontSize ?? 11);
            const targetSize = basis === 'max' ? Math.max(...sizes)
              : basis === 'min' ? Math.min(...sizes)
              : sizes[0];
            ordered.forEach((s) => {
              s.style = { ...(s.style ?? {}), fontSize: targetSize };
            });
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
      setSDSGSpaceMode: (ids, mode) => {
        const set_ = new Set(ids);
        set((state) => ({
          doc: produce(state.doc, (d) => {
            // band モードへ切替時、sdsgSpace が未有効なら自動有効化
            if (mode === 'band-top' || mode === 'band-bottom') {
              if (!d.settings.sdsgSpace) return;
              d.settings.sdsgSpace.enabled = true;
              if (mode === 'band-top') {
                d.settings.sdsgSpace.bands.top.enabled = true;
                d.settings.sdsgSpace.bands.top.showBorder = true;
              } else {
                d.settings.sdsgSpace.bands.bottom.enabled = true;
                d.settings.sdsgSpace.bands.bottom.showBorder = true;
              }
            }
            const activeSheet = d.sheets.find((sh) => sh.id === d.activeSheetId);
            if (!activeSheet) return;
            const allowMismatched = d.settings.sdsgSpace?.allowMismatchedPlacement ?? false;
            activeSheet.sdsg.forEach((s) => {
              if (!set_.has(s.id)) return;
              // 種別と帯の組合せチェック
              if (!allowMismatched) {
                if (mode === 'band-top' && s.type === 'SG') return;   // skip
                if (mode === 'band-bottom' && s.type === 'SD') return;
              }
              const prevMode = s.spaceMode ?? 'attached';
              s.spaceMode = mode;
              // モード切替時はオフセット類を **保持** する（attached ↔ band 往復時の位置消失を防止）
              //   timeOffset / itemOffset      … attached モード時のみ読まれる
              //   spaceInsetTime / spaceInsetItem … band モード時のみ読まれる
              //   なので各モードでの独立編集履歴が往復で失われない
              // attached → band 切替時は band 側サイズ未設定なら現 width/height を初期値に移植
              if ((mode === 'band-top' || mode === 'band-bottom') && prevMode === 'attached') {
                if (s.spaceWidth == null) s.spaceWidth = s.width ?? 70;
                if (s.spaceHeight == null) s.spaceHeight = s.height ?? 40;
              }
            });
          }),
          dirty: true,
        }));
      },
      placeAllSDSGToBands: (sdTarget, sgTarget) => {
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            const allowMismatched = state.doc.settings.sdsgSpace?.allowMismatchedPlacement ?? false;
            sheet.sdsg.forEach((s) => {
              const target = s.type === 'SD' ? sdTarget : sgTarget;
              if (target === 'none') return;
              const newMode = target === 'top' ? 'band-top' : 'band-bottom';
              if (!allowMismatched) {
                if (newMode === 'band-top' && s.type === 'SG') return;
                if (newMode === 'band-bottom' && s.type === 'SD') return;
              }
              s.spaceMode = newMode;
              s.timeOffset = 0;
              s.itemOffset = 0;
              s.spaceInsetItem = 0;
            });
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
      // 指定位置挿入: index は「N 番目の前に挿入」（length で末尾後）
      pasteFromClipboardAt: (kind, index, options) => {
        if (!clipboard) return;
        const mode = options?.mode ?? 'offset';
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            if (kind === 'box') {
              const isH = state.doc.settings.layout === 'horizontal';
              const idMap = new Map<string, string>();
              const newBoxes = clipboard!.boxes.map((b) => {
                const newId = genBoxIdByType(b.type, [...sheet.boxes.map((x) => x.id), ...idMap.values()]);
                idMap.set(b.id, newId);
                return { ...b, id: newId };
              });

              // midpoint モード: 前後 Box の Time 軸中間に均等配置
              if (mode === 'midpoint' && newBoxes.length > 0) {
                const prev = options?.prevBoxId ? sheet.boxes.find((b) => b.id === options.prevBoxId) : undefined;
                const next = options?.nextBoxId ? sheet.boxes.find((b) => b.id === options.nextBoxId) : undefined;
                if (prev && next) {
                  // Time 軸方向の区間を N+1 等分して N 個の Box を配置
                  const n = newBoxes.length;
                  if (isH) {
                    const startT = prev.x + prev.width;
                    const endT = next.x;
                    const range = endT - startT;
                    newBoxes.forEach((nb, j) => {
                      const t = (j + 1) / (n + 1);
                      // Box 中心を配置点にする: nb.x = lerp_center - width/2
                      const centerX = startT + range * t;
                      nb.x = centerX - nb.width / 2;
                      // Item 軸（y）は前後の平均で配置（プロトタイプとして）
                      nb.y = (prev.y + next.y) / 2;
                    });
                  } else {
                    const startT = prev.y + prev.height;
                    const endT = next.y;
                    const range = endT - startT;
                    newBoxes.forEach((nb, j) => {
                      const t = (j + 1) / (n + 1);
                      const centerY = startT + range * t;
                      nb.y = centerY - nb.height / 2;
                      nb.x = (prev.x + next.x) / 2;
                    });
                  }
                } else if (prev) {
                  // 末尾側挿入: prev の直後に並べる
                  newBoxes.forEach((nb, j) => {
                    if (isH) { nb.x = prev.x + prev.width + 20 + j * (nb.width + 10); nb.y = prev.y; }
                    else     { nb.y = prev.y + prev.height + 20 + j * (nb.height + 10); nb.x = prev.x; }
                  });
                } else if (next) {
                  // 先頭側挿入: next の直前に並べる
                  newBoxes.forEach((nb, j) => {
                    if (isH) { nb.x = next.x - 20 - (newBoxes.length - j) * (nb.width + 10); nb.y = next.y; }
                    else     { nb.y = next.y - 20 - (newBoxes.length - j) * (nb.height + 10); nb.x = next.x; }
                  });
                } else {
                  // 参照なし: 従来通り +20 オフセット（フォールバック）
                  newBoxes.forEach((nb, j) => { const src = clipboard!.boxes[j]; nb.x = src.x + 20; nb.y = src.y + 20; });
                }
              } else {
                // offset モード（既定）: 元座標 +20px
                newBoxes.forEach((nb, j) => { const src = clipboard!.boxes[j]; nb.x = src.x + 20; nb.y = src.y + 20; });
              }

              const safeIndex = Math.max(0, Math.min(index, sheet.boxes.length));
              sheet.boxes.splice(safeIndex, 0, ...newBoxes);
            } else {
              // SDSG は midpoint に対応しない（座標は attachedTo に追従するため無意味）
              const newSDSGs = clipboard!.sdsg.map((s) => {
                const newId = genSDSGId();
                return { ...s, id: newId };
              });
              const safeIndex = Math.max(0, Math.min(index, sheet.sdsg.length));
              sheet.sdsg.splice(safeIndex, 0, ...newSDSGs);
            }
          }),
          dirty: true,
        }));
      },
      getClipboardInfo: () => ({
        boxCount: clipboard?.boxes.length ?? 0,
        lineCount: clipboard?.lines.length ?? 0,
        sdsgCount: clipboard?.sdsg.length ?? 0,
      }),

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
            noteIds: type === 'note' ? [id] : [],
          },
        }));
      },
      toggleSelect: (type, id) => {
        set((state) => {
          const key = `${type}Ids` as 'boxIds' | 'lineIds' | 'sdsgIds' | 'noteIds';
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
      setSelection: (boxIds, lineIds = [], sdsgIds = [], opts) => {
        set((state) => ({
          selection: {
            sheetId: state.doc.activeSheetId,
            boxIds,
            lineIds,
            sdsgIds,
            noteIds: [],
            legendSelected: opts?.legendSelected ?? false,
          },
        }));
      },
      selectLegend: () => {
        set((state) => ({
          selection: {
            sheetId: state.doc.activeSheetId,
            boxIds: [],
            lineIds: [],
            sdsgIds: [],
            noteIds: [],
            legendSelected: true,
          },
        }));
      },
      clearSelection: () => {
        set((state) => ({
          selection: {
            sheetId: state.doc.activeSheetId,
            boxIds: [], lineIds: [], sdsgIds: [], noteIds: [],
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
              noteIds: sheet.notes.map((a) => a.id),
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
        const insertedRef: { ids: string[] } = { ids: [] };
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
              insertedRef.ids = newBoxIds;
            }),
            dirty: true,
          };
        });
        // 挿入された Box 群を選択状態にする
        if (insertedRef.ids.length > 0) {
          set((s) => ({
            selection: { ...s.selection, boxIds: insertedRef.ids, lineIds: [], sdsgIds: [], noteIds: [] },
          }));
        }
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

      // --- 型変更 + ID自動更新 ---
      changeBoxType: (boxId, newType) => {
        const state = get();
        const sheet = state.doc.sheets.find((s) => s.id === state.doc.activeSheetId);
        if (!sheet) return;
        const box = sheet.boxes.find((b) => b.id === boxId);
        if (!box) return;
        const oldType = box.type;
        if (oldType === newType) return;

        // 新しい型の接頭辞で新ID生成（自分自身を除く他のIDとの衝突を回避）
        const otherIds = sheet.boxes.filter((b) => b.id !== boxId).map((b) => b.id);
        const newId = genBoxIdByType(newType, otherIds);

        // 1. 型変更 + 2. ID変更 + 3. 参照の一括更新
        set((s) => ({
          doc: produce(s.doc, (d) => {
            d.sheets.forEach((sh) => {
              sh.boxes.forEach((b) => {
                if (b.id === boxId) {
                  b.type = newType as Box['type'];
                  b.id = newId;
                }
              });
              sh.lines.forEach((l) => {
                if (l.from === boxId) l.from = newId;
                if (l.to === boxId) l.to = newId;
              });
              sh.sdsg.forEach((sg) => { if (sg.attachedTo === boxId) sg.attachedTo = newId; });
              sh.comments.forEach((c) => { if (c.targetId === boxId) c.targetId = newId; });
            });
            d.metadata.modifiedAt = new Date().toISOString();
          }),
          selection: s.selection.boxIds.includes(boxId)
            ? { ...s.selection, boxIds: s.selection.boxIds.map((id) => (id === boxId ? newId : id)) }
            : s.selection,
          dirty: true,
        }));
      },

      // --- Sequential line creation ---
      addSequentialLines: (boxIds, type = 'RLine') => {
        if (boxIds.length < 2) return;
        set((state) => ({
          doc: mutateActiveSheet(state.doc, (sheet) => {
            const prefix = type === 'XLine' ? 'XL_' : 'RL_';
            const pattern = new RegExp(`^${prefix}(\\d+)$`);
            let maxN = 0;
            sheet.lines.forEach((l) => {
              const m = l.id.match(pattern);
              if (m) {
                const n = parseInt(m[1], 10);
                if (n > maxN) maxN = n;
              }
            });
            for (let i = 0; i < boxIds.length - 1; i++) {
              const from = boxIds[i];
              const to = boxIds[i + 1];
              maxN += 1;
              sheet.lines.push({
                id: `${prefix}${maxN}`,
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
      toggleSnap: () => set((state) => {
        const next = !state.view.snapEnabled;
        writeSnapEnabled(next);
        return { view: { ...state.view, snapEnabled: next } };
      }),
      togglePaperGuides: () => set((state) => ({ view: { ...state.view, showPaperGuides: !state.view.showPaperGuides } })),
      toggleCommentMode: () => set((state) => ({ view: { ...state.view, commentMode: !state.view.commentMode } })),
      toggleBoxIds: () => set((state) => ({ view: { ...state.view, showBoxIds: !state.view.showBoxIds } })),
      toggleSDSGIds: () => set((state) => ({ view: { ...state.view, showSDSGIds: !state.view.showSDSGIds } })),
      toggleLineIds: () => set((state) => ({ view: { ...state.view, showLineIds: !state.view.showLineIds } })),
      toggleAllIds: () => set((state) => {
        const anyOn = state.view.showBoxIds || state.view.showSDSGIds || state.view.showLineIds;
        const next = !anyOn;
        return { view: { ...state.view, showBoxIds: next, showSDSGIds: next, showLineIds: next } };
      }),
      toggleTopRuler: () => set((state) => ({ view: { ...state.view, showTopRuler: !state.view.showTopRuler } })),
      toggleLeftRuler: () => set((state) => ({ view: { ...state.view, showLeftRuler: !state.view.showLeftRuler } })),
      requestFit: (mode) => set((state) => ({ fitMode: mode, fitCounter: state.fitCounter + 1 })),
      toggleLegend: () => set((state) => ({
        doc: produce(state.doc, (d) => { d.settings.legend.alwaysVisible = !d.settings.legend.alwaysVisible; }),
      })),
      togglePeriodLabels: () => set((state) => ({
        doc: produce(state.doc, (d) => { d.settings.periodLabels.alwaysVisible = !d.settings.periodLabels.alwaysVisible; }),
      })),
      setCanvasMode: (canvasMode) => set((state) => ({ view: { ...state.view, canvasMode } })),
      setDataSheetWidth: (dataSheetWidth) => set((state) => ({ view: { ...state.view, dataSheetWidth } })),
      setPropertyPanelWidth: (propertyPanelWidth) => set((state) => ({ view: { ...state.view, propertyPanelWidth } })),
      setGridSnap: (enabled) => set((state) => ({
        doc: produce(state.doc, (d) => { d.settings.snap.gridSnap = enabled; }),
      })),

      // --- Settings ---
      setLayout: (layout) => {
        set((state) => {
          const currentLayout = state.doc.settings.layout;
          if (currentLayout === layout) return state;
          // レイアウト切替時: Item_Level の意味を保持するため、座標を 90° 回転させる。
          // 座標系:
          //   横型: ItemLevel = -(y + h/2)/100  (上=+)
          //   縦型: ItemLevel =  (x + w/2)/100  (右=+)
          // 回転後の top-left 座標式（中心基準の保存から導出）:
          //   h → v: new_x = -(y + h),  new_y = x
          //   v → h: new_x = y,          new_y = -(x + w)
          //   いずれも new_w = old_h, new_h = old_w
          return {
            doc: produce(state.doc, (d) => {
              d.settings.layout = layout;
              d.metadata.modifiedAt = new Date().toISOString();
              const toVertical = layout === 'vertical';
              d.sheets.forEach((sheet) => {
                sheet.boxes.forEach((b) => {
                  const ox = b.x, oy = b.y, ow = b.width, oh = b.height;
                  if (toVertical) {
                    b.x = -(oy + oh);
                    b.y = ox;
                  } else {
                    b.x = oy;
                    b.y = -(ox + ow);
                  }
                  b.width = oh;
                  b.height = ow;
                  b.textOrientation = layout === 'horizontal' ? 'vertical' : 'horizontal';
                });
                // SDSG も同じ rotation を適用する:
                //  - width/height, spaceWidth/spaceHeight は swap（視覚的な -90° 回転）
                //  - itemOffset / spaceInsetItem は符号反転（IL 方向が反転するため）
                //  - timeOffset / spaceInsetTime は据え置き（time 軸方向は保存される）
                sheet.sdsg.forEach((sg) => {
                  if (sg.width != null && sg.height != null) {
                    const tw = sg.width; sg.width = sg.height; sg.height = tw;
                  }
                  if (sg.spaceWidth != null && sg.spaceHeight != null) {
                    const tw = sg.spaceWidth; sg.spaceWidth = sg.spaceHeight; sg.spaceHeight = tw;
                  }
                  if (sg.itemOffset != null) sg.itemOffset = -sg.itemOffset;
                  if (sg.spaceInsetItem != null) sg.spaceInsetItem = -sg.spaceInsetItem;
                });
              });
              // 凡例位置も同じ -90° rotation を適用（IL/TL 位置を保存）
              //   h→v: new_x = -old_y, new_y = old_x
              //   v→h: new_x = old_y, new_y = -old_x
              const legend = d.settings.legend;
              if (legend) {
                const ox = legend.position.x, oy = legend.position.y;
                if (toVertical) {
                  legend.position = { x: -oy, y: ox };
                } else {
                  legend.position = { x: oy, y: -ox };
                }
              }
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
      setRibbonFontSize: (size) => {
        const clamped = Math.max(8, Math.min(24, size));
        set((state) => ({
          doc: produce(state.doc, (d) => { d.settings.ribbonFontSize = clamped; }),
        }));
      },
      setGridPx: (px) => {
        const clamped = Math.max(2, Math.min(200, Math.round(px)));
        set((state) => ({
          doc: produce(state.doc, (d) => { d.settings.snap.gridPx = clamped; }),
        }));
      },
      setDefaultBoxSize: (size) => {
        set((state) => ({
          doc: produce(state.doc, (d) => {
            if (size.width != null) {
              d.settings.defaultBoxSize.width = Math.max(20, Math.min(1000, Math.round(size.width)));
            }
            if (size.height != null) {
              d.settings.defaultBoxSize.height = Math.max(20, Math.min(1000, Math.round(size.height)));
            }
          }),
        }));
      },
      setDefaultFontSize: (size) => {
        const clamped = Math.max(6, Math.min(72, Math.round(size)));
        set((state) => ({
          doc: produce(state.doc, (d) => { d.settings.defaultFontSize = clamped; }),
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
