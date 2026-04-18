// ============================================================================
// TEMer Plus - Data Model
// SPEC.md 準拠: 複数シート、文献標準の記号体系、メタデータ、編集履歴
// ============================================================================

export type BoxType =
  | 'normal'
  | 'BFP'
  | 'EFP'
  | 'P-EFP'
  | 'OPP'
  | 'annotation'
  | '2nd-EFP'
  | 'P-2nd-EFP';

export type BoxShape = 'rect' | 'ellipse';

export type LineType = 'RLine' | 'XLine';
export type LineConnectionMode = 'center-to-center' | 'horizontal';
export type LineShape = 'straight' | 'curve';

export type TextOrientation = 'horizontal' | 'vertical';

export type SDSGType = 'SD' | 'SG';

export type SheetType = 'individual' | 'integrated';

export type LayoutDirection = 'horizontal' | 'vertical';

export type Locale = 'ja' | 'en';

// ----------------------------------------------------------------------------
// 図形要素
// ----------------------------------------------------------------------------

export type TextAlign = 'left' | 'center' | 'right';
export type VerticalAlign = 'top' | 'middle' | 'bottom';

export interface BoxStyle {
  fontSize?: number;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  textAlign?: TextAlign;
  verticalAlign?: VerticalAlign;
}

export interface Box {
  id: string;
  type: BoxType;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: BoxShape;                   // 既定: 'rect'（BFPで 'ellipse' 選択可）
  textOrientation?: TextOrientation;  // 既定: 'horizontal'
  autoFitText?: boolean;               // 文字サイズ自動調整
  autoFitBox?: boolean;                // Box サイズ自動調整（テキストに合わせ）
  style?: BoxStyle;
  number?: number;                     // OPP-1, BFP-2 等
  participantId?: string;              // 統合図用
  typeCategory?: string;               // 類型用
  description?: string;                // 論文用詳細説明
  noDescriptionNeeded?: boolean;       // 説明不要フラグ
  zIndex?: number;                     // 重なり順

  // サブラベル（協力者ID 等）。box外に表示
  // - 横型: box下部、縦型: box右辺（既定）
  // - オフセットで位置調整可
  subLabel?: string;
  subLabelOffsetX?: number;            // デフォルト 0
  subLabelOffsetY?: number;            // デフォルト 0
  subLabelFontSize?: number;           // デフォルト 10

  // IDバッジ（Box外、横型=上辺中央、縦型=左辺中央）
  idOffsetX?: number;                  // デフォルト 0
  idOffsetY?: number;                  // デフォルト 0
  idFontSize?: number;                 // デフォルト 10
}

export interface LineStyle {
  strokeWidth?: number;
  color?: string;
}

export interface Line {
  id: string;
  type: LineType;
  from: string;                        // Box ID
  to: string;                          // Box ID
  connectionMode: LineConnectionMode;  // 既定: center-to-center
  horizontalY?: number;                // horizontal モードの接続Y
  shape: LineShape;                    // 既定: straight
  controlPoints?: { x: number; y: number }[];  // curve の Bezier 制御点
  label?: string;
  style?: LineStyle;
  description?: string;
  noDescriptionNeeded?: boolean;
  zIndex?: number;
}

export interface SDSG {
  id: string;
  type: SDSGType;
  label: string;
  attachedTo: string;                  // Box or Line ID
  itemOffset: number;
  timeOffset: number;
  width?: number;
  height?: number;
  style?: BoxStyle;
  description?: string;
  noDescriptionNeeded?: boolean;
  zIndex?: number;
}

export interface Annotation {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  style?: 'callout' | 'note';
  zIndex?: number;
}

export interface PeriodLabel {
  id: string;
  position: number;                    // time axis position
  label: string;
}

export interface Comment {
  id: string;
  targetId: string;                    // Box or Line ID
  text: string;
  author?: string;
  createdAt: string;                   // ISO 8601
  resolved: boolean;
  replies?: CommentReply[];
}

