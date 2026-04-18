// ============================================================================
// Default values and factory functions
// ============================================================================

import type {
  ProjectSettings,
  Sheet,
  TEMDocument,
  ViewState,
  Box,
  Line,
} from '../types';

export const DEFAULT_SETTINGS: ProjectSettings = {
  layout: 'horizontal',
  locale: 'ja',
  gridSize: 10,
  snap: {
    alignGuides: true,
    distanceSnap: true,
    distancePx: 20,
    gridSnap: false,
    gridPx: 10,
  },
  showLegend: true,
  legendPosition: 'right',
  timelineLabel: { ja: '非可逆的時間', en: 'Irreversible time' },
  timelineAutoInsert: true,
  defaultFont: 'system-ui',
  defaultFontSize: 13,
  defaultBoxSize: { width: 100, height: 50 },
  defaultAutoFitText: true,
  defaultAutoFitBox: false,
  paperGuides: [
    { enabled: false, size: 'A4-landscape', color: '#ff6b6b' },
  ],
  uiFontSize: 13,
  timeArrow: {
    autoInsert: true,
    alwaysVisible: true,
    timeStartExtension: -1,
    timeEndExtension: 1,
    itemReference: 'min',
    itemOffset: -2,
    label: '非可逆的時間',
    strokeWidth: 2.5,
    fontSize: 14,
  },
  legend: {
    autoGenerate: true,
    alwaysVisible: true,
    includeInExport: true,
    position: { x: 0, y: 0 },
    includeBoxes: true,
    includeLines: true,
    includeSDSG: true,
    includeTimeArrow: true,
    title: '凡例',
    fontSize: 11,
    minWidth: 200,
  },
};

export const DEFAULT_VIEW_STATE: ViewState = {
  zoom: 1,
  panX: 0,
  panY: 0,
  showGrid: true,
  showPaperGuides: false,
  showLegend: true,
  showComments: true,
  showBoxIds: true,
  dataSheetVisible: false,
  propertyPanelVisible: true,
  snapEnabled: true,
  commentMode: false,
  canvasMode: 'move',
  dataSheetWidth: 360,
};

// 1 level = 100px（ユーザ要望で統一）
export const LEVEL_PX = 100;
export const MINOR_TICK_PX = 10;

