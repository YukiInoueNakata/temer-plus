// ============================================================================
// エクスポート用 印刷レイアウト変換層
// - 元 doc を deep copy して、印刷用の調整（全体スケール・文字サイズ・枠線等）
//   を適用する
// - 元 doc は不変
// - プレビューと実エクスポートで同じ変換関数を共有
// ============================================================================

import { produce } from 'immer';
import type {
  TEMDocument,
  Box,
  Line,
  SDSG,
} from '../types';
import { computeContentBounds } from './fitBounds';
import { getPaperPx, type PaperSizeKey } from './paperSizes';

export type FitMode = 'manual' | 'fit-width' | 'fit-height' | 'fit-both';

export interface ExportTransform {
  // フィット制御
  fitMode: FitMode;
  paperSize: PaperSizeKey;
  paperMarginRatio: number;        // 0.05 = 用紙の内側 5% を余白に
  globalScale: number;             // manual 時に使用

  // Box / Line の微調整
  fontSizeDelta: number;
  fontSizeScale: number;
  boxBorderWidthDelta: number;
  lineStrokeWidthDelta: number;
  boxGapScale: number;             // Box サイズは不変、中心間距離のみ拡縮

  // 補助要素
  typeLabelFontSizeDelta: number;
  subLabelFontSizeDelta: number;
  timeArrowFontSizeDelta: number;
  timeArrowStrokeDelta: number;
  legendFontSizeDelta: number;
  periodLabelFontSizeDelta: number;

  // 下限ガード
  minFontSize: number;
  minBorderWidth: number;
}

export const DEFAULT_EXPORT_TRANSFORM: ExportTransform = {
  fitMode: 'manual',
  paperSize: 'A4-landscape',
  paperMarginRatio: 0.05,
  globalScale: 1.0,
  fontSizeDelta: 0,
  fontSizeScale: 1,
  boxBorderWidthDelta: 0,
  lineStrokeWidthDelta: 0,
  boxGapScale: 1,
  typeLabelFontSizeDelta: 0,
  subLabelFontSizeDelta: 0,
  timeArrowFontSizeDelta: 0,
  timeArrowStrokeDelta: 0,
  legendFontSizeDelta: 0,
  periodLabelFontSizeDelta: 0,
  minFontSize: 6,
  minBorderWidth: 0.5,
};

// ----------------------------------------------------------------------------
// フィット倍率の計算
// ----------------------------------------------------------------------------

export function computeFitScale(
  bbox: { width: number; height: number },
  paperSize: PaperSizeKey,
  fitMode: FitMode,
  paperMarginRatio: number,
  customPaperWidth?: number,
  customPaperHeight?: number,
): number {
  if (fitMode === 'manual') return 1; // 呼び出し元で globalScale を使う
  const paper = getPaperPx(paperSize, customPaperWidth, customPaperHeight);
  const m = paperMarginRatio ?? 0.05;
  const innerW = Math.max(1, paper.width * (1 - m * 2));
  const innerH = Math.max(1, paper.height * (1 - m * 2));
  const sx = innerW / Math.max(1, bbox.width);
  const sy = innerH / Math.max(1, bbox.height);
  if (fitMode === 'fit-width') return sx;
  if (fitMode === 'fit-height') return sy;
  return Math.min(sx, sy); // fit-both
}

// ----------------------------------------------------------------------------
// 変換適用
// ----------------------------------------------------------------------------

export function applyExportTransform(
  doc: TEMDocument,
  xf: ExportTransform,
): { doc: TEMDocument; effectiveScale: number; bbox: { x: number; y: number; width: number; height: number } | null } {
  const sheet = doc.sheets.find((s) => s.id === doc.activeSheetId);
  const bounds = sheet ? computeContentBounds(sheet, doc.settings.layout, doc.settings) : null;

  // 1) 全体スケール（座標・サイズ）
  const fitScale = bounds
    ? computeFitScale(bounds, xf.paperSize, xf.fitMode, xf.paperMarginRatio)
    : 1;
  const effectiveScale = xf.fitMode === 'manual' ? xf.globalScale : fitScale;

  // 中心基準で Box gap を広げる
  const boxGap = xf.boxGapScale;

  const newDoc = produce(doc, (d) => {
    // 各シート
    for (const sh of d.sheets) {
      // 中心を求めて Box 間距離の倍率を適用（Box サイズは据え置き）
      if (boxGap !== 1 && sh.boxes.length > 0) {
        const xs: number[] = [];
        const ys: number[] = [];
        sh.boxes.forEach((b) => {
          xs.push(b.x + b.width / 2);
          ys.push(b.y + b.height / 2);
        });
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        sh.boxes.forEach((b) => {
          const bcx = b.x + b.width / 2;
          const bcy = b.y + b.height / 2;
          const ncx = cx + (bcx - cx) * boxGap;
          const ncy = cy + (bcy - cy) * boxGap;
          b.x = ncx - b.width / 2;
          b.y = ncy - b.height / 2;
        });
        // 時期ラベル位置も連動
        sh.periodLabels.forEach((p) => {
          p.position = cx + (p.position * 100 - cx) * boxGap; // position は Level 値 → px 換算
        });
      }

      // 2) 全体スケール: Box 座標・サイズ
      if (effectiveScale !== 1) {
        sh.boxes.forEach((b) => transformBox(b, effectiveScale));
        sh.sdsg.forEach((sg) => transformSDSG(sg, effectiveScale));
      }

      // 3) Box 微調整
      sh.boxes.forEach((b) => applyBoxAdjust(b, d.settings.defaultFontSize, xf));
      // 4) Line 微調整
      sh.lines.forEach((l) => applyLineAdjust(l, xf));
      // 5) SDSG 微調整
      sh.sdsg.forEach((sg) => applySDSGAdjust(sg, xf));
    }

    // 6) Project settings
    applyProjectAdjust(d, xf);
  });

  // bounds も effectiveScale 適用後に再計算して返す
  const newSheet = newDoc.sheets.find((s) => s.id === newDoc.activeSheetId);
  const newBounds = newSheet
    ? computeContentBounds(newSheet, newDoc.settings.layout, newDoc.settings)
    : null;

  return { doc: newDoc, effectiveScale, bbox: newBounds };
}

