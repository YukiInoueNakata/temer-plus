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

// Box の自動拡張モード
export type AutoFitBoxMode = 'none' | 'width-fixed' | 'height-fixed';

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
  autoFitText?: boolean;               // 文字サイズを Box に収まるよう自動縮小
  autoFitBox?: boolean;                // 互換用（true = fit-content 的動作）
  // Box 自動拡張モード:
  //   'none': 自動拡張しない（既存サイズ固定）
  //   'width-fixed': 横幅固定、ラベルが収まらないとき高さを増やす
  //   'height-fixed': 高さ固定、ラベルが収まらないとき横幅を増やす
  autoFitBoxMode?: AutoFitBoxMode;
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

  // タイプラベル（種別バッジ）個別スタイル
  typeLabelFontSize?: number;
  typeLabelBold?: boolean;
  typeLabelItalic?: boolean;
  typeLabelFontFamily?: string;
  typeLabelAsciiUpright?: boolean;    // タイプラベルの縦書き時ASCII向き（未指定なら asciiUpright に従う）

  // サブラベル個別 ASCII
  subLabelAsciiUpright?: boolean;

  // 縦書き時の半角英数の向き: true=upright(縦積み)、false=mixed(横倒し)
  // 未指定時は true（upright）が既定
  asciiUpright?: boolean;
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
  // 始点・終点からの方向ベクトル沿いオフセット（px）。重なり回避に用いる
  startMargin?: number;
  endMargin?: number;
  // 始点・終点の Time 方向オフセット（px、ユーザ座標）
  startOffsetTime?: number;
  endOffsetTime?: number;
  // 始点・終点の Item 方向オフセット（px、ユーザ座標）
  startOffsetItem?: number;
  endOffsetItem?: number;
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
  // サブラベル（Box と同形式）
  subLabel?: string;
  subLabelOffsetX?: number;
  subLabelOffsetY?: number;
  subLabelFontSize?: number;
  subLabelAsciiUpright?: boolean;
  // タイプラベル（SD / SG バッジ）個別スタイル
  typeLabelFontSize?: number;
  typeLabelBold?: boolean;
  typeLabelItalic?: boolean;
  typeLabelFontFamily?: string;
  typeLabelAsciiUpright?: boolean;
  // 縦書き英数向き（本体テキスト用）
  asciiUpright?: boolean;
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

// 用紙の "size key"（向きを持たない短辺×長辺の論理サイズ）
// 描画時に layout に応じて「横型なら長辺を横、縦型なら長辺を縦」に回転
export type PaperBaseKey = 'A4' | 'A3' | '16:9' | '4:3' | 'custom';

export interface PaperGuide {
  enabled: boolean;
  // 互換: 旧 'A4-landscape' などが保存されていたら読み込み時は 'A4' 等に正規化
  size: 'A4-landscape' | 'A4-portrait' | 'A3-landscape' | 'A3-portrait' | '16:9' | '4:3' | 'custom';
  baseSize?: PaperBaseKey;   // 新しいキー（layout で向きが決まる）
  customWidth?: number;       // px
  customHeight?: number;      // px
  color?: string;
  pageCount?: number;         // 長辺方向に並べる枚数（既定 1）
  maskOutside?: boolean;      // 用紙枠外を薄グレーで mask（既定 true）
}

export interface SnapSettings {
  alignGuides: boolean;
  distanceSnap: boolean;
  distancePx: number;
  gridSnap: boolean;
  gridPx: number;
}

export type PeriodLabelBandStyle = 'tick' | 'band';
export type HorizontalLabelSide = 'top' | 'bottom';
export type VerticalLabelSide = 'left' | 'right';

export interface PeriodLabelSettings {
  alwaysVisible: boolean;              // 編集中の表示
  includeInExport: boolean;            // エクスポートに含める
  itemReference: 'min' | 'max';        // 基準: 既定 'max'
  itemOffset: number;                  // 基準からのオフセット（既定 +2）
  fontSize: number;
  showDividers: boolean;               // 縦（横）の区切り線
  dividerStrokeWidth: number;
  // 描画スタイル:
  //   'tick': 単独ラベル + 短い区切り線（既定、従来）
  //   'band': |---時期1---|---時期2---| 形式の帯
  bandStyle: PeriodLabelBandStyle;
  // ラベル文字の基準線に対する配置
  labelSideHorizontal: HorizontalLabelSide; // 横型レイアウト時（既定 'top'）
  labelSideVertical: VerticalLabelSide;     // 縦型レイアウト時（既定 'right'）
}

export type LegendBackgroundStyle = 'none' | 'white';
export type LegendTitlePosition = 'top' | 'left';
export type LegendTitleAlign = 'left' | 'center' | 'right';
export type LegendTitleWritingMode = 'horizontal' | 'vertical';
export type LegendTitleVerticalAlign = 'top' | 'middle' | 'bottom';

