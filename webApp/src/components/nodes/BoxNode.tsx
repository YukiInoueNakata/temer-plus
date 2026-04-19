// ============================================================================
// BoxNode - React Flow custom node for TEM Box
// - ダブルクリックでインラインラベル編集（textarea）
// - 選択時に 8 点リサイズハンドル（NodeResizer）
// - ラベルは部分装飾タグ（<b>/<i>/<u>/<s>/<size=>/<color=>/<font=>）に対応
// - autoFitBoxMode: 'width-fixed' = 横幅固定で高さ自動拡張
//                   'height-fixed' = 高さ固定で横幅自動拡張
// - IDバッジ / 種別タグ / サブラベル は従来通り
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { Handle, NodeResizer, Position, type NodeProps } from 'reactflow';
import type { Box } from '../../types';
import { BOX_RENDER_SPECS } from '../../store/defaults';
import { computeBoxDisplay } from '../../utils/typeDisplay';
import { renderVerticalAwareText } from '../../utils/verticalText';
import { renderRichText } from '../../utils/richText';
import { computeAutoFitSize, computeFitFontSize } from '../../utils/boxFit';
import { useTEMView } from '../../context/TEMViewContext';

export interface BoxNodeData extends Pick<
  Box,
  'id' | 'label' | 'type' | 'width' | 'height' | 'shape' | 'textOrientation' | 'style' |
  'number' | 'participantId' |
  'subLabel' | 'subLabelOffsetX' | 'subLabelOffsetY' | 'subLabelFontSize' |
  'idOffsetX' | 'idOffsetY' | 'idFontSize' |
  'typeLabelFontSize' | 'typeLabelBold' | 'typeLabelItalic' | 'typeLabelFontFamily' | 'typeLabelAsciiUpright' |
  'subLabelAsciiUpright' |
  'asciiUpright' |
  'autoFitBoxMode' | 'autoFitText'
> {}

