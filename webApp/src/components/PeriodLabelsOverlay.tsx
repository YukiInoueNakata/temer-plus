// ============================================================================
// PeriodLabelsOverlay - 時期ラベルをキャンバス上に描画
// - bandStyle: 'tick' = 単独ラベル + 短い区切り線
//   bandStyle: 'band' = |---時期1---|---時期2---| の帯表記
// ============================================================================

import { useStore as useReactFlowStore } from 'reactflow';
import { computePeriodLabels } from '../utils/periodLabels';
import { renderVerticalAwareText } from '../utils/verticalText';
import { useTEMView } from '../context/TEMViewContext';

export function PeriodLabelsOverlay() {
  const view = useTEMView();
  const sheet = view.sheet;
  const layout = view.settings.layout;
  const settings = view.settings.periodLabels;
  const timeArrowSettings = view.settings.timeArrow;
  const transform = useReactFlowStore((s) => s.transform);

  if (!sheet || !settings.alwaysVisible) return null;
  if (sheet.periodLabels.length === 0) return null;

  const geom = computePeriodLabels(sheet, layout, settings, timeArrowSettings);
  if (!geom) return null;

  const [panX, panY, zoom] = transform;
  const isH = layout === 'horizontal';
  const sideH = settings.labelSideHorizontal ?? 'top';
  const sideV = settings.labelSideVertical ?? 'right';

  // 画面座標への変換
  const toScreen = (wx: number, wy: number) => ({
    x: wx * zoom + panX,
    y: wy * zoom + panY,
  });

  const startScreen = toScreen(geom.startX, geom.startY);
  const endScreen = toScreen(geom.endX, geom.endY);

  // ラベル描画用の共通 DOM（縦書き対応のため div でレンダ）
  const labelDiv = (
    x: number,
    y: number,
    text: string,
    keyId: string,
    align: 'center-under' | 'center-over' | 'left' | 'right',
  ) => {
    const fs = settings.fontSize * zoom;
    const isVert = !isH;
    const style: React.CSSProperties = {
      position: 'absolute',
      left: x,
      top: y,
      fontSize: fs,
      color: '#222',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
      writingMode: isVert ? 'vertical-rl' : undefined,
      textOrientation: isVert ? 'upright' : undefined,
      background: settings.bandStyle === 'band' ? '#fff' : 'transparent',
      padding: settings.bandStyle === 'band' ? `${2 * zoom}px ${6 * zoom}px` : 0,
    };
    // 配置
    if (align === 'center-under') {
      style.transform = 'translate(-50%, 0)';
    } else if (align === 'center-over') {
      style.transform = 'translate(-50%, -100%)';
    } else if (align === 'left') {
      style.transform = 'translate(-100%, -50%)';
    } else if (align === 'right') {
      style.transform = 'translate(0, -50%)';
    }
    return (
      <div key={keyId} style={style}>
        {renderVerticalAwareText(text, isVert)}
      </div>
    );
  };

  // 帯スタイル: 端点 + 各ラベル境界で | を引き、ラベルを中央へ
  if (settings.bandStyle === 'band') {
    // ラベルを time 順にソート（計算済み geom.items は入力順なので並び替え）
    const sortedItems = [...geom.items].sort((a, b) => (isH ? a.x - b.x : a.y - b.y));
    // 境界 time 位置リスト: 開始端 + 各ラベル境界 + 終了端
    const bounds: number[] = [];
    bounds.push(isH ? geom.startX : geom.startY);
    // 各ラベルの前に境界、最後のラベルの後にも境界
    sortedItems.forEach((it, i) => {
      if (i === 0) return;
      const prev = sortedItems[i - 1];
      // 2ラベル間の中点
      const mid = isH ? (prev.x + it.x) / 2 : (prev.y + it.y) / 2;
      bounds.push(mid);
    });
    bounds.push(isH ? geom.endX : geom.endY);
    // 各ラベルは区切り間の中央
    return (
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 1,
          overflow: 'visible',
        }}
      >
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            overflow: 'visible',
          }}
        >
          {/* 主軸線 */}
          {settings.showDividers && (
            <line
              x1={startScreen.x}
              y1={startScreen.y}
              x2={endScreen.x}
              y2={endScreen.y}
              stroke="#555"
              strokeWidth={settings.dividerStrokeWidth * zoom}
            />
          )}
          {/* 境界の | */}
          {settings.showDividers && bounds.map((b, i) => {
            const tickLen = 10 * zoom;
            if (isH) {
              const sx = b * zoom + panX;
              const sy = geom.startY * zoom + panY;
              return (
                <line
                  key={`b${i}`}
                  x1={sx}
                  y1={sy - tickLen / 2}
                  x2={sx}
                  y2={sy + tickLen / 2}
                  stroke="#555"
                  strokeWidth={settings.dividerStrokeWidth * zoom * 1.4}
                />
              );
            } else {
              const sx = geom.startX * zoom + panX;
              const sy = b * zoom + panY;
              return (
                <line
                  key={`b${i}`}
                  x1={sx - tickLen / 2}
                  y1={sy}
                  x2={sx + tickLen / 2}
                  y2={sy}
                  stroke="#555"
                  strokeWidth={settings.dividerStrokeWidth * zoom * 1.4}
                />
              );
            }
          })}
        </svg>
        {sortedItems.map((item, i) => {
          // ラベル中央 = bounds[i] と bounds[i+1] の中点
          const left = bounds[i];
          const right = bounds[i + 1];
          const center = (left + right) / 2;
          if (isH) {
            const sx = center * zoom + panX;
            const sy = geom.startY * zoom + panY;
            if (sideH === 'top') {
              return labelDiv(sx, sy - 2 * zoom, item.label, `lbl${i}`, 'center-over');
            }
            return labelDiv(sx, sy + 2 * zoom, item.label, `lbl${i}`, 'center-under');
          } else {
            const sx = geom.startX * zoom + panX;
            const sy = center * zoom + panY;
            if (sideV === 'right') {
              return labelDiv(sx + 2 * zoom, sy, item.label, `lbl${i}`, 'right');
            }
            return labelDiv(sx - 2 * zoom, sy, item.label, `lbl${i}`, 'left');
          }
        })}
      </div>
    );
  }

  // Tick スタイル（従来）
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1,
        overflow: 'visible',
      }}
    >
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          overflow: 'visible',
        }}
      >
        {settings.showDividers && (
          <line
            x1={startScreen.x}
            y1={startScreen.y}
            x2={endScreen.x}
            y2={endScreen.y}
            stroke="#555"
            strokeWidth={settings.dividerStrokeWidth * zoom}
          />
        )}
        {geom.items.map((item, i) => {
          const ix = item.x * zoom + panX;
          const iy = item.y * zoom + panY;
          const tickLen = 8 * zoom;
          const tick = isH
            ? { x1: ix, y1: iy - tickLen / 2, x2: ix, y2: iy + tickLen / 2 }
            : { x1: ix - tickLen / 2, y1: iy, x2: ix + tickLen / 2, y2: iy };
          return settings.showDividers ? (
            <line
              key={i}
              {...tick}
              stroke="#555"
              strokeWidth={settings.dividerStrokeWidth * zoom}
            />
          ) : null;
        })}
      </svg>
      {geom.items.map((item, i) => {
        const ix = item.x * zoom + panX;
        const iy = item.y * zoom + panY;
        if (isH) {
          if (sideH === 'top') {
            return labelDiv(ix, iy - 2 * zoom, item.label, `lbl${i}`, 'center-over');
          }
          return labelDiv(ix, iy + 2 * zoom, item.label, `lbl${i}`, 'center-under');
        } else {
          if (sideV === 'right') {
            return labelDiv(ix + 2 * zoom, iy, item.label, `lbl${i}`, 'right');
          }
          return labelDiv(ix - 2 * zoom, iy, item.label, `lbl${i}`, 'left');
        }
      })}
    </div>
  );
}
