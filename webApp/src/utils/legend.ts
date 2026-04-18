// ============================================================================
// 凡例自動生成 - シートから使用記号を抽出
// ============================================================================

import type { Sheet, LegendSettings, BoxType } from '../types';
import { BOX_TYPE_LABELS } from '../store/defaults';

export type LegendCategory = 'box' | 'line' | 'sdsg' | 'timeArrow';

export interface LegendItem {
  category: LegendCategory;
  key: string;
  label: string;
  description: string;
}

const BOX_DESCRIPTIONS: Record<BoxType, string> = {
  'normal':     '経験・出来事',
  'BFP':        '分岐点 (Bifurcation Point)',
  'EFP':        '等至点 (Equifinality Point)',
  'P-EFP':      '両極化等至点 (Polarized EFP)',
  'OPP':        '必須通過点 (Obligatory Passage Point)',
  'annotation': '潜在経験 / 想定された未実現経験',
  '2nd-EFP':    '第二等至点',
  'P-2nd-EFP':  '両極化第二等至点',
};

export function computeLegendItems(sheet: Sheet, settings: LegendSettings): LegendItem[] {
  const items: LegendItem[] = [];

  if (settings.includeBoxes) {
    const usedTypes = new Set(sheet.boxes.map((b) => b.type));
    // 標準順序で並べる
    const order: BoxType[] = ['normal', 'BFP', 'EFP', 'P-EFP', 'OPP', 'annotation', '2nd-EFP', 'P-2nd-EFP'];
    order.forEach((type) => {
      if (usedTypes.has(type)) {
        items.push({
          category: 'box',
          key: type,
          label: BOX_TYPE_LABELS[type]?.ja ?? type,
          description: BOX_DESCRIPTIONS[type] ?? '',
        });
      }
    });
  }

  if (settings.includeLines) {
    const usedTypes = new Set(sheet.lines.map((l) => l.type));
    if (usedTypes.has('RLine')) {
      items.push({ category: 'line', key: 'RLine', label: '実線径路', description: '実現した径路' });
    }
    if (usedTypes.has('XLine')) {
      items.push({ category: 'line', key: 'XLine', label: '点線径路', description: '想定された（未実現）径路' });
    }
  }

  if (settings.includeSDSG && sheet.sdsg.length > 0) {
    const types = new Set(sheet.sdsg.map((s) => s.type));
    if (types.has('SD')) {
      items.push({ category: 'sdsg', key: 'SD', label: 'SD', description: '社会的方向づけ（径路を妨害する力）' });
    }
    if (types.has('SG')) {
      items.push({ category: 'sdsg', key: 'SG', label: 'SG', description: '社会的ガイド（径路を支援する力）' });
    }
  }

  if (settings.includeTimeArrow) {
    items.push({ category: 'timeArrow', key: 'timeArrow', label: '非可逆的時間', description: '時間軸の方向' });
  }

  return items;
}
