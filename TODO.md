# TODO.md - TEMer 開発タスク

## Phase 1: 最小プロトタイプ（進行中）

### 環境構築
- [x] old_file/ に旧資産退避
- [x] CLAUDE.md / HISTORY.md / TODO.md 作成
- [x] webApp/ 配下に Vite+React+TS プロジェクト scaffold
- [x] 依存パッケージ定義（react, reactflow, zustand, pptxgenjs, html-to-image）
- [x] `npm install` 動作確認
- [ ] **`npm run dev` で実際のブラウザ動作確認**（ユーザ手動テスト）

### データモデル
- [x] `src/types.ts` に Box / Line / TEMDocument 型定義
- [x] `src/store/store.ts` に Zustand ストア（boxes, lines, CRUD操作）
- [x] サンプルデータ（Box 3個、Line 2本）

### UI
- [x] 左：データシート（表形式、セル編集でストア更新）
- [x] 右：React Flow 作図ビュー
- [x] 上：ツールバー（Box追加、サンプル読込、Export PPT、Export PNG）

### 作図
- [x] カスタムノード: 通常Box
- [x] カスタムノード: 二重線Box
- [x] カスタムノード: 点線Box
- [x] 実線矢印エッジ
- [x] 点線矢印エッジ
- [x] ドラッグでBoxの座標を更新 → シートに反映
- [x] エッジ接続でLineを追加 → シートに反映

### エクスポート
- [x] PNG出力（html-to-image）
- [x] pptx出力（PptxGenJS）
  - [x] 通常Box → rect
  - [x] 二重線Box → **2矩形重ね描きで暫定対応**（`compound: 'dbl'` はPptxGenJS未対応）
  - [x] 点線Box → rect with `line.dashType: 'dash'`
  - [x] 実線矢印 → line with `endArrowType: 'triangle'`
  - [x] 点線矢印 → line with `dashType: 'dashDot'` + `endArrowType`

### ドキュメント
- [x] webApp/README.md に起動手順

### Phase 1 の残課題（次セッションで）
- [ ] ブラウザで手動動作確認（Chrome/Edge）
- [ ] pptx出力をPowerPointで開いて見た目確認
- [ ] PNG出力の画質確認（pixelRatio=2）

---

## Phase 2: 機能拡充（未着手）

### Must have（文献上ほぼ全TEM図で必要）
- [ ] SD / SG（Pentagon、向きを属性で管理、左右反転対応）
- [ ] Box種別 5種フル対応（OPP=太線 / BFP=実線 / EFP=二重線 / P-EFP=点線 / 通常）
  - [ ] **重要**: 旧TEMerPlusの線種マッピングと文献主流を照合（EFP↔OPPの逆転がないか）
- [ ] 非可逆的時間軸の描画（図端の長い矢印）
- [ ] 時期ラベル（時間軸上の離散ラベル）

### Should have（文献調査で追加が推奨される）
- [ ] **2nd EFP / P-2nd EFP** — キャリア・健康分野で独立要素化（Hosaka 2026 参照）
- [ ] **OPP / BFP の自動番号採番**（OPP-1, BFP-2 等）
- [ ] **吹き出し／注釈ノード**（看護・スポーツ分野で多用）
- [ ] **凡例（Legend）の自動生成**（英語論文で標準装備）
- [ ] **径路のグループ化／領域ハイライト**（カタログTEA 2023）

### ファイル・設定
- [ ] 設定画面
  - [ ] レイアウト方向（縦/横）
  - [ ] デフォルトフォント・サイズ
  - [ ] レベル間隔
- [ ] `.tem` ファイル保存（File System Access API）
- [ ] `.tem` ファイル読み込み
- [ ] IndexedDB自動バックアップ
- [ ] 全ブラウザ動作確認（Chrome/Edge/Safari/Firefox）

---

## Phase 3: 自動レイアウト（未着手）

- [ ] Item_Level / Time_Level ベースの自動配置
- [ ] レベル変更ダイアログ（旧 UserForm_Box_level_Change 相当）
- [ ] 矢印始点終点の自動修正
- [ ] 図形移動時の連動（右側シフト、同列以上）
- [ ] レイアウト方向切替時の全図形再計算

---

## Phase 4: データ連携（未着手）

- [ ] CSV インポート
- [ ] 旧 `.xlsm` Dataシート読み取り → `.tem` 変換ツール
- [ ] 既存TEM作図資料（pptx）からのインポート検討

---

## Phase 5: Nice to have（将来・検討）

- [ ] **TLMG 3層スイムレーン**（行為層/記号層/信念層）
- [ ] **促進的記号 Promoter Sign**（星型・雲型・ダイヤ型）
- [ ] **統合TEM図ビュー**（1/4/9/16の法則に対応、複数協力者の径路を統合）
- [ ] **縦型図**
- [ ] **ブロック矢印（太矢印）** で強調径路
- [ ] **色カスタマイズ**（モノクロ前提から脱却）
- [ ] **「時間を拡張する」サブ領域表示**（特定分岐点のズーム詳細化）
- [ ] **Label/SubLabel機能**（旧版で準備中だった機能）

---

## 判断保留事項

- [ ] データシートUIライブラリ選定: 自前 vs Handsontable vs AG Grid
- [ ] Tauriデスクトップ版をいつ追加するか
- [ ] 共同編集機能（WebSocket / Yjs）を入れるか
- [ ] i18n対応（日英切替）
- [ ] **pptx二重線のネイティブ出力**（PptxGenJSの`cmpd="dbl"`未対応問題）
  - 選択肢A: PptxGenJSにPRを送る（`compound` プロパティ追加）
  - 選択肢B: pptx生成後のXMLポストプロセスで `cmpd="dbl"` を注入
  - 選択肢C: 自前のpptx生成（JSZip + DrawingML直書き）に置換
  - 暫定: 2矩形重ね描きで対応（見た目は問題なし）

---

## 既知の課題・注意点

- Safari では File System Access API が使えない → 保存はダウンロード方式にフォールバック
- pptx の二重線はPowerPoint側で表示、LibreOfficeでの互換性は要検証
- 大規模図（Box 100個超）でのReact Flowパフォーマンスは要検証
