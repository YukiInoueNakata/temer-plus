// ============================================================================
// コンテンツの bounding box 計算
// - Box, SDSG, 時間矢印, 時期ラベル, 凡例 すべてを含む
// - Canvas の fit 機能で使用
// ============================================================================

import type { Sheet, ProjectSettings, LayoutDirection } from '../types';
import { computeTimeArrow } from './timeArrow';
import { computePeriodLabels } from './periodLabels';
import { computeLegendItems } from './legend';
import { resolveBetweenEndpoint } from './sdsgBetween';
import {
  computeSDSGBandLayout,
  sdsgBandKey,
  computeBandRowAssignments,
  computeSDSGBandPosition,
} from './sdsgSpaceLayout';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function computeContentBounds(
  sheet: Sheet,
  layout: LayoutDirection,
  settings: ProjectSettings,
): Rect | null {
  const xs: number[] = [];
  const ys: number[] = [];

  // Box
  sheet.boxes.forEach((b) => {
    xs.push(b.x, b.x + b.width);
    ys.push(b.y, b.y + b.height);
  });

  // SDSG - band / between / attached の 3 モードを区別
  const isH = layout === 'horizontal';
  const bandEnabled = settings.sdsgSpace?.enabled;
  const boxById = new Map(sheet.boxes.map((b) => [b.id, b]));
  const lineById = new Map(sheet.lines.map((l) => [l.id, l]));

  // band モード事前計算（有効時のみ）
  const bandEntries: Record<'top' | 'bottom', Array<{ id: string; timeStart: number; timeEnd: number; rowOverride?: number }>> = { top: [], bottom: [] };
  if (bandEnabled) {
    sheet.sdsg.forEach((sg) => {
      const bk = sdsgBandKey(sg);
      if (!bk) return;
      let tS: number, tE: number;
      if (sg.anchorMode === 'between' && sg.attachedTo2) {
        const ep1 = resolveBetweenEndpoint(sg.attachedTo, boxById, lineById, isH);
        const ep2 = resolveBetweenEndpoint(sg.attachedTo2, boxById, lineById, isH);
        if (!ep1 || !ep2) return;
        const mode = sg.betweenMode ?? 'edge-to-edge';
        const left = ep1.timeStart <= ep2.timeStart ? ep1 : ep2;
        const right = ep1.timeStart <= ep2.timeStart ? ep2 : ep1;
        if (mode === 'edge-to-edge') { tS = left.timeStart; tE = right.timeStart + right.timeSize; }
        else { tS = left.timeStart + left.timeSize / 2; tE = right.timeStart + right.timeSize / 2; }
      } else {
        const attached = sheet.boxes.find((b) => b.id === sg.attachedTo);
        if (!attached) return;
        const centerT = isH ? attached.x + attached.width / 2 : attached.y + attached.height / 2;
        const timeAxisSize = isH
          ? (sg.spaceWidth ?? sg.width ?? 70)
          : (sg.spaceHeight ?? sg.height ?? 40);
        tS = centerT - timeAxisSize / 2;
        tE = centerT + timeAxisSize / 2;
      }
      bandEntries[bk].push({ id: sg.id, timeStart: tS, timeEnd: tE, rowOverride: sg.spaceRowOverride });
    });
  }
  // 帯の高さ算出には autoArrange に関わらず row 数を反映する（縦重ねに帯背景を合わせる）。
  const topRowsAll = bandEnabled ? computeBandRowAssignments(bandEntries.top) : new Map<string, number>();
  const bottomRowsAll = bandEnabled ? computeBandRowAssignments(bandEntries.bottom) : new Map<string, number>();
  const topRows = bandEnabled && settings.sdsgSpace?.autoArrange ? topRowsAll : new Map<string, number>();
  const bottomRows = bandEnabled && settings.sdsgSpace?.autoArrange ? bottomRowsAll : new Map<string, number>();
  const topTotalRows = Math.max(1, ...Array.from(topRowsAll.values()).map((v) => v + 1));
  const bottomTotalRows = Math.max(1, ...Array.from(bottomRowsAll.values()).map((v) => v + 1));
  const bandLayout = bandEnabled
    ? computeSDSGBandLayout(sheet, layout, settings, { top: topTotalRows, bottom: bottomTotalRows })
    : {};

  sheet.sdsg.forEach((sg) => {
    // --- band モード: 帯内の実位置を使用 ---
    const bk = sdsgBandKey(sg);
    const band = bk === 'top' ? bandLayout.topBand : bk === 'bottom' ? bandLayout.bottomBand : undefined;
    if (bandEnabled && bk && band) {
      const entry = bandEntries[bk].find((e) => e.id === sg.id);
      if (entry) {
        const rowMap = bk === 'top' ? topRows : bottomRows;
        const totalRows = bk === 'top' ? topTotalRows : bottomTotalRows;
        const rowIdx = rowMap.get(sg.id) ?? 0;
        const timeAnchor = (entry.timeStart + entry.timeEnd) / 2;
        const timeWidth = Math.max(10, entry.timeEnd - entry.timeStart);
        const bandSettings = bk === 'top' ? settings.sdsgSpace?.bands.top : settings.sdsgSpace?.bands.bottom;
        const pos = computeSDSGBandPosition(band, layout, timeAnchor, timeWidth, rowIdx, totalRows, sg, bk,
          { shrinkToFitRow: bandSettings?.shrinkToFitRow !== false });
        xs.push(pos.x, pos.x + pos.width);
        ys.push(pos.y, pos.y + pos.height);
        return;
      }
    }

    // --- between モード（Box / Line 混在対応） ---
    if (sg.anchorMode === 'between' && sg.attachedTo2) {
      const ep1 = resolveBetweenEndpoint(sg.attachedTo, boxById, lineById, isH);
      const ep2 = resolveBetweenEndpoint(sg.attachedTo2, boxById, lineById, isH);
      if (ep1 && ep2) {
        const mode = sg.betweenMode ?? 'edge-to-edge';
        const left = ep1.timeStart <= ep2.timeStart ? ep1 : ep2;
        const right = ep1.timeStart <= ep2.timeStart ? ep2 : ep1;
        let startPos: number, endPos: number;
        if (mode === 'edge-to-edge') {
          startPos = left.timeStart;
          endPos = right.timeStart + right.timeSize;
        } else {
          startPos = left.timeStart + left.timeSize / 2;
          endPos = right.timeStart + right.timeSize / 2;
        }
        const timeCenter = (startPos + endPos) / 2;
        const timeSpan = Math.max(10, Math.abs(endPos - startPos));
        const itemCenter = (ep1.itemCenter + ep2.itemCenter) / 2;
        const w = isH ? timeSpan : (sg.width ?? 70);
        const h = isH ? (sg.height ?? 40) : timeSpan;
        const anchorX = isH ? timeCenter : itemCenter;
        const anchorY = isH ? itemCenter : timeCenter;
        const x = anchorX - w / 2 + (isH ? (sg.timeOffset ?? 0) : (sg.itemOffset ?? 0));
        const y = anchorY - h / 2 + (isH ? (sg.itemOffset ?? 0) : (sg.timeOffset ?? 0));
        xs.push(x, x + w);
        ys.push(y, y + h);
        return;
      }
    }

    // --- attached モード（既存ロジック） ---
    const attachedBox = sheet.boxes.find((b) => b.id === sg.attachedTo);
    let ax = 0, ay = 0;
    if (attachedBox) {
      ax = attachedBox.x + attachedBox.width / 2;
      ay = attachedBox.y + attachedBox.height / 2;
    } else {
      const attachedLine = sheet.lines.find((l) => l.id === sg.attachedTo);
      if (attachedLine) {
        const fromBox = sheet.boxes.find((b) => b.id === attachedLine.from);
        const toBox = sheet.boxes.find((b) => b.id === attachedLine.to);
        if (fromBox && toBox) {
          ax = (fromBox.x + fromBox.width / 2 + toBox.x + toBox.width / 2) / 2;
          ay = (fromBox.y + fromBox.height / 2 + toBox.y + toBox.height / 2) / 2;
        }
      }
    }
    const timeOff = sg.timeOffset ?? 0;
    const itemOff = sg.itemOffset ?? 0;
    const w = sg.width ?? 70;
    const h = sg.height ?? 40;
    const x = ax - w / 2 + (isH ? timeOff : itemOff);
    const y = ay - h / 2 + (isH ? itemOff : timeOff);
    xs.push(x, x + w);
    ys.push(y, y + h);
  });

  // 時間矢印（alwaysVisible 問わず計算可能なら含める）
  if (settings.timeArrow) {
    const arrow = computeTimeArrow(sheet, layout, settings.timeArrow, settings.sdsgSpace, settings.typeLabelVisibility);
    if (arrow) {
      xs.push(arrow.startX, arrow.endX, arrow.labelX);
      ys.push(arrow.startY, arrow.endY, arrow.labelY);
    }
  }

  // 時期ラベル
  if (settings.periodLabels && sheet.periodLabels.length > 0) {
    const geom = computePeriodLabels(sheet, layout, settings.periodLabels, settings.timeArrow, settings.sdsgSpace, settings.typeLabelVisibility);
    if (geom) {
      xs.push(geom.startX, geom.endX);
      ys.push(geom.startY, geom.endY);
      // ラベルテキスト領域（テキスト自体の大きさ）も bbox に含める
      const fs = settings.periodLabels.fontSize ?? 13;
      geom.items.forEach((it) => {
        const maxLen = Math.max(6, (it.label ?? '').length);
        const textW = Math.max(80, maxLen * fs * 0.9);
        const textH = Math.max(20, fs * 1.8);
        if (layout === 'horizontal') {
          // 横型: label は x 中央 + y 上下どちらか
          xs.push(it.x - textW / 2, it.x + textW / 2);
          ys.push(it.y - textH, it.y + textH);
        } else {
          // 縦型: label は y 中心 + x 左右どちらか
          xs.push(it.x - textW, it.x + textW);
          ys.push(it.y - textH / 2, it.y + textH / 2);
        }
      });
    }
  }

  // 凡例（近似：位置 + minWidth + 行数による高さ）
  if (settings.legend && settings.legend.alwaysVisible) {
    const items = computeLegendItems(sheet, settings.legend);
    if (items.length > 0) {
      const lg = settings.legend;
      const cols = Math.max(
        1,
        Math.floor(
          (layout === 'vertical' ? lg.columnsVertical : lg.columnsHorizontal) ?? lg.columns ?? 1
        )
      );
      const rows = Math.ceil(items.length / cols);
      const showDesc = lg.showDescriptions === true;
      const titleH = lg.showTitle !== false ? (lg.titleFontSize ?? lg.fontSize * 1.15) * 1.4 + 6 : 0;
      const textRowH = lg.fontSize * (showDesc ? 2 : 1) * 1.4 + 4;
      const rowH = Math.max(textRowH, (lg.sampleHeight ?? 18) + 4);
      const approxH = titleH + rows * rowH + 20;
      const approxW = Math.max(lg.minWidth, ((lg.sampleWidth ?? 32) + 80) * cols) + 16;
      xs.push(lg.position.x, lg.position.x + approxW);
      ys.push(lg.position.y, lg.position.y + approxH);
    }
  }

  if (xs.length === 0 || ys.length === 0) return null;
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}
