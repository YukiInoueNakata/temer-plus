// ============================================================================
// CSVImportDialog - CSV インポート（Box / Line / SDSG / 時期ラベル）
// - エンティティ種別を切替えて取り込み
// - ファイル読込 → プレビュー → 列マッピング → インポート
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTEMStore, useActiveSheet } from '../store/store';
import {
  FIELD_LABELS,
  LINE_FIELD_LABELS,
  SDSG_FIELD_LABELS,
  PERIOD_LABEL_FIELD_LABELS,
  buildBoxesFromRows,
  buildLinesFromRows,
  buildSDSGsFromRows,
  buildPeriodLabelsFromRows,
  guessFieldKind,
  guessLineFieldKind,
  guessSDSGFieldKind,
  guessPeriodLabelFieldKind,
  parseCsvFile,
  type CsvFieldKind,
  type LineCsvFieldKind,
  type SDSGCsvFieldKind,
  type PeriodLabelCsvFieldKind,
  type ParsedCsv,
} from '../utils/csvImport';
import type { BoxType } from '../types';
import { BOX_TYPE_LABELS, LEVEL_PX } from '../store/defaults';

type EntityKind = 'box' | 'line' | 'sdsg' | 'period';

const BOX_FIELD_OPTIONS: CsvFieldKind[] = [
  'ignore', 'label', 'type', 'timeLevel', 'itemLevel', 'id', 'subLabel', 'description', 'width', 'height',
];
const LINE_FIELD_OPTIONS: LineCsvFieldKind[] = [
  'ignore', 'id', 'from', 'to', 'type', 'shape', 'label', 'description',
];
const SDSG_FIELD_OPTIONS: SDSGCsvFieldKind[] = [
  'ignore', 'id', 'type', 'label', 'attachedTo', 'attachedTo2', 'anchorMode', 'spaceMode', 'subLabel', 'description',
];
const PERIOD_FIELD_OPTIONS: PeriodLabelCsvFieldKind[] = ['ignore', 'id', 'position', 'label'];

const ENTITY_LABELS: Record<EntityKind, string> = {
  box: 'Box',
  line: 'Line（矢印）',
  sdsg: 'SDSG（社会的方向 / ガイド）',
  period: '時期ラベル',
};

type InsertMode = 'append' | 'new-sheet' | 'between';

