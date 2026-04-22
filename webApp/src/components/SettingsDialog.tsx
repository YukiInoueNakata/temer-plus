// ============================================================================
// Settings Dialog - タブ化した設定モーダル
// タブ: 全体 / スナップ / 時間矢印 / 凡例 / 時期ラベル / プロジェクト
// ============================================================================

import { useState, useRef, useEffect } from 'react';
import { useTEMStore, useActiveSheet } from '../store/store';
import { produce } from 'immer';
import type {
  TimeArrowSettings,
  LegendSettings,
  PeriodLabelSettings,
  PeriodLabelBandStyle,
  LegendBackgroundStyle,
  LegendItemOverride,
  LegendTitleAlign,
  LegendTitlePosition,
  LegendTitleWritingMode,
  LegendTitleVerticalAlign,
  HorizontalLabelSide,
  VerticalLabelSide,
  TimeArrowLabelAlignHorizontal,
  TimeArrowLabelAlignVertical,
  TypeLabelVisibilityKey,
} from '../types';
import { FONT_OPTIONS } from '../store/defaults';
import { computeLegendItems } from '../utils/legend';
import type { PaperBaseKey } from '../types';

type Tab = 'general' | 'snap' | 'typelabel' | 'timearrow' | 'legend' | 'period' | 'sdsgspace' | 'project';

const TABS: { key: Tab; label: string }[] = [
  { key: 'general', label: '全体' },
  { key: 'snap', label: 'スナップ' },
  { key: 'typelabel', label: 'タイプラベル' },
  { key: 'timearrow', label: '非可逆的時間' },
  { key: 'legend', label: '凡例' },
  { key: 'period', label: '時期区分' },
  { key: 'sdsgspace', label: 'SD/SG 配置' },
  { key: 'project', label: 'プロジェクト' },
];

