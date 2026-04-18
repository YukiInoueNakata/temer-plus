// ============================================================================
// BoxNode - React Flow custom node for TEM Box
// - IDバッジ: Box左上コーナー線上（小さく表示、調整可）
// - 種別タグ: Box外部の辺中央（横型Layout=上辺中央、縦型Layout=左辺中央）
// - サブラベル: Box外部の反対側辺（横型Layout=下辺、縦型Layout=右辺）
// - Handle位置: Layoutに連動（横型=左右、縦型=上下）
// ============================================================================

import { Handle, Position, type NodeProps } from 'reactflow';
import type { Box } from '../../types';
import { BOX_RENDER_SPECS, BOX_TYPE_LABELS } from '../../store/defaults';
import { useTEMStore } from '../../store/store';

export interface BoxNodeData extends Pick<
  Box,
  'id' | 'label' | 'type' | 'width' | 'height' | 'shape' | 'textOrientation' | 'style' |
  'number' | 'participantId' |
  'subLabel' | 'subLabelOffsetX' | 'subLabelOffsetY' | 'subLabelFontSize' |
  'idOffsetX' | 'idOffsetY' | 'idFontSize'
> {}

export function BoxNode({ data, selected }: NodeProps<BoxNodeData>) {
  const showBoxIds = useTEMStore((s) => s.view.showBoxIds);
  const layout = useTEMStore((s) => s.doc.settings.layout);
  const spec = BOX_RENDER_SPECS[data.type] ?? BOX_RENDER_SPECS.normal;
  const shape = data.shape ?? spec.defaultShape;
  const isTextVertical = data.textOrientation === 'vertical';
  const isVerticalLayout = layout === 'vertical';

  const borderColor = data.style?.borderColor ?? '#222';
  const bgColor = data.style?.backgroundColor ?? '#fff';
  const textColor = data.style?.color ?? '#222';
  const fontFamily = data.style?.fontFamily ?? 'inherit';
  const textAlign = data.style?.textAlign ?? 'center';
  const verticalAlign = data.style?.verticalAlign ?? 'middle';

  const alignMap: Record<string, string> = {
    top: 'flex-start', middle: 'center', bottom: 'flex-end',
    left: 'flex-start', center: 'center', right: 'flex-end',
  };

  const flexAlignItems = isTextVertical ? alignMap[textAlign] : alignMap[verticalAlign];
  const flexJustify = isTextVertical ? alignMap[verticalAlign] : alignMap[textAlign];

  const baseStyle: React.CSSProperties = {
    width: data.width,
    height: data.height,
    display: 'flex',
    alignItems: flexAlignItems,
    justifyContent: flexJustify,
    whiteSpace: 'pre-wrap',
    background: bgColor,
    color: textColor,
    fontSize: data.style?.fontSize ?? 13,
    fontFamily,
    fontWeight: data.style?.bold ? 700 : 400,
    fontStyle: data.style?.italic ? 'italic' : 'normal',
    textDecoration: data.style?.underline ? 'underline' : 'none',
    padding: 4,
    boxSizing: 'border-box',
    boxShadow: selected ? '0 0 0 2px #2684ff' : 'none',
    position: 'relative',
    overflow: 'visible',
  };

  const textStyle: React.CSSProperties = {
    writingMode: isTextVertical ? 'vertical-rl' : 'horizontal-tb',
    textOrientation: isTextVertical ? 'mixed' : undefined,
    textAlign: isTextVertical ? 'left' : (textAlign as 'left' | 'center' | 'right'),
  };

  const borderStyle: React.CSSProperties = shape === 'ellipse'
    ? { borderRadius: '50%', border: `${spec.borderWidth}px ${spec.borderStyle} ${borderColor}` }
    : { border: `${spec.borderWidth}px ${spec.borderStyle} ${borderColor}`, borderRadius: 0 };

  // ==========================================================================
  // IDバッジ: Box左上コーナー線上（小さく）、オフセット調整可
  // ==========================================================================
  const idOffsetX = data.idOffsetX ?? 0;
  const idOffsetY = data.idOffsetY ?? 0;
  const idFontSize = data.idFontSize ?? 9;
  const idDisplay = data.id.length > 14 ? data.id.slice(0, 14) + '…' : data.id;

  const idBadge = showBoxIds ? (
    <div
      style={{
        position: 'absolute',
        top: -2 + idOffsetY,
        left: 4 + idOffsetX,
        fontSize: idFontSize,
        background: '#fff',
        padding: '0 3px',
        color: '#666',
        lineHeight: '10px',
        fontFamily: 'monospace',
        pointerEvents: 'none',
        transform: 'translateY(-50%)',
        whiteSpace: 'nowrap',
      }}
    >
      {idDisplay}
    </div>
  ) : null;

  // ==========================================================================
  // 種別タグ: Layout連動（横型=上辺中央、縦型=左辺中央）、太字、目立つ
  // ==========================================================================
  const typeShort = BOX_TYPE_LABELS[data.type]?.shortJa ?? data.type;
  const numberSuffix = data.number ? `-${data.number}` : '';
  const typeTagText = data.type === 'normal' ? '' : `${typeShort}${numberSuffix}`;

  // 縦型レイアウトでは縦書き、背景/枠なし
  const typeTagStyle: React.CSSProperties = isVerticalLayout
    ? {
        position: 'absolute',
        top: '50%',
        right: `calc(100% + 6px)`,
        transform: 'translateY(-50%)',
        fontSize: 11,
        padding: '2px 4px',
        color: '#222',
        fontWeight: 700,
        writingMode: 'vertical-rl',
        textOrientation: 'mixed',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      }
    : {
        position: 'absolute',
        bottom: `calc(100% + 6px)`,
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: 11,
        padding: '2px 4px',
        color: '#222',
        fontWeight: 700,
        writingMode: 'horizontal-tb',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      };

  // ==========================================================================
  // サブラベル: Layout連動（横型=下辺中央、縦型=右辺中央）、オフセット調整可
  // ==========================================================================
  const subLabelText = data.subLabel ?? data.participantId ?? '';
  const subOffsetX = data.subLabelOffsetX ?? 0;
  const subOffsetY = data.subLabelOffsetY ?? 0;
  const subFontSize = data.subLabelFontSize ?? 10;

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
        writingMode: 'horizontal-tb',
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

  // ==========================================================================
  // Handle: Layoutに連動
  // 横型Layout: target=左、source=右（左→右の矢印）
  // 縦型Layout: target=上、source=下（時間が上→下、矢印も上→下。「下辺から上辺に」は子→親/target→sourceの見え方）
  // ==========================================================================
  const targetPosition = isVerticalLayout ? Position.Top : Position.Left;
  const sourcePosition = isVerticalLayout ? Position.Bottom : Position.Right;

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ ...baseStyle, ...borderStyle }}>
        <Handle type="target" position={targetPosition} style={{ background: '#555' }} />
        {idBadge}
        {typeTagText && <div style={typeTagStyle}>{typeTagText}</div>}
        <div style={textStyle}>{data.label}</div>
        <Handle type="source" position={sourcePosition} style={{ background: '#555' }} />
      </div>
      {subLabelText && <div style={subLabelStyle}>{subLabelText}</div>}
    </div>
  );
}
