// ============================================================================
// LegendOverlay - キャンバス上の凡例（ドラッグ可能）
// ============================================================================

import { useState, useRef, useEffect } from 'react';
import { useStore as useReactFlowStore } from 'reactflow';
import { useTEMStore, useActiveSheet } from '../store/store';
import { computeLegendItems, type LegendItem } from '../utils/legend';
import { BOX_RENDER_SPECS } from '../store/defaults';

export function LegendOverlay() {
  const sheet = useActiveSheet();
  const legend = useTEMStore((s) => s.doc.settings.legend);
  const transform = useReactFlowStore((s) => s.transform);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ mouseX: 0, mouseY: 0, legendX: 0, legendY: 0 });

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const dx = (e.clientX - startRef.current.mouseX) / transform[2];
      const dy = (e.clientY - startRef.current.mouseY) / transform[2];
      const newX = startRef.current.legendX + dx;
      const newY = startRef.current.legendY + dy;
      // Update settings
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
  }, [dragging, transform]);

  if (!sheet || !legend.alwaysVisible) return null;
  const items = computeLegendItems(sheet, legend);
  if (items.length === 0) return null;

  const [panX, panY, zoom] = transform;
  const screenX = legend.position.x * zoom + panX;
  const screenY = legend.position.y * zoom + panY;
  const scaledFont = legend.fontSize * zoom;
  const scaledMinWidth = legend.minWidth * zoom;

  return (
    <div
      style={{
        position: 'absolute',
        left: screenX,
        top: screenY,
        minWidth: scaledMinWidth,
        background: '#ffffff',
        border: '1px solid #999',
        borderRadius: 4,
        padding: 8 * zoom,
        fontSize: scaledFont,
        boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
        zIndex: 5,
        cursor: dragging ? 'grabbing' : 'default',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          fontWeight: 700,
          marginBottom: 4 * zoom,
          paddingBottom: 4 * zoom,
          borderBottom: '1px solid #ddd',
          cursor: 'grab',
          fontSize: scaledFont * 1.15,
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          startRef.current = {
            mouseX: e.clientX,
            mouseY: e.clientY,
            legendX: legend.position.x,
            legendY: legend.position.y,
          };
          setDragging(true);
        }}
        title="ドラッグで移動"
      >
        ⠿ {legend.title}
      </div>
      {items.map((item) => (
        <div
          key={`${item.category}-${item.key}`}
          style={{ display: 'flex', alignItems: 'center', gap: 6 * zoom, marginBottom: 3 * zoom }}
        >
          <LegendSampleIcon item={item} zoom={zoom} />
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontWeight: 600 }}>{item.label}</div>
            <div style={{ fontSize: scaledFont * 0.85, color: '#666' }}>{item.description}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Sample Icons
// ============================================================================

function LegendSampleIcon({ item, zoom }: { item: LegendItem; zoom: number }) {
  const w = 32 * zoom;
  const h = 18 * zoom;

  if (item.category === 'box') {
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
    const fill = isSD ? '#fff0f0' : '#f0f4ff';
    const stroke = isSD ? '#a33' : '#33a';
    return (
      <svg width={w} height={h} style={{ flexShrink: 0 }}>
        <polygon points={points} fill={fill} stroke={stroke} strokeWidth={1} />
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
