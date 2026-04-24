// ============================================================================
// SDSG attached-anchor resolution
// SDSG.attachedTo は Box ID か Line ID のどちらか。attachedType が設定されて
// いればその種別で直接 Map lookup、未設定 (旧ファイル) は box → line の順で
// フォールバック検索する。
// ============================================================================

import type { SDSG, Box, Line } from '../types';

export type AttachedAnchor =
  | { kind: 'box'; box: Box }
  | { kind: 'line'; line: Line; from: Box; to: Box };

export function resolveAttachedAnchor(
  sg: SDSG,
  boxById: Map<string, Box>,
  lineById: Map<string, Line>,
): AttachedAnchor | null {
  if (sg.attachedType === 'line') {
    const line = lineById.get(sg.attachedTo);
    if (!line) return null;
    const from = boxById.get(line.from);
    const to = boxById.get(line.to);
    if (!from || !to) return null;
    return { kind: 'line', line, from, to };
  }
  if (sg.attachedType === 'box') {
    const box = boxById.get(sg.attachedTo);
    return box ? { kind: 'box', box } : null;
  }
  // 旧ファイル: 先に box を試し、miss したら line
  const box = boxById.get(sg.attachedTo);
  if (box) return { kind: 'box', box };
  const line = lineById.get(sg.attachedTo);
  if (!line) return null;
  const from = boxById.get(line.from);
  const to = boxById.get(line.to);
  if (!from || !to) return null;
  return { kind: 'line', line, from, to };
}

/** AttachedAnchor の中心座標 (single mode で anchor として使う) */
export function anchorCenter(a: AttachedAnchor): { x: number; y: number } {
  if (a.kind === 'box') {
    return { x: a.box.x + a.box.width / 2, y: a.box.y + a.box.height / 2 };
  }
  return {
    x: (a.from.x + a.from.width / 2 + a.to.x + a.to.width / 2) / 2,
    y: (a.from.y + a.from.height / 2 + a.to.y + a.to.height / 2) / 2,
  };
}
