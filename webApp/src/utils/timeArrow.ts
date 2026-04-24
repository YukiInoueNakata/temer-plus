// ============================================================================
// 非可逆的時間矢印の計算
// ============================================================================

import type { Sheet, TimeArrowSettings, LayoutDirection, SDSGSpaceSettings, TypeLabelVisibilityMap } from '../types';
import { LEVEL_PX } from '../store/defaults';
import { computeBandOuterCoord, resolveBandOuterBounds } from './sdsgSpaceLayout';

export interface TimeArrowGeometry {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  labelX: number;
  labelY: number;
  label: string;
  strokeWidth: number;
  fontSize: number;
  layout: LayoutDirection;
  // ラベル配置（描画側の transform 算出に使用）
  labelSide: 'top' | 'bottom' | 'left' | 'right';
}

/**
 * シート内の全要素を囲むバウンディングボックスを元に
 * 非可逆的時間矢印の配置を計算する
 */
export function computeTimeArrow(
  sheet: Sheet,
  layout: LayoutDirection,
  settings: TimeArrowSettings,
  // band 範囲を bbox に含めたいときに sdsgSpace を渡す。
  // sdsgSpaceLayout からの呼び出しでは循環回避のため省略する。
  sdsgSpace?: SDSGSpaceSettings,
  typeLabelVisibility?: TypeLabelVisibilityMap,
): TimeArrowGeometry | null {
  if (sheet.boxes.length === 0) return null;

  // 全Box座標収集
  const xs: number[] = [];
  const ys: number[] = [];
  sheet.boxes.forEach((b) => {
    xs.push(b.x, b.x + b.width);
    ys.push(b.y, b.y + b.height);
  });

  // SDSG座標も含める（位置は attachedTo + offset）
  // band モード SDSG は band 配置に依存し循環のリスクがあるため、band 範囲を
  // 「boxes 基準の最外エッジ」として近似的に xs/ys に追加する（下の sdsgSpace ブロック）。
  sheet.sdsg.forEach((sg) => {
    if (sg.spaceMode === 'band-top' || sg.spaceMode === 'band-bottom') return;
    const attached = sheet.boxes.find((b) => b.id === sg.attachedTo);
    if (!attached) return;
    const isH = layout === 'horizontal';
    const sgX = attached.x + (isH ? (sg.timeOffset ?? 0) : (sg.itemOffset ?? 0));
    const sgY = attached.y + (isH ? (sg.itemOffset ?? 0) : (sg.timeOffset ?? 0));
    const sgW = sg.width ?? 70;
    const sgH = sg.height ?? 40;
    xs.push(sgX, sgX + sgW);
    ys.push(sgY, sgY + sgH);
  });

  // 非可逆的時間は最低 IL 側を基準にするため、最低 IL 方向のみ bbox を拡張する。
  //   横型: 最低 IL = 最大 y 方向（画面下）
  //   縦型: 最低 IL = 最小 x 方向（画面左）
  // 拡張内容:
  //   - 常に LABEL_MARGIN_PX を加算（Box / 付随 SDSG のタイプラベル・サブラベル用）
  //   - SG 帯（band-bottom）に SDSG があれば、heightMode に応じた実際の band 外側エッジを使用
  const LABEL_MARGIN_PX = 30;
  const isHLocal = layout === 'horizontal';
  if (sheet.boxes.length > 0) {
    // 既存 bbox の最低 IL 側 + LABEL_MARGIN（Box / attached SDSG のラベル用）
    if (isHLocal) {
      ys.push(Math.max(...ys) + LABEL_MARGIN_PX);
    } else {
      xs.push(Math.min(...xs) - LABEL_MARGIN_PX);
    }
    // SG 帯の実際の外側エッジ（row 数積み上げを反映した実効位置）
    if (sdsgSpace?.enabled) {
      const sgBand = sdsgSpace.bands.bottom;
      if (sgBand.reference !== 'timearrow') {
        const { bottomOuter } = resolveBandOuterBounds(sheet, layout, sdsgSpace, typeLabelVisibility);
        if (bottomOuter != null) {
          let insetExt = 0;
          sheet.sdsg.forEach((sg) => {
            if (sg.spaceMode !== 'band-bottom') return;
            const inset = sg.spaceInsetItem ?? 0;
            if (inset > insetExt) insetExt = inset;
          });
          const ow = isHLocal ? 1 : -1;
          const finalOuter = bottomOuter + ow * insetExt;
          if (isHLocal) ys.push(finalOuter + LABEL_MARGIN_PX);
          else xs.push(finalOuter - LABEL_MARGIN_PX);
        }
      }
    }
  }
  void computeBandOuterCoord;  // 旧関数は他所で参照される可能性があるため import は残す

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  // time軸と item軸に対応
  const isH = layout === 'horizontal';
  const minTime = isH ? minX : minY;
  const maxTime = isH ? maxX : maxY;

  // レベル換算（time軸は layout によらず素直）
  const minTimeLevel = minTime / LEVEL_PX;
  const maxTimeLevel = maxTime / LEVEL_PX;

  // ユーザ座標系の Item_Level 範囲
  // 横型: Item UP=+ なので最上行(min y) が max_user_IL
  // 縦型: Item RIGHT=+ なので最右列(max x) が max_user_IL
  const userMaxItemLevel = isH ? -minY / LEVEL_PX : maxX / LEVEL_PX;
  const userMinItemLevel = isH ? -maxY / LEVEL_PX : minX / LEVEL_PX;

  const arrowStartTime = (minTimeLevel + settings.timeStartExtension) * LEVEL_PX;
  const arrowEndTime = (maxTimeLevel + settings.timeEndExtension) * LEVEL_PX;
  const refUserIL = settings.itemReference === 'max' ? userMaxItemLevel : userMinItemLevel;
  // itemOffset の +/- を UI 直感に合わせて反転（+ で外側へ / - で内側へ）
  const targetUserIL = refUserIL - settings.itemOffset;
  // ユーザ座標 → ストレージ座標
  const arrowItem = isH ? -targetUserIL * LEVEL_PX : targetUserIL * LEVEL_PX;

  const offset = (settings.labelOffset ?? 4) + settings.fontSize / 2;
  if (layout === 'horizontal') {
    const sideH = settings.labelSideHorizontal ?? 'bottom';
    const alignH = settings.labelAlignHorizontal ?? 'center';
    // 矢印に沿った位置: center=中点、end=矢印の先端近く
    const labelX = alignH === 'end'
      ? arrowEndTime - (arrowEndTime - arrowStartTime) * 0.05
      : (arrowStartTime + arrowEndTime) / 2;
    return {
      startX: arrowStartTime,
      startY: arrowItem,
      endX: arrowEndTime,
      endY: arrowItem,
      labelX,
      labelY: sideH === 'top' ? arrowItem - offset : arrowItem + offset,
      label: settings.label,
      strokeWidth: settings.strokeWidth,
      fontSize: settings.fontSize,
      layout,
      labelSide: sideH,
    };
  } else {
    const sideV = settings.labelSideVertical ?? 'left';
    const alignV = settings.labelAlignVertical ?? 'center';
    // 縦型: center=中点、start=矢印の開始付近（上寄り）
    const labelY = alignV === 'start'
      ? arrowStartTime + (arrowEndTime - arrowStartTime) * 0.05
      : (arrowStartTime + arrowEndTime) / 2;
    return {
      startX: arrowItem,
      startY: arrowStartTime,
      endX: arrowItem,
      endY: arrowEndTime,
      labelX: sideV === 'left' ? arrowItem - offset : arrowItem + offset,
      labelY,
      label: settings.label,
      strokeWidth: settings.strokeWidth,
      fontSize: settings.fontSize,
      layout,
      labelSide: sideV,
    };
  }
}
