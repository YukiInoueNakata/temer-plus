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
  SDSG,
  PeriodLabel,
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
  defaultBoxSize: { width: 60, height: 100 },
  defaultAutoFitText: false,
  defaultAutoFitBox: false,
  defaultAutoFitBoxMode: 'width-fixed',
  paperGuides: [
    { enabled: false, size: 'A4-landscape', baseSize: 'A4', color: '#000000', pageCount: 2, maskOutside: true },
  ],
  uiFontSize: 13,
  ribbonFontSize: 12,
  levelStep: 0.5,
  timeArrow: {
    autoInsert: true,
    alwaysVisible: true,
    timeStartExtension: -0.5,
    timeEndExtension: 0.5,
    // 既定: 下部（min Item_Level 基準、offset=0 でちょうどその位置）
    itemReference: 'min',
    itemOffset: 0,
    label: '非可逆的時間',
    strokeWidth: 2.5,
    fontSize: 14,
    labelSideHorizontal: 'bottom',
    labelSideVertical: 'left',
    labelBold: false,
    labelItalic: false,
    labelUnderline: false,
    labelOffset: 4,
    labelAlignHorizontal: 'center',
    labelAlignVertical: 'center',
  },
  legend: {
    autoGenerate: true,
    alwaysVisible: true,
    includeInExport: true,
    // 横型で IL=-5 / TL=0 が左上端になる位置（storage 座標: x=0, y=500）
    position: { x: 0, y: 500 },
    includeBoxes: true,
    includeLines: true,
    includeSDSG: true,
    includeTimeArrow: false,
    title: '凡例',
    fontSize: 11,
    minWidth: 200,
    showDescriptions: false,
    columns: 1,
    columnsHorizontal: 1,
    columnsVertical: 1,
    showTitle: true,
    titleBold: true,
    titleItalic: false,
    titleUnderline: false,
    titleAlign: 'left',
    titlePosition: 'top',
    titleWritingMode: 'horizontal',
    titleVerticalAlign: 'top',
    backgroundStyle: 'white',
    borderWidth: 1,
    borderColor: '#999',
    sampleWidth: 32,
    sampleHeight: 18,
    titleSeparatorVisible: true,
    titleSeparatorColor: '#dddddd',
    itemOverrides: {},
  },
  periodLabels: {
    alwaysVisible: true,
    includeInExport: true,
    itemReference: 'max',
    itemOffset: 0,
    fontSize: 13,
    showDividers: true,
    dividerStrokeWidth: 1,
    bandStyle: 'band',
    labelSideHorizontal: 'top',
    labelSideVertical: 'right',
  },
  typeLabelVisibility: {
    BFP: true,
    EFP: true,
    'P-EFP': true,
    OPP: true,
    '2nd-EFP': true,
    'P-2nd-EFP': true,
    SD: true,
    SG: true,
  },
  sdsgSpace: {
    enabled: false,
    bands: {
      top: {
        enabled: true,
        heightMode: 'auto',
        heightLevel: 1.5,
        reference: 'boxes',       // Box 群の外側を既定（時期区分/時間矢印は別途選択可）
        offsetLevel: 0.2,
        showBorder: true,
        borderColor: '#9b59b6',
        fillStyle: 'tinted',
        labelPosition: 'top-left',
        shrinkToFitRow: false,
        autoExpandHeight: false,
      },
      bottom: {
        enabled: true,
        heightMode: 'auto',
        heightLevel: 1.5,
        reference: 'boxes',       // Box 群の外側を既定
        offsetLevel: 0.2,
        showBorder: true,
        borderColor: '#27ae60',
        fillStyle: 'tinted',
        labelPosition: 'top-left',
        shrinkToFitRow: false,
        autoExpandHeight: false,
      },
    },
    autoPlaceSD: 'top',
    autoPlaceSG: 'bottom',
    allowMismatchedPlacement: false,
    autoArrange: true,
    autoFlipDirectionInBand: false,
  },
};

// snapEnabled は localStorage に保存してプロジェクト跨ぎでユーザ好みを維持
const SNAP_ENABLED_KEY = 'temer:snapEnabled';
function readSnapEnabled(): boolean {
  try {
    const v = localStorage.getItem(SNAP_ENABLED_KEY);
    if (v === null) return true;
    return v === '1';
  } catch { return true; }
}
export function writeSnapEnabled(on: boolean): void {
  try { localStorage.setItem(SNAP_ENABLED_KEY, on ? '1' : '0'); } catch { /* noop */ }
}

