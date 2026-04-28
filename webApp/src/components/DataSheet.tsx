// ============================================================================
// DataSheet - Left collapsible sidebar
// 用途: 初期一括作成、複数Boxコピペ追加、ID・ラベル編集、Excel複数行貼付
// ============================================================================

import { useState, useMemo, useRef, useEffect } from 'react';
import { useTEMStore, useActiveSheet } from '../store/store';
import type { BoxType } from '../types';
import { BOX_TYPE_LABELS, LEVEL_PX } from '../store/defaults';
import { SELECTABLE_BOX_TYPES } from '../utils/typeDisplay';
import { xyToTimeLevel, xyToItemLevel, setTimeLevelOnly, setItemLevelOnly } from '../utils/coords';

type DataTab = 'box' | 'line' | 'sdsg';
type SortField = 'id' | 'type' | 'label' | 'timeLevel' | 'itemLevel';
type SortDir = 'asc' | 'desc';

export function DataSheet() {
  const visible = useTEMStore((s) => s.view.dataSheetVisible);
  const toggle = useTEMStore((s) => s.toggleDataSheet);
  const width = useTEMStore((s) => s.view.dataSheetWidth);
  const setWidth = useTEMStore((s) => s.setDataSheetWidth);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      const panel = document.querySelector('.data-sheet') as HTMLElement | null;
      if (!panel) return;
      const left = panel.getBoundingClientRect().left;
      const newWidth = Math.max(50, Math.min(900, e.clientX - left));
      setWidth(newWidth);
    };
    const onUp = () => setResizing(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing, setWidth]);

  if (!visible) {
    return (
      <div className="panel-collapsed left" onClick={toggle} title="データシートを表示">
        <span style={{ writingMode: 'vertical-rl', fontWeight: 600, color: '#444', letterSpacing: '0.1em' }}>
          データシート
        </span>
      </div>
    );
  }

  return (
    <div className="data-sheet" style={{ width }}>
      <div className="panel-header">
        <span>🗂 データシート</span>
        <button className="panel-toggle" onClick={toggle}>×</button>
      </div>
      <div className="panel-body">
        <DataSheetTabs />
      </div>
      <div
        className="panel-resizer"
        onMouseDown={(e) => { e.preventDefault(); setResizing(true); }}
        title="幅を調整"
      />
    </div>
  );
}

function DataSheetTabs() {
  const [tab, setTab] = useState<DataTab>('box');
  return (
    <>
      <div className="inner-tabs">
        <button className={tab === 'box' ? 'active' : ''} onClick={() => setTab('box')}>Box</button>
        <button className={tab === 'line' ? 'active' : ''} onClick={() => setTab('line')}>Line</button>
        <button className={tab === 'sdsg' ? 'active' : ''} onClick={() => setTab('sdsg')}>SD/SG</button>
      </div>
      {tab === 'box' && <BoxTable />}
      {tab === 'line' && <LineTable />}
      {tab === 'sdsg' && <SDSGTable />}
    </>
  );
}

function useResizableColumns(defaults: number[]): [number[], (i: number, w: number) => void] {
  const [widths, setWidths] = useState<number[]>(defaults);
  const update = (i: number, w: number) => {
    setWidths((cur) => cur.map((cw, idx) => (idx === i ? Math.max(30, w) : cw)));
  };
  return [widths, update];
}

function ColHeader({ label, width, onResize, onSort, sortArrow }: {
  label: string;
  width: number;
  onResize: (w: number) => void;
  onSort?: () => void;
  sortArrow?: string;
}) {
  const startX = useRef(0);
  const startW = useRef(0);
  const dragging = useRef(false);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startX.current = e.clientX;
    startW.current = width;
    dragging.current = true;
    const move = (ev: MouseEvent) => {
      if (!dragging.current) return;
      onResize(startW.current + (ev.clientX - startX.current));
    };
    const up = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <th style={{ width, minWidth: width, maxWidth: width, position: 'relative' }}>
      <div onClick={onSort} style={{ cursor: onSort ? 'pointer' : 'default' }}>
        {label}{sortArrow}
      </div>
      <div className="col-resizer" onMouseDown={onMouseDown} />
    </th>
  );
}