export function SettingsDialog({
  open,
  onClose,
  initialTab,
  tabNonce,
}: {
  open: boolean;
  onClose: () => void;
  initialTab?: string;
  // initialTab と同じ値が連続で指定されても切替を強制するためのカウンタ
  tabNonce?: number;
}) {
  // マウント時は initialTab を反映して 'general' フラッシュを避ける
  const [tab, setTab] = useState<Tab>(() =>
    initialTab && TABS.some((t) => t.key === initialTab) ? (initialTab as Tab) : 'general'
  );
  // ドラッグ位置（null = 中央配置）
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ mouseX: 0, mouseY: 0, dlgX: 0, dlgY: 0 });

  // open / initialTab / tabNonce いずれかの変化で initialTab を適用
  useEffect(() => {
    if (open && initialTab && TABS.some((t) => t.key === initialTab)) {
      setTab(initialTab as Tab);
    }
  }, [open, initialTab, tabNonce]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.mouseX;
      const dy = e.clientY - dragStart.current.mouseY;
      setPos({
        x: dragStart.current.dlgX + dx,
        y: dragStart.current.dlgY + dy,
      });
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

  // ドラッグされている場合は left/top 絶対値、未ドラッグなら中央配置
  const modalStyle: React.CSSProperties = pos
    ? {
        width: 640,
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        margin: 0,
      }
    : { width: 640 };

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    // 子ボタン（×など）のクリックは除外
    if ((e.target as HTMLElement).closest('.modal-close')) return;
    const cur = pos ?? { x: window.innerWidth / 2 - 320, y: window.innerHeight / 2 - 200 };
    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      dlgX: cur.x,
      dlgY: cur.y,
    };
    setPos(cur);
    setDragging(true);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={modalStyle}
      >
        <div
          className="modal-header"
          onMouseDown={onHeaderMouseDown}
          style={{ cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none' }}
          title="ドラッグで移動"
        >
          <h3>設定</h3>
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
        <div className="modal-body" style={{ minHeight: 360 }}>
          {tab === 'general' && <GeneralSection />}
          {tab === 'snap' && <SnapSection />}
          {tab === 'typelabel' && <TypeLabelSection />}
          {tab === 'timearrow' && <TimeArrowSettingsSection />}
          {tab === 'legend' && <LegendSettingsSection />}
          {tab === 'period' && <PeriodLabelSettingsSection />}
          {tab === 'sdsgspace' && <SDSGSpaceSection />}
          {tab === 'project' && <ProjectSection />}
        </div>
        <div className="modal-footer">
          <button className="ribbon-btn-primary" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// General
// ============================================================================
function GeneralSection() {
  const doc = useTEMStore((s) => s.doc);
  const setLayout = useTEMStore((s) => s.setLayout);
  const setLocale = useTEMStore((s) => s.setLocale);
  const setUIFontSize = useTEMStore((s) => s.setUIFontSize);
  const setRibbonFontSize = useTEMStore((s) => s.setRibbonFontSize);
  const ribbonFontSize = doc.settings.ribbonFontSize ?? 12;

  const updateLevelStep = (v: number) => {
    useTEMStore.setState((state) => ({
      doc: produce(state.doc, (d) => { d.settings.levelStep = v; }),
    }));
  };

  return (
    <section className="settings-section">
      <div className="setting-row">
        <label>レイアウト</label>
        <select
          value={doc.settings.layout}
          onChange={(e) => setLayout(e.target.value as 'horizontal' | 'vertical')}
        >
          <option value="horizontal">横型</option>
          <option value="vertical">縦型</option>
        </select>
      </div>
      <div className="setting-row">
        <label>言語</label>
        <select
          value={doc.settings.locale}
          onChange={(e) => setLocale(e.target.value as 'ja' | 'en')}
        >
          <option value="ja">日本語</option>
          <option value="en">English</option>
        </select>
      </div>
      <div className="setting-row">
        <label>UI フォントサイズ（px）</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="range"
            min={10}
            max={40}
            value={doc.settings.uiFontSize}
            onChange={(e) => setUIFontSize(Number(e.target.value))}
            style={{ width: 120 }}
          />
          <input
            type="number"
            min={10}
            max={40}
            value={doc.settings.uiFontSize}
            onChange={(e) => setUIFontSize(Number(e.target.value))}
            style={{ width: 50 }}
          />
        </div>
      </div>
      <div className="setting-row">
        <label>リボン文字サイズ（px）</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="range"
            min={8}
            max={24}
            value={ribbonFontSize}
            onChange={(e) => setRibbonFontSize(Number(e.target.value))}
            style={{ width: 120 }}
          />
          <input
            type="number"
            min={8}
            max={24}
            value={ribbonFontSize}
            onChange={(e) => setRibbonFontSize(Number(e.target.value))}
            style={{ width: 50 }}
          />
        </div>
      </div>
      <div className="setting-row">
        <label>Level 調整刻み</label>
        <input
          type="number"
          step="0.1"
          min={0.1}
          max={2}
          value={doc.settings.levelStep ?? 0.5}
          onChange={(e) => updateLevelStep(Number(e.target.value))}
          style={{ width: 80 }}
        />
      </div>
      <p className="hint">プロパティパネルで Item/Time レベルを矢印キー/スピナーで調整する際の刻み幅</p>

      <PaperGuideSection />

      <h4 style={{ marginTop: 16 }}>Box 自動調整（既定）</h4>
      <div className="setting-row">
        <label>自動拡張モード（Box 個別未指定時）</label>
        <select
          value={doc.settings.defaultAutoFitBoxMode ?? 'width-fixed'}
          onChange={(e) => {
            useTEMStore.setState((state) => ({
              doc: produce(state.doc, (d) => {
                d.settings.defaultAutoFitBoxMode = e.target.value as
                  'none' | 'width-fixed' | 'height-fixed';
              }),
            }));
          }}
        >
          <option value="none">自動拡張なし</option>
          <option value="width-fixed">横幅固定で高さ自動</option>
          <option value="height-fixed">高さ固定で横幅自動</option>
        </select>
      </div>
      <div className="setting-row">
        <label>文字サイズ自動調整（既定、全 Box）</label>
        <input
          type="checkbox"
          checked={doc.settings.defaultAutoFitText === true}
          onChange={(e) => {
            useTEMStore.setState((state) => ({
              doc: produce(state.doc, (d) => {
                d.settings.defaultAutoFitText = e.target.checked;
              }),
            }));
          }}
        />
      </div>
      <p className="hint">
        自動拡張: ラベルが収まらない時、どちら側を増やすか（Box 個別プロパティで上書き可）<br />
        文字サイズ自動調整: Box に収まる最大文字サイズを自動設定（同時有効不可。個別設定優先）
      </p>
    </section>
  );
}

// ============================================================================
// 用紙枠
// ============================================================================
function PaperGuideSection() {
  const doc = useTEMStore((s) => s.doc);
  const guide = doc.settings.paperGuides[0];
  if (!guide) return null;

  const update = (patch: Partial<typeof guide>) => {
    useTEMStore.setState((state) => ({
      doc: produce(state.doc, (d) => {
        d.settings.paperGuides[0] = { ...d.settings.paperGuides[0], ...patch };
      }),
    }));
  };

  const baseSize = guide.baseSize ?? 'A4';
  const isCustom = baseSize === 'custom';

  return (
    <>
      <h4 style={{ marginTop: 16 }}>用紙枠</h4>
      <p className="hint" style={{ marginTop: 0 }}>
        表示タブの「用紙枠」ボタンで ON/OFF。横型レイアウトは長辺=横、縦型は長辺=縦。
        短辺中央が Level 0 になるよう描画、枠外は薄グレーでマスク。
      </p>
      <div className="setting-row">
        <label>用紙サイズ</label>
        <select
          value={baseSize}
          onChange={(e) => update({ baseSize: e.target.value as PaperBaseKey })}
          style={{ maxWidth: 220 }}
        >
          <option value="A4">A4（1:√2 ≈ 1:1.414）</option>
          <option value="A3">A3（A4 と同比率）</option>
          <option value="16:9">16:9（スライド）</option>
          <option value="4:3">4:3</option>
          <option value="custom">カスタム</option>
        </select>
      </div>
      {isCustom && (
        <>
          <div className="setting-row">
            <label>カスタム短辺 (px)</label>
            <input
              type="number"
              min={50}
              value={guide.customWidth ?? 794}
              onChange={(e) => update({ customWidth: Math.max(50, Number(e.target.value)) })}
              style={{ width: 100 }}
            />
          </div>
          <div className="setting-row">
            <label>カスタム長辺 (px)</label>
            <input
              type="number"
              min={50}
              value={guide.customHeight ?? 1123}
              onChange={(e) => update({ customHeight: Math.max(50, Number(e.target.value)) })}
              style={{ width: 100 }}
            />
          </div>
        </>
      )}
      <div className="setting-row">
        <label>枚数（長辺方向）</label>
        <input
          type="number"
          min={1}
          max={50}
          value={guide.pageCount ?? 1}
          onChange={(e) => update({ pageCount: Math.max(1, Math.min(50, Number(e.target.value))) })}
          style={{ width: 80 }}
        />
      </div>
      <div className="setting-row">
        <label>枠外を薄グレーで表示</label>
        <input
          type="checkbox"
          checked={guide.maskOutside !== false}
          onChange={(e) => update({ maskOutside: e.target.checked })}
        />
      </div>
      <div className="setting-row">
        <label>枠線の色</label>
        <input
          type="color"
          value={guide.color ?? '#000000'}
          onChange={(e) => update({ color: e.target.value })}
        />
      </div>
    </>
  );
}

// ============================================================================
// Snap
// ============================================================================
function SnapSection() {
  const doc = useTEMStore((s) => s.doc);
  const view = useTEMStore((s) => s.view);
  const toggleGrid = useTEMStore((s) => s.toggleGrid);
  const toggleSnap = useTEMStore((s) => s.toggleSnap);
  const setGridPx = useTEMStore((s) => s.setGridPx);

  const updateSnap = (patch: Partial<typeof doc.settings.snap>) => {
    useTEMStore.setState((state) => ({
      doc: produce(state.doc, (d) => { d.settings.snap = { ...d.settings.snap, ...patch }; }),
    }));
  };

  return (
    <section className="settings-section">
      <h4>表示</h4>
      <div className="setting-row">
        <label>グリッドを表示</label>
        <input type="checkbox" checked={view.showGrid} onChange={toggleGrid} />
      </div>
      <div className="setting-row">
        <label>スナップを有効化</label>
        <input type="checkbox" checked={view.snapEnabled} onChange={toggleSnap} />
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        「グリッド」は点の表示のみ。「スナップ」は Box ドラッグ時に位置をグリッドに吸着させます（両者は独立）。
      </p>

      <h4 style={{ marginTop: 14 }}>グリッド間隔</h4>
      <div className="setting-row">
        <label>グリッド（px）</label>
        <input
          type="number"
          min={2}
          max={200}
          value={doc.settings.snap.gridPx}
          onChange={(e) => setGridPx(Number(e.target.value))}
          style={{ width: 80 }}
        />
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        グリッド表示の点間隔とスナップ吸着距離を兼ねる（既定 10px）。25〜50 程度にするとスナップの効きが体感しやすくなります。
      </p>

      <h4 style={{ marginTop: 14 }}>整列ガイド</h4>
      <div className="setting-row">
        <label>他 Box と整列時にガイド線を表示</label>
        <input
          type="checkbox"
          checked={doc.settings.snap.alignGuides}
          onChange={(e) => updateSnap({ alignGuides: e.target.checked })}
        />
      </div>
      <div className="setting-row">
        <label>距離スナップ（px）</label>
        <input
          type="number"
          min={0}
          max={200}
          value={doc.settings.snap.distancePx}
          onChange={(e) => updateSnap({ distancePx: Math.max(0, Number(e.target.value)) })}
          style={{ width: 80 }}
        />
      </div>
    </section>
  );
}

// ============================================================================
// Type label visibility
// ============================================================================
function TypeLabelSection() {
  const doc = useTEMStore((s) => s.doc);
  const vis = doc.settings.typeLabelVisibility;

  const keys: { key: TypeLabelVisibilityKey; label: string }[] = [
    { key: 'BFP', label: 'BFP（分岐点）' },
    { key: 'EFP', label: 'EFP（等至点）' },
    { key: 'P-EFP', label: 'P-EFP（両極化等至点）' },
    { key: 'OPP', label: 'OPP（必須通過点）' },
    { key: '2nd-EFP', label: '2nd-EFP（第二等至点）' },
    { key: 'P-2nd-EFP', label: 'P-2nd-EFP（両極化第二等至点）' },
    { key: 'SD', label: 'SD（社会的方向づけ）' },
    { key: 'SG', label: 'SG（社会的ガイド）' },
  ];

  const setAll = (value: boolean) => {
    useTEMStore.setState((state) => ({
      doc: produce(state.doc, (d) => {
        keys.forEach((k) => {
          d.settings.typeLabelVisibility[k.key] = value;
        });
      }),
    }));
  };

  const setOne = (key: TypeLabelVisibilityKey, value: boolean) => {
    useTEMStore.setState((state) => ({
      doc: produce(state.doc, (d) => {
        d.settings.typeLabelVisibility[key] = value;
      }),
    }));
  };

  return (
    <section className="settings-section">
      <h4>タイプラベル（種別バッジ）表示</h4>
      <p className="hint" style={{ marginBottom: 6 }}>
        各種別について、キャンバス上のタイプラベルを個別に表示／非表示できます。
      </p>
      <div className="setting-row" style={{ justifyContent: 'flex-start', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ color: '#555', fontSize: '0.9em' }}>一括:</span>
        <button className="ribbon-btn-small" onClick={() => setAll(true)}>すべて表示</button>
        <button className="ribbon-btn-small" onClick={() => setAll(false)}>すべて非表示</button>
      </div>
      {keys.map((k) => (
        <div className="setting-row" key={k.key}>
          <label>{k.label}</label>
          <input
            type="checkbox"
            checked={vis?.[k.key] !== false}
            onChange={(e) => setOne(k.key, e.target.checked)}
          />
        </div>
      ))}
    </section>
  );
}

// ============================================================================
// SD/SG 配置（専用スペース／帯）
// ============================================================================
function SDSGSpaceSection() {
  const doc = useTEMStore((s) => s.doc);
  const placeAllSDSGToBands = useTEMStore((s) => s.placeAllSDSGToBands);
  const layout = doc.settings.layout;
  const space = doc.settings.sdsgSpace;

  const updateSpace = (patch: Partial<NonNullable<typeof doc.settings.sdsgSpace>>) => {
    useTEMStore.setState((state) => ({
      doc: produce(state.doc, (d) => {
        if (!d.settings.sdsgSpace) return;
        d.settings.sdsgSpace = { ...d.settings.sdsgSpace, ...patch };
      }),
    }));
  };

  const updateBand = (which: 'top' | 'bottom', patch: Partial<NonNullable<typeof doc.settings.sdsgSpace>['bands']['top']>) => {
    useTEMStore.setState((state) => ({
      doc: produce(state.doc, (d) => {
        if (!d.settings.sdsgSpace) return;
        d.settings.sdsgSpace.bands[which] = { ...d.settings.sdsgSpace.bands[which], ...patch };
      }),
    }));
  };

  if (!space) {
    return <p className="hint">SD/SG 配置の設定データがありません。</p>;
  }

  const isH = layout === 'horizontal';
  const topLabel = isH ? '上部 (SD)' : '右側 (SD)';
  const bottomLabel = isH ? '下部 (SG)' : '左側 (SG)';

  return (
    <section className="settings-section">
      <h4>SD/SG 配置モード</h4>
      <p className="hint" style={{ marginTop: 0 }}>
        SD/SG を Box 群の外側に用意した「帯」に配置するモードです。
        時期区分や非可逆的時間の内側に帯を設け、SD/SG を一列に並べます。
      </p>
      <div className="setting-row">
        <label>機能を有効化</label>
        <input
          type="checkbox"
          checked={space.enabled}
          onChange={(e) => updateSpace({ enabled: e.target.checked })}
        />
      </div>
      <p className="hint">OFF: 従来通り attachedTo Box に追従 / ON: 上部(SD)帯・下部(SG)帯を選べる</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14 }}>
      <div>
      <h4 style={{ marginTop: 0 }}>{topLabel}</h4>
      <div className="setting-row">
        <label>この帯を使う</label>
        <input
          type="checkbox"
          checked={space.bands.top.enabled}
          onChange={(e) => updateBand('top', { enabled: e.target.checked })}
        />
      </div>
      <div className="setting-row">
        <label>帯の高さ</label>
        <select
          value={space.bands.top.heightMode ?? 'auto'}
          onChange={(e) => updateBand('top', { heightMode: e.target.value as 'auto' | 'manual' })}
          style={{ width: 120 }}
        >
          <option value="auto">自動（SDSG/ラベルに合わせる）</option>
          <option value="manual">手動指定</option>
        </select>
      </div>
      {(space.bands.top.heightMode ?? 'auto') === 'manual' && (
        <div className="setting-row">
          <label>高さ (Level)</label>
          <input
            type="number"
            min={0.1}
            max={10}
            step={0.1}
            value={space.bands.top.heightLevel}
            onChange={(e) => updateBand('top', { heightLevel: Math.max(0.1, Number(e.target.value)) })}
            style={{ width: 80 }}
          />
        </div>
      )}
      <div className="setting-row">
        <label>配置基準</label>
        <select
          value={space.bands.top.reference}
          onChange={(e) => updateBand('top', { reference: e.target.value as 'period' | 'timearrow' | 'boxes' })}
        >
          <option value="boxes">Box 群の外側（直接）</option>
          <option value="period">時期区分の内側</option>
          <option value="timearrow">非可逆的時間の内側</option>
        </select>
      </div>
      <div className="setting-row">
        <label>基準からの距離 (Level)</label>
        <input
          type="number"
          step={0.1}
          value={space.bands.top.offsetLevel}
          onChange={(e) => updateBand('top', { offsetLevel: Number(e.target.value) })}
          style={{ width: 80 }}
        />
      </div>
      <div className="setting-row">
        <label>編集時に帯範囲を表示</label>
        <input
          type="checkbox"
          checked={space.bands.top.showBorder}
          onChange={(e) => updateBand('top', { showBorder: e.target.checked })}
        />
      </div>
      <div className="setting-row">
        <label>枠の色</label>
        <input
          type="color"
          value={space.bands.top.borderColor ?? '#9b59b6'}
          onChange={(e) => updateBand('top', { borderColor: e.target.value })}
        />
      </div>
      <div className="setting-row">
        <label>背景塗りつぶし</label>
        <select
          value={space.bands.top.fillStyle ?? 'tinted'}
          onChange={(e) => updateBand('top', { fillStyle: e.target.value as 'tinted' | 'none' })}
        >
          <option value="tinted">薄く塗る</option>
          <option value="none">塗らない（枠線のみ）</option>
        </select>
      </div>
      <div className="setting-row">
        <label>ラベル位置</label>
        <select
          value={space.bands.top.labelPosition ?? 'top-left'}
          onChange={(e) => updateBand('top', { labelPosition: e.target.value as 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none' })}
        >
          <option value="top-left">左上</option>
          <option value="top-right">右上</option>
          <option value="bottom-left">左下</option>
          <option value="bottom-right">右下</option>
          <option value="none">非表示</option>
        </select>
      </div>

      </div>
      <div>
      <h4 style={{ marginTop: 0 }}>{bottomLabel}</h4>
      <div className="setting-row">
        <label>この帯を使う</label>
        <input
          type="checkbox"
          checked={space.bands.bottom.enabled}
          onChange={(e) => updateBand('bottom', { enabled: e.target.checked })}
        />
      </div>
      <div className="setting-row">
        <label>帯の高さ</label>
        <select
          value={space.bands.bottom.heightMode ?? 'auto'}
          onChange={(e) => updateBand('bottom', { heightMode: e.target.value as 'auto' | 'manual' })}
          style={{ width: 120 }}
        >
          <option value="auto">自動（SDSG/ラベルに合わせる）</option>
          <option value="manual">手動指定</option>
        </select>
      </div>
      {(space.bands.bottom.heightMode ?? 'auto') === 'manual' && (
        <div className="setting-row">
          <label>高さ (Level)</label>
          <input
            type="number"
            min={0.1}
            max={10}
            step={0.1}
            value={space.bands.bottom.heightLevel}
            onChange={(e) => updateBand('bottom', { heightLevel: Math.max(0.1, Number(e.target.value)) })}
            style={{ width: 80 }}
          />
        </div>
      )}
      <div className="setting-row">
        <label>配置基準</label>
        <select
          value={space.bands.bottom.reference}
          onChange={(e) => updateBand('bottom', { reference: e.target.value as 'period' | 'timearrow' | 'boxes' })}
        >
          <option value="boxes">Box 群の外側（直接）</option>
          <option value="period">時期区分の内側</option>
          <option value="timearrow">非可逆的時間の内側</option>
        </select>
      </div>
      <div className="setting-row">
        <label>基準からの距離 (Level)</label>
        <input
          type="number"
          step={0.1}
          value={space.bands.bottom.offsetLevel}
          onChange={(e) => updateBand('bottom', { offsetLevel: Number(e.target.value) })}
          style={{ width: 80 }}
        />
      </div>
      <div className="setting-row">
        <label>編集時に帯範囲を表示</label>
        <input
          type="checkbox"
          checked={space.bands.bottom.showBorder}
          onChange={(e) => updateBand('bottom', { showBorder: e.target.checked })}
        />
      </div>
      <div className="setting-row">
        <label>枠の色</label>
        <input
          type="color"
          value={space.bands.bottom.borderColor ?? '#27ae60'}
          onChange={(e) => updateBand('bottom', { borderColor: e.target.value })}
        />
      </div>
      <div className="setting-row">
        <label>背景塗りつぶし</label>
        <select
          value={space.bands.bottom.fillStyle ?? 'tinted'}
          onChange={(e) => updateBand('bottom', { fillStyle: e.target.value as 'tinted' | 'none' })}
        >
          <option value="tinted">薄く塗る</option>
          <option value="none">塗らない（枠線のみ）</option>
        </select>
      </div>
      <div className="setting-row">
        <label>ラベル位置</label>
        <select
          value={space.bands.bottom.labelPosition ?? 'top-left'}
          onChange={(e) => updateBand('bottom', { labelPosition: e.target.value as 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none' })}
        >
          <option value="top-left">左上</option>
          <option value="top-right">右上</option>
          <option value="bottom-left">左下</option>
          <option value="bottom-right">右下</option>
          <option value="none">非表示</option>
        </select>
      </div>

      </div>
      </div>

      <h4 style={{ marginTop: 14 }}>配置の挙動</h4>
      <div className="setting-row">
        <label>重なり時に自動整列</label>
        <input
          type="checkbox"
          checked={space.autoArrange}
          onChange={(e) => updateSpace({ autoArrange: e.target.checked })}
        />
      </div>
      <p className="hint">ON: 同じ時間位置で重なる SDSG を帯内で自動的に縦積み / OFF: 重なっても整列しない</p>
      <div className="setting-row">
        <label>row が多い時、SDSG を帯内に圧縮</label>
        <input
          type="checkbox"
          checked={space.bands.top.shrinkToFitRow !== false || space.bands.bottom.shrinkToFitRow !== false}
          onChange={(e) => {
            updateBand('top', { shrinkToFitRow: e.target.checked });
            updateBand('bottom', { shrinkToFitRow: e.target.checked });
          }}
        />
      </div>
      <p className="hint">ON: SDSG の高さを row span に合わせて自動圧縮 / OFF: はみ出しを許容（赤枠で警告）</p>
      <div className="setting-row">
        <label>row が多い時、帯を自動拡張</label>
        <input
          type="checkbox"
          checked={!!(space.bands.top.autoExpandHeight || space.bands.bottom.autoExpandHeight)}
          onChange={(e) => {
            updateBand('top', { autoExpandHeight: e.target.checked });
            updateBand('bottom', { autoExpandHeight: e.target.checked });
          }}
        />
      </div>
      <p className="hint">ON: heightLevel を超える row 数が必要な時、帯を一時的に拡張（描画時のみ、設定値は保持）</p>
      <div className="setting-row">
        <label>組合せ制限を解除</label>
        <input
          type="checkbox"
          checked={space.allowMismatchedPlacement}
          onChange={(e) => updateSpace({ allowMismatchedPlacement: e.target.checked })}
        />
      </div>
      <p className="hint">
        既定では SD は上部(SD)帯のみ、SG は下部(SG)帯のみに配置可能。ON にすると逆向き（SD を下部(SG)帯、SG を上部(SD)帯）も許可されます
      </p>
      <div className="setting-row">
        <label>band 位置で方向点を自動反転</label>
        <input
          type="checkbox"
          checked={space.autoFlipDirectionInBand}
          onChange={(e) => updateSpace({ autoFlipDirectionInBand: e.target.checked })}
        />
      </div>
      <p className="hint">
        ON: 種別と band 位置が食い違う時（例: SD を下部(SG)帯、SG を上部(SD)帯）に五角形の点を反転させ、常に Box 群を指す向きにします。OFF: 種別固有の向き（SD=下向き / SG=上向き、横型の場合）を維持
      </p>

      <h4 style={{ marginTop: 14 }}>一括配置</h4>
      <div className="setting-row">
        <label>SD の既定配置</label>
        <select
          value={space.autoPlaceSD}
          onChange={(e) => updateSpace({ autoPlaceSD: e.target.value as 'none' | 'top' | 'bottom' })}
        >
          <option value="none">配置しない（attached）</option>
          <option value="top">上部(SD)帯</option>
          <option value="bottom">下部(SG)帯（要組合せ解除）</option>
        </select>
      </div>
      <div className="setting-row">
        <label>SG の既定配置</label>
        <select
          value={space.autoPlaceSG}
          onChange={(e) => updateSpace({ autoPlaceSG: e.target.value as 'none' | 'top' | 'bottom' })}
        >
          <option value="none">配置しない（attached）</option>
          <option value="top">上部(SD)帯（要組合せ解除）</option>
          <option value="bottom">下部(SG)帯</option>
        </select>
      </div>
      <div className="setting-row" style={{ justifyContent: 'flex-start', gap: 6, flexWrap: 'wrap' }}>
        <button
          className="ribbon-btn-small"
          onClick={() => {
            if (!confirm('全 SD/SG の配置を既定設定で一括変更します。個別の offset はリセットされます。よろしいですか?')) return;
            placeAllSDSGToBands(space.autoPlaceSD, space.autoPlaceSG);
          }}
        >
          既定配置を全 SD/SG に適用
        </button>
      </div>
    </section>
  );
}

// ============================================================================
// Project info
// ============================================================================
function ProjectSection() {
  const doc = useTEMStore((s) => s.doc);
  const setDefaultBoxSize = useTEMStore((s) => s.setDefaultBoxSize);
  const setDefaultFontSize = useTEMStore((s) => s.setDefaultFontSize);
  return (
    <section className="settings-section">
      <h4>プロジェクト情報</h4>
      <div className="setting-row">
        <label>タイトル</label>
        <input type="text" value={doc.metadata.title} readOnly style={{ width: 200 }} />
      </div>
      <div className="setting-row">
        <label>作成日</label>
        <input
          type="text"
          value={new Date(doc.metadata.createdAt).toLocaleString('ja-JP')}
          readOnly
          style={{ width: 200 }}
        />
      </div>
      <div className="setting-row">
        <label>編集履歴</label>
        <span style={{ fontSize: 12, color: '#666' }}>
          {doc.history.length}/50件
        </span>
      </div>

      <h4 style={{ marginTop: 16 }}>Box の既定サイズ</h4>
      <p className="hint" style={{ marginTop: 0 }}>
        「挿入」タブで Box を追加するときや CSV インポート時のデフォルトサイズ（ピクセル）。
        テキスト方向は現在のレイアウトに応じて自動設定されます（横型 → 縦書き / 縦型 → 横書き）。
      </p>
      <div className="setting-row">
        <label>既定Box幅 (px)</label>
        <input
          type="number"
          min={20}
          max={1000}
          value={doc.settings.defaultBoxSize.width}
          onChange={(e) => setDefaultBoxSize({ width: Number(e.target.value) })}
          style={{ width: 100 }}
        />
      </div>
      <div className="setting-row">
        <label>既定Box高さ (px)</label>
        <input
          type="number"
          min={20}
          max={1000}
          value={doc.settings.defaultBoxSize.height}
          onChange={(e) => setDefaultBoxSize({ height: Number(e.target.value) })}
          style={{ width: 100 }}
        />
      </div>
      <div className="setting-row" style={{ justifyContent: 'flex-start', gap: 6 }}>
        <span style={{ color: '#555', fontSize: '0.9em' }}>プリセット:</span>
        <button className="ribbon-btn-small" onClick={() => setDefaultBoxSize({ width: 60, height: 100 })}>
          縦長 (60×100)
        </button>
        <button className="ribbon-btn-small" onClick={() => setDefaultBoxSize({ width: 100, height: 50 })}>
          横長 (100×50)
        </button>
        <button className="ribbon-btn-small" onClick={() => setDefaultBoxSize({ width: 80, height: 80 })}>
          正方形 (80×80)
        </button>
      </div>

      <h4 style={{ marginTop: 16 }}>文字の既定</h4>
      <div className="setting-row">
        <label>既定フォント</label>
        <input type="text" value={doc.settings.defaultFont} readOnly style={{ width: 180 }} />
      </div>
      <div className="setting-row">
        <label>既定サイズ (pt)</label>
        <input
          type="number"
          min={6}
          max={72}
          value={doc.settings.defaultFontSize}
          onChange={(e) => setDefaultFontSize(Number(e.target.value))}
          style={{ width: 80 }}
        />
      </div>
    </section>
  );
}

// ============================================================================
// Period label
// ============================================================================
function PeriodLabelSettingsSection() {
  const doc = useTEMStore((s) => s.doc);
  const pl = doc.settings.periodLabels;

  const update = (patch: Partial<PeriodLabelSettings>) => {
    useTEMStore.setState((state) => ({
      doc: produce(state.doc, (d) => {
        d.settings.periodLabels = { ...d.settings.periodLabels, ...patch };
      }),
    }));
  };

  return (
    <section className="settings-section">
      <div className="setting-row">
        <label>編集中も表示</label>
        <input
          type="checkbox"
          checked={pl.alwaysVisible}
          onChange={(e) => update({ alwaysVisible: e.target.checked })}
        />
      </div>
      <div className="setting-row">
        <label>エクスポートに含める</label>
        <input
          type="checkbox"
          checked={pl.includeInExport}
          onChange={(e) => update({ includeInExport: e.target.checked })}
        />
      </div>
      <div className="setting-row">
        <label>描画スタイル</label>
        <select
          value={pl.bandStyle ?? 'band'}
          onChange={(e) => update({ bandStyle: e.target.value as PeriodLabelBandStyle })}
        >
          <option value="band">帯（|---時期1---|---時期2---|）</option>
          <option value="tick">点（ラベル + 短い区切り）</option>
        </select>
      </div>
      <div className="setting-row">
        <label>ラベル位置（横型レイアウト）</label>
        <select
          value={pl.labelSideHorizontal ?? 'top'}
          onChange={(e) => update({ labelSideHorizontal: e.target.value as HorizontalLabelSide })}
        >
          <option value="top">上部</option>
          <option value="bottom">下部</option>
        </select>
      </div>
      <div className="setting-row">
        <label>ラベル位置（縦型レイアウト）</label>
        <select
          value={pl.labelSideVertical ?? 'right'}
          onChange={(e) => update({ labelSideVertical: e.target.value as VerticalLabelSide })}
        >
          <option value="left">左側</option>
          <option value="right">右側</option>
        </select>
      </div>
      <div className="setting-row">
        <label>Item軸の基準</label>
        <select
          value={pl.itemReference}
          onChange={(e) => update({ itemReference: e.target.value as 'min' | 'max' })}
        >
          <option value="max">最大Item_Level（上側）</option>
          <option value="min">最小Item_Level（下側）</option>
        </select>
      </div>
      <div className="setting-row">
        <label>基準からのオフセット</label>
        <input
          type="number"
          step="0.5"
          value={pl.itemOffset}
          onChange={(e) => update({ itemOffset: Number(e.target.value) })}
          style={{ width: 70 }}
        />
      </div>
      <div className="setting-row">
        <label>区切り線を描画</label>
        <input
          type="checkbox"
          checked={pl.showDividers}
          onChange={(e) => update({ showDividers: e.target.checked })}
        />
      </div>
      <div className="setting-row">
        <label>フォントサイズ</label>
        <input
          type="number"
          min={8}
          max={40}
          value={pl.fontSize}
          onChange={(e) => update({ fontSize: Number(e.target.value) })}
          style={{ width: 70 }}
        />
      </div>

      <PeriodLabelListEditor />
    </section>
  );
}

// 現シートの時期ラベル一覧（追加・編集・削除）
function PeriodLabelListEditor() {
  const sheet = useActiveSheet();
  const addPeriodLabel = useTEMStore((s) => s.addPeriodLabel);
  const updatePeriodLabel = useTEMStore((s) => s.updatePeriodLabel);
  const removePeriodLabel = useTEMStore((s) => s.removePeriodLabel);
  const [newLabel, setNewLabel] = useState('');
  const [newPosition, setNewPosition] = useState(0);

  const handleAdd = () => {
    if (!newLabel.trim()) {
      alert('ラベルを入力してください');
      return;
    }
    addPeriodLabel(newLabel.trim(), newPosition);
    setNewLabel('');
    setNewPosition((p) => p + 1);
  };

  return (
    <>
      <h4 style={{ marginTop: 16 }}>時期ラベル（現シート）</h4>
      <p className="hint" style={{ marginTop: 0 }}>
        メインウィンドウの時期ラベルをダブルクリック、または「表示」タブの「時期編集...」でもここが開きます。
      </p>
      <div className="setting-row">
        <label>新規ラベル</label>
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="例: 入学前"
          style={{ width: 140 }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        />
        <input
          type="number"
          step="0.5"
          value={newPosition}
          onChange={(e) => setNewPosition(Number(e.target.value))}
          style={{ width: 70, marginLeft: 4 }}
          title="Time_Level"
        />
        <button className="ribbon-btn-small" onClick={handleAdd} style={{ marginLeft: 4 }}>追加</button>
      </div>
      {sheet && sheet.periodLabels.length === 0 && (
        <p className="hint">まだ時期ラベルがありません。</p>
      )}
      {sheet && sheet.periodLabels.length > 0 && (
        <table style={{ width: '100%', fontSize: '0.92em', marginTop: 4 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>ラベル</th>
              <th style={{ textAlign: 'left', width: 80 }}>Time_Level</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {[...sheet.periodLabels]
              .sort((a, b) => a.position - b.position)
              .map((pl) => (
                <tr key={pl.id}>
                  <td>
                    <input
                      type="text"
                      value={pl.label}
                      onChange={(e) => updatePeriodLabel(pl.id, { label: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.5"
                      value={pl.position}
                      onChange={(e) => updatePeriodLabel(pl.id, { position: Number(e.target.value) })}
                      style={{ width: 70 }}
                    />
                  </td>
                  <td>
                    <button className="row-btn danger" onClick={() => removePeriodLabel(pl.id)} title="削除">×</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </>
  );
}

// ============================================================================
// Legend
// ============================================================================
export function LegendSettingsSection() {
  const doc = useTEMStore((s) => s.doc);
  const sheet = useActiveSheet();
  const lg = doc.settings.legend;

  const update = (patch: Partial<LegendSettings>) => {
    useTEMStore.setState((state) => ({
      doc: produce(state.doc, (d) => {
        d.settings.legend = { ...d.settings.legend, ...patch };
      }),
    }));
  };

  const setOverride = (key: string, patch: Partial<LegendItemOverride>) => {
    useTEMStore.setState((state) => ({
      doc: produce(state.doc, (d) => {
        const ov = d.settings.legend.itemOverrides ?? {};
        ov[key] = { ...(ov[key] ?? {}), ...patch };
        d.settings.legend.itemOverrides = ov;
      }),
    }));
  };

  const clearOverride = (key: string) => {
    useTEMStore.setState((state) => ({
      doc: produce(state.doc, (d) => {
        const ov = d.settings.legend.itemOverrides ?? {};
        delete ov[key];
        d.settings.legend.itemOverrides = ov;
      }),
    }));
  };

  // 現シート上の凡例項目（上書き対象を提示する用）
  const currentItems = sheet ? computeLegendItems(sheet, lg) : [];

  return (
    <div>
      <section className="settings-section">
        <h4>表示対象</h4>
        <div className="setting-row">
          <label>自動生成（使用記号を抽出）</label>
          <input type="checkbox" checked={lg.autoGenerate} onChange={(e) => update({ autoGenerate: e.target.checked })} />
        </div>
        <div className="setting-row">
          <label>編集中も表示</label>
          <input type="checkbox" checked={lg.alwaysVisible} onChange={(e) => update({ alwaysVisible: e.target.checked })} />
        </div>
        <div className="setting-row">
          <label>エクスポートに含める</label>
          <input type="checkbox" checked={lg.includeInExport} onChange={(e) => update({ includeInExport: e.target.checked })} />
        </div>
        <div className="setting-row">
          <label>Box 種別を含む</label>
          <input type="checkbox" checked={lg.includeBoxes} onChange={(e) => update({ includeBoxes: e.target.checked })} />
        </div>
        <div className="setting-row">
          <label>Line 種別を含む</label>
          <input type="checkbox" checked={lg.includeLines} onChange={(e) => update({ includeLines: e.target.checked })} />
        </div>
        <div className="setting-row">
          <label>SD/SG を含む</label>
          <input type="checkbox" checked={lg.includeSDSG} onChange={(e) => update({ includeSDSG: e.target.checked })} />
        </div>
        <div className="setting-row">
          <label>非可逆的時間を含む</label>
          <input type="checkbox" checked={lg.includeTimeArrow} onChange={(e) => update({ includeTimeArrow: e.target.checked })} />
        </div>
      </section>

      <section className="settings-section">
        <h4>タイトル</h4>
        <div className="setting-row">
          <label>タイトルを表示</label>
          <input
            type="checkbox"
            checked={lg.showTitle !== false}
            onChange={(e) => update({ showTitle: e.target.checked })}
          />
        </div>
        <div className="setting-row">
          <label>タイトル文字列</label>
          <input
            type="text"
            value={lg.title}
            onChange={(e) => update({ title: e.target.value })}
            style={{ width: 160 }}
          />
        </div>
        <div className="setting-row">
          <label>タイトルの配置位置</label>
          <select
            value={lg.titlePosition ?? 'top'}
            onChange={(e) => update({ titlePosition: e.target.value as LegendTitlePosition })}
          >
            <option value="top">上部</option>
            <option value="left">左側</option>
          </select>
        </div>
        <div className="setting-row">
          <label>タイトルの書き方向</label>
          <select
            value={lg.titleWritingMode ?? 'horizontal'}
            onChange={(e) => update({ titleWritingMode: e.target.value as LegendTitleWritingMode })}
          >
            <option value="horizontal">横書き</option>
            <option value="vertical">縦書き</option>
          </select>
        </div>
        <div className="setting-row">
          <label>タイトルの揃え</label>
          <select
            value={lg.titleAlign ?? 'left'}
            onChange={(e) => update({ titleAlign: e.target.value as LegendTitleAlign })}
          >
            <option value="left">左揃え</option>
            <option value="center">中央揃え</option>
            <option value="right">右揃え</option>
          </select>
        </div>
        {lg.titlePosition === 'left' && (
          <div className="setting-row">
            <label>タイトルの上下揃え（左側配置時）</label>
            <select
              value={lg.titleVerticalAlign ?? 'top'}
              onChange={(e) => update({ titleVerticalAlign: e.target.value as LegendTitleVerticalAlign })}
            >
              <option value="top">上</option>
              <option value="middle">中央</option>
              <option value="bottom">下</option>
            </select>
          </div>
        )}
        <div className="setting-row">
          <label>タイトル フォント</label>
          <select
            value={lg.titleFontFamily ?? ''}
            onChange={(e) => update({ titleFontFamily: e.target.value || undefined })}
          >
            <option value="">（本文と同じ）</option>
            {FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
        <div className="setting-row">
          <label>タイトル サイズ (px)</label>
          <input
            type="number"
            min={6}
            max={60}
            value={lg.titleFontSize ?? ''}
            placeholder={`既定 ${Math.round(lg.fontSize * 1.15)}`}
            onChange={(e) => update({
              titleFontSize: e.target.value === '' ? undefined : Number(e.target.value),
            })}
            style={{ width: 80 }}
          />
        </div>
        <div className="setting-row">
          <label>タイトル 装飾</label>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className={lg.titleBold !== false ? 'style-btn active' : 'style-btn'}
              onClick={() => update({ titleBold: !(lg.titleBold !== false) })}
              title="太字"
            ><b>B</b></button>
            <button
              className={lg.titleItalic ? 'style-btn active' : 'style-btn'}
              onClick={() => update({ titleItalic: !lg.titleItalic })}
              title="斜体"
            ><i>I</i></button>
            <button
              className={lg.titleUnderline ? 'style-btn active' : 'style-btn'}
              onClick={() => update({ titleUnderline: !lg.titleUnderline })}
              title="下線"
            ><u>U</u></button>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h4>レイアウト</h4>
        <div className="setting-row">
          <label>横型レイアウト時の列数</label>
          <input
            type="number"
            min={1}
            value={lg.columnsHorizontal ?? 1}
            onChange={(e) => update({ columnsHorizontal: Math.max(1, Number(e.target.value)) })}
            style={{ width: 70 }}
          />
        </div>
        <div className="setting-row">
          <label>縦型レイアウト時の列数</label>
          <input
            type="number"
            min={1}
            value={lg.columnsVertical ?? 1}
            onChange={(e) => update({ columnsVertical: Math.max(1, Number(e.target.value)) })}
            style={{ width: 70 }}
          />
        </div>
        <div className="setting-row">
          <label>サンプル図形 幅 (px)</label>
          <input
            type="number"
            min={4}
            max={200}
            value={lg.sampleWidth ?? 32}
            onChange={(e) => update({ sampleWidth: Math.max(4, Number(e.target.value)) })}
            style={{ width: 80 }}
          />
        </div>
        <div className="setting-row">
          <label>サンプル図形 高さ (px)</label>
          <input
            type="number"
            min={4}
            max={200}
            value={lg.sampleHeight ?? 18}
            onChange={(e) => update({ sampleHeight: Math.max(4, Number(e.target.value)) })}
            style={{ width: 80 }}
          />
        </div>
        <div className="setting-row">
          <label>本文 フォント</label>
          <select
            value={lg.fontFamily ?? ''}
            onChange={(e) => update({ fontFamily: e.target.value || undefined })}
          >
            <option value="">（UI 既定）</option>
            {FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
        <div className="setting-row">
          <label>本文 フォントサイズ (px)</label>
          <input
            type="number"
            min={8}
            max={30}
            value={lg.fontSize}
            onChange={(e) => update({ fontSize: Number(e.target.value) })}
            style={{ width: 70 }}
          />
        </div>
        <div className="setting-row">
          <label>最小幅 (px)</label>
          <input
            type="number"
            min={50}
            max={800}
            value={lg.minWidth}
            onChange={(e) => update({ minWidth: Number(e.target.value) })}
            style={{ width: 70 }}
          />
        </div>
        <div className="setting-row">
          <label>2行目（説明文）を既定で表示</label>
          <input
            type="checkbox"
            checked={lg.showDescriptions === true}
            onChange={(e) => update({ showDescriptions: e.target.checked })}
          />
        </div>
      </section>

      <section className="settings-section">
        <h4>サイズ（固定）</h4>
        <p className="hint" style={{ marginTop: 0 }}>
          凡例の幅・高さを固定すると、キャンバスのスクロールや zoom に関係なく同じ見た目になります。
          未入力の場合は内容に合わせて自動。右下のハンドルをドラッグしても調整できます。
        </p>
        <div className="setting-row">
          <label>幅 (px)</label>
          <input
            type="number"
            min={0}
            step={1}
            value={lg.width ?? ''}
            placeholder="自動"
            onChange={(e) => {
              const v = e.target.value;
              update({ width: v === '' ? undefined : Math.max(40, Number(v)) });
            }}
            style={{ width: 100 }}
          />
        </div>
        <div className="setting-row">
          <label>高さ (px)</label>
          <input
            type="number"
            min={0}
            step={1}
            value={lg.height ?? ''}
            placeholder="自動"
            onChange={(e) => {
              const v = e.target.value;
              update({ height: v === '' ? undefined : Math.max(20, Number(v)) });
            }}
            style={{ width: 100 }}
          />
        </div>
        <div className="setting-row" style={{ justifyContent: 'flex-start', gap: 6 }}>
          <button className="ribbon-btn-small" onClick={() => update({ width: undefined, height: undefined })}>
            自動に戻す
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h4>背景・枠線</h4>
        <div className="setting-row">
          <label>背景</label>
          <select
            value={lg.backgroundStyle ?? 'white'}
            onChange={(e) => update({ backgroundStyle: e.target.value as LegendBackgroundStyle })}
          >
            <option value="white">白</option>
            <option value="none">透明（背景なし）</option>
          </select>
        </div>
        <div className="setting-row">
          <label>枠線の太さ (px、0=透明)</label>
          <input
            type="number"
            min={0}
            max={10}
            step={0.1}
            value={lg.borderWidth ?? 1}
            onChange={(e) => update({ borderWidth: Math.max(0, Number(e.target.value)) })}
            style={{ width: 80 }}
          />
        </div>
        <div className="setting-row">
          <label>枠線の色</label>
          <input
            type="color"
            value={lg.borderColor ?? '#999999'}
            onChange={(e) => update({ borderColor: e.target.value })}
          />
        </div>
      </section>

      <section className="settings-section">
        <h4>タイトルと項目の区切り線</h4>
        <div className="setting-row">
          <label>表示</label>
          <input
            type="checkbox"
            checked={lg.titleSeparatorVisible !== false}
            onChange={(e) => update({ titleSeparatorVisible: e.target.checked })}
          />
        </div>
        <div className="setting-row">
          <label>色</label>
          <input
            type="color"
            value={lg.titleSeparatorColor ?? '#dddddd'}
            onChange={(e) => update({ titleSeparatorColor: e.target.value })}
            disabled={lg.titleSeparatorVisible === false}
          />
        </div>
      </section>

      <section className="settings-section">
        <h4>項目別の表記</h4>
        <p className="hint" style={{ marginBottom: 6 }}>
          現在使用中の凡例項目について、ラベル（1行目）と説明文（2行目）を上書きできます。
          空欄にすると既定に戻ります。
        </p>
        {currentItems.length > 0 && (
          <div
            className="setting-row"
            style={{ justifyContent: 'flex-start', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}
          >
            <span style={{ color: '#555', fontSize: '0.9em' }}>すべての項目の2行目:</span>
            <button
              className="ribbon-btn-small"
              onClick={() => {
                currentItems.forEach((item) => {
                  setOverride(`${item.category}:${item.key}`, { showDescription: true });
                });
              }}
            >
              一括表示
            </button>
            <button
              className="ribbon-btn-small"
              onClick={() => {
                currentItems.forEach((item) => {
                  setOverride(`${item.category}:${item.key}`, { showDescription: false });
                });
              }}
            >
              一括非表示
            </button>
            <button
              className="ribbon-btn-small"
              onClick={() => {
                currentItems.forEach((item) => {
                  setOverride(`${item.category}:${item.key}`, { showDescription: undefined });
                });
              }}
              title="項目別設定を解除して全体既定に従う"
            >
              既定に戻す
            </button>
          </div>
        )}
        {currentItems.length === 0 && <p className="hint">現シートには凡例項目がありません</p>}
        {currentItems.map((item) => {
          const key = `${item.category}:${item.key}`;
          const ov = lg.itemOverrides?.[key] ?? {};
          const showDesc = ov.showDescription ?? (lg.showDescriptions === true);
          return (
            <div
              key={key}
              style={{
                border: '1px solid #eee',
                borderRadius: 4,
                padding: 8,
                marginBottom: 6,
                background: '#fafafa',
              }}
            >
              <div style={{ fontSize: '0.85em', color: '#666', marginBottom: 4 }}>
                <code>{key}</code>
              </div>
              <div className="setting-row">
                <label>ラベル（1行目）</label>
                <input
                  type="text"
                  value={ov.label ?? ''}
                  placeholder={item.label}
                  onChange={(e) => setOverride(key, { label: e.target.value || undefined })}
                  style={{ width: 200 }}
                />
              </div>
              <div className="setting-row">
                <label>説明（2行目）</label>
                <input
                  type="text"
                  value={ov.description ?? ''}
                  placeholder={item.description}
                  onChange={(e) => setOverride(key, { description: e.target.value || undefined })}
                  style={{ width: 240 }}
                />
              </div>
              <div className="setting-row">
                <label>2行目を表示</label>
                <select
                  value={ov.showDescription === undefined ? '' : ov.showDescription ? 'true' : 'false'}
                  onChange={(e) => {
                    const v = e.target.value;
                    setOverride(key, {
                      showDescription: v === '' ? undefined : v === 'true',
                    });
                  }}
                >
                  <option value="">（全体既定 {showDesc ? '=表示' : '=非表示'}）</option>
                  <option value="true">表示</option>
                  <option value="false">非表示</option>
                </select>
              </div>
              <div className="setting-row">
                <button
                  className="danger-btn"
                  onClick={() => clearOverride(key)}
                  style={{ fontSize: '0.8em' }}
                >
                  この項目の上書きを解除
                </button>
              </div>
            </div>
          );
        })}
      </section>

      <p className="hint">凡例はキャンバス上でドラッグして位置調整、ダブルクリックでこの設定を開けます</p>
    </div>
  );
}

// ============================================================================
// Time arrow
// ============================================================================
function TimeArrowSettingsSection() {
  const doc = useTEMStore((s) => s.doc);
  const ta = doc.settings.timeArrow;

  const update = (patch: Partial<TimeArrowSettings>) => {
    useTEMStore.setState((state) => ({
      doc: produce(state.doc, (d) => {
        d.settings.timeArrow = { ...d.settings.timeArrow, ...patch };
      }),
    }));
  };

  return (
    <section className="settings-section">
      <div className="setting-row">
        <label>エクスポート時に自動挿入</label>
        <input
          type="checkbox"
          checked={ta.autoInsert}
          onChange={(e) => update({ autoInsert: e.target.checked })}
        />
      </div>
      <div className="setting-row">
        <label>編集中も常時表示</label>
        <input
          type="checkbox"
          checked={ta.alwaysVisible}
          onChange={(e) => update({ alwaysVisible: e.target.checked })}
        />
      </div>
      <div className="setting-row">
        <label>開始レベル拡張（minTimeLevel に加算）</label>
        <input
          type="number"
          step="0.5"
          value={ta.timeStartExtension}
          onChange={(e) => update({ timeStartExtension: Number(e.target.value) })}
          style={{ width: 70 }}
        />
      </div>
      <div className="setting-row">
        <label>終了レベル拡張（maxTimeLevel に加算）</label>
        <input
          type="number"
          step="0.5"
          value={ta.timeEndExtension}
          onChange={(e) => update({ timeEndExtension: Number(e.target.value) })}
          style={{ width: 70 }}
        />
      </div>
      <div className="setting-row">
        <label>Item軸の基準</label>
        <select
          value={ta.itemReference}
          onChange={(e) => update({ itemReference: e.target.value as 'min' | 'max' })}
        >
          <option value="max">最大Item_Level（上側）</option>
          <option value="min">最小Item_Level（下側）</option>
        </select>
      </div>
      <div className="setting-row">
        <label>基準からのオフセット（±レベル）</label>
        <input
          type="number"
          step="0.5"
          value={ta.itemOffset}
          onChange={(e) => update({ itemOffset: Number(e.target.value) })}
          style={{ width: 70 }}
          title="+ で外側（基準位置から Box 群の反対側へ）、- で内側（Box 群寄り）"
        />
      </div>
      <div className="setting-row">
        <label>ラベル</label>
        <input
          type="text"
          value={ta.label}
          onChange={(e) => update({ label: e.target.value })}
          style={{ width: 180 }}
        />
      </div>
      <div className="setting-row">
        <label>ラベル位置（横型レイアウト）</label>
        <select
          value={ta.labelSideHorizontal ?? 'bottom'}
          onChange={(e) => update({ labelSideHorizontal: e.target.value as HorizontalLabelSide })}
        >
          <option value="top">上部</option>
          <option value="bottom">下部</option>
        </select>
      </div>
      <div className="setting-row">
        <label>ラベル位置（縦型レイアウト）</label>
        <select
          value={ta.labelSideVertical ?? 'left'}
          onChange={(e) => update({ labelSideVertical: e.target.value as VerticalLabelSide })}
        >
          <option value="left">左側</option>
          <option value="right">右側</option>
        </select>
      </div>
      <div className="setting-row">
        <label>ラベルオフセット (px)</label>
        <input
          type="number"
          min={0}
          step={1}
          value={ta.labelOffset ?? 4}
          onChange={(e) => update({ labelOffset: Math.max(0, Number(e.target.value)) })}
          style={{ width: 80 }}
        />
      </div>
      <div className="setting-row">
        <label>ラベル揃え（横型：矢印方向）</label>
        <select
          value={ta.labelAlignHorizontal ?? 'center'}
          onChange={(e) => update({ labelAlignHorizontal: e.target.value as TimeArrowLabelAlignHorizontal })}
        >
          <option value="center">中央</option>
          <option value="end">右寄り（矢印先端側）</option>
        </select>
      </div>
      <div className="setting-row">
        <label>ラベル揃え（縦型：矢印方向）</label>
        <select
          value={ta.labelAlignVertical ?? 'center'}
          onChange={(e) => update({ labelAlignVertical: e.target.value as TimeArrowLabelAlignVertical })}
        >
          <option value="center">中央</option>
          <option value="start">上寄り（矢印始点側）</option>
        </select>
      </div>
      <div className="setting-row">
        <label>ラベル フォント</label>
        <select
          value={ta.labelFontFamily ?? ''}
          onChange={(e) => update({ labelFontFamily: e.target.value || undefined })}
        >
          <option value="">（UI既定）</option>
          {FONT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>
      <div className="setting-row">
        <label>ラベル 装飾</label>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className={ta.labelBold ? 'style-btn active' : 'style-btn'}
            onClick={() => update({ labelBold: !ta.labelBold })}
            title="太字"
          ><b>B</b></button>
          <button
            className={ta.labelItalic ? 'style-btn active' : 'style-btn'}
            onClick={() => update({ labelItalic: !ta.labelItalic })}
            title="斜体"
          ><i>I</i></button>
          <button
            className={ta.labelUnderline ? 'style-btn active' : 'style-btn'}
            onClick={() => update({ labelUnderline: !ta.labelUnderline })}
            title="下線"
          ><u>U</u></button>
        </div>
      </div>
      <div className="setting-row">
        <label>線の太さ (pt)</label>
        <input
          type="number"
          min={0.5}
          step="0.5"
          value={ta.strokeWidth}
          onChange={(e) => update({ strokeWidth: Number(e.target.value) })}
          style={{ width: 70 }}
        />
      </div>
      <div className="setting-row">
        <label>フォントサイズ</label>
        <input
          type="number"
          min={8}
          max={40}
          value={ta.fontSize}
          onChange={(e) => update({ fontSize: Number(e.target.value) })}
          style={{ width: 70 }}
        />
      </div>
    </section>
  );
}
