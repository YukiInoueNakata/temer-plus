// ============================================================================
// エクスポート進捗・キャンセル共通 util
// - ProgressInfo: 現在処理中のステップ情報
// - checkAborted: signal.aborted をチェックして中止エラーを投げる
// ============================================================================

export interface ProgressInfo {
  current: number;   // 完了済ステップ数（0 始まり）
  total: number;     // 全ステップ数
  label: string;     // ユーザへの表示文字列（例: 'ページ 3 / 5 をクロップ中'）
}

export type ProgressCallback = (info: ProgressInfo) => void;

/**
 * signal が abort されていたら AbortError を投げる。
 * 各ループの先頭で呼ぶことで、ユーザがキャンセルボタンを押したら即座に処理を中断できる。
 */
export function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Export aborted by user', 'AbortError');
  }
}

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}
