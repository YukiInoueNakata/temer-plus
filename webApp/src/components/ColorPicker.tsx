// ============================================================================
// ColorPicker - PowerPoint 風の色選択ポップオーバー
// - トリガー: 現在色の 20×20 色見本ボタン
// - ポップオーバー: 既定 / 塗りなし / 24 色プリセット / 最近使った色 / HEX+native picker
// - 最近使った色は localStorage で永続化（最大 10 色）
// ============================================================================

import { useEffect, useRef, useState } from 'react';

const RECENT_KEY = 'temer:recent-colors';
const RECENT_MAX = 10;

// 24 色プリセット（3 行 × 8 列）
const PRESET_COLORS: string[] = [
  // Row 1: モノトーン
  '#000000', '#444444', '#666666', '#888888',
  '#BBBBBB', '#DDDDDD', '#F0F0F0', '#FFFFFF',
  // Row 2: 基本純色
  '#D32F2F', '#F57C00', '#FBC02D', '#388E3C',
  '#1976D2', '#7B1FA2', '#C2185B', '#00796B',
  // Row 3: アクセント淡色
  '#FFCDD2', '#FFE0B2', '#FFF9C4', '#C8E6C9',
  '#BBDEFB', '#E1BEE7', '#F8BBD0', '#B2DFDB',
];

interface Props {
  value: string | undefined;
  onChange: (color: string | undefined) => void;
  /** 「塗りつぶしなし」ボタンを出す（背景・枠色向け） */
  allowNone?: boolean;
  /** 「自動（既定）」ボタンを出す（undefined にリセット） */
  allowDefault?: boolean;
  /** 「自動（既定）」のラベルをカスタマイズ */
  defaultLabel?: string;
  /** 「塗りつぶしなし」のラベルをカスタマイズ */
  noneLabel?: string;
  /** トリガーボタンのタイトル（a11y 用） */
  title?: string;
  /** サイズを小さく（テーブルセル内など） */
  compact?: boolean;
}

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function pushRecent(color: string): string[] {
  try {
    const cur = loadRecent();
    const next = [color, ...cur.filter((c) => c.toLowerCase() !== color.toLowerCase())].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    return next;
  } catch {
    return loadRecent();
  }
}

function normalizeHex(input: string): string | null {
  const s = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`.toUpperCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s.toUpperCase()}`;
  if (/^[0-9a-fA-F]{8}$/.test(s)) return `#${s.toUpperCase()}`;
  return null;
}

// ポップオーバーの推定サイズ（画面端判定用）
const POPOVER_WIDTH = 232;
const POPOVER_HEIGHT_MAX = 360; // 自動 + プリセット 3 行 + recent 3 行 + custom

