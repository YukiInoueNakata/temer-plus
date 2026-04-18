// ============================================================================
// PeriodLabelsOverlay - 時期ラベルをキャンバス上に描画
// ============================================================================

import { useStore as useReactFlowStore } from 'reactflow';
import { useTEMStore, useActiveSheet } from '../store/store';
import { computePeriodLabels } from '../utils/periodLabels';

export function PeriodLabelsOverlay() {
  const sheet = useActiveSheet();
  const layout = useTEMStore((s) => s.doc.settings.layout);
  const settings = useTEMStore((s) => s.doc.settings.periodLabels);
  const timeArrowSettings = useTEMStore((s) => s.doc.settings.timeArrow);
  const transform = useReactFlowStore((s) => s.transform);

  if (!sheet || !settings.alwaysVisible) return null;
  if (sheet.periodLabels.length === 0) return null;

  const geom = computePeriodLabels(sheet, layout, settings, timeArrowSettings);
  if (!geom) return null;

  const [panX, panY, zoom] = transform;
  const sx = geom.startX * zoom + panX;
  const sy = geom.startY * zoom + panY;
  const ex = geom.endX * zoom + panX;
  const ey = geom.endY * zoom + panY;

  return (
    <svg
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
      {settings.showDividers && (
        <line
          x1={sx}
          y1={sy}
          x2={ex}
          y2={ey}
          stroke="#555"
          strokeWidth={settings.dividerStrokeWidth * zoom}
        />
      )}
      {geom.items.map((item, i) => {
        const ix = item.x * zoom + panX;
        const iy = item.y * zoom + panY;
        // 横型: ラベルは線の上に / 縦型: 線の左に
        const labelY = layout === 'horizontal' ? iy - settings.fontSize * zoom * 0.3 : iy;
        const labelX = layout === 'horizontal' ? ix : ix - settings.fontSize * zoom * 0.3;
        // 区切り線（短い縦または横）
        const tickLen = 8 * zoom;
        const tick = layout === 'horizontal'
          ? { x1: ix, y1: iy - tickLen / 2, x2: ix, y2: iy + tickLen / 2 }
          : { x1: ix - tickLen / 2, y1: iy, x2: ix + tickLen / 2, y2: iy };
        return (
          <g key={i}>
            {settings.showDividers && (
              <line
                {...tick}
                stroke="#555"
                strokeWidth={settings.dividerStrokeWidth * zoom}
              />
            )}
            <text
              x={labelX}
              y={labelY}
              fontSize={settings.fontSize * zoom}
              textAnchor={layout === 'horizontal' ? 'middle' : 'end'}
              dominantBaseline={layout === 'horizontal' ? 'auto' : 'central'}
              fill="#222"
              style={{
                writingMode: layout === 'vertical' ? 'vertical-rl' : undefined,
                textOrientation: layout === 'vertical' ? 'upright' : undefined,
              }}
            >
              {item.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