export interface CommentReply {
  id: string;
  text: string;
  author?: string;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// シート
// ----------------------------------------------------------------------------

export interface Sheet {
  id: string;
  name: string;
  type: SheetType;
  order: number;
  participantId?: string;
  boxes: Box[];
  lines: Line[];
  sdsg: SDSG[];
  annotations: Annotation[];
  comments: Comment[];
  periodLabels: PeriodLabel[];
}

// ----------------------------------------------------------------------------
// メタデータ（論文報告用）
// ----------------------------------------------------------------------------

export interface NotationSystem {
  base: 'Arakawa2012' | 'custom' | 'other';
  customDescription?: string;
}

export interface ParticipantsInfo {
  count: number;
  description: string;
  hsiDescription: string;
  pseudonyms?: string[];
}

export interface InterviewInfo {
  method: string;
  durationDescription: string;
  timesCount: number;
  analysisCombination?: string;
  notes?: string;
}

export interface VisualConventionEntry {
  hasMeaning: boolean;
  description?: string;
}

export interface VisualConventions {
  horizontalLength?: VisualConventionEntry;
  arrowAngle?: VisualConventionEntry;
  verticalPosition?: VisualConventionEntry;
  colors?: VisualConventionEntry;
  lineWeight?: VisualConventionEntry;
  other?: Array<{ aspect: string; description: string }>;
}

export interface Participant {
  id: string;
  pseudonym: string;
  age?: string;
  gender?: string;
  occupation?: string;
  interviewDate?: string;
  color?: string;                      // 統合図での識別色
  notes?: string;
  typeCategory?: string;
}

// ----------------------------------------------------------------------------
// プロジェクト設定
// ----------------------------------------------------------------------------

export interface PaperGuide {
  enabled: boolean;
  size: 'A4-landscape' | 'A4-portrait' | 'A3-landscape' | 'A3-portrait' | '16:9' | '4:3' | 'custom';
  customWidth?: number;
  customHeight?: number;
  color?: string;
}

export interface SnapSettings {
  alignGuides: boolean;
  distanceSnap: boolean;
  distancePx: number;
  gridSnap: boolean;
  gridPx: number;
}

export interface TimeArrowSettings {
  autoInsert: boolean;                 // エクスポート時に自動挿入するか（＋キャンバス表示）
  alwaysVisible: boolean;              // 編集中も常時表示
  timeStartExtension: number;          // minTimeLevel からの開始オフセット（既定 -1）
  timeEndExtension: number;            // maxTimeLevel からの終了オフセット（既定 +1）
  itemReference: 'min' | 'max';        // 基準: 最小 or 最大 Item_Level（既定 'min'）
  itemOffset: number;                  // 基準からのオフセット（既定 -2, 'min'で負=上へ, 'max'で正=下へ）
  label: string;                       // 矢印ラベル（既定: 非可逆的時間）
  strokeWidth: number;                 // 線の太さ（既定 2.5）
  fontSize: number;                    // ラベルフォントサイズ（既定 14）
}

export interface ProjectSettings {
  layout: LayoutDirection;
  locale: Locale;
  gridSize: number;
  snap: SnapSettings;
  showLegend: boolean;
  legendPosition: 'right' | 'bottom' | 'external';
  timelineLabel: { ja: string; en: string };
  timelineAutoInsert: boolean;
  defaultFont: string;
  defaultFontSize: number;
  defaultBoxSize: { width: number; height: number };
  defaultAutoFitText: boolean;
  defaultAutoFitBox: boolean;
  paperGuides: PaperGuide[];
  uiFontSize: number;                  // UI全体のフォントサイズ（px）
  timeArrow: TimeArrowSettings;
}

// ----------------------------------------------------------------------------
// 編集履歴
// ----------------------------------------------------------------------------

export interface HistoryEntry {
  timestamp: string;                   // ISO 8601
  action: string;                      // "add-box", "delete-line", "edit-label", etc.
  sheetId?: string;
  details?: string;
}

// ----------------------------------------------------------------------------
// 外部リソース
// ----------------------------------------------------------------------------

export interface Resources {
  images?: Record<string, string>;     // id -> base64 data URL
  transcripts?: Record<string, string>; // id -> plain text
}

// ----------------------------------------------------------------------------
// ドキュメント全体
// ----------------------------------------------------------------------------

export interface TEMDocument {
  version: '0.3';
  sheets: Sheet[];
  activeSheetId: string;
  participants: Participant[];
  settings: ProjectSettings;
  metadata: {
    title: string;
    author?: string;
    createdAt: string;
    modifiedAt: string;
    description?: string;
    notationSystem?: NotationSystem;
    participantsInfo?: ParticipantsInfo;
    interview?: InterviewInfo;
    visualConventions?: VisualConventions;
    reportNotes?: string;
  };
  history: HistoryEntry[];             // 最新50件
  resources?: Resources;
}

// ----------------------------------------------------------------------------
// 編集セッション（メモリ上のみ、ファイルに保存しない）
// ----------------------------------------------------------------------------

export interface Selection {
  sheetId: string;
  boxIds: string[];
  lineIds: string[];
  sdsgIds: string[];
  annotationIds: string[];
}

export type CanvasMode = 'move' | 'select';

export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
  showGrid: boolean;
  showPaperGuides: boolean;
  showLegend: boolean;
  showComments: boolean;
  showBoxIds: boolean;                 // Box上のIDバッジ表示切替
  dataSheetVisible: boolean;
  propertyPanelVisible: boolean;
  snapEnabled: boolean;
  commentMode: boolean;
  canvasMode: CanvasMode;
  dataSheetWidth: number;
}