export const DEFAULT_VIEW_STATE: ViewState = {
  zoom: 1,
  panX: 0,
  panY: 0,
  showGrid: true,
  showPaperGuides: false,
  showLegend: true,
  showComments: true,
  showBoxIds: true,
  showTopRuler: true,
  showLeftRuler: true,
  dataSheetVisible: false,
  propertyPanelVisible: true,
  snapEnabled: readSnapEnabled(),
  commentMode: false,
  canvasMode: 'move',
  dataSheetWidth: 360,
  propertyPanelWidth: 300,
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
    notes: [],
    comments: [],
    periodLabels: [],
  };
}

export function createSampleSheet(name: string, order: number): Sheet {
  const sheet = createEmptySheet(name, order);
  // 標準構成:
  //   Item1(出発点) → OPP1(必須通過点) → BFP1(分岐点) → EFP1(等至点) / P_EFP1(両極化等至点)
  //   SD / SG は BFP1 に紐づけ
  //   時期1 = 出発点〜等至点、時期2 = 等至点以降
  const boxes: Box[] = [
    { id: 'Item1',  type: 'normal', label: '出発点',       x: 100, y: 200, width: 60, height: 100, textOrientation: 'vertical' },
    { id: 'OPP1',   type: 'OPP',    label: '必須通過点',   x: 300, y: 200, width: 60, height: 120, textOrientation: 'vertical' },
    { id: 'BFP1',   type: 'BFP',    label: '分岐点',       x: 500, y: 200, width: 60, height: 100, textOrientation: 'vertical' },
    { id: 'EFP1',   type: 'EFP',    label: '等至点',       x: 700, y: 100, width: 70, height: 120, textOrientation: 'vertical' },
    { id: 'P_EFP1', type: 'P-EFP',  label: '両極化等至点', x: 700, y: 300, width: 70, height: 120, textOrientation: 'vertical' },
  ];
  const lines: Line[] = [
    { id: 'RL_1', type: 'RLine', from: 'Item1', to: 'OPP1',   connectionMode: 'center-to-center', shape: 'straight' },
    { id: 'RL_2', type: 'RLine', from: 'OPP1',  to: 'BFP1',   connectionMode: 'center-to-center', shape: 'straight' },
    { id: 'RL_3', type: 'RLine', from: 'BFP1',  to: 'EFP1',   connectionMode: 'center-to-center', shape: 'straight' },
    { id: 'XL_1', type: 'XLine', from: 'BFP1',  to: 'P_EFP1', connectionMode: 'center-to-center', shape: 'straight' },
  ];
  // SD / SG を分岐点(BFP1) に配置。既定サイズ 70x40
  const sdsg: SDSG[] = [
    { id: 'SD1', type: 'SD', label: 'SD', attachedTo: 'BFP1', itemOffset: -120, timeOffset: 0, width: 70, height: 40 },
    { id: 'SG1', type: 'SG', label: 'SG', attachedTo: 'BFP1', itemOffset: 130,  timeOffset: 0, width: 70, height: 40 },
  ];
  // 時期ラベル: 時期1 (出発点〜等至点中央あたり)、時期2 (等至点以降)
  // Item 左端 x=100 → timeLevel=1, EFP x=700 → timeLevel=7
  // 中央 ≒ timeLevel=4（時期1）、timeLevel=7.5（時期2）
  const periodLabels: PeriodLabel[] = [
    { id: genPeriodId(), position: 4,   label: '時期1' },
    { id: genPeriodId(), position: 7.5, label: '時期2' },
  ];
  sheet.boxes = boxes;
  sheet.lines = lines;
  sheet.sdsg = sdsg;
  sheet.periodLabels = periodLabels;
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
  // P-EFP: 二重+点線（CSS単体では表現不可なので BoxNode で2重枠を特別描画）
  'P-EFP':      { borderStyle: 'dashed', borderWidth: 2.5, defaultShape: 'rect' },
  OPP:          { borderStyle: 'solid',  borderWidth: 3.0, defaultShape: 'rect' },
  annotation:   { borderStyle: 'dashed', borderWidth: 1.0, defaultShape: 'rect' },  // 潜在経験: 細めの点線
  '2nd-EFP':    { borderStyle: 'double', borderWidth: 3.0, defaultShape: 'rect' },
  'P-2nd-EFP':  { borderStyle: 'dashed', borderWidth: 2.5, defaultShape: 'rect' },
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
