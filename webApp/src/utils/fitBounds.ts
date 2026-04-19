// ============================================================================
// コンテンツの bounding box 計算
// - Box, SDSG, 時間矢印, 時期ラベル, 凡例 すべてを含む
// - Canvas の fit 機能で使用
// ============================================================================

import type { Sheet, ProjectSettings, LayoutDirection } from '../types';
import { computeTimeArrow } from './timeArrow';
import { computePeriodLabels } from './periodLabels';
import { computeLegendItems } from './legend';

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

  // SDSG
  sheet.sdsg.forEach((sg) => {
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
    const isH = layout === 'horizontal';
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
    const arrow = computeTimeArrow(sheet, layout, settings.timeArrow);
    if (arrow) {
      xs.push(arrow.startX, arrow.endX, arrow.labelX);
      ys.push(arrow.startY, arrow.endY, arrow.labelY);
    }
  }

  // 時期ラベル
  if (settings.periodLabels && sheet.periodLabels.length > 0) {
    const geom = computePeriodLabels(sheet, layout, settings.periodLabels, settings.timeArrow);
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
