// ============================================================================
// Box種別の表示計算（自動連番・オーディナル）
// ============================================================================

import type { Box, BoxType, LayoutDirection } from '../types';
import { BOX_TYPE_LABELS } from '../store/defaults';

function toOrdinalEn(n: number): string {
  if (n < 1) return '';
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  const suffixes: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };
  return `${n}${suffixes[n % 10] ?? 'th'}`;
}

/**
 * Box の表示用タグ文字列を計算する
 * - 通常: 種別名（例: EFP, OPP）
 * - 複数ある場合:
 *   - EFP, P-EFP: "EFP" (1st), "2nd EFP", "3rd EFP"... (英語オーディナル)
 *   - OPP, BFP: "OPP-1", "OPP-2"... (ハイフン番号)
 *   - annotation: "潜在-1", "潜在-2"...
 *   - normal: 連番なし（ID で識別）
 *
 * 同種別は時間軸順で並べる
 */
export function computeBoxDisplay(
  allBoxes: Box[],
  currentBox: Box,
  layout: LayoutDirection,
): string {
  const type = currentBox.type;
  const shortName = BOX_TYPE_LABELS[type]?.shortJa ?? type;

  // normal は表示なし
  if (type === 'normal') return '';

  // 同種別の Box を時間軸順でソート
  const sameType = allBoxes
    .filter((b) => b.type === type)
    .sort((a, b) => {
      const aT = layout === 'horizontal' ? a.x : a.y;
      const bT = layout === 'horizontal' ? b.x : b.y;
      return aT - bT;
    });

  if (sameType.length <= 1) return shortName;

  const index = sameType.findIndex((b) => b.id === currentBox.id) + 1;
  if (index <= 0) return shortName;

  // EFP / P-EFP: 英語オーディナル
  if (type === 'EFP' || type === 'P-EFP') {
    if (index === 1) return shortName;
    return `${toOrdinalEn(index)} ${shortName}`;
  }

  // その他: ハイフン番号
  return `${shortName}-${index}`;
}

/**
 * Box の ID 採番用の「論理番号」を時間軸順で返す
 * （ID 生成時の次番号計算に使う参考情報）
 */
export function computeOrdinalNumber(
  allBoxes: Box[],
  currentBox: Box,
  layout: LayoutDirection,
): number {
  const sameType = allBoxes
    .filter((b) => b.type === currentBox.type)
    .sort((a, b) => {
      const aT = layout === 'horizontal' ? a.x : a.y;
      const bT = layout === 'horizontal' ? b.x : b.y;
      return aT - bT;
    });
  return sameType.findIndex((b) => b.id === currentBox.id) + 1;
}

// 再 export for convenience
export { toOrdinalEn };

/**
 * BoxType を受け取り、UI で選択可能な型のリスト（通常/BFP/EFP/P-EFP/OPP/潜在経験）
 * 2nd-EFP / P-2nd-EFP は内部のみ（EFP/P-EFP + オーディナルで代替）
 */
export const SELECTABLE_BOX_TYPES: BoxType[] = [
  'normal',
  'BFP',
  'EFP',
  'P-EFP',
  'OPP',
  'annotation',
];
