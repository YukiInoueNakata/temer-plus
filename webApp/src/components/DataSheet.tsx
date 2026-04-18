// ============================================================================
// DataSheet - Left collapsible sidebar
// 用途: 初期一括作成、複数Boxコピペ追加、ID・ラベル編集、Excel複数行貼付
// ============================================================================

import { useState, useMemo, useRef, useEffect } from 'react';
import { useTEMStore, useActiveSheet } from '../store/store';
import type { BoxType } from '../types';
import { BOX_TYPE_LABELS, LEVEL_PX } from '../store/defaults';

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
      const newWidth = Math.max(240, Math.min(900, e.clientX - left));
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
        🗂
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
  const [sortField, setSortField] = useState<SortField>('timeLevel');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filter, setFilter] = useState('');
  const [insertCount, setInsertCount] = useState(1);
  const [colWidths, setColWidth] = useResizableColumns([90, 80, 160, 60, 60, 30]);

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
    for (let i = 1; i <= count; i++) {
      const ratio = i / (count + 1);
      const newX = prev && next ? prev.x + (next.x - prev.x) * ratio : (prev ? prev.x + LEVEL_PX : LEVEL_PX);
      const newY = prev && next ? prev.y + (next.y - prev.y) * ratio : (prev ? prev.y : 200);
      addBox({ x: newX, y: newY });
    }
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
    for (let i = 1; i < lines.length; i++) {
      lastX += LEVEL_PX;
      addBox({ label: lines[i], x: lastX, y: baseY });
    }
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
      </div>
      <div style={{ overflow: 'auto' }}>
        <table className="data-table resizable">
          <thead>
            <tr>
              <ColHeader label="ID" width={colWidths[0]} onResize={(w) => setColWidth(0, w)} onSort={() => handleSort('id')} sortArrow={arrow('id')} />
              <ColHeader label="種別" width={colWidths[1]} onResize={(w) => setColWidth(1, w)} onSort={() => handleSort('type')} sortArrow={arrow('type')} />
              <ColHeader label="ラベル" width={colWidths[2]} onResize={(w) => setColWidth(2, w)} onSort={() => handleSort('label')} sortArrow={arrow('label')} />
              <ColHeader label="Time" width={colWidths[3]} onResize={(w) => setColWidth(3, w)} onSort={() => handleSort('timeLevel')} sortArrow={arrow('timeLevel')} />
              <ColHeader label="Item" width={colWidths[4]} onResize={(w) => setColWidth(4, w)} onSort={() => handleSort('itemLevel')} sortArrow={arrow('itemLevel')} />
              <ColHeader label="" width={colWidths[5]} onResize={(w) => setColWidth(5, w)} />
            </tr>
          </thead>
          <tbody>
            {sortedBoxes.map((b, idx) => (
              <>
                <tr key={b.id}>
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
                    <select value={b.type} onChange={(e) => updateBox(b.id, { type: e.target.value as BoxType })}>
                      {(['normal', 'BFP', 'EFP', 'P-EFP', 'OPP', 'annotation'] as const).map((t) => (
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
                      step="0.1"
                      value={(b.x / LEVEL_PX).toFixed(1)}
                      onChange={(e) => updateBox(b.id, { x: Number(e.target.value) * LEVEL_PX })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.1"
                      value={(b.y / LEVEL_PX).toFixed(1)}
                      onChange={(e) => updateBox(b.id, { y: Number(e.target.value) * LEVEL_PX })}
                    />
                  </td>
                  <td>
                    <button className="row-btn danger" onClick={() => removeBoxes([b.id])} title="削除">×</button>
                  </td>
                </tr>
                {idx < sortedBoxes.length - 1 && (
                  <tr className="insert-row" key={`insert-${b.id}`}>
                    <td colSpan={6}>
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
              <tr><td colSpan={6} style={{ textAlign: 'center', color: '#888', padding: 20 }}>
                {filter ? '該当するBoxがありません' : 'Boxがありません。下の「+追加」で作成'}
              </td></tr>
            )}
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
  if (!sheet) return null;

  return (
    <table className="data-table">
      <thead>
        <tr><th>ID</th><th>種別</th><th>ラベル</th><th>対象</th></tr>
      </thead>
      <tbody>
        {sheet.sdsg.map((s) => (
          <tr key={s.id}>
            <td><code>{s.id.slice(0, 10)}</code></td>
            <td>{s.type}</td>
            <td>{s.label}</td>
            <td><code>{s.attachedTo.slice(0, 10)}</code></td>
          </tr>
        ))}
        {sheet.sdsg.length === 0 && (
          <tr><td colSpan={4} style={{ textAlign: 'center', color: '#888', padding: 20 }}>SD/SGは次のPhaseで追加機能を実装</td></tr>
        )}
      </tbody>
    </table>
  );
}
