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

---

## 2026-04-19 追記: 直近の作業ステータス

### 完了（2026-04-19 前半）
- 凡例の詳細カスタマイズ（タイトル位置 top/left、書き方向、揃え、背景/枠線、サンプルサイズ、項目別上書き、一括トグル、ダブルクリックで設定起動）
- 時期ラベル帯表記、ラベル位置（横型 top/bottom、縦型 left/right）、設定タブ名「時期区分」
- 時間矢印ラベルの装飾（フォント/B/I/U）、オフセット、矢印方向の揃え（center/end・center/start）
- SDSG を Box と同形式タイプラベル + サブラベル対応、モノクロ基調統一
- タイプラベル種別ごとの表示 ON/OFF（設定ダイアログ「タイプラベル」タブ、一括切替）
- 設定ダイアログのタブ化＋ドラッグ移動、幅 640px 固定
- ExportDialog 新規（PNG/SVG/PPTX、範囲・要素・背景の設定）。リボン「出力」タブ → ファイルタブへ統合
- 初期サンプル図を Item → OPP → BFP → EFP/P-EFP（SD/SG を BFP に）＋ 時期1/時期2 配置に変更
- 画面 fit（全体/横/縦）: 時間矢印・時期ラベル・凡例を含む bounds で viewport を合わせる
- 縦書き時の半角ハイフン 90° 回転（`utils/verticalText.tsx`）
- Line の始点/終点 Time/Item 軸独立オフセット（`components/edges/LineEdge.tsx`）

### PPTX 実装（コード実装済、動作確認待ち）
- [x] `exportPPT.ts` 全面刷新（横型/縦型レイアウト、スケーリング、bbox+offset fit）
- [x] SDSG を rightArrow + 回転で表現（横: SD=90/SG=270、縦: SD=0/SG=180）
- [x] Line に Time/Item 独立オフセットを反映
- [x] 時間矢印ラベル装飾・位置・オフセット反映
- [x] 時期区分 band/tick 対応
- [x] 凡例の新構造（タイトル位置 top/left、列数、項目別上書き、サンプルサイズ）
- [x] 二重線 Box: **マーカー色 + XML ポストプロセスで `cmpd="dbl"` 注入** → 本物の二重線（JSZip 追加）
- [x] ExportDialog に PPTX 固有項目（スケーリング ON/OFF）
- [ ] **PowerPoint で開いて見た目確認**（次回・出先から戻った後）
  - 二重線の効き、SDSG の向き、スケーリング収まり、ラベル位置、凡例 `left` レイアウト

### PPTX の残課題候補（動作確認で判明次第）
- ID バッジは PPTX では非表示（必要なら復活）
- 縦型 SDSG のサブラベル / タイプラベルの配置調整
- 凡例 `titleWritingMode: vertical` 時の揃え精緻化
- オフセットマージンのpx換算が bbox スケールと整合しているかの検証

---

## 2026-04-21 時点の追加完了項目（UI フィードバック第9〜12弾）

### 完了
- エクスポートプレビュー: ホイール=ズーム/ドラッグ=パン分離、凡例スケール連動、autoCenterOnPaper で凡例位置シフト、時期ラベルも全体スケール連動
- 論文レポート出力は一時停止（出力内容が未成熟のため、ボタンは案内 alert に差し替え）
- 編集モード 3 種:「移動（パン）」「選択（自由編集）」「範囲選択（矩形選択）」。移動モードは NodeResizer とノードドラッグが無効、ダブルクリック編集は有効
- Box:「幅を文字に」「高さを文字に」ボタン / ラベル編集の Undo 一発対応 / サイズ変更時に SD/SG が Box 縁距離を保ちながら追従
- SDSG: ダブルクリック編集 / SD=上・SG=下 の自動配置 / プロパティパネルを Box と同等の装飾 UI に拡張 / 左右・上下揃え / ASCII 縦向き
- 表示リボン: タイプラベル一括切替 / リボン文字サイズ調整 / グリッド・スナップを設定に集約
- 時期区分 UI 統合: 設定 > 時期区分タブに時期ラベル一覧編集を移設、ダブルクリック/ボタンで該当タブを開く
- 非可逆的時間: タブ名改名 + 矢印ラベルダブルクリックで該当タブを開く
- 整列ガイド: 選択解除で即消去
- 設定ダイアログ: tabNonce で同タブ連続指定でも切替を強制、オーバーレイラベルのイベント伝播対策

### 未着手 / 積み残し
- [ ] 論文レポート出力の刷新（内容設計からやり直し）
- [ ] 大規模図（Box 100 個超）でのパフォーマンス検証
- [ ] Safari/Firefox 動作確認
- [ ] TEM 文献準拠の自動レイアウト（Phase 3）
- [ ] TLMG 3 層スイムレーン（Phase 5）

---

## 2026-04-20 時点の大きな完了項目

- Box のインライン編集（ダブルクリックで textarea）
- Box の 8 点リサイズハンドル（React Flow NodeResizer）
- Box 自動拡張モード（width-fixed / height-fixed / none）＋「文字に合わせる」
- ラベル部分装飾タグ（`<b>/<i>/<u>/<s>/<size=>/<color=>/<font=>`）横書きで反映
- 選択 Box のサイズ統一 / 文字サイズ統一
- 用紙サイズ共通定義（`utils/paperSizes.ts`）
- PDF 出力（用紙サイズ + マージン fit、jsPDF）
- 論文用レポート (.docx、docx パッケージ) + PaperReportDialog + PropertyPanel に description 入力
- **印刷レイアウト変換層 + プレビュー付き統合出力ダイアログ**
  （ExportTransform / ExportPreviewCanvas / ExportPreviewDialog / TEMViewContext）
  元データ不変、完全一致プレビュー、ズーム/スクロール可
- **シート実データリサイズダイアログ**（編集リボン > シート > リサイズ）
  パーセント or 用紙 fit、文字サイズ連動切替可、Undo 対応
