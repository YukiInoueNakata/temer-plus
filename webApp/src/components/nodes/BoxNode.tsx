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
import { resolveBoxVisuals } from '../../utils/boxPreset';
import { computeBoxDisplay } from '../../utils/typeDisplay';
import { renderVerticalAwareText } from '../../utils/verticalText';
import { renderRichText } from '../../utils/richText';
import { computeAutoFitSize, computeFitFontSize } from '../../utils/boxFit';
import { useTEMView } from '../../context/TEMViewContext';
import { useTEMStore } from '../../store/store';

export interface BoxNodeData extends Pick<
  Box,
  'id' | 'label' | 'type' | 'width' | 'height' | 'shape' | 'textOrientation' | 'style' |
  'number' | 'participantId' |
  'subLabel' | 'subLabelOffsetX' | 'subLabelOffsetY' | 'subLabelFontSize' |
  'subLabelColor' | 'subLabelBackgroundColor' | 'subLabelBorderColor' | 'subLabelBorderWidth' |
  'idOffsetX' | 'idOffsetY' | 'idFontSize' |
  'typeLabelFontSize' | 'typeLabelBold' | 'typeLabelItalic' | 'typeLabelFontFamily' | 'typeLabelAsciiUpright' |
  'typeLabelColor' | 'typeLabelBackgroundColor' | 'typeLabelBorderColor' | 'typeLabelBorderWidth' |
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
  const editLocked = view.editLocked;
  // 移動モード（editLocked）でも文字編集は許可したいため、
  // インライン編集は isPreview のみで無効化する
  const editingDisabled = isPreview;
  // リサイズとノードドラッグは editLocked の場合にも無効
  const resizeDisabled = isPreview || editLocked;
  const spec = BOX_RENDER_SPECS[data.type] ?? BOX_RENDER_SPECS.normal;
  // ProjectSettings.boxTypePresets による動的プリセット解決
  // 優先順位: box 個別値 > preset > 工場出荷時 (BOX_RENDER_SPECS)
  const boxForPreset = view.sheet?.boxes.find((b) => b.id === data.id);
  const visuals = boxForPreset ? resolveBoxVisuals(boxForPreset, view.settings) : null;
  const shape = visuals?.shape ?? data.shape ?? spec.defaultShape;
  const isTextVertical = data.textOrientation === 'vertical';
  const isVerticalLayout = layout === 'vertical';

  const borderColor = visuals?.borderColor ?? '#222';
  const bgColor = visuals?.backgroundColor ?? '#fff';
  const textColor = visuals?.color ?? '#222';
  const fontFamily = visuals?.fontFamily ?? 'inherit';
  const textAlign = data.style?.textAlign ?? 'center';
  const verticalAlign = data.style?.verticalAlign ?? 'middle';
  const fontSize = visuals?.fontSize ?? 13;
  const boldEff = visuals?.bold ?? data.style?.bold;
  const italicEff = visuals?.italic ?? data.style?.italic;
  const specBorderWidth = visuals?.borderWidth ?? spec.borderWidth;
  const specBorderStyle = visuals?.borderStyle ?? spec.borderStyle;

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

  // ラベル編集の確定: autoFit の結果も同じ 1 更新に畳み込むことで Ctrl+Z が機能する
  const commitEdit = () => {
    setEditing(false);
    if (draft === data.label) return;
    const patch: Partial<Box> = { label: draft };
    // autoFitBoxMode: ラベル変更を前提に新サイズを算出し、同時に適用
    if (mode !== 'none' && !autoFitText) {
      const next = computeAutoFitSize(draft, data.width, data.height, mode, {
        fontSize,
        fontFamily: data.style?.fontFamily,
        bold: data.style?.bold,
        italic: data.style?.italic,
        vertical: isTextVertical,
        padding: 8,
      });
      if (next.width !== data.width || next.height !== data.height) {
        const thisBox = sheet?.boxes.find((b) => b.id === nodeId);
        const cy = thisBox ? thisBox.y + thisBox.height / 2 : null;
        patch.width = next.width;
        patch.height = next.height;
        if (cy != null && next.height !== data.height) {
          patch.y = cy - next.height / 2;
        }
      }
    } else if (autoFitText) {
      const fitted = computeFitFontSize(draft, data.width, data.height, {
        fontFamily: data.style?.fontFamily,
        bold: data.style?.bold,
        italic: data.style?.italic,
        vertical: isTextVertical,
        padding: 8,
        minSize: 6,
        maxSize: 72,
      });
      if (Math.abs(fitted - fontSize) >= 0.5) {
        patch.style = { ...(data.style ?? {}), fontSize: fitted };
      }
    }
    updateBox(nodeId, patch);
  };

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
  // CSS Grid の justifyItems / alignItems は writing-mode に依らず
  // 物理軸（X=justify / Y=align）で動作するため、縦書きでも横書きでも
  // 「左右方向（Box 幅）」と「上下方向（Box 高さ）」を一貫して制御できる
  const gridMap: Record<string, string> = {
    top: 'start', middle: 'center', bottom: 'end',
    left: 'start', center: 'center', right: 'end',
  };
  const xAlign = gridMap[textAlign];      // 左右方向 = Box 幅基準
  const yAlign = gridMap[verticalAlign];  // 上下方向 = Box 高さ基準

  const baseStyle: React.CSSProperties = {
    width: data.width,
    height: data.height,
    display: 'grid',
    justifyItems: xAlign,   // X 軸 = Box 幅基準で左右揃え（writing-mode 非依存）
    alignItems: yAlign,     // Y 軸 = Box 高さ基準で上下揃え
    whiteSpace: 'pre-wrap',
    background: bgColor,
    color: textColor,
    fontSize,
    fontFamily,
    fontWeight: boldEff ? 700 : 400,
    fontStyle: italicEff ? 'italic' : 'normal',
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
    // grid 側で justifyItems/alignItems が box 幅・高さに対する配置を行うため
    // ここでは textAlign は設定しない（縦書きでは行内揃えの意味が変わるため）
    // 横書き時のみ、子 div 内の text-align を保持したい場合は指定
    textAlign: isTextVertical ? undefined : (textAlign as 'left' | 'center' | 'right'),
    // width/height auto で box 内の子サイズを自然に、grid justifyItems/alignItems で配置
  };

  const isPEfp = data.type === 'P-EFP' || data.type === 'P-2nd-EFP';
  const borderStyle: React.CSSProperties = shape === 'ellipse'
    ? { borderRadius: '50%', border: `${specBorderWidth}px ${specBorderStyle} ${borderColor}` }
    : isPEfp
      ? {
          border: `1.5px dashed ${borderColor}`,
          outline: `1.5px dashed ${borderColor}`,
          outlineOffset: '2px',
          borderRadius: 0,
        }
      : { border: `${specBorderWidth}px ${specBorderStyle} ${borderColor}`, borderRadius: 0 };

  // IDバッジ
  // idOffsetX/Y は論理軸基準 (X=時間軸, Y=項目軸)、レイアウトに応じて画面軸へ変換
  const idOffTime = data.idOffsetX ?? 0;
  const idOffItem = data.idOffsetY ?? 0;
  const idScreenX = !isVerticalLayout ? idOffTime : idOffItem;
  const idScreenY = !isVerticalLayout ? idOffItem : idOffTime;
  const idFontSize = data.idFontSize ?? 9;
  const idDisplay = data.id.length > 14 ? data.id.slice(0, 14) + '…' : data.id;
  const idBadge = showBoxIds ? (
    <div
      style={{
        position: 'absolute',
        top: -2 + idScreenY,
        left: 4 + idScreenX,
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

  const typeLabelColor = visuals?.typeLabelColor ?? '#222';
  const typeLabelBg = visuals?.typeLabelBackgroundColor;
  const typeLabelBorderColor = visuals?.typeLabelBorderColor;
  const typeLabelBorderWidth = visuals?.typeLabelBorderWidth ?? 0;
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
  const typeTagStyle: React.CSSProperties = isVerticalLayout
    ? {
        ...typeTagCommon,
        position: 'absolute',
        top: '50%',
        right: `calc(100% + 6px)`,
        transform: 'translateY(-50%)',
        writingMode: 'vertical-rl',
        textOrientation: typeAsciiUpright ? 'upright' : 'mixed',
      }
    : {
        ...typeTagCommon,
        position: 'absolute',
        bottom: `calc(100% + 6px)`,
        left: '50%',
        transform: 'translateX(-50%)',
        writingMode: 'horizontal-tb',
      };

  // サブラベル
  // subLabelOffsetX/Y は論理軸基準 (X=時間軸, Y=項目軸)、レイアウトに応じて画面軸へ変換
  const subLabelText = data.subLabel ?? data.participantId ?? '';
  const subOffTime = data.subLabelOffsetX ?? 0;
  const subOffItem = data.subLabelOffsetY ?? 0;
  const subOffsetX = !isVerticalLayout ? subOffTime : subOffItem;
  const subOffsetY = !isVerticalLayout ? subOffItem : subOffTime;
  const subFontSize = data.subLabelFontSize ?? 10;
  const subAsciiUpright = data.subLabelAsciiUpright ?? asciiUpright;
  const subLabelColor = visuals?.subLabelColor ?? '#555';
  const subLabelBg = visuals?.subLabelBackgroundColor ?? 'rgba(255,255,255,0.85)';
  const subLabelBorderColor = visuals?.subLabelBorderColor;
  const subLabelBorderWidth = visuals?.subLabelBorderWidth ?? 0;
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

  const targetPosition = isVerticalLayout ? Position.Top : Position.Left;
  const sourcePosition = isVerticalLayout ? Position.Bottom : Position.Right;

  // NodeResizer onResize でストア更新。temporal を pause/resume し、リサイズ 1 回分を
  // まとめて Undo できるようにする（連続的な中間状態が履歴を汚染しないよう抑制）。
  const resizing = useRef(false);
  const onResizeStart = () => {
    if (resizing.current) return;
    resizing.current = true;
    useTEMStore.temporal.getState().pause();
  };
  const onResize = (
    _e: unknown,
    params: { width: number; height: number },
  ) => {
    updateBox(nodeId, {
      width: Math.max(20, Math.round(params.width)),
      height: Math.max(20, Math.round(params.height)),
    });
  };
  const onResizeEnd = () => {
    if (!resizing.current) return;
    resizing.current = false;
    useTEMStore.temporal.getState().resume();
  };

  return (
    <div style={{ position: 'relative' }}>
      <NodeResizer
        isVisible={!!selected && !editing && !resizeDisabled}
        minWidth={30}
        minHeight={20}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, background: '#2684ff', border: '1px solid #fff' }}
        lineStyle={{ borderColor: '#2684ff' }}
        onResizeStart={onResizeStart}
        onResize={onResize}
        onResizeEnd={onResizeEnd}
      />
      <div
        style={{ ...baseStyle, ...borderStyle }}
        onDoubleClick={(e) => {
          if (editingDisabled) return;
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
