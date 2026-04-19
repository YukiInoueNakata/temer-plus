// ============================================================================
// LegendOverlay - キャンバス上の凡例
// - ドラッグで移動、ダブルクリックで設定を開く
// - タイトル: 位置(top/right)・揃え(left/center/right)・書き方向(horizontal/vertical)
//   右側配置時は上下揃え(top/middle/bottom)
// - 項目: アイコンは中央揃え（横幅一定）、テキストは右揃え
// ============================================================================

import { useState, useRef, useEffect } from 'react';
import { useStore as useReactFlowStore } from 'reactflow';
import { useTEMStore } from '../store/store';
import { computeLegendItems, type LegendItem } from '../utils/legend';
import { BOX_RENDER_SPECS } from '../store/defaults';
import { useTEMView } from '../context/TEMViewContext';

export function LegendOverlay({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const view = useTEMView();
  const sheet = view.sheet;
  const legend = view.settings.legend;
  const layout = view.settings.layout;
  const isPreview = view.isPreview;
  const transform = useReactFlowStore((s) => s.transform);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ mouseX: 0, mouseY: 0, legendX: 0, legendY: 0 });

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      if (isPreview) return; // プレビューではドラッグ無効
      const dx = (e.clientX - startRef.current.mouseX) / transform[2];
      const dy = (e.clientY - startRef.current.mouseY) / transform[2];
      const newX = startRef.current.legendX + dx;
      const newY = startRef.current.legendY + dy;
      useTEMStore.setState((state) => ({
        doc: {
          ...state.doc,
          settings: {
            ...state.doc.settings,
            legend: {
              ...state.doc.settings.legend,
              position: { x: newX, y: newY },
            },
          },
        },
      }));
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, transform, isPreview]);

  if (!sheet || !legend.alwaysVisible) return null;
  const items = computeLegendItems(sheet, legend);
  if (items.length === 0) return null;

  const [panX, panY, zoom] = transform;
  const screenX = legend.position.x * zoom + panX;
  const screenY = legend.position.y * zoom + panY;
  const scaledFont = legend.fontSize * zoom;
  const scaledMinWidth = legend.minWidth * zoom;

  const columns = Math.max(
    1,
    Math.floor(
      (layout === 'vertical' ? legend.columnsVertical : legend.columnsHorizontal) ?? legend.columns ?? 1
    )
  );
  const showTitle = legend.showTitle !== false;
  const showDescriptions = legend.showDescriptions === true; // 既定 false
  const fontFamily = legend.fontFamily;

  const bg = legend.backgroundStyle === 'none' ? 'transparent' : '#ffffff';
  const border = legend.borderWidth > 0
    ? `${legend.borderWidth * zoom}px solid ${legend.borderColor ?? '#999'}`
    : 'none';

  const titleFontSize = (legend.titleFontSize ?? legend.fontSize * 1.15) * zoom;
  const titleFontFamily = legend.titleFontFamily ?? fontFamily;
  const titleFontWeight = legend.titleBold === false ? 400 : 700;
  const titleFontStyle = legend.titleItalic ? 'italic' : 'normal';
  const titleTextDecoration = legend.titleUnderline ? 'underline' : 'none';
  const titleAlign = legend.titleAlign ?? 'left';
  const titlePosition = legend.titlePosition ?? 'top';
  const titleWritingMode = legend.titleWritingMode ?? 'horizontal';
  const titleVerticalAlign = legend.titleVerticalAlign ?? 'top';
  const titleIsVertical = titleWritingMode === 'vertical';

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      legendX: legend.position.x,
      legendY: legend.position.y,
    };
    setDragging(true);
  };

  const openSettings = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onOpenSettings?.();
  };

  // --- 項目テーブル（アイコン中央、テキスト左揃え） ---
  const sampleW = legend.sampleWidth ?? 32;
  const sampleH = legend.sampleHeight ?? 18;
  // アイコン列は (sampleW + 余白) を最小幅とし、中央に揃える
  const iconColMin = (sampleW + 8) * zoom;
  const itemsGrid = (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        columnGap: 12 * zoom,
        rowGap: 4 * zoom,
      }}
    >
      {items.map((item) => {
        const overrideKey = `${item.category}:${item.key}`;
        const ov = legend.itemOverrides?.[overrideKey];
        const label = ov?.label ?? item.label;
        const description = ov?.description ?? item.description;
        const showDesc = ov?.showDescription ?? showDescriptions;
        return (
          <div
            key={overrideKey}
            style={{
              display: 'grid',
              gridTemplateColumns: `${iconColMin}px 1fr`,
              alignItems: 'center',
              columnGap: 8 * zoom,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <LegendSampleIcon item={item} zoom={zoom} width={sampleW} height={sampleH} />
            </div>
            <div style={{ textAlign: 'left', lineHeight: 1.2, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{label}</div>
              {showDesc && description && (
                <div style={{ fontSize: scaledFont * 0.85, color: '#666' }}>
                  {description}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  // --- タイトル部（右側にハンドルを常設） ---
  // タイトル位置: 'top' では横並び（タイトル＋ハンドル）、'right' では縦並び
  const titleBlockTop = showTitle ? (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6 * zoom,
        marginBottom: 4 * zoom,
        paddingBottom: 4 * zoom,
        borderBottom: legend.borderWidth > 0 ? '1px solid #ddd' : 'none',
      }}
    >
      <div
        style={{
          flex: 1,
          textAlign: titleAlign,
          fontSize: titleFontSize,
          fontFamily: titleFontFamily ?? undefined,
          fontWeight: titleFontWeight,
          fontStyle: titleFontStyle,
          textDecoration: titleTextDecoration,
          writingMode: titleIsVertical ? 'vertical-rl' : undefined,
          textOrientation: titleIsVertical ? 'upright' : undefined,
          color: '#222',
          lineHeight: 1.2,
        }}
      >
        {legend.title}
      </div>
      <div
        onMouseDown={startDrag}
        title="ドラッグで移動"
        style={{
          cursor: 'grab',
          fontSize: titleFontSize,
          lineHeight: 1,
          color: '#888',
          padding: `0 ${4 * zoom}px`,
          flexShrink: 0,
        }}
      >
        ⠿
      </div>
    </div>
  ) : null;

  // タイトル右側配置の場合、flex row でタイトル列を右に配置
  // 右側配置では、タイトルとハンドルを縦に並べる（書き方向に応じて）
  const alignItemsMap: Record<string, string> = {
    top: 'flex-start',
    middle: 'center',
    bottom: 'flex-end',
  };

  const titleBlockLeft = showTitle ? (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: alignItemsMap[titleVerticalAlign] ?? 'flex-start',
        gap: 4 * zoom,
        marginRight: 6 * zoom,
        paddingRight: 6 * zoom,
        borderRight: legend.borderWidth > 0 ? '1px solid #ddd' : 'none',
        minWidth: titleIsVertical ? titleFontSize * 1.5 : undefined,
      }}
    >
      <div
        style={{
          textAlign: titleAlign,
          fontSize: titleFontSize,
          fontFamily: titleFontFamily ?? undefined,
          fontWeight: titleFontWeight,
          fontStyle: titleFontStyle,
          textDecoration: titleTextDecoration,
          writingMode: titleIsVertical ? 'vertical-rl' : undefined,
          textOrientation: titleIsVertical ? 'upright' : undefined,
          color: '#222',
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
        }}
      >
        {legend.title}
      </div>
      <div
        onMouseDown={startDrag}
        title="ドラッグで移動"
        style={{
          cursor: 'grab',
          fontSize: titleFontSize,
          lineHeight: 1,
          color: '#888',
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        ⠿
      </div>
    </div>
  ) : null;

  // タイトル非表示時の最小ハンドル（右上）
  const bareHandle = !showTitle ? (
    <div
      onMouseDown={startDrag}
      title="ドラッグで移動"
      style={{
        position: 'absolute',
        top: 2 * zoom,
        right: 4 * zoom,
        cursor: 'grab',
        fontSize: Math.max(10, scaledFont),
        lineHeight: 1,
        color: '#888',
      }}
    >
      ⠿
    </div>
  ) : null;

  // レイアウト外枠
  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    left: screenX,
    top: screenY,
    minWidth: scaledMinWidth,
    background: bg,
    border,
    borderRadius: legend.borderWidth > 0 ? 4 : 0,
    padding: 8 * zoom,
    fontSize: scaledFont,
    fontFamily: fontFamily ?? undefined,
    boxShadow: legend.backgroundStyle === 'white' && legend.borderWidth > 0
      ? '0 2px 6px rgba(0,0,0,0.08)'
      : 'none',
    zIndex: 5,
    cursor: dragging ? 'grabbing' : 'default',
    userSelect: 'none',
  };

  const onSingleClick = (e: React.MouseEvent) => {
    if (isPreview) return;
    e.stopPropagation();
    useTEMStore.getState().selectLegend();
  };

  return (
    <div
      onDoubleClick={openSettings}
      onClick={onSingleClick}
      title="クリックで選択、ダブルクリックで凡例設定"
      style={wrapperStyle}
    >
      {bareHandle}
      {titlePosition === 'top' ? (
        <>
          {titleBlockTop}
          {itemsGrid}
        </>
      ) : (
        // left: タイトルを左、項目を右に並べる
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'stretch' }}>
          {titleBlockLeft}
          <div style={{ flex: 1, minWidth: 0 }}>{itemsGrid}</div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Sample Icons
// ============================================================================

function LegendSampleIcon({
  item,
  zoom,
  width = 32,
  height = 18,
}: {
  item: LegendItem;
  zoom: number;
  width?: number;
  height?: number;
}) {
  const w = width * zoom;
  const h = height * zoom;

  if (item.category === 'box') {
    const isPEfp = item.key === 'P-EFP' || item.key === 'P-2nd-EFP';
    if (isPEfp) {
      return (
        <div
          style={{
            width: w - 4 * zoom,
            height: h - 4 * zoom,
            margin: 2 * zoom,
            border: `1.5px dashed #222`,
            outline: `1.5px dashed #222`,
            outlineOffset: `${2 * zoom}px`,
            background: '#fff',
            flexShrink: 0,
            boxSizing: 'border-box',
          }}
        />
      );
    }
    const spec = BOX_RENDER_SPECS[item.key] ?? BOX_RENDER_SPECS.normal;
    return (
      <div
        style={{
          width: w,
          height: h,
          border: `${spec.borderWidth * zoom}px ${spec.borderStyle} #222`,
          background: '#fff',
          flexShrink: 0,
        }}
      />
    );
  }

  if (item.category === 'line') {
    const isDashed = item.key === 'XLine';
    return (
      <svg width={w} height={h} style={{ flexShrink: 0 }}>
        <defs>
          <marker id={`legend-arrow-${item.key}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#222" />
          </marker>
        </defs>
        <line
          x1={2}
          y1={h / 2}
          x2={w - 4}
          y2={h / 2}
          stroke="#222"
          strokeWidth={1.5 * zoom}
          strokeDasharray={isDashed ? `${4 * zoom} ${2 * zoom}` : undefined}
          markerEnd={`url(#legend-arrow-${item.key})`}
        />
      </svg>
    );
  }

  if (item.category === 'sdsg') {
    const isSD = item.key === 'SD';
    const points = isSD
      ? `0,0 ${w},0 ${w},${h * 0.55} ${w / 2},${h} 0,${h * 0.55}`
      : `${w / 2},0 ${w},${h * 0.45} ${w},${h} 0,${h} 0,${h * 0.45}`;
    return (
      <svg width={w} height={h} style={{ flexShrink: 0 }}>
        <polygon points={points} fill="#fff" stroke="#333" strokeWidth={1} />
      </svg>
    );
  }

  if (item.category === 'timeArrow') {
    return (
      <svg width={w} height={h} style={{ flexShrink: 0 }}>
        <defs>
          <marker id="legend-time-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#222" />
          </marker>
        </defs>
        <line
          x1={2}
          y1={h / 2}
          x2={w - 4}
          y2={h / 2}
          stroke="#222"
          strokeWidth={2.5 * zoom}
          markerEnd="url(#legend-time-arrow)"
        />
      </svg>
    );
  }

  return null;
}
