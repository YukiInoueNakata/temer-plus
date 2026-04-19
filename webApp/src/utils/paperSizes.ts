// ============================================================================
// 用紙サイズの共通定義
// - PaperGuide.size のキーと同一
// - 96 DPI 換算の px と、inch ベースの 2 系統を提供
// ============================================================================

export type PaperSizeKey =
  | 'A4-landscape'
  | 'A4-portrait'
  | 'A3-landscape'
  | 'A3-portrait'
  | '16:9'
  | '4:3'
  | 'custom';

export interface PaperDimPx {
  width: number;
  height: number;
}

// 96 DPI 相当（= 1 inch = 96 px）
// A4 = 210 × 297 mm = 8.27 × 11.69 inch
// A3 = 297 × 420 mm = 11.69 × 16.54 inch
export const PAPER_SIZES_PX: Record<Exclude<PaperSizeKey, 'custom'>, PaperDimPx> = {
  'A4-landscape': { width: 1123, height: 794 },
  'A4-portrait':  { width: 794,  height: 1123 },
  'A3-landscape': { width: 1587, height: 1123 },
  'A3-portrait':  { width: 1123, height: 1587 },
  '16:9':         { width: 1280, height: 720 },
  '4:3':          { width: 1024, height: 768 },
};

export const PAPER_SIZES_INCH: Record<Exclude<PaperSizeKey, 'custom'>, PaperDimPx> = {
  'A4-landscape': { width: 11.693, height: 8.268 },
  'A4-portrait':  { width: 8.268,  height: 11.693 },
  'A3-landscape': { width: 16.535, height: 11.693 },
  'A3-portrait':  { width: 11.693, height: 16.535 },
  '16:9':         { width: 13.333, height: 7.5 },
  '4:3':          { width: 10.667, height: 8.0 },
};

export const PAPER_LABELS: Record<Exclude<PaperSizeKey, 'custom'>, string> = {
  'A4-landscape': 'A4 横',
  'A4-portrait':  'A4 縦',
  'A3-landscape': 'A3 横',
  'A3-portrait':  'A3 縦',
  '16:9':         '16:9 スライド',
  '4:3':          '4:3 スライド',
};

export function getPaperPx(size: PaperSizeKey, customW?: number, customH?: number): PaperDimPx {
  if (size === 'custom') {
    return { width: customW ?? 1280, height: customH ?? 720 };
  }
  return PAPER_SIZES_PX[size];
}

export function getPaperInch(size: PaperSizeKey, customW?: number, customH?: number): PaperDimPx {
  if (size === 'custom') {
    const w = customW ?? 1280;
    const h = customH ?? 720;
    return { width: w / 96, height: h / 96 };
  }
  return PAPER_SIZES_INCH[size];
}

export const PAPER_SIZE_OPTIONS: { value: Exclude<PaperSizeKey, 'custom'>; label: string }[] = [
  { value: 'A4-landscape', label: 'A4 横' },
  { value: 'A4-portrait',  label: 'A4 縦' },
  { value: 'A3-landscape', label: 'A3 横' },
  { value: 'A3-portrait',  label: 'A3 縦' },
  { value: '16:9',         label: '16:9 スライド（13.33×7.5 in）' },
  { value: '4:3',          label: '4:3 スライド（10.67×8.0 in）' },
];
