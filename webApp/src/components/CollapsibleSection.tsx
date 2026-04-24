// ============================================================================
// CollapsibleSection - 折りたたみ可能なセクション
// - <details> をベースに a11y 対応
// - 開閉状態を localStorage に保存（キー: temer:section:<sectionKey>）
// ============================================================================

import { useEffect, useRef, useState, type ReactNode } from 'react';

const LS_PREFIX = 'temer:section:';

interface Props {
  title: string;
  sectionKey: string;
  defaultOpen?: boolean;
  children: ReactNode;
  /** h5 のスタイルに合わせた見出し（PropertyPanel 互換） */
  compact?: boolean;
}

function readState(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(LS_PREFIX + key);
    if (v === null) return fallback;
    return v === '1';
  } catch {
    return fallback;
  }
}

function writeState(key: string, open: boolean): void {
  try { localStorage.setItem(LS_PREFIX + key, open ? '1' : '0'); } catch { /* noop */ }
}

export function CollapsibleSection({ title, sectionKey, defaultOpen = true, children, compact }: Props) {
  const [open, setOpen] = useState<boolean>(() => readState(sectionKey, defaultOpen));
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    writeState(sectionKey, open);
  }, [sectionKey, open]);

  const summaryStyle: React.CSSProperties = compact
    ? {
        cursor: 'pointer',
        padding: '4px 0',
        fontSize: '0.92em',
        fontWeight: 600,
        color: '#555',
        userSelect: 'none',
        listStyle: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }
    : {
        cursor: 'pointer',
        padding: '6px 0',
        fontSize: '0.95em',
        fontWeight: 600,
        color: '#444',
        userSelect: 'none',
        listStyle: 'none',
      };

  return (
    <details
      ref={detailsRef}
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      style={{ margin: '6px 0' }}
    >
      <summary style={summaryStyle}>
        <span style={{ fontSize: '0.75em', color: '#999' }}>{open ? '▼' : '▶'}</span>
        {title}
      </summary>
      <div style={{ paddingTop: 4 }}>
        {children}
      </div>
    </details>
  );
}