export function CSVImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const doc = useTEMStore((s) => s.doc);
  const sheet = useActiveSheet();
  const importBoxes = useTEMStore((s) => s.importBoxes);
  const importLines = useTEMStore((s) => s.importLines);
  const importSDSGs = useTEMStore((s) => s.importSDSGs);
  const importPeriodLabels = useTEMStore((s) => s.importPeriodLabels);
  const addSheet = useTEMStore((s) => s.addSheet);
  const switchSheet = useTEMStore((s) => s.setActiveSheet);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [entityKind, setEntityKind] = useState<EntityKind>('box');
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<string[]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [defaultType, setDefaultType] = useState<BoxType>('normal');
  const [insertMode, setInsertMode] = useState<InsertMode>('append');
  const [afterBoxId, setAfterBoxId] = useState<string>('');
  const [beforeBoxId, setBeforeBoxId] = useState<string>('');
  const [gap, setGap] = useState(20);
  const [autoConnect, setAutoConnect] = useState(false);
  const [lineType, setLineType] = useState<'RLine' | 'XLine'>('RLine');
  const [error, setError] = useState<string | null>(null);

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

  const previewRows = useMemo(() => {
    if (!parsed) return [] as string[][];
    const rows = hasHeader ? parsed.rows.slice(1) : parsed.rows;
    return rows.slice(0, 5);
  }, [parsed, hasHeader]);

  const existingIds = useMemo(() => {
    const s = new Set<string>();
    doc.sheets.forEach((sh) => {
      sh.boxes.forEach((b) => s.add(b.id));
      sh.lines.forEach((l) => s.add(l.id));
      sh.sdsg.forEach((sg) => s.add(sg.id));
      sh.periodLabels.forEach((p) => s.add(p.id));
    });
    return s;
  }, [doc]);

  const validBoxIds = useMemo(() => new Set(sheet?.boxes.map((b) => b.id) ?? []), [sheet]);
  const validLineIds = useMemo(() => new Set(sheet?.lines.map((l) => l.id) ?? []), [sheet]);

  if (!open) return null;

  // エンティティ別 helper
  const fieldOptionsFor = (kind: EntityKind): { value: string; label: string }[] => {
    switch (kind) {
      case 'box': return BOX_FIELD_OPTIONS.map((f) => ({ value: f, label: FIELD_LABELS[f] }));
      case 'line': return LINE_FIELD_OPTIONS.map((f) => ({ value: f, label: LINE_FIELD_LABELS[f] }));
      case 'sdsg': return SDSG_FIELD_OPTIONS.map((f) => ({ value: f, label: SDSG_FIELD_LABELS[f] }));
      case 'period': return PERIOD_FIELD_OPTIONS.map((f) => ({ value: f, label: PERIOD_LABEL_FIELD_LABELS[f] }));
    }
  };

  const guessFor = (header: string, kind: EntityKind): string => {
    switch (kind) {
      case 'box': return guessFieldKind(header);
      case 'line': return guessLineFieldKind(header);
      case 'sdsg': return guessSDSGFieldKind(header);
      case 'period': return guessPeriodLabelFieldKind(header);
    }
  };

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

  // mapping を再算出（ファイル読込後 / エンティティ種別変更時）
  const recomputeMapping = (p: ParsedCsv, kind: EntityKind) => {
    const cols = p.rows[0]?.length ?? 0;
    const map: string[] = [];
    if (p.probableHeader && p.rows.length > 0) {
      for (let i = 0; i < cols; i++) {
        map.push(guessFor(p.rows[0][i] ?? '', kind));
      }
    } else {
      // ヘッダなし: Box は 1 列目を label に、それ以外は ignore のまま（必須列はユーザが指定）
      for (let i = 0; i < cols; i++) {
        map.push(kind === 'box' && i === 0 ? 'label' : 'ignore');
      }
    }
    setMapping(map);
  };

  const handleFile = async (f: File) => {
    setError(null);
    try {
      const p = await parseCsvFile(f);
      setParsed(p);
      setHasHeader(p.probableHeader);
      recomputeMapping(p, entityKind);
    } catch (e) {
      setError(`CSV パースに失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const onChangeEntity = (kind: EntityKind) => {
    setEntityKind(kind);
    if (parsed) recomputeMapping(parsed, kind);
  };

  const runImport = () => {
    if (!parsed) return;
    setError(null);

    if (entityKind === 'box') {
      let startTime = 0;
      const baseItem = 0;
      if (insertMode === 'append' && sheet && sheet.boxes.length > 0) {
        const isH = doc.settings.layout === 'horizontal';
        const maxT = Math.max(...sheet.boxes.map((b) => (isH ? b.x + b.width : b.y + b.height)));
        startTime = Math.ceil(maxT / LEVEL_PX) + 1;
      }
      const result = buildBoxesFromRows(parsed.rows, {
        mapping: mapping as CsvFieldKind[],
        hasHeader,
        defaultType,
        defaultWidth: doc.settings.defaultBoxSize.width,
        defaultHeight: doc.settings.defaultBoxSize.height,
        defaultFontSize: doc.settings.defaultFontSize,
        defaultTextOrientation: doc.settings.layout === 'horizontal' ? 'vertical' : 'horizontal',
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
      if (insertMode === 'new-sheet') {
        const newId = addSheet('CSV インポート');
        switchSheet(newId);
        setTimeout(() => {
          importBoxes(result.boxes, result.lines);
          finishImport(`${result.boxes.length} 件の Box、${result.lines.length} 件の Line をインポートしました`, result.errors);
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
        importBoxes(result.boxes, result.lines);
      }
      finishImport(`${result.boxes.length} 件の Box、${result.lines.length} 件の Line をインポートしました`, result.errors);
      return;
    }

    if (entityKind === 'line') {
      const result = buildLinesFromRows(parsed.rows, {
        mapping: mapping as LineCsvFieldKind[],
        hasHeader,
        defaultType: lineType,
        defaultShape: 'straight',
        existingIds,
        validBoxIds,
      });
      if (result.lines.length === 0) {
        setError('インポート可能な Line がありませんでした。from / to 列を割り当て、from/to の値が現在のシートの Box ID と一致する必要があります。');
        return;
      }
      importLines(result.lines);
      finishImport(`${result.lines.length} 件の Line をインポートしました`, result.errors);
      return;
    }

    if (entityKind === 'sdsg') {
      const result = buildSDSGsFromRows(parsed.rows, {
        mapping: mapping as SDSGCsvFieldKind[],
        hasHeader,
        existingIds,
        validBoxIds,
        validLineIds,
      });
      if (result.sdsgs.length === 0) {
        setError('インポート可能な SDSG がありませんでした。type と attachedTo 列が必要です。');
        return;
      }
      importSDSGs(result.sdsgs);
      finishImport(`${result.sdsgs.length} 件の SDSG をインポートしました`, result.errors);
      return;
    }

    // period
    const result = buildPeriodLabelsFromRows(parsed.rows, {
      mapping: mapping as PeriodLabelCsvFieldKind[],
      hasHeader,
      existingIds,
    });
    if (result.periodLabels.length === 0) {
      setError('インポート可能な時期ラベルがありませんでした。position と label 列を割り当ててください。');
      return;
    }
    importPeriodLabels(result.periodLabels);
    finishImport(`${result.periodLabels.length} 件の時期ラベルをインポートしました`, result.errors);
  };

  const finishImport = (successMsg: string, errors: string[]) => {
    if (errors.length > 0) {
      alert(`インポート完了（警告 ${errors.length} 件）\n\n${errors.join('\n')}`);
    } else {
      alert(successMsg);
    }
    onClose();
  };

  const fieldOptions = fieldOptionsFor(entityKind);
  const showBoxOptions = entityKind === 'box';

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
          <section className="settings-section">
            <div className="setting-row">
              <label>インポート対象</label>
              <select value={entityKind} onChange={(e) => onChangeEntity(e.target.value as EntityKind)}>
                {(Object.keys(ENTITY_LABELS) as EntityKind[]).map((k) => (
                  <option key={k} value={k}>{ENTITY_LABELS[k]}</option>
                ))}
              </select>
            </div>
          </section>

          {!parsed && (
            <section className="settings-section">
              <p className="hint" style={{ marginTop: 0 }}>
                CSV ファイルを選択してください。1 行目にヘッダがある場合は自動判定します。
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
                <strong>仕様メモ ({ENTITY_LABELS[entityKind]}):</strong>
                <ul style={{ marginTop: 4 }}>
                  {entityKind === 'box' && (
                    <>
                      <li>必須列: ラベル（label）</li>
                      <li>オプション列: 種別 / Time Level / Item Level / ID / サブラベル / 説明 / 幅 / 高さ</li>
                      <li>種別は英名（BFP / EFP / P-EFP / OPP / annotation / 2nd-EFP）または日本語（分岐点・等至点・両極化等至点・必須通過点・潜在経験・第二等至点）</li>
                    </>
                  )}
                  {entityKind === 'line' && (
                    <>
                      <li>必須列: from（始点 Box ID）/ to（終点 Box ID）</li>
                      <li>オプション列: ID / type (RLine/XLine) / shape (straight/elbow/curve) / label / 説明</li>
                      <li>from / to は<strong>現在のシート</strong>に存在する Box ID と一致する必要があります</li>
                    </>
                  )}
                  {entityKind === 'sdsg' && (
                    <>
                      <li>必須列: type (SD/SG) / attachedTo（Box または Line ID）</li>
                      <li>オプション列: ID / label / attachedTo2 / anchorMode (single/between) / spaceMode (attached/band-top/band-bottom) / subLabel / 説明</li>
                      <li>attachedTo2 を指定すると between モードになります（明示的に single を指定すれば single）</li>
                    </>
                  )}
                  {entityKind === 'period' && (
                    <>
                      <li>必須列: position（Time Level の数値）/ label</li>
                      <li>オプション列: ID</li>
                    </>
                  )}
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
                            {parsed.rows[0]?.[i] ?? ''}
                            {!hasHeader && parsed.rows[1] && (
                              <span style={{ color: '#999' }}> / {parsed.rows[1][i]}</span>
                            )}
                          </td>
                          <td style={{ border: '1px solid #ddd', padding: '2px 6px' }}>
                            <select
                              value={kind}
                              onChange={(e) => {
                                const v = e.target.value;
                                setMapping((m) => m.map((x, j) => (j === i ? v : x)));
                              }}
                            >
                              {fieldOptions.map((f) => (
                                <option key={f.value} value={f.value}>{f.label}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {showBoxOptions && (
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
              )}

              {entityKind === 'line' && (
                <section className="settings-section">
                  <h4>配置オプション</h4>
                  <div className="setting-row">
                    <label>type 未指定時のデフォルト</label>
                    <select value={lineType} onChange={(e) => setLineType(e.target.value as 'RLine' | 'XLine')}>
                      <option value="RLine">実線（RLine）</option>
                      <option value="XLine">点線（XLine）</option>
                    </select>
                  </div>
                </section>
              )}

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