function transformBox(b: Box, scale: number) {
  b.x *= scale;
  b.y *= scale;
  b.width *= scale;
  b.height *= scale;
}

function transformSDSG(sg: SDSG, scale: number) {
  if (sg.width != null) sg.width *= scale;
  if (sg.height != null) sg.height *= scale;
  sg.timeOffset = (sg.timeOffset ?? 0) * scale;
  sg.itemOffset = (sg.itemOffset ?? 0) * scale;
}

function applyBoxAdjust(b: Box, defaultFS: number, xf: ExportTransform) {
  const curFS = b.style?.fontSize ?? defaultFS;
  const newFS = Math.max(xf.minFontSize, curFS * xf.fontSizeScale + xf.fontSizeDelta);
  const curTypeFS = b.typeLabelFontSize ?? 11;
  const curSubFS = b.subLabelFontSize ?? 10;
  b.style = { ...(b.style ?? {}), fontSize: newFS };
  b.typeLabelFontSize = Math.max(xf.minFontSize, curTypeFS + xf.typeLabelFontSizeDelta);
  b.subLabelFontSize = Math.max(xf.minFontSize, curSubFS + xf.subLabelFontSizeDelta);
  // 枠線太さ: 個別に上書きせず style.borderColor は保持、
  // 描画側（BoxNode/exportPPT 等）は BOX_RENDER_SPECS.borderWidth を参照するため、
  // 共通の変更は Project 側で吸収する（後述 applyProjectAdjust 参照）
}

function applyLineAdjust(l: Line, xf: ExportTransform) {
  const cur = l.style?.strokeWidth ?? 1.5;
  l.style = {
    ...(l.style ?? {}),
    strokeWidth: Math.max(xf.minBorderWidth, cur + xf.lineStrokeWidthDelta),
  };
}

function applySDSGAdjust(sg: SDSG, xf: ExportTransform) {
  const curFS = sg.style?.fontSize ?? 11;
  sg.style = {
    ...(sg.style ?? {}),
    fontSize: Math.max(xf.minFontSize, curFS * xf.fontSizeScale + xf.fontSizeDelta),
  };
  if (sg.subLabelFontSize != null) {
    sg.subLabelFontSize = Math.max(xf.minFontSize, sg.subLabelFontSize + xf.subLabelFontSizeDelta);
  }
  if (sg.typeLabelFontSize != null) {
    sg.typeLabelFontSize = Math.max(xf.minFontSize, sg.typeLabelFontSize + xf.typeLabelFontSizeDelta);
  }
}

function applyProjectAdjust(d: TEMDocument, xf: ExportTransform) {
  // 時間矢印
  d.settings.timeArrow.fontSize = Math.max(
    xf.minFontSize,
    d.settings.timeArrow.fontSize + xf.timeArrowFontSizeDelta,
  );
  d.settings.timeArrow.strokeWidth = Math.max(
    xf.minBorderWidth,
    d.settings.timeArrow.strokeWidth + xf.timeArrowStrokeDelta,
  );
  // 凡例
  d.settings.legend.fontSize = Math.max(
    xf.minFontSize,
    d.settings.legend.fontSize + xf.legendFontSizeDelta,
  );
  // 時期区分
  d.settings.periodLabels.fontSize = Math.max(
    xf.minFontSize,
    d.settings.periodLabels.fontSize + xf.periodLabelFontSizeDelta,
  );
}

// ----------------------------------------------------------------------------
// プリセット
// ----------------------------------------------------------------------------

export const EXPORT_PRESETS: Record<string, Partial<ExportTransform> & { label: string }> = {
  default: {
    label: '既定（変換なし）',
  },
  poster_a1: {
    label: '学会ポスター（A1想定）',
    fitMode: 'fit-both',
    paperSize: 'A3-landscape',
    fontSizeDelta: 4,
    lineStrokeWidthDelta: 1,
    boxBorderWidthDelta: 1,
  },
  paper_a4: {
    label: '論文用（A4横）',
    fitMode: 'fit-both',
    paperSize: 'A4-landscape',
    fontSizeDelta: 1,
  },
  slide_16_9: {
    label: 'スライド（16:9）',
    fitMode: 'fit-both',
    paperSize: '16:9',
    fontSizeDelta: 2,
    lineStrokeWidthDelta: 0.5,
  },
  compact: {
    label: '小型印刷',
    fitMode: 'fit-both',
    paperSize: 'A4-landscape',
    fontSizeDelta: -2,
  },
};
