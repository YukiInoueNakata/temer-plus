// ============================================================================
// ShiftContentDialog - 時期区分・時間矢印・凡例以外を一括で
// Time_Level / Item_Level 方向に平行移動するダイアログ
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { useTEMStore } from '../store/store';

export function ShiftContentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const shift = useTEMStore((s) => s.shiftActiveSheetContent);
  const [dTime, setDTime] = useState(0);
  const [dItem, setDItem] = useState(0);

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
    const cur = pos ?? { x: window.innerWidth / 2 - 200, y: window.innerHeight / 2 - 140 };
    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, dlgX: cur.x, dlgY: cur.y };
    setPos(cur);
    setDragging(true);
  };

  const modalStyle: React.CSSProperties = pos
    ? { width: 400, position: 'absolute', left: pos.x, top: pos.y, margin: 0 }
    : { width: 400 };

  const apply = () => {
    if (dTime === 0 && dItem === 0) {
      onClose();
      return;
    }
    shift(dTime, dItem);
    setDTime(0);
    setDItem(0);
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
          <h3>一括移動</h3>
          <button onClick={onClose} className="modal-close">×</button>
        </div>
        <div className="modal-body">
          <p className="hint" style={{ marginTop: 0 }}>
            Box、Line、SDSG を Time_Level / Item_Level 方向にまとめて平行移動します。
            時期区分・時間矢印・凡例は移動しません。Ctrl+Z で取り消し可。
          </p>
          <section className="settings-section">
            <div className="setting-row">
              <label>Time_Level 方向（右=＋）</label>
              <input
                type="number"
                step={0.5}
                value={dTime}
                onChange={(e) => setDTime(Number(e.target.value))}
                style={{ width: 100 }}
              />
            </div>
            <div className="setting-row">
              <label>Item_Level 方向（上=＋）</label>
              <input
                type="number"
                step={0.5}
                value={dItem}
                onChange={(e) => setDItem(Number(e.target.value))}
                style={{ width: 100 }}
              />
            </div>
            <div className="setting-row" style={{ justifyContent: 'flex-start', gap: 6 }}>
              <button className="ribbon-btn-small" onClick={apply}>一括移動</button>
              <button
                className="ribbon-btn-small"
                onClick={() => { setDTime(0); setDItem(0); }}
              >
                値をクリア
              </button>
            </div>
          </section>
        </div>
        <div className="modal-footer">
          <button className="ribbon-btn-small" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
