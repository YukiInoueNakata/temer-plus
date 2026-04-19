// ============================================================================
// CSVImportDialog - CSV から Box を一括インポートするダイアログ
// - ファイル読込 → プレビュー
// - 列マッピング UI
// - ヘッダ行の有無、既定値、順次接続、挿入位置
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTEMStore, useActiveSheet } from '../store/store';
import {
  FIELD_LABELS,
  buildBoxesFromRows,
  guessFieldKind,
  parseCsvFile,
  type CsvFieldKind,
  type ParsedCsv,
} from '../utils/csvImport';
import type { BoxType } from '../types';
import { BOX_TYPE_LABELS, LEVEL_PX } from '../store/defaults';

const FIELD_OPTIONS: CsvFieldKind[] = [
  'ignore', 'label', 'type', 'timeLevel', 'itemLevel', 'id', 'subLabel', 'description', 'width', 'height',
];

type InsertMode = 'append' | 'new-sheet' | 'between';

export function CSVImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const doc = useTEMStore((s) => s.doc);
  const sheet = useActiveSheet();
  const importBoxes = useTEMStore((s) => s.importBoxes);
  const addSheet = useTEMStore((s) => s.addSheet);
  const switchSheet = useTEMStore((s) => s.setActiveSheet);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<CsvFieldKind[]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [defaultType, setDefaultType] = useState<BoxType>('normal');
  const [insertMode, setInsertMode] = useState<InsertMode>('append');
  const [afterBoxId, setAfterBoxId] = useState<string>('');
  const [beforeBoxId, setBeforeBoxId] = useState<string>('');
  const [gap, setGap] = useState(20);
  const [autoConnect, setAutoConnect] = useState(false);
  const [lineType, setLineType] = useState<'RLine' | 'XLine'>('RLine');
  const [error, setError] = useState<string | null>(null);

  // ダイアログ位置
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ mouseX: 0, mouseY: 0, dlgX: 0, dlgY: 0 });

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.mouseX;
      const dy = e.clientY - dragStart.current.mouseY;
      setPos({ x: dragStart.current.dlgX + dx, y: dragStart.current.dlgY + dy });
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  if (!open) return null;

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.modal-close')) return;
    const cur = pos ?? { x: window.innerWidth / 2 - 360, y: window.innerHeight / 2 - 280 };
    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, dlgX: cur.x, dlgY: cur.y };
    setPos(cur);
    setDragging(true);
  };

  const modalStyle: React.CSSProperties = pos
    ? { width: 720, maxWidth: '95vw', position: 'absolute', left: pos.x, top: pos.y, margin: 0 }
    : { width: 720, maxWidth: '95vw' };

  const handleFile = async (f: File) => {
    setError(null);
    try {
      const p = await parseCsvFile(f);
      setParsed(p);
      setHasHeader(p.probableHeader);
      // 自動マッピング
      const cols = p.rows[0]?.length ?? 0;
      const map: CsvFieldKind[] = [];
      if (p.probableHeader && p.rows.length > 0) {
        for (let i = 0; i < cols; i++) {
          map.push(guessFieldKind(p.rows[0][i] ?? ''));
        }
      } else {
        // ヘッダなし & 1 列のみなら label に自動アサイン
        for (let i = 0; i < cols; i++) {
          map.push(i === 0 ? 'label' : 'ignore');
        }
      }
      setMapping(map);
    } catch (e) {
      setError(`CSV パースに失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const previewRows = useMemo(() => {
    if (!parsed) return [];
    const rows = hasHeader ? parsed.rows.slice(1) : parsed.rows;
    return rows.slice(0, 5);
  }, [parsed, hasHeader]);

  const existingIds = useMemo(() => {
    const s = new Set<string>();
    doc.sheets.forEach((sh) => {
      sh.boxes.forEach((b) => s.add(b.id));
      sh.lines.forEach((l) => s.add(l.id));
      sh.sdsg.forEach((sg) => s.add(sg.id));
    });
    return s;
  }, [doc]);

  const runImport = () => {
    if (!parsed) return;
    setError(null);

    // 挿入位置の開始 timeLevel 計算
    let startTime = 0;
    let baseItem = 0;
    if (insertMode === 'append' && sheet && sheet.boxes.length > 0) {
      const isH = doc.settings.layout === 'horizontal';
      // 最大 timeLevel の右隣 + 1
      const maxT = Math.max(
        ...sheet.boxes.map((b) => (isH ? b.x + b.width : b.y + b.height)),
      );
      startTime = Math.ceil(maxT / LEVEL_PX) + 1;
    } else if (insertMode === 'between') {
      // between モードのとき: 挿入後に shift されるので起点は 0 から
      // （store.importBoxes が offset を適用する）
      startTime = 0;
    }

    const result = buildBoxesFromRows(parsed.rows, {
      mapping,
      hasHeader,
      defaultType,
      defaultWidth: doc.settings.defaultBoxSize.width,
      defaultHeight: doc.settings.defaultBoxSize.height,
      defaultFontSize: doc.settings.defaultFontSize,
      startTimeLevel: startTime,
      baseItemLevel: baseItem,
      autoConnect,
      connectLineType: lineType,
      existingIds,
      levelPx: LEVEL_PX,
    });

    if (result.boxes.length === 0) {
      setError('インポート可能な Box がありませんでした。ラベル列を割り当てましたか？');
      return;
    }

    // インポート実行
    if (insertMode === 'new-sheet') {
      const newId = addSheet('CSV インポート');
      switchSheet(newId);
      // importBoxes は activeSheet 対象。addSheet が active にしない場合に備えて少し遅らせる
      setTimeout(() => {
        importBoxes(result.boxes, result.lines);
        if (result.errors.length > 0) {
          alert(`インポート完了（警告 ${result.errors.length} 件）\n\n${result.errors.join('\n')}`);
        } else {
          alert(`${result.boxes.length} 件の Box、${result.lines.length} 件の Line をインポートしました`);
        }
        onClose();
      }, 0);
      return;
    }

    if (insertMode === 'between') {
      importBoxes(result.boxes, result.lines, {
        insertAfterBoxId: afterBoxId || undefined,
        insertBeforeBoxId: !afterBoxId && beforeBoxId ? beforeBoxId : undefined,
        gap,
      });
    } else {
      // append
      importBoxes(result.boxes, result.lines);
    }

    if (result.errors.length > 0) {
      alert(`インポート完了（警告 ${result.errors.length} 件）\n\n${result.errors.join('\n')}`);
    } else {
      alert(`${result.boxes.length} 件の Box、${result.lines.length} 件の Line をインポートしました`);
    }
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={modalStyle}>
        <div
          className="modal-header"
          onMouseDown={onHeaderMouseDown}
          style={{ cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none' }}
          title="ドラッグで移動"
        >
          <h3>CSV インポート</h3>
          <button onClick={onClose} className="modal-close">×</button>
        </div>
        <div className="modal-body" style={{ minHeight: 420 }}>
          {!parsed && (
            <section className="settings-section">
              <p className="hint" style={{ marginTop: 0 }}>
                CSV ファイルを選択してください。Box ラベルを少なくとも 1 列含めます。
                1 行目にヘッダ（列名）がある場合は自動判定します。
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              {error && <p style={{ color: '#c33', fontSize: '0.88em' }}>{error}</p>}
              <div style={{ marginTop: 16, fontSize: '0.85em', color: '#666' }}>
                <strong>仕様メモ:</strong>
                <ul style={{ marginTop: 4 }}>
                  <li>必須列: ラベル（label）</li>
                  <li>オプション列: 種別 / Time Level / Item Level / ID / サブラベル / 説明 / 幅 / 高さ</li>
                  <li>種別は英名（BFP / EFP / P-EFP / OPP / annotation / 2nd-EFP）または日本語（分岐点・等至点・両極化等至点・必須通過点・潜在経験・第二等至点）</li>
                  <li>Line / SDSG / 時期ラベルの CSV インポートは将来対応</li>
                </ul>
              </div>
            </section>
          )}

          {parsed && (
            <>
              <section className="settings-section">
                <div className="setting-row">
                  <label>1 行目はヘッダ</label>
                  <input
                    type="checkbox"
                    checked={hasHeader}
                    onChange={(e) => setHasHeader(e.target.checked)}
                  />
                </div>
                <div className="setting-row">
                  <label>区切り文字</label>
                  <span style={{ fontFamily: 'monospace' }}>{JSON.stringify(parsed.delimiter)}</span>
                </div>
                <div className="setting-row">
                  <label>検出行数</label>
                  <span>{parsed.rows.length}（ヘッダ除外: {hasHeader ? parsed.rows.length - 1 : parsed.rows.length}）</span>
                </div>
                <div className="setting-row">
                  <button
                    className="ribbon-btn-small"
                    onClick={() => { setParsed(null); setMapping([]); }}
                  >
                    別ファイルを選ぶ
                  </button>
                </div>
              </section>

              <section className="settings-section">
                <h4>列マッピング</h4>
                <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: '0.85em' }}>
                    <thead>
                      <tr>
                        <th style={{ border: '1px solid #ddd', padding: '4px 6px', background: '#f5f5f5' }}>列 #</th>
                        <th style={{ border: '1px solid #ddd', padding: '4px 6px', background: '#f5f5f5' }}>ヘッダ / 値例</th>
                        <th style={{ border: '1px solid #ddd', padding: '4px 6px', background: '#f5f5f5' }}>割当</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mapping.map((kind, i) => (
                        <tr key={i}>
                          <td style={{ border: '1px solid #ddd', padding: '2px 6px', color: '#666' }}>{i + 1}</td>
                          <td style={{ border: '1px solid #ddd', padding: '2px 6px', fontFamily: 'monospace' }}>
                            {hasHeader ? (parsed.rows[0]?.[i] ?? '') : (parsed.rows[0]?.[i] ?? '')}
                            {!hasHeader && parsed.rows[1] && (
                              <span style={{ color: '#999' }}> / {parsed.rows[1][i]}</span>
                            )}
                          </td>
                          <td style={{ border: '1px solid #ddd', padding: '2px 6px' }}>
                            <select
                              value={kind}
                              onChange={(e) => {
                                const v = e.target.value as CsvFieldKind;
                                setMapping((m) => m.map((x, j) => (j === i ? v : x)));
                              }}
                            >
                              {FIELD_OPTIONS.map((f) => (
                                <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="settings-section">
                <h4>配置オプション</h4>
                <div className="setting-row">
                  <label>種別未指定時のデフォルト</label>
                  <select value={defaultType} onChange={(e) => setDefaultType(e.target.value as BoxType)}>
                    {Object.entries(BOX_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v.ja} ({k})</option>
                    ))}
                  </select>
                </div>
                <div className="setting-row">
                  <label>挿入方式</label>
                  <select value={insertMode} onChange={(e) => setInsertMode(e.target.value as InsertMode)}>
                    <option value="append">現在のシート末尾に追加（最大 Time_Level の右隣）</option>
                    <option value="between">指定 Box の間に挿入（以降をシフト）</option>
                    <option value="new-sheet">新規シートに作成</option>
                  </select>
                </div>
                {insertMode === 'between' && sheet && (
                  <>
                    <div className="setting-row">
                      <label>この Box の直後に挿入</label>
                      <select value={afterBoxId} onChange={(e) => { setAfterBoxId(e.target.value); setBeforeBoxId(''); }}>
                        <option value="">（指定しない）</option>
                        {sheet.boxes.map((b) => (
                          <option key={b.id} value={b.id}>{b.id}: {b.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="setting-row">
                      <label>またはこの Box の直前に挿入</label>
                      <select
                        value={beforeBoxId}
                        onChange={(e) => { setBeforeBoxId(e.target.value); setAfterBoxId(''); }}
                        disabled={!!afterBoxId}
                      >
                        <option value="">（指定しない）</option>
                        {sheet.boxes.map((b) => (
                          <option key={b.id} value={b.id}>{b.id}: {b.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="setting-row">
                      <label>シフト時のギャップ (px)</label>
                      <input
                        type="number"
                        min={0}
                        value={gap}
                        onChange={(e) => setGap(Math.max(0, Number(e.target.value)))}
                        style={{ width: 80 }}
                      />
                    </div>
                  </>
                )}
                <div className="setting-row">
                  <label>Box を順次接続</label>
                  <input
                    type="checkbox"
                    checked={autoConnect}
                    onChange={(e) => setAutoConnect(e.target.checked)}
                  />
                </div>
                {autoConnect && (
                  <div className="setting-row">
                    <label>接続線種</label>
                    <select value={lineType} onChange={(e) => setLineType(e.target.value as 'RLine' | 'XLine')}>
                      <option value="RLine">実線（実現径路）</option>
                      <option value="XLine">点線（未実現径路）</option>
                    </select>
                  </div>
                )}
              </section>

              <section className="settings-section">
                <h4>プレビュー（先頭 5 行）</h4>
                <table style={{ borderCollapse: 'collapse', fontSize: '0.82em' }}>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i}>
                        {row.map((c, j) => (
                          <td key={j} style={{ border: '1px solid #eee', padding: '2px 6px', color: mapping[j] === 'ignore' ? '#aaa' : '#222' }}>
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              {error && <p style={{ color: '#c33', fontSize: '0.88em' }}>{error}</p>}
            </>
          )}
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="ribbon-btn-small" onClick={onClose}>キャンセル</button>
          {parsed && (
            <button className="ribbon-btn-primary" onClick={runImport}>
              インポート
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