// 項目別のテキスト上書き（ラベル/説明/説明表示）
export interface LegendItemOverride {
  label?: string;
  description?: string;
  showDescription?: boolean;          // 未指定時は全体設定 showDescriptions に従う
}

export interface LegendSettings {
  autoGenerate: boolean;              // シートから使用記号を自動抽出
  alwaysVisible: boolean;             // 編集中も表示（エクスポートは別制御）
  includeInExport: boolean;           // エクスポート時に含める
  position: { x: number; y: number }; // 世界座標、ドラッグで移動可
  includeBoxes: boolean;
  includeLines: boolean;
  includeSDSG: boolean;
  includeTimeArrow: boolean;
  title: string;
  fontSize: number;
  minWidth: number;
  showDescriptions: boolean;          // 各項目の説明文を表示（既定 true）
  columns: number;                    // 後方互換用（未使用）、新規は columnsHorizontal/Vertical 参照
  columnsHorizontal: number;          // 横型レイアウト時の列数（既定 1）
  columnsVertical: number;            // 縦型レイアウト時の列数（既定 1）
  fontFamily?: string;                // 項目本文のフォント
  showTitle: boolean;                 // タイトルバーを表示
  // タイトルのスタイル
  titleFontSize?: number;             // 未指定時は fontSize * 1.15
  titleFontFamily?: string;           // 未指定時は fontFamily に従う
  titleBold?: boolean;                // 既定 true
  titleItalic?: boolean;              // 既定 false
  titleUnderline?: boolean;           // 既定 false
  titleAlign: LegendTitleAlign;       // 水平揃え（既定 left）
  titlePosition: LegendTitlePosition; // 上部 or 右側（既定 top）
  titleWritingMode: LegendTitleWritingMode; // 縦書き / 横書き（既定 horizontal）
  titleVerticalAlign: LegendTitleVerticalAlign; // 右側配置時の上下揃え（既定 top）
  // 背景・枠線
  backgroundStyle: LegendBackgroundStyle;   // 'white' | 'none'（既定 white）
  borderWidth: number;                      // 0 = 枠線なし（既定 1）
  borderColor?: string;                     // 既定 '#999'
  // サンプル図形サイズ（px 単位、zoom=1 の表示基準）
  sampleWidth: number;                      // 既定 32
  sampleHeight: number;                     // 既定 18
  // 項目別上書き（キーは `${category}:${key}` 例: `box:EFP`, `line:RLine`）
  itemOverrides?: Record<string, LegendItemOverride>;
}

// 矢印線方向のラベル位置: 横型は center / end(右寄り), 縦型は center / start(上寄り)
export type TimeArrowLabelAlignHorizontal = 'center' | 'end';
export type TimeArrowLabelAlignVertical = 'center' | 'start';

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
  // ラベル文字の矢印線に対する配置
  labelSideHorizontal: HorizontalLabelSide; // 横型レイアウト時（既定 'bottom'）
  labelSideVertical: VerticalLabelSide;     // 縦型レイアウト時（既定 'left'）
  // ラベルの装飾・フォント
  labelFontFamily?: string;
  labelBold?: boolean;
  labelItalic?: boolean;
  labelUnderline?: boolean;
  // 矢印からのオフセット（px）
  labelOffset: number;                 // 既定 4
  // 矢印線方向の揃え
  labelAlignHorizontal: TimeArrowLabelAlignHorizontal; // 既定 'center'
  labelAlignVertical: TimeArrowLabelAlignVertical;     // 既定 'center'
}

// 各 Box 種別 / SD・SG のタイプラベル表示フラグ
export type TypeLabelVisibilityKey =
  | 'BFP' | 'EFP' | 'P-EFP' | 'OPP'
  | '2nd-EFP' | 'P-2nd-EFP'
  | 'SD' | 'SG';

export type TypeLabelVisibilityMap = Record<TypeLabelVisibilityKey, boolean>;

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
  // 全体既定の自動拡張モード（Box 個別設定が無いとき参照される）
  defaultAutoFitBoxMode: AutoFitBoxMode;
  paperGuides: PaperGuide[];
  uiFontSize: number;                  // UI全体のフォントサイズ（px）
  levelStep: number;                   // プロパティのLevel調整刻み（既定 0.5）
  timeArrow: TimeArrowSettings;
  legend: LegendSettings;
  periodLabels: PeriodLabelSettings;
  // タイプラベル（種別バッジ）の表示有無を種別ごとに
  typeLabelVisibility: TypeLabelVisibilityMap;
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
  legendSelected?: boolean;  // 凡例がシングル選択されている
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
  showTopRuler: boolean;               // 上部ルーラー（Time or Item）表示切替
  showLeftRuler: boolean;              // 左部ルーラー（Item or Time）表示切替
  dataSheetVisible: boolean;
  propertyPanelVisible: boolean;
  snapEnabled: boolean;
  commentMode: boolean;
  canvasMode: CanvasMode;
  dataSheetWidth: number;
  propertyPanelWidth: number;
}