// ============================================================================
// Box Table
// ============================================================================

function BoxTable() {
  const sheet = useActiveSheet();
  const updateBox = useTEMStore((s) => s.updateBox);
  const addBox = useTEMStore((s) => s.addBox);
  const removeBoxes = useTEMStore((s) => s.removeBoxes);
  const renameBoxId = useTEMStore((s) => s.renameBoxId);
  const changeBoxType = useTEMStore((s) => s.changeBoxType);
  const layout = useTEMStore((s) => s.doc.settings.layout);
  const levelStep = useTEMStore((s) => s.doc.settings.levelStep);
  const selectedBoxIds = useTEMStore((s) => s.selection.boxIds);
  const setSelection = useTEMStore((s) => s.setSelection);
  const pasteAtStore = useTEMStore((s) => s.pasteFromClipboardAt);
  const getClipboardInfo = useTEMStore((s) => s.getClipboardInfo);
  const clipboardBoxCount = getClipboardInfo().boxCount;
  const [pasteMode, setPasteMode] = useState<'offset' | 'midpoint'>(
    () => (localStorage.getItem('temer:paste-mode') as 'offset' | 'midpoint') ?? 'offset',
  );
  const updatePasteMode = (m: 'offset' | 'midpoint') => {
    setPasteMode(m);
    try { localStorage.setItem('temer:paste-mode', m); } catch { /* noop */ }
  };
  const [sortField, setSortField] = useState<SortField>('timeLevel');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filter, setFilter] = useState('');
  const [insertCount, setInsertCount] = useState(1);
  const [colWidths, setColWidth] = useResizableColumns([28, 90, 80, 160, 60, 60, 30]);
  const lastClickedIdx = useRef<number | null>(null);

  const sortedBoxes = useMemo(() => {
    if (!sheet) return [];
    let arr = [...sheet.boxes];
    if (filter) {
      const f = filter.toLowerCase();
      arr = arr.filter((b) =>
        b.id.toLowerCase().includes(f) ||
        b.type.toLowerCase().includes(f) ||
        b.label.toLowerCase().includes(f)
      );
    }
    arr.sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';
      if (sortField === 'id') { av = a.id; bv = b.id; }
      else if (sortField === 'type') { av = a.type; bv = b.type; }
      else if (sortField === 'label') { av = a.label; bv = b.label; }
      else if (sortField === 'timeLevel') { av = a.x; bv = b.x; }
      else if (sortField === 'itemLevel') { av = a.y; bv = b.y; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [sheet, sortField, sortDir, filter]);

  if (!sheet) return null;

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };
  const arrow = (field: SortField) => (sortField === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  const handleInsertAfter = (afterIndex: number, count: number) => {
    const prev = sortedBoxes[afterIndex];
    const next = sortedBoxes[afterIndex + 1];
    const newIds: string[] = [];
    for (let i = 1; i <= count; i++) {
      const ratio = i / (count + 1);
      const newX = prev && next ? prev.x + (next.x - prev.x) * ratio : (prev ? prev.x + LEVEL_PX : LEVEL_PX);
      const newY = prev && next ? prev.y + (next.y - prev.y) * ratio : (prev ? prev.y : 200);
      newIds.push(addBox({ x: newX, y: newY }));
    }
    // addBox は最後の Box だけを選択するので、挿入した全 Box を選択し直す
    if (newIds.length > 0) setSelection(newIds);
  };

  const handleIdEdit = (oldId: string) => {
    const newId = prompt('新しいIDを入力', oldId);
    if (!newId || newId === oldId) return;
    const ok = renameBoxId(oldId, newId);
    if (!ok) alert('IDの変更に失敗しました（重複または無効なID）');
  };

  // Excel 複数行貼付対応: クリップボードから複数行取得 → 各行を新規Boxとして追加
  const handleLabelPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>, currentBoxId: string) => {
    const text = e.clipboardData.getData('text');
    if (!text.includes('\n')) return;  // 単一行なら通常貼付
    e.preventDefault();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return;
    // 先頭行を既存Boxへ、残りは新規Box追加
    updateBox(currentBoxId, { label: lines[0] });
    const currentBox = sheet.boxes.find((b) => b.id === currentBoxId);
    let lastX = currentBox?.x ?? 0;
    const baseY = currentBox?.y ?? 200;
    const newIds: string[] = [currentBoxId];
    for (let i = 1; i < lines.length; i++) {
      lastX += LEVEL_PX;
      newIds.push(addBox({ label: lines[i], x: lastX, y: baseY }));
    }
    if (newIds.length > 0) setSelection(newIds);
  };

  // チェックボックスクリック: Ctrl/Cmd で追加選択、Shift で範囲選択、通常で切替
  const handleSelectClick = (idx: number, boxId: string, e: React.MouseEvent) => {
    const currentSet = new Set(selectedBoxIds);
    if (e.shiftKey && lastClickedIdx.current != null) {
      // 範囲選択: lastClicked〜idx 全部を selectedBoxIds に加える
      const from = Math.min(lastClickedIdx.current, idx);
      const to = Math.max(lastClickedIdx.current, idx);
      const rangeIds = sortedBoxes.slice(from, to + 1).map((x) => x.id);
      setSelection(Array.from(new Set([...selectedBoxIds, ...rangeIds])));
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd: トグル
      if (currentSet.has(boxId)) currentSet.delete(boxId);
      else currentSet.add(boxId);
      setSelection(Array.from(currentSet));
      lastClickedIdx.current = idx;
    } else {
      // 通常クリック: トグル（選択中ならこの 1 つだけに／非選択なら追加）
      if (currentSet.has(boxId) && currentSet.size === 1) {
        setSelection([]);
      } else {
        setSelection([boxId]);
      }
      lastClickedIdx.current = idx;
    }
  };

  const allVisibleSelected = sortedBoxes.length > 0 && sortedBoxes.every((b) => selectedBoxIds.includes(b.id));
  const toggleSelectAll = () => {
    if (allVisibleSelected) setSelection([]);
    else setSelection(sortedBoxes.map((b) => b.id));
  };

  return (
    <>
      <div className="table-toolbar">
        <input
          placeholder="🔍 絞り込み"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="filter-input"
        />
        {selectedBoxIds.length > 0 && (
          <span style={{ fontSize: '0.77em', color: '#2684ff', marginLeft: 4 }}>
            選択 {selectedBoxIds.length}個
          </span>
        )}
        <label style={{ marginLeft: 'auto', fontSize: '0.78em', color: '#666', display: 'flex', alignItems: 'center', gap: 4 }}>
          貼付モード:
          <select
            value={pasteMode}
            onChange={(e) => updatePasteMode(e.target.value as 'offset' | 'midpoint')}
            style={{ fontSize: '0.88em' }}
            title="クリップボード挿入時の座標決定方式"
          >
            <option value="offset">+20 オフセット</option>
            <option value="midpoint">中間配置（前後 Box の中間 Time）</option>
          </select>
        </label>
      </div>
      <div style={{ overflow: 'auto' }}>
        <table className="data-table resizable">
          <thead>
            <tr>
              <th style={{ width: colWidths[0], minWidth: colWidths[0], textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                  title="表示中の全て選択/解除"
                />
              </th>
              <ColHeader label="ID" width={colWidths[1]} onResize={(w) => setColWidth(1, w)} onSort={() => handleSort('id')} sortArrow={arrow('id')} />
              <ColHeader label="種別" width={colWidths[2]} onResize={(w) => setColWidth(2, w)} onSort={() => handleSort('type')} sortArrow={arrow('type')} />
              <ColHeader label="ラベル" width={colWidths[3]} onResize={(w) => setColWidth(3, w)} onSort={() => handleSort('label')} sortArrow={arrow('label')} />
              <ColHeader label="Time" width={colWidths[4]} onResize={(w) => setColWidth(4, w)} onSort={() => handleSort('timeLevel')} sortArrow={arrow('timeLevel')} />
              <ColHeader label="Item" width={colWidths[5]} onResize={(w) => setColWidth(5, w)} onSort={() => handleSort('itemLevel')} sortArrow={arrow('itemLevel')} />
              <ColHeader label="" width={colWidths[6]} onResize={(w) => setColWidth(6, w)} />
            </tr>
          </thead>
          <tbody>
            <InsertSlot
              kind="box"
              index={0}
              disabled={clipboardBoxCount === 0}
              pasteCount={clipboardBoxCount}
              onPaste={() => pasteAtStore('box', 0, {
                mode: pasteMode,
                prevBoxId: undefined,
                nextBoxId: sortedBoxes[0]?.id,
              })}
              colSpan={7}
            />
            {sortedBoxes.map((b, idx) => (
              <>
                <tr key={b.id} className={selectedBoxIds.includes(b.id) ? 'row-selected' : ''}>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedBoxIds.includes(b.id)}
                      onClick={(e) => handleSelectClick(idx, b.id, e)}
                      onChange={() => { /* handled by onClick */ }}
                      title="クリック: 単独選択 / Ctrl+クリック: 追加 / Shift+クリック: 範囲選択"
                    />
                  </td>
                  <td>
                    <input
                      value={b.id}
                      readOnly
                      onDoubleClick={() => handleIdEdit(b.id)}
                      style={{ fontFamily: 'monospace', cursor: 'pointer' }}
                      title="ダブルクリックで変更"
                    />
                  </td>
                  <td>
                    <select
                      value={b.type}
                      onChange={(e) => changeBoxType(b.id, e.target.value as BoxType)}
                      title="変更するとIDも自動更新"
                    >
                      {SELECTABLE_BOX_TYPES.map((t) => (
                        <option key={t} value={t}>{BOX_TYPE_LABELS[t].shortJa}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <textarea
                      value={b.label}
                      onChange={(e) => updateBox(b.id, { label: e.target.value })}
                      onPaste={(e) => handleLabelPaste(e, b.id)}
                      rows={1}
                      title="Excelから複数行コピペ可"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step={levelStep}
                      value={xyToTimeLevel(b.x, b.y, layout).toFixed(1)}
                      onChange={(e) => {
                        const p = setTimeLevelOnly(b.x, b.y, Number(e.target.value), layout);
                        updateBox(b.id, p);
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step={levelStep}
                      value={xyToItemLevel(b.x, b.y, layout).toFixed(1)}
                      onChange={(e) => {
                        const p = setItemLevelOnly(b.x, b.y, Number(e.target.value), layout);
                        updateBox(b.id, p);
                      }}
                    />
                  </td>
                  <td>
                    <button
                      className="row-btn"
                      onClick={() => {
                        if (!sheet) return;
                        const sheetIdx = sheet.boxes.findIndex((x) => x.id === b.id);
                        if (sheetIdx >= 0) {
                          pasteAtStore('box', sheetIdx + 1, {
                            mode: pasteMode,
                            prevBoxId: b.id,
                            nextBoxId: sortedBoxes[idx + 1]?.id,
                          });
                        }
                      }}
                      disabled={clipboardBoxCount === 0}
                      title={clipboardBoxCount > 0 ? `この下にクリップボードを挿入（${clipboardBoxCount} 行、モード: ${pasteMode === 'midpoint' ? '中間配置' : '+20オフセット'}）` : 'クリップボード空'}
                      style={{ opacity: clipboardBoxCount > 0 ? 1 : 0.35 }}
                    >⬇</button>
                    <button className="row-btn danger" onClick={() => removeBoxes([b.id])} title="削除">×</button>
                  </td>
                </tr>
                {idx < sortedBoxes.length - 1 && (
                  <tr className="insert-row" key={`insert-${b.id}`}>
                    <td colSpan={7}>
                      <button
                        className="insert-between-btn"
                        onClick={() => handleInsertAfter(idx, insertCount)}
                        title={`ここに${insertCount}個挿入`}
                      >＋ここに{insertCount > 1 ? `${insertCount}個` : ''}挿入</button>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {sortedBoxes.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#888', padding: 20 }}>
                {filter ? '該当するBoxがありません' : 'Boxがありません。下の「+追加」で作成'}
              </td></tr>
            )}
            <InsertSlot
              kind="box"
              index={sheet?.boxes.length ?? 0}
              disabled={clipboardBoxCount === 0}
              pasteCount={clipboardBoxCount}
              onPaste={() => pasteAtStore('box', sheet?.boxes.length ?? 0, {
                mode: pasteMode,
                prevBoxId: sortedBoxes[sortedBoxes.length - 1]?.id,
                nextBoxId: undefined,
              })}
              colSpan={7}
            />
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <button className="toolbar-btn" onClick={() => addBox()} title="末尾に新規Boxを追加">＋ 新規追加</button>
        <span style={{ fontSize: '0.77em', color: '#666' }}>挿入個数:</span>
        <input
          type="number"
          min={1}
          max={10}
          value={insertCount}
          onChange={(e) => setInsertCount(Math.max(1, Number(e.target.value)))}
          style={{ width: 40 }}
          title="挿入ボタンで追加する個数"
        />
        <span style={{ fontSize: '0.77em', color: '#999' }}>個</span>
      </div>
    </>
  );
}

// ============================================================================
// Line Table
// ============================================================================

function LineTable() {
  const sheet = useActiveSheet();
  const updateLine = useTEMStore((s) => s.updateLine);
  const removeLines = useTEMStore((s) => s.removeLines);
  const [filter, setFilter] = useState('');
  const [colWidths, setColWidth] = useResizableColumns([90, 60, 120, 120, 30]);

  if (!sheet) return null;

  const filtered = filter
    ? sheet.lines.filter((l) =>
        l.id.toLowerCase().includes(filter.toLowerCase()) ||
        l.from.toLowerCase().includes(filter.toLowerCase()) ||
        l.to.toLowerCase().includes(filter.toLowerCase())
      )
    : sheet.lines;

  return (
    <>
      <div className="table-toolbar">
        <input placeholder="🔍 絞り込み" value={filter} onChange={(e) => setFilter(e.target.value)} className="filter-input" />
        <span style={{ fontSize: '0.77em', color: '#666' }}>※ Lineはキャンバスで接続</span>
      </div>
      <div style={{ overflow: 'auto' }}>
        <table className="data-table resizable">
          <thead>
            <tr>
              <ColHeader label="ID" width={colWidths[0]} onResize={(w) => setColWidth(0, w)} />
              <ColHeader label="種別" width={colWidths[1]} onResize={(w) => setColWidth(1, w)} />
              <ColHeader label="From" width={colWidths[2]} onResize={(w) => setColWidth(2, w)} />
              <ColHeader label="To" width={colWidths[3]} onResize={(w) => setColWidth(3, w)} />
              <ColHeader label="" width={colWidths[4]} onResize={(w) => setColWidth(4, w)} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <tr key={l.id}>
                <td><code>{l.id.slice(0, 12)}</code></td>
                <td>
                  <select value={l.type} onChange={(e) => updateLine(l.id, { type: e.target.value as 'RLine' | 'XLine' })}>
                    <option value="RLine">実線</option>
                    <option value="XLine">点線</option>
                  </select>
                </td>
                <td>
                  <select value={l.from} onChange={(e) => updateLine(l.id, { from: e.target.value })}>
                    {sheet.boxes.map((b) => (
                      <option key={b.id} value={b.id}>{b.label || b.id.slice(0, 10)}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select value={l.to} onChange={(e) => updateLine(l.id, { to: e.target.value })}>
                    {sheet.boxes.map((b) => (
                      <option key={b.id} value={b.id}>{b.label || b.id.slice(0, 10)}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <button className="row-btn danger" onClick={() => removeLines([l.id])} title="削除">×</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#888', padding: 20 }}>Lineがありません</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SDSGTable() {
  const sheet = useActiveSheet();
  const selection = useTEMStore((s) => s.selection);
  const addSDSG = useTEMStore((s) => s.addSDSG);
  const updateSDSG = useTEMStore((s) => s.updateSDSG);
  const removeSDSG = useTEMStore((s) => s.removeSDSG);
  const pasteAt = useTEMStore((s) => s.pasteFromClipboardAt);
  const clipboardInfo = useTEMStore((s) => s.getClipboardInfo?.());
  if (!sheet) return null;

  const clipboardSDSGCount = clipboardInfo?.sdsgCount ?? 0;
  const canPaste = clipboardSDSGCount > 0;

  // 追加ボタン: 選択中 Line あれば Line、なければ最後の Box
  const resolveAttachTarget = (): string | null => {
    if (selection.lineIds.length > 0) return selection.lineIds[0];
    const boxes = sheet.boxes;
    if (boxes.length === 0) return null;
    return boxes[boxes.length - 1].id;
  };
  const addOne = (type: 'SD' | 'SG') => {
    const target = resolveAttachTarget();
    if (!target) { alert('先に Box を 1 つ以上作成してください'); return; }
    addSDSG({ type, attachedTo: target });
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, padding: '6px 10px', borderBottom: '1px solid #e0e0e0' }}>
        <button className="ribbon-btn-small" onClick={() => addOne('SD')} disabled={sheet.boxes.length === 0}>+ SD 追加</button>
        <button className="ribbon-btn-small" onClick={() => addOne('SG')} disabled={sheet.boxes.length === 0}>+ SG 追加</button>
        <span style={{ fontSize: '0.82em', color: '#888', alignSelf: 'center', marginLeft: 8 }}>
          {selection.lineIds.length > 0
            ? `→ Line ${selection.lineIds[0]} に紐づけ`
            : sheet.boxes.length > 0
              ? `→ 最後の Box ${sheet.boxes[sheet.boxes.length - 1].id} に紐づけ`
              : '→ Box がありません'}
        </span>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>ID</th><th>種別</th><th>ラベル</th><th>モード</th><th>対象 1</th><th>対象 2</th><th style={{ width: 30 }}></th>
          </tr>
        </thead>
        <tbody>
          <InsertSlot
            kind="sdsg"
            index={0}
            disabled={!canPaste}
            pasteCount={clipboardSDSGCount}
            onPaste={() => pasteAt('sdsg', 0)}
            colSpan={7}
          />
          {sheet.sdsg.map((s, idx) => {
            const isBetween = s.anchorMode === 'between';
            return (
            <tr key={s.id} className="data-row">
              <td><code style={{ fontSize: '0.82em' }}>{s.id}</code></td>
              <td>{s.type}</td>
              <td>
                <textarea
                  value={s.label}
                  onChange={(e) => updateSDSG(s.id, { label: e.target.value })}
                  rows={1}
                  style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.9em', minHeight: 22 }}
                />
              </td>
              <td>
                <select
                  value={isBetween ? 'between' : 'single'}
                  onChange={(e) => {
                    const mode = e.target.value as 'single' | 'between';
                    if (mode === 'between') {
                      // attachedTo2 未指定なら attachedTo 以外の先頭 Box を採用
                      const fallback = sheet.boxes.find((b) => b.id !== s.attachedTo)?.id;
                      updateSDSG(s.id, {
                        anchorMode: 'between',
                        attachedTo2: s.attachedTo2 ?? fallback,
                        betweenMode: s.betweenMode ?? 'edge-to-edge',
                      });
                    } else {
                      updateSDSG(s.id, { anchorMode: 'single', attachedTo2: undefined });
                    }
                  }}
                  style={{ fontSize: '0.82em' }}
                >
                  <option value="single">single</option>
                  <option value="between">between</option>
                </select>
              </td>
              <td>
                <select
                  value={s.attachedTo}
                  onChange={(e) => updateSDSG(s.id, { attachedTo: e.target.value })}
                  style={{ fontFamily: 'monospace', fontSize: '0.82em' }}
                >
                  {!sheet.boxes.some((b) => b.id === s.attachedTo)
                    && !sheet.lines.some((l) => l.id === s.attachedTo) && (
                    <option value={s.attachedTo}>（現: {s.attachedTo}）</option>
                  )}
                  <optgroup label="Box">
                    {sheet.boxes.map((b) => (
                      <option key={b.id} value={b.id}>Box: {b.id}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Line">
                    {sheet.lines.map((l) => (
                      <option key={l.id} value={l.id}>Line: {l.id}</option>
                    ))}
                  </optgroup>
                </select>
              </td>
              <td>
                <select
                  value={s.attachedTo2 ?? ''}
                  disabled={!isBetween}
                  onChange={(e) => {
                    const v = e.target.value || undefined;
                    if (v) {
                      updateSDSG(s.id, {
                        attachedTo2: v,
                        anchorMode: 'between',
                        betweenMode: s.betweenMode ?? 'edge-to-edge',
                      });
                    } else {
                      updateSDSG(s.id, { attachedTo2: undefined, anchorMode: 'single' });
                    }
                  }}
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '0.82em',
                    background: isBetween ? undefined : '#f0f0f0',
                    color: isBetween ? undefined : '#999',
                  }}
                >
                  <option value="">（未指定）</option>
                  <optgroup label="Box">
                    {sheet.boxes.filter((b) => b.id !== s.attachedTo).map((b) => (
                      <option key={b.id} value={b.id}>Box: {b.id}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Line">
                    {sheet.lines.filter((l) => l.id !== s.attachedTo).map((l) => (
                      <option key={l.id} value={l.id}>Line: {l.id}</option>
                    ))}
                  </optgroup>
                </select>
              </td>
              <td style={{ position: 'relative' }}>
                <RowHoverButtons
                  canPaste={canPaste}
                  pasteCount={clipboardSDSGCount}
                  onPaste={() => pasteAt('sdsg', idx + 1)}
                  onDelete={() => removeSDSG(s.id)}
                />
              </td>
            </tr>
            );
          })}
          <InsertSlot
            kind="sdsg"
            index={sheet.sdsg.length}
            disabled={!canPaste}
            pasteCount={clipboardSDSGCount}
            onPaste={() => pasteAt('sdsg', sheet.sdsg.length)}
            colSpan={7}
          />
          {sheet.sdsg.length === 0 && (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#888', padding: 20 }}>
              SD/SG はまだありません。上のボタンから追加できます。
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// 挿入スロット / 行ホバーボタン
// ============================================================================

function InsertSlot(props: {
  kind: 'box' | 'sdsg';
  index: number;
  disabled: boolean;
  pasteCount: number;
  onPaste: () => void;
  colSpan: number;
}) {
  void props.kind; void props.index;
  return (
    <tr>
      <td colSpan={props.colSpan} style={{ padding: 0 }}>
        <button
          onClick={props.onPaste}
          disabled={props.disabled}
          style={{
            width: '100%',
            height: 24,
            border: '1px dashed #b0b8c8',
            background: props.disabled ? '#f6f6f6' : '#fafcff',
            opacity: props.disabled ? 0.4 : 1,
            cursor: props.disabled ? 'not-allowed' : 'pointer',
            fontSize: '0.8em',
            color: '#567',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            transition: 'background-color 0.15s',
          }}
          onMouseEnter={(e) => { if (!props.disabled) e.currentTarget.style.background = '#e8f0ff'; }}
          onMouseLeave={(e) => { if (!props.disabled) e.currentTarget.style.background = '#fafcff'; }}
          title={props.disabled ? 'クリップボードに貼り付け可能な要素がありません' : `ここにクリップボードを挿入（${props.pasteCount} 行）`}
        >
          ＋ クリップボードをここに挿入 {props.pasteCount > 0 ? `(${props.pasteCount} 行)` : ''}
        </button>
      </td>
    </tr>
  );
}

function RowHoverButtons(props: {
  canPaste: boolean;
  pasteCount: number;
  onPaste: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="row-hover-buttons" style={{ display: 'inline-flex', gap: 2 }}>
      <button
        onClick={props.onPaste}
        disabled={!props.canPaste}
        style={{
          width: 24, height: 22, padding: 0,
          border: '1px solid #bbb', borderRadius: 3,
          background: '#fff',
          opacity: props.canPaste ? 1 : 0.35,
          cursor: props.canPaste ? 'pointer' : 'not-allowed',
          fontSize: 12,
        }}
        title={props.canPaste ? `この下にクリップボードを挿入（${props.pasteCount} 行）` : 'クリップボード空'}
      >⬇</button>
    </div>
  );
}