export function ColorPicker({
  value,
  onChange,
  allowNone = false,
  allowDefault = true,
  defaultLabel = '自動（既定）',
  noneLabel = '塗りつぶしなし',
  title,
  compact = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const [hexInput, setHexInput] = useState(value ?? '');
  const [popPos, setPopPos] = useState<{ left: number; top: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHexInput(value ?? '');
  }, [value]);

  // 開いた時にトリガーの bounding rect を計算し、画面端を考慮してポップオーバー位置を決定。
  // viewport を超えそうなら反対側に展開（fixed 配置）。
  useEffect(() => {
    if (!open) { setPopPos(null); return; }
    const trigger = rootRef.current?.querySelector('button');
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    // 横: 右側に余裕があれば左揃え、なければ右揃え
    let left = rect.left;
    if (left + POPOVER_WIDTH + margin > vw) {
      left = Math.max(margin, rect.right - POPOVER_WIDTH);
    }
    // 縦: 下に余裕があれば下、なければ上に展開
    let top = rect.bottom + 4;
    if (top + POPOVER_HEIGHT_MAX + margin > vh) {
      const above = rect.top - 4 - POPOVER_HEIGHT_MAX;
      top = above >= margin ? above : Math.max(margin, vh - POPOVER_HEIGHT_MAX - margin);
    }
    setPopPos({ left, top });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // スクロール / リサイズで閉じる（fixed 位置の追従より閉じる方がシンプル）
    const onScrollOrResize = () => setOpen(false);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open]);

  const pick = (color: string | undefined) => {
    onChange(color);
    if (color) setRecent(pushRecent(color));
    setOpen(false);
  };

  const size = compact ? 18 : 22;
  const swatchSize = compact ? 18 : 20;

  const triggerBg = value === undefined
    ? 'linear-gradient(135deg, #fff 0 50%, #ccc 50% 100%)'   // 「自動」感の斜線
    : value === 'transparent' || value === 'none'
      ? 'repeating-linear-gradient(45deg, #fff, #fff 4px, #eee 4px, #eee 8px)'  // チェック「なし」
      : value;

  return (
    <div
      ref={rootRef}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}
    >
      <button
        type="button"
        title={title ?? (value ?? defaultLabel)}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
          padding: 2,
          height: size + 4,
          border: '1px solid #bbb',
          borderRadius: 3,
          background: '#fff',
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: swatchSize,
            height: swatchSize,
            background: triggerBg,
            border: '1px solid #999',
            borderRadius: 2,
          }}
        />
        <span style={{ fontSize: 9, color: '#666', lineHeight: 1 }}>▼</span>
      </button>

      {open && popPos && (
        <div
          ref={popRef}
          style={{
            position: 'fixed',
            top: popPos.top,
            left: popPos.left,
            zIndex: 9999,
            background: '#fff',
            border: '1px solid #bbb',
            borderRadius: 4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: 8,
            width: POPOVER_WIDTH,
            maxHeight: POPOVER_HEIGHT_MAX,
            overflowY: 'auto',
            fontSize: 12,
          }}
        >
          {/* 自動 / 塗りつぶしなし */}
          {(allowDefault || allowNone) && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {allowDefault && (
                <button
                  type="button"
                  onClick={() => pick(undefined)}
                  style={{
                    flex: 1,
                    padding: '4px 6px',
                    border: '1px solid #ccc',
                    borderRadius: 3,
                    background: '#f6f6f6',
                    cursor: 'pointer',
                    fontSize: 11,
                  }}
                >
                  {defaultLabel}
                </button>
              )}
              {allowNone && (
                <button
                  type="button"
                  onClick={() => pick('transparent')}
                  style={{
                    flex: 1,
                    padding: '4px 6px',
                    border: '1px solid #ccc',
                    borderRadius: 3,
                    background: '#f6f6f6',
                    cursor: 'pointer',
                    fontSize: 11,
                  }}
                >
                  {noneLabel}
                </button>
              )}
            </div>
          )}

          {/* プリセット 8×3 */}
          <div style={{ fontSize: 10, color: '#666', marginBottom: 4 }}>プリセット</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 20px)', gap: 3, marginBottom: 8 }}>
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => pick(c)}
                title={c}
                style={{
                  width: 20,
                  height: 20,
                  padding: 0,
                  border: value && value.toLowerCase() === c.toLowerCase() ? '2px solid #2684ff' : '1px solid #999',
                  borderRadius: 2,
                  background: c,
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>

          {/* 最近使った色 */}
          {recent.length > 0 && (
            <>
              <div style={{ fontSize: 10, color: '#666', marginBottom: 4 }}>最近使った色</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 20px)', gap: 3, marginBottom: 8 }}>
                {recent.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => pick(c)}
                    title={c}
                    style={{
                      width: 20,
                      height: 20,
                      padding: 0,
                      border: value && value.toLowerCase() === c.toLowerCase() ? '2px solid #2684ff' : '1px solid #999',
                      borderRadius: 2,
                      background: c,
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            </>
          )}

          {/* カスタム */}
          <div style={{ fontSize: 10, color: '#666', marginBottom: 4 }}>カスタム</div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="#RRGGBB"
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const h = normalizeHex(hexInput);
                  if (h) pick(h);
                }
              }}
              style={{
                flex: 1,
                padding: '3px 6px',
                border: '1px solid #ccc',
                borderRadius: 3,
                fontFamily: 'monospace',
                fontSize: 11,
              }}
            />
            <button
              type="button"
              onClick={() => {
                const h = normalizeHex(hexInput);
                if (h) pick(h);
              }}
              style={{
                padding: '3px 8px',
                border: '1px solid #ccc',
                borderRadius: 3,
                background: '#f6f6f6',
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              OK
            </button>
            <input
              type="color"
              value={normalizeHex(value ?? '') ?? '#000000'}
              onChange={(e) => pick(e.target.value.toUpperCase())}
              style={{
                width: 28,
                height: 26,
                padding: 0,
                border: '1px solid #ccc',
                borderRadius: 3,
                cursor: 'pointer',
              }}
              title="OS 標準のカラーピッカー"
            />
          </div>
        </div>
      )}
    </div>
  );
}
