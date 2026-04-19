// ============================================================================
// SDSGNode - React Flow custom node for SD/SG (ペンタゴン)
// - モノクロ基調、Box と同形式のタイプラベル + サブラベル対応
// ============================================================================

import { Handle, Position, type NodeProps } from 'reactflow';
import type { SDSG } from '../../types';
import { renderVerticalAwareText } from '../../utils/verticalText';
import { useTEMView } from '../../context/TEMViewContext';

export interface SDSGNodeData extends Pick<
  SDSG,
  'type' | 'label' | 'width' | 'height' | 'style' |
  'subLabel' | 'subLabelOffsetX' | 'subLabelOffsetY' | 'subLabelFontSize' | 'subLabelAsciiUpright' |
  'typeLabelFontSize' | 'typeLabelBold' | 'typeLabelItalic' | 'typeLabelFontFamily' | 'typeLabelAsciiUpright' |
  'asciiUpright'
> {
  id: string;
}

export function SDSGNode({ data, selected }: NodeProps<SDSGNodeData>) {
  const view = useTEMView();
  const layout = view.settings.layout;
  const typeLabelVisibility = view.settings.typeLabelVisibility;
  const width = data.width ?? 70;
  const height = data.height ?? 40;
  const isSD = data.type === 'SD';
  const isHorizontalLayout = layout === 'horizontal';
  const isVerticalLayout = !isHorizontalLayout;

  let points: string;
  if (isHorizontalLayout) {
    if (isSD) {
      points = `0,0 ${width},0 ${width},${height * 0.55} ${width / 2},${height} 0,${height * 0.55}`;
    } else {
      points = `${width / 2},0 ${width},${height * 0.45} ${width},${height} 0,${height} 0,${height * 0.45}`;
    }
  } else {
    if (isSD) {
      points = `0,0 ${width * 0.55},0 ${width},${height / 2} ${width * 0.55},${height} 0,${height}`;
    } else {
      points = `${width * 0.45},0 ${width},0 ${width},${height} ${width * 0.45},${height} 0,${height / 2}`;
    }
  }

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

  const typeTagStyle: React.CSSProperties = isVerticalLayout
    ? {
        position: 'absolute',
        top: '50%',
        right: `calc(100% + 6px)`,
        transform: 'translateY(-50%)',
        fontSize: typeFontSize,
        padding: '2px 4px',
        color: '#222',
        fontWeight: typeFontWeight,
        fontStyle: typeFontStyle,
        fontFamily: typeFontFamily,
        writingMode: 'vertical-rl',
        textOrientation: typeAsciiUpright ? 'upright' : 'mixed',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      }
    : {
        position: 'absolute',
        bottom: `calc(100% + 6px)`,
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: typeFontSize,
        padding: '2px 4px',
        color: '#222',
        fontWeight: typeFontWeight,
        fontStyle: typeFontStyle,
        fontFamily: typeFontFamily,
        writingMode: 'horizontal-tb',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      };

  // --- サブラベル（Box と同じ形式） ---
  const subLabelText = data.subLabel ?? '';
  const subOffsetX = data.subLabelOffsetX ?? 0;
  const subOffsetY = data.subLabelOffsetY ?? 0;
  const subFontSize = data.subLabelFontSize ?? 10;
  const subAsciiUpright = data.subLabelAsciiUpright ?? asciiUpright;
  const subLabelStyle: React.CSSProperties = isVerticalLayout
    ? {
        position: 'absolute',
        top: `calc(50% + ${subOffsetY}px)`,
        left: `calc(100% + 6px + ${subOffsetX}px)`,
        transform: 'translateY(-50%)',
        fontSize: subFontSize,
        color: '#555',
        background: 'rgba(255,255,255,0.85)',
        padding: '0 4px',
        writingMode: 'vertical-rl',
        textOrientation: subAsciiUpright ? 'upright' : 'mixed',
        whiteSpace: 'nowrap',
      }
    : {
        position: 'absolute',
        top: `calc(100% + 6px + ${subOffsetY}px)`,
        left: `calc(50% + ${subOffsetX}px)`,
        transform: 'translateX(-50%)',
        fontSize: subFontSize,
        color: '#555',
        background: 'rgba(255,255,255,0.85)',
        padding: '0 4px',
        writingMode: 'horizontal-tb',
        whiteSpace: 'nowrap',
      };

  return (
    <div style={{ position: 'relative', width, height, overflow: 'visible' }}>
      <svg
        width={width}
        height={height}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          overflow: 'visible',
          filter: selected ? 'drop-shadow(0 0 2px #2684ff)' : undefined,
        }}
      >
        <polygon
          points={points}
          fill={bgColor}
          stroke={borderColor}
          strokeWidth={1.5}
        />
      </svg>
      <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none' }} />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize,
          fontWeight: data.style?.bold ?? true ? 700 : 400,
          color: textColor,
          pointerEvents: 'none',
          textAlign: 'center',
          padding: 2,
        }}
      >
        {data.label}
      </div>
      {showTypeTag && (
        <div style={typeTagStyle}>
          {renderVerticalAwareText(data.type, isVerticalLayout && typeAsciiUpright)}
        </div>
      )}
      {subLabelText && (
        <div style={subLabelStyle}>
          {renderVerticalAwareText(subLabelText, isVerticalLayout && subAsciiUpright)}
        </div>
      )}
    </div>
  );
}
