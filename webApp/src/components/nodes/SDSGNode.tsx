// ============================================================================
// SDSGNode - React Flow custom node for SD/SG (ペンタゴン)
// - モノクロ基調、Box と同形式のタイプラベル + サブラベル対応
// - ダブルクリックでラベルのインライン編集
// - SD のタイプラベルは上部（横型）/ 左側（縦型）
// - SG のタイプラベルは下部（横型）/ 右側（縦型）
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { Handle, NodeResizer, Position, type NodeProps } from 'reactflow';
import type { SDSG } from '../../types';
import { renderVerticalAwareText } from '../../utils/verticalText';
import { useTEMView } from '../../context/TEMViewContext';
import { useTEMStore } from '../../store/store';

export interface SDSGNodeData extends Pick<
  SDSG,
  'type' | 'label' | 'width' | 'height' | 'style' | 'rectRatio' |
  'labelArea' | 'labelOffsetX' | 'labelOffsetY' |
  'subLabel' | 'subLabelOffsetX' | 'subLabelOffsetY' | 'subLabelFontSize' | 'subLabelAsciiUpright' |
  'subLabelColor' | 'subLabelBackgroundColor' | 'subLabelBorderColor' | 'subLabelBorderWidth' |
  'typeLabelFontSize' | 'typeLabelBold' | 'typeLabelItalic' | 'typeLabelFontFamily' | 'typeLabelAsciiUpright' |
  'typeLabelColor' | 'typeLabelBackgroundColor' | 'typeLabelBorderColor' | 'typeLabelBorderWidth' |
  'asciiUpright' | 'idOffsetX' | 'idOffsetY' | 'idFontSize'
> {
  id: string;
  // 配置モード（resize 時に width/height か spaceWidth/spaceHeight を更新するか判定）
  spaceMode?: 'attached' | 'band-top' | 'band-bottom';
  // 方向点を反転して描画するか（band 配置 + 種別ミスマッチ時に使用）
  flipDirection?: boolean;
  // 帯範囲クランプされてはみ出した表示用（赤枠）
  outOfRange?: boolean;
  // タイプバッジ表示テキスト（SD1, SG2 等。未指定なら data.type をそのまま表示）
  typeLabelText?: string;
}

