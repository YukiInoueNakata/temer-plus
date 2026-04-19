// ============================================================================
// PaperReportDialog - 論文用レポート出力ダイアログ
// 記号体系 / 協力者情報 / インタビュー / 表記方針 / 備考 を編集し、
// docx として出力する
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { useTEMStore } from '../store/store';
import { produce } from 'immer';
import type {
  NotationSystem,
  ParticipantsInfo,
  InterviewInfo,
  VisualConventions,
  VisualConventionEntry,
} from '../types';

type Tab = 'general' | 'notation' | 'participants' | 'interview' | 'visual' | 'export';

const TABS: { key: Tab; label: string }[] = [
  { key: 'general', label: '概要' },
  { key: 'notation', label: '記号体系' },
  { key: 'participants', label: '協力者' },
  { key: 'interview', label: 'インタビュー' },
  { key: 'visual', label: '表記方針' },
  { key: 'export', label: '出力' },
];

export function PaperReportDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('general');
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ mouseX: 0, mouseY: 0, dlgX: 0, dlgY: 0 });
  const [busy, setBusy] = useState(false);
  const [includeDiagram, setIncludeDiagram] = useState(true);
  const doc = useTEMStore((s) => s.doc);

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
    const cur = pos ?? { x: window.innerWidth / 2 - 320, y: window.innerHeight / 2 - 240 };
    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, dlgX: cur.x, dlgY: cur.y };
    setPos(cur);
    setDragging(true);
  };

  const modalStyle: React.CSSProperties = pos
    ? { width: 640, position: 'absolute', left: pos.x, top: pos.y, margin: 0 }
    : { width: 640 };

  const updateMeta = (fn: (m: typeof doc.metadata) => void) => {
    useTEMStore.setState((state) => ({
      doc: produce(state.doc, (d) => {
        fn(d.metadata);
      }),
      dirty: true,
    }));
  };

  const runExport = async () => {
    setBusy(true);
    try {
      const { exportPaperReport } = await import('../utils/exportReport');
      const base = doc.metadata.title || 'TEMer_report';
      await exportPaperReport(doc, {
        filename: `${base}.docx`,
        diagramElementId: 'diagram-canvas',
        includeDiagram,
      });
    } catch (e) {
      console.error(e);
      alert(`レポート出力に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
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
          <h3>論文用レポート</h3>
          <button onClick={onClose} className="modal-close">×</button>
        </div>
        <div className="settings-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? 'settings-tab active' : 'settings-tab'}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="modal-body" style={{ minHeight: 380 }}>
          {tab === 'general' && <GeneralSection updateMeta={updateMeta} />}
          {tab === 'notation' && <NotationSection updateMeta={updateMeta} />}
          {tab === 'participants' && <ParticipantsSection updateMeta={updateMeta} />}
          {tab === 'interview' && <InterviewSection updateMeta={updateMeta} />}
          {tab === 'visual' && <VisualSection updateMeta={updateMeta} />}
          {tab === 'export' && (
            <section className="settings-section">
              <h4>出力設定</h4>
              <div className="setting-row">
                <label>現在のキャンバスを図として含める</label>
                <input
                  type="checkbox"
                  checked={includeDiagram}
                  onChange={(e) => setIncludeDiagram(e.target.checked)}
                />
              </div>
              <p className="hint">
                .docx（Word 形式）として出力します。項目未記入部分は「（未入力）」と明記されます。
                入力内容はドキュメントのメタデータとして保存されるため、再編集時の参考になります。
              </p>
              <div className="setting-row" style={{ justifyContent: 'flex-start' }}>
                <button
                  className="ribbon-btn-primary"
                  onClick={runExport}
                  disabled={busy}
                >
                  {busy ? '生成中...' : 'レポートを生成'}
                </button>
              </div>
            </section>
          )}
        </div>
        <div className="modal-footer">
          <button className="ribbon-btn-small" onClick={onClose} disabled={busy}>閉じる</button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Sections
// ----------------------------------------------------------------------------

type UpdateMeta = (fn: (m: ReturnType<typeof useTEMStore.getState>['doc']['metadata']) => void) => void;

function GeneralSection({ updateMeta }: { updateMeta: UpdateMeta }) {
  const doc = useTEMStore((s) => s.doc);
  return (
    <section className="settings-section">
      <h4>概要</h4>
      <div className="setting-row">
        <label>タイトル</label>
        <input
          type="text"
          value={doc.metadata.title ?? ''}
          onChange={(e) => updateMeta((m) => { m.title = e.target.value; })}
          style={{ width: 320 }}
        />
      </div>
      <div className="setting-row">
        <label>著者</label>
        <input
          type="text"
          value={doc.metadata.author ?? ''}
          onChange={(e) => updateMeta((m) => { m.author = e.target.value; })}
          style={{ width: 220 }}
        />
      </div>
      <div className="setting-row" style={{ alignItems: 'flex-start' }}>
        <label>備考（レポート末尾）</label>
        <textarea
          value={doc.metadata.reportNotes ?? ''}
          onChange={(e) => updateMeta((m) => { m.reportNotes = e.target.value; })}
          style={{ width: 320, height: 80, resize: 'vertical' }}
        />
      </div>
    </section>
  );
}

function NotationSection({ updateMeta }: { updateMeta: UpdateMeta }) {
  const ns = useTEMStore((s) => s.doc.metadata.notationSystem);
  const update = (patch: Partial<NotationSystem>) => {
    updateMeta((m) => {
      m.notationSystem = { ...(m.notationSystem ?? { base: 'Arakawa2012' }), ...patch };
    });
  };
  return (
    <section className="settings-section">
      <h4>記号体系</h4>
      <p className="hint">
        使用する記号体系を明示します。学会発表時の透明性向上のため、
        デフォルト（荒川・安田・サトウ 2012）に準拠するか、独自かを宣言します。
      </p>
      <div className="setting-row">
        <label>基準</label>
        <select
          value={ns?.base ?? 'Arakawa2012'}
          onChange={(e) => update({ base: e.target.value as NotationSystem['base'] })}
        >
          <option value="Arakawa2012">荒川・安田・サトウ 2012（標準）</option>
          <option value="custom">独自</option>
          <option value="other">その他</option>
        </select>
      </div>
      <div className="setting-row" style={{ alignItems: 'flex-start' }}>
        <label>補足説明</label>
        <textarea
          value={ns?.customDescription ?? ''}
          onChange={(e) => update({ customDescription: e.target.value })}
          style={{ width: 320, height: 80, resize: 'vertical' }}
          placeholder="独自/その他を選択した場合、具体的な記号体系を説明"
        />
      </div>
    </section>
  );
}

function ParticipantsSection({ updateMeta }: { updateMeta: UpdateMeta }) {
  const pi = useTEMStore((s) => s.doc.metadata.participantsInfo);
  const update = (patch: Partial<ParticipantsInfo>) => {
    updateMeta((m) => {
      m.participantsInfo = {
        ...(m.participantsInfo ?? { count: 0, description: '', hsiDescription: '' }),
        ...patch,
      };
    });
  };
  return (
    <section className="settings-section">
      <h4>協力者情報</h4>
      <div className="setting-row">
        <label>協力者数</label>
        <input
          type="number"
          min={0}
          value={pi?.count ?? 0}
          onChange={(e) => update({ count: Math.max(0, Number(e.target.value)) })}
          style={{ width: 80 }}
        />
      </div>
      <div className="setting-row" style={{ alignItems: 'flex-start' }}>
        <label>記述（属性など）</label>
        <textarea
          value={pi?.description ?? ''}
          onChange={(e) => update({ description: e.target.value })}
          style={{ width: 320, height: 60, resize: 'vertical' }}
        />
      </div>
      <div className="setting-row" style={{ alignItems: 'flex-start' }}>
        <label>HSI 水準の説明</label>
        <textarea
          value={pi?.hsiDescription ?? ''}
          onChange={(e) => update({ hsiDescription: e.target.value })}
          style={{ width: 320, height: 60, resize: 'vertical' }}
          placeholder="歴史的構造化招待（HSI）の水準の説明"
        />
      </div>
      <div className="setting-row" style={{ alignItems: 'flex-start' }}>
        <label>仮名（カンマ区切り）</label>
        <input
          type="text"
          value={(pi?.pseudonyms ?? []).join(', ')}
          onChange={(e) => update({ pseudonyms: e.target.value.split(/,\s*/).filter(Boolean) })}
          style={{ width: 320 }}
          placeholder="例: A, B, C"
        />
      </div>
    </section>
  );
}

function InterviewSection({ updateMeta }: { updateMeta: UpdateMeta }) {
  const iv = useTEMStore((s) => s.doc.metadata.interview);
  const update = (patch: Partial<InterviewInfo>) => {
    updateMeta((m) => {
      m.interview = {
        ...(m.interview ?? { method: '', durationDescription: '', timesCount: 0 }),
        ...patch,
      };
    });
  };
  return (
    <section className="settings-section">
      <h4>インタビュー方法</h4>
      <div className="setting-row" style={{ alignItems: 'flex-start' }}>
        <label>方法</label>
        <textarea
          value={iv?.method ?? ''}
          onChange={(e) => update({ method: e.target.value })}
          style={{ width: 320, height: 60, resize: 'vertical' }}
          placeholder="半構造化面接 など"
        />
      </div>
      <div className="setting-row">
        <label>所要時間/期間</label>
        <input
          type="text"
          value={iv?.durationDescription ?? ''}
          onChange={(e) => update({ durationDescription: e.target.value })}
          style={{ width: 280 }}
          placeholder="例: 1回あたり約60分、計3回"
        />
      </div>
      <div className="setting-row">
        <label>回数</label>
        <input
          type="number"
          min={0}
          value={iv?.timesCount ?? 0}
          onChange={(e) => update({ timesCount: Math.max(0, Number(e.target.value)) })}
          style={{ width: 80 }}
        />
      </div>
      <div className="setting-row" style={{ alignItems: 'flex-start' }}>
        <label>分析の組合せ</label>
        <textarea
          value={iv?.analysisCombination ?? ''}
          onChange={(e) => update({ analysisCombination: e.target.value })}
          style={{ width: 320, height: 60, resize: 'vertical' }}
          placeholder="例: TEM + M-GTA"
        />
      </div>
      <div className="setting-row" style={{ alignItems: 'flex-start' }}>
        <label>備考</label>
        <textarea
          value={iv?.notes ?? ''}
          onChange={(e) => update({ notes: e.target.value })}
          style={{ width: 320, height: 60, resize: 'vertical' }}
        />
      </div>
    </section>
  );
}

function VisualSection({ updateMeta }: { updateMeta: UpdateMeta }) {
  const vc = useTEMStore((s) => s.doc.metadata.visualConventions);
  const update = (key: keyof VisualConventions, val: VisualConventionEntry | undefined) => {
    updateMeta((m) => {
      m.visualConventions = { ...(m.visualConventions ?? {}), [key]: val };
    });
  };

  const Entry = (props: {
    name: string;
    keyName: 'horizontalLength' | 'arrowAngle' | 'verticalPosition' | 'colors' | 'lineWeight';
  }) => {
    const cur = vc?.[props.keyName];
    return (
      <div style={{ border: '1px solid #eee', borderRadius: 4, padding: 8, marginBottom: 8, background: '#fafafa' }}>
        <div className="setting-row">
          <label>{props.name} に意味がある</label>
          <input
            type="checkbox"
            checked={cur?.hasMeaning ?? false}
            onChange={(e) => update(props.keyName, {
              hasMeaning: e.target.checked,
              description: cur?.description,
            })}
          />
        </div>
        {cur?.hasMeaning && (
          <div className="setting-row" style={{ alignItems: 'flex-start' }}>
            <label>説明</label>
            <textarea
              value={cur.description ?? ''}
              onChange={(e) => update(props.keyName, { hasMeaning: true, description: e.target.value })}
              style={{ width: 300, height: 40, resize: 'vertical' }}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="settings-section">
      <h4>表記方針</h4>
      <p className="hint">図中で意味を持たせた表記について明文化します（学会での透明性向上）。</p>
      <Entry name="横軸の長さ" keyName="horizontalLength" />
      <Entry name="矢印の角度" keyName="arrowAngle" />
      <Entry name="縦の位置" keyName="verticalPosition" />
      <Entry name="色" keyName="colors" />
      <Entry name="線の太さ" keyName="lineWeight" />
    </section>
  );
}