// Available fonts (bundled system fonts)
export const FONT_OPTIONS: { value: string; label: string }[] = [
  { value: 'system-ui', label: 'システム標準' },
  { value: '"Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif', label: 'ヒラギノ角ゴ / 游ゴシック' },
  { value: '"Yu Mincho", "Hiragino Mincho Pro", "Yu Mincho Light", serif', label: '游明朝 / ヒラギノ明朝' },
  { value: '"Meiryo", "メイリオ", sans-serif', label: 'メイリオ' },
  { value: '"Noto Sans JP", sans-serif', label: 'Noto Sans JP' },
  { value: '"Noto Serif JP", serif', label: 'Noto Serif JP' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: '"Times New Roman", serif', label: 'Times New Roman' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Courier New", monospace', label: 'Courier New' },
];

// ----------------------------------------------------------------------------
// ID generators
// ----------------------------------------------------------------------------

const genId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

// 旧ExcelマクロのID命名規則に準拠した prefix
// dic_fig_type に対応: Type → Prefix
export const ID_PREFIXES: Record<string, string> = {
  'normal':      'Item',
  'BFP':         'BFP',
  'EFP':         'EFP',
  'P-EFP':       'P_EFP',
  'OPP':         'OPP',
  'annotation':  'Latent',  // 潜在経験
  '2nd-EFP':     'EFP2',
  'P-2nd-EFP':   'P_EFP2',
};

// 種別別に連番を付けたIDを生成（Excel マクロ準拠）
// 既存IDから最大値を見つけて +1
export function genBoxIdByType(type: string, existingIds: string[]): string {
  const prefix = ID_PREFIXES[type] ?? 'Item';
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  let maxNum = 0;
  for (const id of existingIds) {
    const m = id.match(pattern);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return `${prefix}${maxNum + 1}`;
}

export const genBoxId = () => genId('Box');  // fallback (random) - 使用しない方針
export const genLineId = () => genId('L');
export const genSDSGId = () => genId('SG');
export const genAnnotationId = () => genId('Ann');
export const genCommentId = () => genId('C');
export const genPeriodId = () => genId('P');
export const genSheetId = () => genId('Sheet');
export const genParticipantId = () => genId('Part');

// ----------------------------------------------------------------------------
// Factories
// ----------------------------------------------------------------------------

export function createEmptySheet(name: string, order: number): Sheet {
  return {
    id: genSheetId(),
    name,
    type: 'individual',
    order,
    boxes: [],
    lines: [],
    sdsg: [],
    annotations: [],
    comments: [],
    periodLabels: [],
  };
}

export function createSampleSheet(name: string, order: number): Sheet {
  const sheet = createEmptySheet(name, order);
  // 1 level = 100px。横型レイアウト・縦書きBox = 縦長(60×100)が既定
  const boxes: Box[] = [
    { id: 'Item1', type: 'normal', label: '出発点',       x: 100, y: 200, width: 60,  height: 100, textOrientation: 'vertical' },
    { id: 'BFP1',  type: 'BFP',    label: '分岐点',       x: 300, y: 200, width: 60,  height: 100, textOrientation: 'vertical' },
    { id: 'OPP1',  type: 'OPP',    label: '必須通過点',   x: 500, y: 200, width: 60,  height: 120, textOrientation: 'vertical' },
    { id: 'EFP1',  type: 'EFP',    label: '等至点',       x: 700, y: 100, width: 70,  height: 120, textOrientation: 'vertical' },
    { id: 'P_EFP1',type: 'P-EFP',  label: '両極化等至点', x: 700, y: 300, width: 70,  height: 120, textOrientation: 'vertical' },
  ];
  const lines: Line[] = [
    {
      id: 'L1', type: 'RLine', from: 'Item1', to: 'Item2',
      connectionMode: 'center-to-center', shape: 'straight',
    },
    {
      id: 'L2', type: 'RLine', from: 'Item2', to: 'Item3',
      connectionMode: 'center-to-center', shape: 'straight',
    },
    {
      id: 'L3', type: 'RLine', from: 'Item3', to: 'Item4',
      connectionMode: 'center-to-center', shape: 'straight',
    },
    {
      id: 'L4', type: 'XLine', from: 'Item3', to: 'Item5',
      connectionMode: 'center-to-center', shape: 'straight',
    },
  ];
  sheet.boxes = boxes;
  sheet.lines = lines;
  return sheet;
}

export function createEmptyDocument(): TEMDocument {
  const sheet = createEmptySheet('Sheet 1', 0);
  return {
    version: '0.3',
    sheets: [sheet],
    activeSheetId: sheet.id,
    participants: [],
    settings: DEFAULT_SETTINGS,
    metadata: {
      title: 'Untitled TEM',
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    },
    history: [],
  };
}

export function createSampleDocument(): TEMDocument {
  const sheet = createSampleSheet('参加者A', 0);
  return {
    version: '0.3',
    sheets: [sheet],
    activeSheetId: sheet.id,
    participants: [
      { id: genParticipantId(), pseudonym: 'A' },
    ],
    settings: DEFAULT_SETTINGS,
    metadata: {
      title: 'Sample TEM',
      author: '中田友貴',
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    },
    history: [],
  };
}

// ----------------------------------------------------------------------------
// Literature-standard rendering specs per Box type
// ----------------------------------------------------------------------------

export interface BoxRenderSpec {
  borderStyle: 'solid' | 'double' | 'dashed' | 'dotted';
  borderWidth: number;
  defaultShape: 'rect' | 'ellipse';
}

export const BOX_RENDER_SPECS: Record<string, BoxRenderSpec> = {
  // 文献標準準拠（Arakawa 2012、Kawai 2016 など）
  normal:       { borderStyle: 'solid',  borderWidth: 1.5, defaultShape: 'rect' },
  BFP:          { borderStyle: 'solid',  borderWidth: 2.0, defaultShape: 'rect' },  // 通常より少し太い
  EFP:          { borderStyle: 'double', borderWidth: 3.0, defaultShape: 'rect' },
  'P-EFP':      { borderStyle: 'dashed', borderWidth: 1.5, defaultShape: 'rect' },
  OPP:          { borderStyle: 'solid',  borderWidth: 3.0, defaultShape: 'rect' },
  annotation:   { borderStyle: 'dashed', borderWidth: 1.0, defaultShape: 'rect' },  // 潜在経験: 細めの点線
  '2nd-EFP':    { borderStyle: 'double', borderWidth: 3.0, defaultShape: 'rect' },
  'P-2nd-EFP':  { borderStyle: 'dashed', borderWidth: 1.5, defaultShape: 'rect' },
};

export const BOX_TYPE_LABELS: Record<string, { ja: string; en: string; shortJa?: string }> = {
  normal:      { ja: '通常',               en: 'Normal', shortJa: '通常' },
  BFP:         { ja: '分岐点',             en: 'BFP',    shortJa: 'BFP' },
  EFP:         { ja: '等至点',             en: 'EFP',    shortJa: 'EFP' },
  'P-EFP':     { ja: '両極化等至点',       en: 'P-EFP',  shortJa: 'P-EFP' },
  OPP:         { ja: '必須通過点',         en: 'OPP',    shortJa: 'OPP' },
  annotation:  { ja: '潜在経験',           en: 'Latent', shortJa: '潜在' },
  '2nd-EFP':   { ja: '第二等至点',         en: '2nd EFP', shortJa: '2nd EFP' },
  'P-2nd-EFP': { ja: '両極化第二等至点',   en: 'P-2nd EFP', shortJa: 'P-2nd' },
};

// Exported for testing / other consumers
export { genId };