export function SDSGNode({ data, selected, id: nodeId }: NodeProps<SDSGNodeData>) {
  const view = useTEMView();
  const layout = view.settings.layout;
  const typeLabelVisibility = view.settings.typeLabelVisibility;
  const updateSDSG = view.updateSDSG;
  const isPreview = view.isPreview;
  const editLocked = view.editLocked ?? false;
  const resizeDisabled = isPreview || editLocked;
  // 移動モードでもダブルクリック編集は許可。preview 時のみ抑止
  const editingDisabled = isPreview;
  const width = data.width ?? 70;
  const height = data.height ?? 40;

  // NodeResizer: 現在の配置モードに応じて width/height or spaceWidth/spaceHeight を更新
  const isBandMode = data.spaceMode === 'band-top' || data.spaceMode === 'band-bottom';
  const resizing = useRef(false);
  const onResizeStart = () => {
    if (resizing.current) return;
    resizing.current = true;
    useTEMStore.temporal.getState().pause();
  };
  const onResize = (_e: unknown, params: { width: number; height: number }) => {
    const w = Math.max(10, Math.round(params.width));
    const h = Math.max(10, Math.round(params.height));
    if (isBandMode) {
      updateSDSG(nodeId, { spaceWidth: w, spaceHeight: h });
    } else {
      updateSDSG(nodeId, { width: w, height: h });
    }
  };
  const onResizeEnd = () => {
    if (!resizing.current) return;
    resizing.current = false;
    useTEMStore.temporal.getState().resume();
  };
  // flipDirection=true の場合は種別と逆向きに点を描画（band 配置時の方向点自動反転用）
  const isSD = data.flipDirection ? data.type === 'SG' : data.type === 'SD';
  const isHorizontalLayout = layout === 'horizontal';
  const isVerticalLayout = !isHorizontalLayout;

  // インライン編集
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.label);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (editing) {
      setDraft(data.label);
      queueMicrotask(() => {
        textareaRef.current?.focus();
        textareaRef.current?.select();
      });
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps
  const commitEdit = () => {
    setEditing(false);
    if (draft !== data.label) {
      updateSDSG(nodeId, { label: draft });
    }
  };
  const cancelEdit = () => {
    setEditing(false);
    setDraft(data.label);
  };

  // 矩形部分の比率（0-1、既定 0.55）。1 に近いほど矩形部分が大きく三角が浅くなる
  const rectRatio = Math.max(0.05, Math.min(0.95, data.rectRatio ?? 0.55));
  // triRatio = 1 - rectRatio だが、点の位置計算で直接使う値
  const triRatio = 1 - rectRatio;

  let points: string;
  // 本体ラベル配置領域: 既定は五角形全体、'rect' なら矩形部分のみ
  const labelArea = data.labelArea ?? 'pentagon';
  let textRect = { top: 0, left: 0, width, height };
  if (isHorizontalLayout) {
    // 横型: 矩形上側、三角が上下いずれかに出る
    // SD 下向き: 矩形上 + 三角下、rectRatio = 矩形高さ / 全高
    // SG 上向き: 三角上 + 矩形下
    if (isSD) {
      const rectBottom = height * rectRatio;
      points = `0,0 ${width},0 ${width},${rectBottom} ${width / 2},${height} 0,${rectBottom}`;
      if (labelArea === 'rect') textRect = { top: 0, left: 0, width, height: rectBottom };
    } else {
      const rectTop = height * triRatio;
      points = `${width / 2},0 ${width},${rectTop} ${width},${height} 0,${height} 0,${rectTop}`;
      if (labelArea === 'rect') textRect = { top: rectTop, left: 0, width, height: height - rectTop };
    }
  } else {
    // 縦型: 矩形左右、三角が左右に出る
    // SD: 左向き（三角左 + 矩形右）→ SD は Box の右側にあり、Box を指す（左）
    // SG: 右向き（矩形左 + 三角右）→ SG は Box の左側にあり、Box を指す（右）
    if (isSD) {
      const rectLeft = width * triRatio;
      points = `${rectLeft},0 ${width},0 ${width},${height} ${rectLeft},${height} 0,${height / 2}`;
      if (labelArea === 'rect') textRect = { top: 0, left: rectLeft, width: width - rectLeft, height };
    } else {
      const rectRight = width * rectRatio;
      points = `0,0 ${rectRight},0 ${width},${height / 2} ${rectRight},${height} 0,${height}`;
      if (labelArea === 'rect') textRect = { top: 0, left: 0, width: rectRight, height };
    }
  }
  const labelOffX = data.labelOffsetX ?? 0;
  const labelOffY = data.labelOffsetY ?? 0;

  const bgColor = data.style?.backgroundColor ?? '#ffffff';
  const borderColor = data.style?.borderColor ?? '#333';
  const textColor = data.style?.color ?? '#222';
  const fontSize = data.style?.fontSize ?? 11;

  // --- タイプラベル (SD / SG)：Box と同じ形式（外部、背景/枠なし、太字） ---
  const showTypeTag = typeLabelVisibility?.[data.type] !== false;
  const asciiUpright = data.asciiUpright ?? true;
  const typeAsciiUpright = data.typeLabelAsciiUpright ?? asciiUpright;
  const typeFontSize = data.typeLabelFontSize ?? 11;
  const typeFontWeight = data.typeLabelBold === false ? 400 : 700;
  const typeFontStyle = data.typeLabelItalic ? 'italic' : 'normal';
  const typeFontFamily = data.typeLabelFontFamily ?? 'inherit';
  const typeLabelColor = data.typeLabelColor ?? '#222';
  const typeLabelBg = data.typeLabelBackgroundColor;
  const typeLabelBorderColor = data.typeLabelBorderColor;
  const typeLabelBorderWidth = data.typeLabelBorderWidth ?? 0;
  const typeLabelBorder = typeLabelBorderWidth > 0 && typeLabelBorderColor
    ? `${typeLabelBorderWidth}px solid ${typeLabelBorderColor}`
    : undefined;

  const typeTagCommon: React.CSSProperties = {
    fontSize: typeFontSize,
    padding: '2px 4px',
    color: typeLabelColor,
    background: typeLabelBg,
    border: typeLabelBorder,
    fontWeight: typeFontWeight,
    fontStyle: typeFontStyle,
    fontFamily: typeFontFamily,
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  };

  // SD = 上（横型）/ 右（縦型）、SG = 下（横型）/ 左（縦型）
  // typeTag は SDSG の外側（Box と反対側）に表示
  const typeTagStyle: React.CSSProperties = isVerticalLayout
    ? isSD
      ? {
          ...typeTagCommon,
          position: 'absolute',
          top: '50%',
          left: `calc(100% + 6px)`,
          transform: 'translateY(-50%)',
          writingMode: 'vertical-rl',
          textOrientation: typeAsciiUpright ? 'upright' : 'mixed',
        }
      : {
          ...typeTagCommon,
          position: 'absolute',
          top: '50%',
          right: `calc(100% + 6px)`,
          transform: 'translateY(-50%)',
          writingMode: 'vertical-rl',
          textOrientation: typeAsciiUpright ? 'upright' : 'mixed',
        }
    : isSD
      ? {
          ...typeTagCommon,
          position: 'absolute',
          bottom: `calc(100% + 6px)`,
          left: '50%',
          transform: 'translateX(-50%)',
          writingMode: 'horizontal-tb',
        }
      : {
          ...typeTagCommon,
          position: 'absolute',
          top: `calc(100% + 6px)`,
          left: '50%',
          transform: 'translateX(-50%)',
          writingMode: 'horizontal-tb',
        };

  // --- サブラベル（Box と同じ形式） ---
  const subLabelText = data.subLabel ?? '';
  const subOffsetX = data.subLabelOffsetX ?? 0;
  const subOffsetY = data.subLabelOffsetY ?? 0;
  const subFontSize = data.subLabelFontSize ?? 10;
  const subAsciiUpright = data.subLabelAsciiUpright ?? asciiUpright;
  const subLabelColor = data.subLabelColor ?? '#555';
  const subLabelBg = data.subLabelBackgroundColor ?? 'rgba(255,255,255,0.85)';
  const subLabelBorderColor = data.subLabelBorderColor;
  const subLabelBorderWidth = data.subLabelBorderWidth ?? 0;
  const subLabelBorder = subLabelBorderWidth > 0 && subLabelBorderColor
    ? `${subLabelBorderWidth}px solid ${subLabelBorderColor}`
    : undefined;
  const subLabelCommon: React.CSSProperties = {
    fontSize: subFontSize,
    color: subLabelColor,
    background: subLabelBg,
    border: subLabelBorder,
    padding: '0 4px',
    whiteSpace: 'nowrap',
  };
  const subLabelStyle: React.CSSProperties = isVerticalLayout
    ? {
        ...subLabelCommon,
        position: 'absolute',
        top: `calc(50% + ${subOffsetY}px)`,
        left: `calc(100% + 6px + ${subOffsetX}px)`,
        transform: 'translateY(-50%)',
        writingMode: 'vertical-rl',
        textOrientation: subAsciiUpright ? 'upright' : 'mixed',
      }
    : {
        ...subLabelCommon,
        position: 'absolute',
        top: `calc(100% + 6px + ${subOffsetY}px)`,
        left: `calc(50% + ${subOffsetX}px)`,
        transform: 'translateX(-50%)',
        writingMode: 'horizontal-tb',
      };

  return (
    <div
      style={{ position: 'relative', width, height, overflow: 'visible' }}
      onDoubleClick={(e) => {
        if (editingDisabled) return;
        e.stopPropagation();
        setEditing(true);
      }}
    >
      <NodeResizer
        isVisible={!!selected && !editing && !resizeDisabled}
        minWidth={20}
        minHeight={15}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, background: '#2684ff', border: '1px solid #fff' }}
        lineStyle={{ borderColor: '#2684ff' }}
        onResizeStart={onResizeStart}
        onResize={onResize}
        onResizeEnd={onResizeEnd}
      />
      <svg
        width={width}
        height={height}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          overflow: 'visible',
          filter: selected
            ? 'drop-shadow(0 0 2px #2684ff)'
            : data.outOfRange
              ? 'drop-shadow(0 0 3px #e74c3c)'
              : undefined,
        }}
      >
        <polygon
          points={points}
          fill={bgColor}
          stroke={data.outOfRange ? '#e74c3c' : borderColor}
          strokeWidth={1.5}
        />
      </svg>
      <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none' }} />
      {editing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(); }
            else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: textRect.top + labelOffY,
            left: textRect.left + labelOffX,
            width: textRect.width,
            height: textRect.height,
            border: 'none',
            outline: 'none',
            resize: 'none',
            background: 'transparent',
            fontSize,
            fontWeight: data.style?.bold ?? true ? 700 : 400,
            fontStyle: data.style?.italic ? 'italic' : 'normal',
            fontFamily: data.style?.fontFamily ?? 'inherit',
            color: textColor,
            textAlign: 'center',
            padding: 2,
            boxSizing: 'border-box',
          }}
        />
      ) : (
        (() => {
          // Box と同じ: Grid の justifyItems/alignItems は writing-mode に依存せず
          // 物理軸で動くため、縦書き/横書きいずれも同じマッピングで機能する
          const gridMap: Record<string, string> = {
            top: 'start', middle: 'center', bottom: 'end',
            left: 'start', center: 'center', right: 'end',
          };
          const xAlign = gridMap[data.style?.textAlign ?? 'center'];
          const yAlign = gridMap[data.style?.verticalAlign ?? 'middle'];
          return (
            <div
              style={{
                position: 'absolute',
                top: textRect.top + labelOffY,
                left: textRect.left + labelOffX,
                width: textRect.width,
                height: textRect.height,
                display: 'grid',
                justifyItems: xAlign,
                alignItems: yAlign,
                fontSize,
                fontWeight: data.style?.bold ?? true ? 700 : 400,
                fontStyle: data.style?.italic ? 'italic' : 'normal',
                textDecoration: data.style?.underline ? 'underline' : 'none',
                fontFamily: data.style?.fontFamily ?? 'inherit',
                color: textColor,
                pointerEvents: 'none',
                padding: 2,
                writingMode: isVerticalLayout ? 'vertical-rl' : 'horizontal-tb',
                textOrientation: isVerticalLayout ? ((data.asciiUpright ?? true) ? 'upright' : 'mixed') : undefined,
              }}
            >
              {data.label}
            </div>
          );
        })()
      )}
      {showTypeTag && (
        <div style={typeTagStyle}>
          {renderVerticalAwareText(data.typeLabelText ?? data.type, isVerticalLayout && typeAsciiUpright)}
        </div>
      )}
      {subLabelText && (
        <div style={subLabelStyle}>
          {renderVerticalAwareText(subLabelText, isVerticalLayout && subAsciiUpright)}
        </div>
      )}
      {view.view.showSDSGIds && (() => {
        // 横型 + SG (描画上 SG = !isSD): 下辺の中心にバッジを重ねる（下辺の上に被せる）
        // それ以外（横型 SD / 縦型）: 上辺の中心にバッジを重ねる（従来通り）
        const idAtBottom = isHorizontalLayout && !isSD;
        const baseStyle: React.CSSProperties = idAtBottom
          ? {
              position: 'absolute',
              top: height - 2 + (data.idOffsetY ?? 0),
              left: 4 + (data.idOffsetX ?? 0),
              transform: 'translateY(-50%)',
            }
          : {
              position: 'absolute',
              top: -2 + (data.idOffsetY ?? 0),
              left: 4 + (data.idOffsetX ?? 0),
              transform: 'translateY(-50%)',
            };
        return (
          <div
            style={{
              ...baseStyle,
              fontSize: data.idFontSize ?? 9,
              background: '#fff',
              padding: '0 3px',
              color: '#666',
              lineHeight: '10px',
              fontFamily: 'monospace',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {nodeId.length > 14 ? nodeId.slice(0, 14) + '…' : nodeId}
          </div>
        );
      })()}
    </div>
  );
}
