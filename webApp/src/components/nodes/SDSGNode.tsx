// ============================================================================
// SDSGNode - React Flow custom node for SD/SG (ペンタゴン)
// - SD (Social Direction): 径路を妨害する方向を示す（五角形、暗めの配色）
// - SG (Social Guidance): 径路を支援する方向を示す（五角形、明るめの配色）
// レイアウトに応じて向きを変える：
//   横型: SD は上から下向き、SG は下から上向き
//   縦型: SD は左から右向き、SG は右から左向き
// ============================================================================

import { Handle, Position, type NodeProps } from 'reactflow';
import type { SDSG } from '../../types';
import { useTEMStore } from '../../store/store';

export interface SDSGNodeData extends Pick<
  SDSG, 'type' | 'label' | 'width' | 'height' | 'style'
> {
  id: string;
}

export function SDSGNode({ data, selected }: NodeProps<SDSGNodeData>) {
  const layout = useTEMStore((s) => s.doc.settings.layout);
  const width = data.width ?? 70;
  const height = data.height ?? 40;
  const isSD = data.type === 'SD';
  const isHorizontalLayout = layout === 'horizontal';

  // 五角形の頂点を計算
  // 横型: SD=下向き、SG=上向き
  // 縦型: SD=右向き、SG=左向き
  let points: string;
  if (isHorizontalLayout) {
    if (isSD) {
      // 下向き五角形: 平らな上辺、先端下
      points = `0,0 ${width},0 ${width},${height * 0.55} ${width / 2},${height} 0,${height * 0.55}`;
    } else {
      // 上向き五角形: 先端上、平らな下辺
      points = `${width / 2},0 ${width},${height * 0.45} ${width},${height} 0,${height} 0,${height * 0.45}`;
    }
  } else {
    if (isSD) {
      // 右向き五角形
      points = `0,0 ${width * 0.55},0 ${width},${height / 2} ${width * 0.55},${height} 0,${height}`;
    } else {
      // 左向き五角形
      points = `${width * 0.45},0 ${width},0 ${width},${height} ${width * 0.45},${height} 0,${height / 2}`;
    }
  }

  const bgColor = data.style?.backgroundColor ?? (isSD ? '#fff0f0' : '#f0f4ff');
  const borderColor = data.style?.borderColor ?? (isSD ? '#a33' : '#33a');
  const textColor = data.style?.color ?? '#222';
  const fontSize = data.style?.fontSize ?? 11;

  return (
    <div style={{ position: 'relative', width, height }}>
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
    </div>
  );
}
