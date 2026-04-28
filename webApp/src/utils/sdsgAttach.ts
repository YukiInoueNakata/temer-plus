// ============================================================================
// SDSG attached-anchor resolution
// SDSG.attachedType ('box' | 'line') は型定義上必須で、新規作成 (store) と
// ファイル読込 (fileIO migration) で必ずセットされる前提。
// 安全のためレガシーデータが渡された場合の最小フォールバック (box → line) は残す。
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
  // 型定義上 attachedType は必須。万一 undefined のレガシーデータが
  // 紛れ込んでもクラッシュしないよう、ここで box → line の保険推定。
  const kind: 'box' | 'line' = (sg.attachedType ?? (boxById.has(sg.attachedTo) ? 'box' : 'line'));
  if (kind === 'line') {
    const line = lineById.get(sg.attachedTo);
    if (!line) return null;
    const from = boxById.get(line.from);
    const to = boxById.get(line.to);
    if (!from || !to) return null;
    return { kind: 'line', line, from, to };
  }
  const box = boxById.get(sg.attachedTo);
  return box ? { kind: 'box', box } : null;
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
