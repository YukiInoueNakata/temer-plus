// ============================================================================
// TEMViewContext - メインキャンバスとプレビューキャンバスで描画情報を共有
//
// - メインキャンバス: Provider を使わない → ストアの値がデフォルトとして取得される
// - プレビューキャンバス: Provider で変換後 doc を注入、アクションは no-op
// - Box / SDSG / Line などの描画コンポーネントは `useTEMView()` を経由して
//   sheet / settings / view / アクションを取る
// ============================================================================

import { createContext, useContext } from 'react';
import type { Sheet, ProjectSettings, ViewState, Box, Line, SDSG } from '../types';
import { useTEMStore, useActiveSheet } from '../store/store';

export interface TEMViewContextValue {
  sheet: Sheet | null;
  settings: ProjectSettings;
  view: ViewState;
  // アクション（プレビューでは no-op）
  updateBox: (id: string, patch: Partial<Box>) => void;
  updateSDSG: (id: string, patch: Partial<SDSG>) => void;
  updateLine?: (id: string, patch: Partial<Line>) => void;
  // プレビューフラグ（編集機能の抑止・インライン編集の無効化などに使用）
  isPreview: boolean;
  // 編集ロック: 'move' モード時に true。リサイズ/インライン編集などを抑止
  editLocked: boolean;
}

export const TEMViewContext = createContext<TEMViewContextValue | null>(null);

/**
 * Context が提供されていればそれを返す。
 * なければストアから取得したフォールバック値を返す（＝メインキャンバス扱い）。
 */
export function useTEMView(): TEMViewContextValue {
  const ctx = useContext(TEMViewContext);
  // ストアの fallback 用 hook（常に呼ぶ必要がある）
  const sheet = useActiveSheet();
  const settings = useTEMStore((s) => s.doc.settings);
  const view = useTEMStore((s) => s.view);
  const updateBox = useTEMStore((s) => s.updateBox);
  const updateSDSG = useTEMStore((s) => s.updateSDSG);
  const updateLine = useTEMStore((s) => s.updateLine);
  if (ctx) return ctx;
  return {
    sheet: sheet ?? null,
    settings,
    view,
    updateBox,
    updateSDSG,
    updateLine,
    isPreview: false,
    editLocked: view.canvasMode === 'move',
  };
}
