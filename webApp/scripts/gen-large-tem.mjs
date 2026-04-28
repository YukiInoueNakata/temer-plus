// ============================================================================
// gen-large-tem.mjs - 大規模 .tem ファイル生成（perf 検証用）
//   node webApp/scripts/gen-large-tem.mjs
//   生成先: webApp/test-fixtures/large-{N}.tem
// ============================================================================

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTDIR = resolve(__dirname, '../test-fixtures');
mkdirSync(OUTDIR, { recursive: true });

// DEFAULT_SETTINGS の必要最小サブセット（src/store/defaults.ts を簡略化）
const DEFAULT_SETTINGS = {
  layout: 'horizontal',
  levelStep: 50,
  paperSize: 'A4-landscape',
  customPaperWidthMm: 297,
  customPaperHeightMm: 210,
  ui: { fontSize: 11 },
  defaults: {
    box: { fontSize: 11, normal: { width: 100, height: 50 }, BFP: { width: 60, height: 100 }, EFP: { width: 70, height: 120 }, 'P-EFP': { width: 70, height: 120 }, OPP: { width: 60, height: 120 }, annotation: { width: 80, height: 50 }, '2nd-EFP': { width: 70, height: 120 }, 'P-2nd-EFP': { width: 70, height: 120 } },
    line: { strokeWidth: 1.5, color: '#333' },
    sdsg: { width: 70, height: 40, fontSize: 11 },
  },
  timeArrow: { enabled: true, position: 'bottom', strokeWidth: 2, color: '#333', autoInsert: true, labelOffset: 4, fontSize: 12 },
  periodLabels: { fontSize: 14, alwaysVisible: true, position: 'top', labelOffset: 4 },
  legend: { enabled: false, position: 'top-right', fontSize: 11, items: [], borderWidth: 1, padding: 8 },
  sdsgSpace: {
    enabled: true,
    autoArrange: true,
    autoFlipDirectionInBand: false,
    allowMismatchedPlacement: false,
    bands: {
      top: { enabled: true, heightMode: 'auto', heightLevel: 1.5, reference: 'boxes', offsetLevel: 0.2, showBorder: true, fillStyle: 'tinted', labelPosition: 'top-left', shrinkToFitRow: true, autoExpandHeight: false },
      bottom: { enabled: true, heightMode: 'auto', heightLevel: 1.5, reference: 'boxes', offsetLevel: 0.2, showBorder: true, fillStyle: 'tinted', labelPosition: 'top-left', shrinkToFitRow: true, autoExpandHeight: false },
    },
  },
  typeLabelVisibility: { SD: true, SG: true, BFP: true, EFP: true, 'P-EFP': true, OPP: true, '2nd-EFP': true, 'P-2nd-EFP': true, annotation: true },
  locale: 'ja',
  showFrame: false,
  showRulers: false,
};

function makeBoxes(n) {
  const boxes = [];
  const cols = 20;
  for (let i = 0; i < n; i++) {
    boxes.push({
      id: `box-${i}`,
      type: 'normal',
      label: `Box ${i}`,
      x: (i % cols) * 120,
      y: Math.floor(i / cols) * 80,
      width: 100,
      height: 50,
    });
  }
  return boxes;
}

function makeLines(boxes) {
  // 順次接続（隣接間）+ 約 1/3 を skip して空白を作る
  const lines = [];
  for (let i = 0; i < boxes.length - 1; i++) {
    if (i % 3 === 2) continue;
    lines.push({
      id: `line-${i}`,
      type: i % 5 === 0 ? 'XLine' : 'RLine',
      from: boxes[i].id,
      to: boxes[i + 1].id,
      connectionMode: 'center-to-center',
      shape: 'straight',
    });
  }
  return lines;
}

function makeSDSGs(boxes) {
  const sdsgs = [];
  const stride = Math.max(5, Math.floor(boxes.length / 30));
  for (let i = 0, k = 0; i < boxes.length; i += stride, k++) {
    const isSD = k % 2 === 0;
    sdsgs.push({
      id: `sdsg-${k}`,
      type: isSD ? 'SD' : 'SG',
      label: isSD ? 'SD' : 'SG',
      attachedTo: boxes[i].id,
      attachedType: 'box',
      itemOffset: 0,
      timeOffset: 0,
      width: 70,
      height: 40,
      spaceMode: isSD ? 'band-top' : 'band-bottom',
    });
  }
  return sdsgs;
}

function makeSheet(boxCount) {
  const boxes = makeBoxes(boxCount);
  const lines = makeLines(boxes);
  const sdsg = makeSDSGs(boxes);
  return {
    id: `sheet-${boxCount}`,
    name: `Large ${boxCount}`,
    type: 'individual',
    order: 0,
    boxes,
    lines,
    sdsg,
    notes: [],
    comments: [],
    periodLabels: [],
  };
}

function makeDocument(boxCount) {
  const sheet = makeSheet(boxCount);
  return {
    version: '0.3',
    sheets: [sheet],
    activeSheetId: sheet.id,
    participants: [],
    settings: DEFAULT_SETTINGS,
    metadata: {
      title: `Large Diagram (${boxCount} boxes)`,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      description: `perf 検証用ダミー: Box ${boxCount} 個 + 接続 + SD/SG`,
    },
    history: [],
  };
}

const TARGETS = [50, 100, 300, 500, 1000];
for (const n of TARGETS) {
  const doc = makeDocument(n);
  const out = resolve(OUTDIR, `large-${n}.tem`);
  writeFileSync(out, JSON.stringify(doc, null, 2));
  const lines = doc.sheets[0].lines.length;
  const sdsgs = doc.sheets[0].sdsg.length;
  console.log(`  ${out.replace(/\\/g, '/')}: ${n} boxes, ${lines} lines, ${sdsgs} sdsg`);
}
console.log(`\nGenerated ${TARGETS.length} files in ${OUTDIR.replace(/\\/g, '/')}`);