export function BoxNode({ data, selected, id: nodeId }: NodeProps<BoxNodeData>) {
  const view = useTEMView();
  const showBoxIds = view.view.showBoxIds;
  const layout = view.settings.layout;
  const typeLabelVisibility = view.settings.typeLabelVisibility;
  const defaultMode = view.settings.defaultAutoFitBoxMode;
  const updateBox = view.updateBox;
  const sheet = view.sheet;
  const isPreview = view.isPreview;
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
  const fontSize = data.style?.fontSize ?? 13;

  // --------------------------------------------------------------------------
  // インライン編集
  // --------------------------------------------------------------------------
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.label);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing) {
      setDraft(data.label);
      // 次のレンダリングで focus
      queueMicrotask(() => {
        textareaRef.current?.focus();
        textareaRef.current?.select();
      });
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const commitEdit = () => {
    setEditing(false);
    if (draft !== data.label) {
      updateBox(nodeId, { label: draft });
    }
  };
  const cancelEdit = () => {
    setEditing(false);
    setDraft(data.label);
  };

  // --------------------------------------------------------------------------
  // autoFitBoxMode: ラベル/フォント変更時に必要サイズを計算して自動拡張
  // 既存サイズより大きい方向にのみ更新（ユーザ手動リサイズを尊重）
  // autoFitText と同時有効時は autoFitText を優先し、autoFitBoxMode は停止
  // --------------------------------------------------------------------------
  const autoFitText = data.autoFitText ?? view.settings.defaultAutoFitText ?? false;
  const mode = (autoFitText ? 'none' : (data.autoFitBoxMode ?? defaultMode ?? 'none'));
  useEffect(() => {
    if (editing) return;
    if (mode === 'none') return;
    const next = computeAutoFitSize(
      data.label,
      data.width,
      data.height,
      mode,
      {
        fontSize,
        fontFamily: data.style?.fontFamily,
        bold: data.style?.bold,
        italic: data.style?.italic,
        vertical: isTextVertical,
        padding: 8,
      }
    );
    if (next.width !== data.width || next.height !== data.height) {
      // 左辺中点を固定: x 不変、height 変化時は y を調整して中心維持
      const thisBox = sheet?.boxes.find((b) => b.id === nodeId);
      const cy = thisBox ? thisBox.y + thisBox.height / 2 : null;
      const patch: Partial<Box> = {
        width: next.width,
        height: next.height,
      };
      if (cy != null && next.height !== data.height) {
        patch.y = cy - next.height / 2;
      }
      updateBox(nodeId, patch);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.label, fontSize, mode, isTextVertical, data.width, data.height, editing]);

  // --------------------------------------------------------------------------
  // autoFitText: Box サイズ固定で fontSize を Box に収まる最大値に自動調整
  // 縮小も拡大も行う（6px〜72px の範囲で二分探索）
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (editing) return;
    if (!autoFitText) return;
    const fitted = computeFitFontSize(
      data.label,
      data.width,
      data.height,
      {
        fontFamily: data.style?.fontFamily,
        bold: data.style?.bold,
        italic: data.style?.italic,
        vertical: isTextVertical,
        padding: 8,
        minSize: 6,
        maxSize: 72,
      },
    );
    if (Math.abs(fitted - fontSize) >= 0.5) {
      updateBox(nodeId, { style: { ...(data.style ?? {}), fontSize: fitted } });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.label, data.width, data.height, isTextVertical, autoFitText, editing]);

  // --------------------------------------------------------------------------
  // 見た目
  // --------------------------------------------------------------------------
  const alignMap: Record<string, string> = {
    top: 'flex-start', middle: 'center', bottom: 'flex-end',
    left: 'flex-start', center: 'center', right: 'flex-end',
  };
  // 揃えは常に Box の幅（左右）・高さ（上下）に対して適用
  // 縦書きテキストでも flex 軸を保持（justifyContent=横、alignItems=縦）
  const flexJustify = alignMap[textAlign];     // 左右方向 = Box 幅基準
  const flexAlignItems = alignMap[verticalAlign]; // 上下方向 = Box 高さ基準

  const baseStyle: React.CSSProperties = {
    width: data.width,
    height: data.height,
    display: 'flex',
    alignItems: flexAlignItems,
    justifyContent: flexJustify,
    whiteSpace: 'pre-wrap',
    background: bgColor,
    color: textColor,
    fontSize,
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

  const asciiUpright = data.asciiUpright ?? true;
  const textStyle: React.CSSProperties = {
    writingMode: isTextVertical ? 'vertical-rl' : 'horizontal-tb',
    textOrientation: isTextVertical ? (asciiUpright ? 'upright' : 'mixed') : undefined,
    textAlign: isTextVertical ? 'left' : (textAlign as 'left' | 'center' | 'right'),
    width: '100%',
  };

  const isPEfp = data.type === 'P-EFP' || data.type === 'P-2nd-EFP';
  const borderStyle: React.CSSProperties = shape === 'ellipse'
    ? { borderRadius: '50%', border: `${spec.borderWidth}px ${spec.borderStyle} ${borderColor}` }
    : isPEfp
      ? {
          border: `1.5px dashed ${borderColor}`,
          outline: `1.5px dashed ${borderColor}`,
          outlineOffset: '2px',
          borderRadius: 0,
        }
      : { border: `${spec.borderWidth}px ${spec.borderStyle} ${borderColor}`, borderRadius: 0 };

  // IDバッジ
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

  // タイプラベル
  const currentBoxForDisplay: Box = {
    id: data.id, type: data.type, label: data.label,
    x: 0, y: 0, width: data.width, height: data.height,
  };
  const typeVisible = typeLabelVisibility
    ? (typeLabelVisibility as Record<string, boolean | undefined>)[data.type] !== false
    : true;
  const shouldShowTypeTag = data.type !== 'normal' && data.type !== 'annotation' && typeVisible;
  const typeTagText = shouldShowTypeTag && sheet
    ? computeBoxDisplay(sheet.boxes, sheet.boxes.find((b) => b.id === data.id) ?? currentBoxForDisplay, layout)
    : '';
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

  // サブラベル
  const subLabelText = data.subLabel ?? data.participantId ?? '';
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

  const targetPosition = isVerticalLayout ? Position.Top : Position.Left;
  const sourcePosition = isVerticalLayout ? Position.Bottom : Position.Right;

  // NodeResizer onResize でストア更新
  const onResize = (
    _e: unknown,
    params: { width: number; height: number },
  ) => {
    updateBox(nodeId, {
      width: Math.max(20, Math.round(params.width)),
      height: Math.max(20, Math.round(params.height)),
    });
  };

  return (
    <div style={{ position: 'relative' }}>
      <NodeResizer
        isVisible={!!selected && !editing && !isPreview}
        minWidth={30}
        minHeight={20}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, background: '#2684ff', border: '1px solid #fff' }}
        lineStyle={{ borderColor: '#2684ff' }}
        onResize={onResize}
      />
      <div
        style={{ ...baseStyle, ...borderStyle }}
        onDoubleClick={(e) => {
          if (isPreview) return;
          e.stopPropagation();
          setEditing(true);
        }}
      >
        <Handle type="target" position={targetPosition} style={{ background: '#555' }} />
        {idBadge}
        {typeTagText && (
          <div style={typeTagStyle}>
            {renderVerticalAwareText(typeTagText, isVerticalLayout && typeAsciiUpright)}
          </div>
        )}
        {editing ? (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                commitEdit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
              }
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              outline: 'none',
              resize: 'none',
              background: 'transparent',
              fontFamily,
              fontSize,
              fontWeight: data.style?.bold ? 700 : 400,
              fontStyle: data.style?.italic ? 'italic' : 'normal',
              color: textColor,
              textAlign: isTextVertical ? 'left' : (textAlign as 'left' | 'center' | 'right'),
              writingMode: isTextVertical ? 'vertical-rl' : 'horizontal-tb',
              textOrientation: isTextVertical ? (asciiUpright ? 'upright' : 'mixed') : undefined,
              padding: 0,
              boxSizing: 'border-box',
            }}
          />
        ) : (
          <div style={textStyle}>
            {renderRichText(data.label, { vertical: isTextVertical, asciiUpright })}
          </div>
        )}
        <Handle type="source" position={sourcePosition} style={{ background: '#555' }} />
      </div>
      {subLabelText && (
        <div style={subLabelStyle}>
          {renderVerticalAwareText(subLabelText, isVerticalLayout && subAsciiUpright)}
        </div>
      )}
    </div>
  );
}
