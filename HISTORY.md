# HISTORY.md - TEMer (Web版) 開発履歴

このファイルはTEMer Web版の開発履歴を記録します。
旧版VBAの履歴は `old_file/HISTORY.md` を参照してください。

---

## 2026-04-18: プロジェクト再出発（Web版へ移行）

### 背景
- 旧版 TEMerPlus（Excel VBA実装）は使い勝手に課題
- クロスプラットフォーム対応・WYSIWYG編集・双方向データ同期を目指して Web版として再設計

### 決定事項
1. **アーキテクチャ**: React + Vite + TypeScript、作図は React Flow、状態は Zustand
2. **データ保存**: `.tem` ファイル（JSON）中心、IndexedDBは自動バックアップ用途
3. **エクスポート**: PptxGenJS（pptxの二重線は `compound: 'dbl'` でネイティブ出力）、PNGは html-to-image
4. **対象ブラウザ**: Chrome / Edge を推奨（File System Access API 活用）、Safari/Firefoxは基本機能のみ保証
5. **旧版は `old_file/` に全退避**して凍結（参照用）

### pptx 二重線対応の調査結果
- DrawingML `<a:ln cmpd="...">` 属性が公式サポート: `sng` / `dbl` / `thickThin` / `thinThick` / `tri`
- PptxGenJS でも `compound` プロパティで指定可能
- → **二重線枠はpptxネイティブで再現可能**（矩形重ね描きは不要）

### 旧版機能棚卸し（Explore agent経由）
旧VBAソース約5,200行を調査、主要要素を整理:

| 分類 | 要素 |
|---|---|
| Box種別 | 通常 / OPP（二重線）/ BFP / EFP / P-EFP（点線）/ 注釈用点線枠 |
| Line種別 | RLine（実線+矢印） / XLine（点線+矢印） |
| SD/SG | Pentagon、方向指定あり |
| Dataシート列 | ID, Type, Text, Item_Level, Time_Level, Width, Height, From_shp_Name, To_shp_Name, 各種マージン/高さ調整, Font, SDSG位置オフセット |
| UI | ツールバー6ボタン、UserForm 6種 |
| 自動処理 | レベル調整、矢印始点終点自動修正、図形移動時連動 |
| 設定 | レイアウト方向、Box種別ごとのサイズ、フォント、レベル間隔等 |

詳細は `old_file/VBA_Backup/` 及び `old_file/HISTORY.md` を参照。

### 実施内容（2026-04-18）
- [x] `old_file/` ディレクトリ作成、旧成果物を全退避
- [x] 新 CLAUDE.md / HISTORY.md / TODO.md 作成
- [x] `webApp/` 最小プロトタイプ作成
  - Vite + React 18 + TypeScript + React Flow + Zustand
  - Box 3種（通常/二重線/点線）、Line 2種（実線/点線+矢印）
  - データシート↔作図ビューの双方向同期
  - PNG出力（html-to-image）、PPTX出力（PptxGenJS）
  - `npm install` 成功（139 packages）
  - `npm run build` 成功（型チェック通過）

### 設計変更
- **矢印は必ず直線**とする（React Flow の `type: 'straight'`）。曲線(bezier)は使わない

### TEM/TEA 文献調査（2026-04-18 追加・3段階）

`docs/literature/` 配下に公開PDF 7本を取得、以下3つの調査レポートを格納:

- `RESEARCH_REPORT.md` — 基礎調査
- `RESEARCH_REPORT_DEEP.md` — 深掘り（TLMG詳細、競合分析、最新動向、戦略的示唆）
- `RESEARCH_REPORT_VISUAL.md` — 視覚確認（PDFを画像化して実図を検証）

また PyMuPDF でPDFを全ページPNG化し `docs/literature/figures/` に保存（77ページ分）。

**視覚確認で確定した表記ルール:**
- **EFP = 二重線長方形**（右端配置）
- **P-EFP = 点線長方形**（EFPの対）
- **OPP = 太線長方形**
- **BFP = 実線長方形 または 楕円**
- 通常Box = 細線長方形
- **SD = 下向き五角形、図の上部配置**（径路を上から妨害）
- **SG = 上向き五角形、図の下部配置**（径路を下から支援）
- 径路: 実線=実現、点線=未実現
- 非可逆的時間軸: 図端の長い右向き矢印

**重要な訂正:**
- Arakawa 2012 の描き方は **8ステップ**（前調査の「7」は誤り）

**旧実装照合結果（`docs/literature/OLD_VS_LITERATURE.md` 参照）:**

`Module_Make_Box.bas` の `ApplyLineStyles` を確認した結果、**致命的なマッピングの誤りを発見**:

| | EFP | OPP |
|---|---|---|
| **文献標準** | **二重線** | 太線（単線） |
| **旧実装** | 太線（単線） | **二重線** |

→ **旧TEMerPlusはEFPとOPPの線種が逆転している**。TEMで最も重要な2要素の表記が文献と食い違う。

**Web版（TEMer）での決定（2026-04-18 ユーザ確認済）:**
- **文献標準を採用**（EFP=二重線、OPP=太線）
- 過去に旧実装の誤り表記のまま論文・資料は出していない → **互換モード不要**
- BFPのデフォルト形状は**長方形**（楕円はオプションとして将来検討）
- 旧xlsmからインポート時は自動修正 + 修正内容サマリ表示

### UX方針の決定（2026-04-18）

**データシート中心から「プロパティパネル中心」へ転換**。ユーザ確認事項:

1. **研究室内共有**: A（ファイル共有 = OneDrive等のクラウド経由）に決定。リアルタイム共同編集は不要。
2. **データシートの位置づけ**: **初期のBox一括作成専用**。以降の編集は「図形クリック→プロパティパネル」で個別/一括編集する Figma/PowerPoint 風UX。
3. **コメント**: Box/Line単位、Figma風（図形上にピン止め可能な注釈）。
4. **統合TEM図**: 検討中（Phase 4以降）。
5. **TLMG連携**: 将来的に（Phase 4以降）。
6. **チュートリアル**: A+B+C 全採用（初回ウォークスルー + マニュアルページ + 動画リンク）。
7. **多言語（日英）**: **A+B のみ**（UIラベル + エラー/凡例）。Boxテキストは単一フィールドで管理（自動翻訳・併記フィールドは当面不要）。
8. **矢印の接続点**（2026-04-18 追加指示）: Line には2つの接続モードを用意。
   - **中点→中点**（右辺中点 → 左辺中点）: **標準・既定**
   - **水平接続**（右辺の同一Y → 左辺の同一Y）: オプション
   - Lineプロパティで切替可能
9. **重要な哲学的前提**（2026-04-18 確認）: **サトウタツヤ先生はTEM表記の画一化・標準化には反対の立場**。TEMerPlus は「標準化を強制する」ツールではなく、**「研究者が自分の表記選択を明文化するのを支援する」ツール**として設計する。
   - 文献標準（Arakawa 2012等）は**デフォルト提供**のみ
   - カスタマイズは完全に自由
   - 「必須」「強制」「規格準拠」という方向は避ける
   - 機能名: 「必須報告事項」→「**表記方針の明文化**」等に変更
   - 戦略: 「TEMerPlus標準」として固定せず、**多様性を可視化・記録**する

10. **論文報告エクスポート機能**（2026-04-18 追加指示）:
    - **出力フォーマット**: Word (.docx) + pptx付録スライド
    - **チェック強度**: **任意**（強制も警告もなし、リマインドのみ）
    - **Box/Line説明**: 任意だが論文用エクスポート時にリマインド。「説明不要（自明）」チェックで例外化可能
    - **含める報告項目**（ユーザが入力した範囲で出力）:
      1. 使用した記号体系（Arakawa 2012 / 独自拡張 / カスタム）
      2. 協力者情報（人数、属性、HSI=招待の論理）
      3. インタビュー期間・回数・方法
      4. 横軸（Time_Level）間隔の意味
      5. 矢印の角度の意味
      6. 縦軸（Item_Level）位置の意味
      7. 色の意味（使用時）
      8. 線の太さの意味（標準以外を使用時）
      9. Box/Line/SD/SG の個別説明

18. **アプリ全体方針の決定**（2026-04-18 ユーザ確認）:
    - **アプリ名**: **TEMer Plus**（旧VBA版も同名だったが、Web版もこの名で）
    - **著者**: 中田友貴
    - **初回起動体験**: **スタート画面**（新規作成 / 最近のファイル / サンプル図 / チュートリアル）
    - **配布方法**: **PWA（オフライン対応）+ Tauri デスクトップ版（.exe/.dmg）** 並行配布
    - **ライセンス**: **PolyForm Noncommercial 1.0.0 + 個別商用契約**方式で進める方針
      - 非商用（研究・教育・個人）: 無料、ソースコード公開
      - 商用利用: 著者（中田友貴）or 立命館大学産学連携窓口経由で個別契約
      - ※ 正式採用は実装着手前に最終確定
    - **PowerPoint からのインポート**: 将来課題として B+C（画像取り込み + OCR/shape解析）
    - **パフォーマンス目標**: **Box 200個まで**保証（統合TEM図含む）
    - **編集履歴**: **ファイル内に最新50件の編集履歴**を保存
    - **協力者メタデータ表示**: **Box/矢印の下部に協力者IDを小さく表記**（標準）+ 色分け識別
    - **凡例カスタマイズ**: **全部カスタマイズ可能**（タイトル/説明文/レイアウト/位置/表示項目）
    - **透かし**: なし

17. **視覚デザイン・運用の決定**（2026-04-18 ユーザ確認）:
    - **配色テーマ**: 多色対応だが**標準はモノクロ**（文献の主流に合わせる）
    - **デフォルトフォント**: システムフォント（OS依存、日本語は Noto Sans / Hiragino / Yu Gothic を自動選択）
    - **その他の視覚細部（Box デフォルトサイズ、グリッド間隔、スナップ閾値等）**: 実装しながら調整
    - **エラー・警告**: 基本はトースト通知（画面下から柔らかく）、致命的なもののみダイアログ
    - **旧 `.xlsm` マイグレーション**: **不要**（旧版は未リリース）→ ROADMAPから削除

16. **細部仕様の決定**（2026-04-18 ユーザ確認）:
    - **ファイル保存**: **明示保存のみ**（Ctrl+S）。正式な保存はこれだけ
    - **IndexedDB自動バックアップ**: **30秒ごと + 次回起動時の復元確認ダイアログ**（PowerPoint「自動回復」相当）
    - **拡張子**: `.tem`
    - **1ファイル=1プロジェクト**（複数シート含む）
    - **外部リソース（画像、逐語録）**: `.tem` ファイル内に**内部埋め込み**（Base64等）
    - **マグネット吸着**: 通常時ON、**リボンにもON/OFF切替ボタン**を配置
      - ソフトスナップ + 整列ガイドライン（PowerPoint方式）
      - 整列ガイド（他のBoxとの揃い）/ 距離スナップ / グリッドスナップ の3種を個別ON/OFF
      - Alt キー押下中は一時無効化
    - **ラベル編集**: プロパティパネル入力 **+ ダブルクリックでインライン編集**（両方サポート）
    - **図形の重なり順**: 基本は重ならない想定だが、**調整可能**
      - 右クリックメニュー: 前面へ / 背面へ / 最前面 / 最背面
      - Home リボンにボタン
      - ショートカット: `]` 前面 / `[` 背面 / `Shift+]` 最前面 / `Shift+[` 最背面

15. **追加仕様の決定**（2026-04-18 ユーザ確認）:
    - **データシート列**: 最低限（ID・種別・ラベル・Item_Level・Time_Level）でOK。**複数Box選択コピペ**も想定。
    - **シート間コピー**: Sheet1→Sheet2 への Box/Line/SD/SG コピペ対応
    - **統合シート**: 手動で作成（自動生成は Phase 6 以降）
    - **新規Box の配置モード**（3種併用、デフォルト=D）:
      - **B**: 最後に選択した Box の隣に配置
      - **C**: Insert ボタン押下 → クリックで配置位置指定
      - **D**: 次の Time_Level に自動配置（旧版踏襲）← **デフォルト**
    - **コメント機能UI**: A+B 両方
      - **A**: Box/Line 右クリック → コメント追加
      - **B**: ツールバー「コメント」ボタンON → Box クリックで追加
    - **テンプレートの中身**: 後日検討
    - **用紙サイズの扱い**（重要な設計転換）:
      - **編集時**: ガイドライン（点線枠）として A4/A3/PPT サイズを背景に表示、**はみ出しは気にせず自由に作図**
      - **エクスポート時**: 用紙サイズを指定 → **自動で矢印・Box等が縮尺調整されて収まる**（または分割）
      - 編集中の「ここからはみ出す」という警告ではなく、**「最終出力で勝手に調整」**する方針

13. **UI詳細仕様の追加決定**（2026-04-18 ユーザ確認）:
    - **上部リボンUI** (PowerPoint風): 作図機能はリボンタブで整理
    - **データシート・プロパティパネル**は**ワンクリックで最小化⇔展開**（アイコン状態でも識別可能）
    - **画面下部のシートタブ** (Excel風): 複数人のTEM図を1ファイル内で管理、タブで切替
    - **曲線矢印を許可**: デフォルトは直線、オプションで曲線
    - **縦書き対応は絶対必要**（Phase 2 に昇格）
    - **スペルチェックは優先度低下**（Phase 4以降）
    - **逐語録メンションは優先度低下**（逐語録フォーマット設計が必要、Phase 4以降）
    - **LLM API連携**（ChatGPT/Claude/Gemini）: **新規追加、優先度低**。APIキー設定で作図支援機能
    - **テストユーザー候補へのコンタクトは現時点では不要**

14. **TEM作図アンケート調査結果の反映**（2026-04-18 追加）:
    - 46名の TEM 研究者の回答を分析 → `docs/SURVEY_ANALYSIS.md`
    - 回答者の61%が**3年未満の初学者**、61%が **PowerPoint 利用**
    - **98% が専用ツールを希望**（45/46） → 市場ニーズ確認済み
    - 既存SPECの方向性は調査で裏付けられた
    - **新規追加機能（調査から発見）:**
      - **用紙サイズ収納チェック**（A4/A3/カスタム、はみ出し警告）
      - **スペルチェック機能**
      - **本文カテゴリー名 ↔ 図中ラベルの自動同期**（キラー機能候補）
      - **逐語録メンション機能**（Box ごとに原文発話へリンク）
      - **Box位置の入れ替えUI**（隣のBoxと←/→で入れ替え）
      - **Word/PPT貼り付け互換性**（SVG ペースト）
      - **BFPから両経路の自動生成**
      - **縦書き対応（長音記号の向き）** ※特殊要件
      - **曲線矢印の対応**（将来検討、現仕様「直線のみ」の再検討）
      - **付箋的UI**（概念選択→自動書式）
    - 調査データは `中田_2024_TEMシンポ_2026年4月18日_14.19.csv`（原データ）と `docs/SURVEY_OPEN_RESPONSES.md`（オープン回答抽出）

11. **横分割エクスポート**（2026-04-18 追加指示）:
   - 横に長すぎてpptxスライド幅に収まらない図を、**任意位置で2/3/N分割**して単一pptxの複数スライドとして出力
   - **分割フォーマット**: 単一pptxに複数スライド
   - **オーバーラップ**: 設定可能（デフォルト 50px 程度、ユーザ指定可能）
   - **Boxが分割線をまたぐ場合**: 両方のスライドに表示（複製配置）
   - **矢印が分割線をまたぐ場合**: 左端「→続」、右端「続→」の続きマーカー表示
   - **凡例**: 全スライドに表示
   - **時間軸矢印**: 各スライドに部分的に描画（全体で1つの時間軸を構成）

### UI レイアウト再設計

```
┌────────────────────────────────────────────────────────┐
│ [File] [Edit] [View] [Templates]         [日本語▼] [保存] │
├─────┬──────────────────────────────────┬───────────────┤
│ 📋  │                                  │  ▼ Properties │
│ Data│                                  │  ID: Item1    │
│ 折り│        Canvas (React Flow)       │  種別: EFP    │
│ 畳み│                                  │  ラベル: ___  │
│     │  [Box1]→[Box2]═══[EFP]           │  W: __  H: __ │
│     │                                  │  フォント:__  │
│     │                                  │  太字 ☐       │
│     │                                  │  ─────        │
│     │                                  │  💬 コメント   │
└─────┴──────────────────────────────────┴───────────────┘
```

- **メイン**: 作図キャンバス（React Flow）
- **右サイドバー**: プロパティパネル（選択中の図形のプロパティを個別/一括編集）
- **左サイドバー（折りたたみ式）**: データシート（初期作成時のみ開く）
- **上部**: メニュー・ツールバー

**戦略的発見（深掘り調査）:**
1. **TEM専用作図ツールは世界的に存在しない** — TEMerPlusは事実上の「世界初」
2. **TLMG標準表記は未確立** — TEMerPlusで事実上の標準を提示できる立場
3. **カタログTEA (2023) が最重要の作図レシピ集** — 書籍入手を推奨
4. **看護分野が最大の応用領域**
5. **Springer 2026 国際展開書籍**に合わせた英語UI対応で国際市場参入可能

**主要な発見:**
1. **現行 TEMerPlus の基本セットは文献上の Must have をほぼ網羅**
   - EFP（二重線）/ P-EFP（点線）/ OPP（太線）/ BFP（実線）/ SD・SG（五角形）/ 径路の実線・点線
2. **要検証**: 文献では EFP=二重線 / OPP=太線 が主流。現行実装と**線種マッピングの再確認が必要**
3. **追加で必要な要素（Should have）**:
   - 2nd EFP / P-2nd EFP（キャリア・健康分野で独立要素化）
   - OPP / BFP の自動番号採番（OPP-1, BFP-2 等）
   - 吹き出し・注釈ノード（看護・スポーツ分野で多用）
   - 凡例（Legend）の自動生成（英語論文で標準装備）
   - 時期ラベル（時間軸上の離散ラベル）
   - 径路のグループ化・領域ハイライト
4. **将来検討（Nice to have）**:
   - TLMG 3層スイムレーン
   - 促進的記号（Promoter Sign: 星型・雲型等）
   - 統合TEM図ビュー（1/4/9/16の法則に対応）
   - 縦型図、ブロック矢印、色カスタマイズ

**最重要参考文献:**
- 荒川・安田・サトウ (2012)「TEM図の描き方の一例」立命館人間科学研究（**描き方の7ステップ**）
- Hosaka et al. (2026) Geriatrics & Gerontology International（**記号表が最も明示的な英語論文**）
- カタログTEA (2023) 新曜社（図のバリエーション見本帳）

### 実装上の発見・調整
- **PptxGenJS v3.12 は `cmpd` 属性を公式APIで出力しない**ことが判明
  - 事前調査では ECMA-376 が `cmpd="dbl"` 等を定義しており、pptx自体は二重線をネイティブサポート
  - しかしPptxGenJSの出力XMLを確認したところ `<a:ln>` に `cmpd` 属性を含めない実装
  - **暫定対応**: 二重線Boxは「外枠 + 内枠（4pxインセット）」の2矩形重ね描きで表現
  - PowerPointで開いた時の見た目は問題なし
  - 将来対応: ①PptxGenJSにPR ②生成後のXMLポストプロセス ③自前pptx生成へ置換 のいずれか（TODO.mdに記録）

---

## 2026-04-18 (後半): Phase 2 大規模実装 + UIフィードバック対応

### Phase 2 実装完了分（初期）
- [x] LICENSE (PolyForm Noncommercial 1.0.0) + COMMERCIAL.md
- [x] 依存パッケージ追加: zundo/i18next/idb-keyval/immer/docx/jspdf
- [x] データモデル全面刷新（複数シート、Participants、ProjectSettings、HistoryEntry、Resources）
- [x] Zustand ストア再設計（複数シート、temporal undo/redo、controlled selection、drag中pause）
- [x] UIレイアウト刷新: リボン/パネル/シートタブ/ステータスバー
- [x] Box 6種を文献標準線種で実装（EFP=二重、OPP=太線、P-EFP=点線 等）

### UIフィードバック対応 (計8回の反復改善)

**第1弾**: ファイルタブ横並び、共有→出力、annotation→潜在経験、BFP差別化、データシート追加・挿入・ソート・フィルタ、軸目盛、設定画面、編集グループ、Design→View統合

**第2弾**: 選択保持（controlled selection）、複数選択サイズ編集、Shift+モード切替、順次接続、軸メモリ改善、レベル単位（100px=1Level）、ID編集、フォント選択

**第3弾**: 全体フォントサイズ変更、バッジにID表示、サブラベル（協力者ID等、位置調整）

**第4弾**: 選択バグ、UI全体スケール、スナップ/用紙枠/グリッド機能化、スクロール挙動、IDバッジ、文字配置、ショートカット（Ctrl+Z/Y/A/C/V/D/N/S, Delete, Esc等）

**第5弾**: Shift選択、スクロールパン、IDバッジ詳細（位置・サイズ調整）、Excelマクロ準拠の自動命名（Item1, BFP1, EFP1, P_EFP1, OPP1, Latent1...）、undo挙動修正（ドラッグ中pause）、レイアウト切替時にx/y swap

**第6弾**: IDバッジ位置戻し、種別タグ位置入替、レイアウトベースの位置（textOrientationではなく）、スクロール修正、Shift選択修正、縦型時に矢印が上下方向

**第7弾**: 独自wheelハンドラ（pan/zoom切替）、独自スクロールバー、controlled selection + onNodeClick、縦型種別タグを縦書き・背景なし、レイアウト切替でwidth/height swap

**第8弾**: 複製時ID規則（Excelマクロ準拠）、Box角を直角、ホーム→編集、順次接続を挿入タブへ、2選択間に挿入ダイアログ（2モード）

**入れ替え機能の2種類**:
- 順序入替(直接): 位置swap + A↔B直接Lineだけ反転
- 順序入替(全リンク): 位置swap + 全Line/SDSG/Commentの参照交換

**挿入ロジック改修**:
- 実線/点線矢印ボタンが2選択時に機能するように
- 単純挿入も A→B 矢印を A→C→B に自動分割
- expand-shiftモード: deltaAtoC / deltaCtoB 指定、内側1レベル、B以降自動シフト
- 新規「以降シフト」機能: 基準Boxより後ろの全Boxを任意レベルシフト

### 技術スタック確定
- React 18 + Vite 5 + TypeScript 5.6
- React Flow 11（カスタムノード・エッジ、選択制御、カスタムwheel）
- Zustand 4 + zundo 2（温度管理undo/redo）
- Immer 10（不変更新）
- i18next 24（導入済み、Phase 3で活用）
- PptxGenJS 3.12（既存）
- html-to-image 1.11（既存）
- docx 9 / jspdf 2.5（Phase 3で活用）
- idb-keyval 6（Phase 3で自動バックアップ）

### ファイル構成
```
webApp/src/
├── types.ts                     - 全データモデル定義
├── App.tsx / App.css            - 全体レイアウト、CSS em相対化
├── main.tsx                     - React root
├── store/
│   ├── defaults.ts              - 既定値、BOX_RENDER_SPECS、LEVEL_PX=100、genBoxIdByType
│   └── store.ts                 - Zustand + zundo、シート・選択・アクション実装
└── components/
    ├── Ribbon.tsx               - リボンUI (6タブ)
    ├── Canvas.tsx               - 独自wheel/scrollbar/ruler実装
    ├── DataSheet.tsx            - 列リサイズ、Excel複数行貼付、ソート/フィルタ
    ├── PropertyPanel.tsx        - Figma風単一/複数選択編集
    ├── SettingsDialog.tsx       - UI全体フォントサイズ等
    ├── InsertBetweenDialog.tsx  - 2選択間挿入（2モード）
    ├── SheetTabs.tsx            - Excel風タブ
    ├── StatusBar.tsx            - 下部状態表示
    └── nodes/
        └── BoxNode.tsx          - Box描画（種別タグ・ID・サブラベル）
```

### 未実装（次のフェーズ）
- #26 Line接続モード `horizontal` の実装
- #27 SD/SG 作成UI + 非可逆的時間矢印の自動挿入
- #30 ファイル保存/読込 + IndexedDB自動バックアップ
- #31 エクスポート機能刷新（用紙自動縮尺、横分割、論文用レポート）
- 時期ラベルUI / 凡例自動生成 / 2nd EFP UI露出 / OPP-BFP自動番号採番

## 移植ロードマップ

### Phase 1: 最小プロトタイプ（現在）
- Box 3種（通常 / 二重 / 点線）
- Line 2種（実線 / 点線）+ 矢印
- 表UIとの双方向同期
- pptx / PNG エクスポート
- ドラッグ移動で座標更新

### Phase 2: 機能拡充
- SD/SG（Pentagon）対応
- Box種別 5種フル対応（OPP/BFP/EFP/P-EFP）
- 設定画面（レイアウト方向、フォント、サイズ）
- `.tem` ファイル入出力（File System Access API）
- IndexedDB自動バックアップ

### Phase 3: 自動レイアウト
- レベル調整機能
- 矢印始点終点自動修正
- 図形移動時の連動（右側シフト等）

### Phase 4: データ連携
- CSV インポート
- 旧 `.xlsm` からのマイグレーションツール（Dataシートを読み取り .tem へ変換）

---

## 2026-04-19: UI大改修 + PPTX準備（フィードバック複数回分を反映）

この日は複数ラウンドのユーザフィードバックを反映した。主な変更点を以下に整理する。

### 座標系・fit・ルーラー
- 横型レイアウトにおける Item_Level 方向を「UP=+」に統一（ユーザ座標とストレージ座標の変換を `utils/coords.ts` に集約）。
- 時期ラベル / 時間矢印の位置計算を修正: `itemReference='max'` は横型で上部、縦型で右側。
- `showTopRuler` / `showLeftRuler` を追加して上/左ルーラーを個別に表示切替。表示タブに UI 追加。
- `store.requestFit('all' | 'width' | 'height')` シグナル＋ `utils/fitBounds.ts` で時間矢印 / 時期ラベル / 凡例を含む全体 bounds を計算。リボン表示タブに 3 ボタン追加。

### Line
- ID 形式を `RL_n` / `XL_n` に統一（シーケンシャル生成を含む）。
- `startOffsetTime` / `endOffsetTime` / `startOffsetItem` / `endOffsetItem` を追加し、Time/Item 軸独立の px オフセットを `components/edges/LineEdge.tsx`（custom edge）で反映。方向沿いマージン `startMargin` / `endMargin` は残す。

### Box / SDSG / タイプラベル
- Box / SDSG に共通の形式で外部タイプラベル表示。`typeLabelFontSize/Bold/Italic/FontFamily/AsciiUpright`、`subLabelAsciiUpright` を個別指定可能に。
- SDSG をモノクロ基調（白背景/黒線）に統一、サブラベル（Box と同形式）を追加。
- `settings.typeLabelVisibility` で種別ごとのタイプラベル表示 ON/OFF。設定ダイアログ「タイプラベル」タブと一括操作ボタン。

### 縦書き
- `utils/verticalText.tsx` を新設。縦書きモード時の半角ハイフン類（`-` / `‐` / `–` / `—` / `－` / `−` 等）を 90°回転して描画。`BoxNode` / `SDSGNode` / `PeriodLabelsOverlay` / `TimeArrowOverlay` で利用。

### 時期ラベル
- `bandStyle: 'tick' | 'band'` を追加。band モードで `|---時期1---|---時期2---|` の帯表記。
- `labelSideHorizontal` (既定 'top') / `labelSideVertical` (既定 'right') を追加し、描画位置を設定で切替可能。
- 設定ダイアログのタブ名を「時期区分」に改名。

### 時間矢印
- ラベル周りに多数の設定追加: `labelOffset` / `labelAlignHorizontal`('center'|'end') / `labelAlignVertical`('center'|'start') / `labelFontFamily` / `labelBold` / `labelItalic` / `labelUnderline` / `labelSideHorizontal`(既定 'bottom') / `labelSideVertical`(既定 'left')。
- 既定: 横型で矢印は下側、縦型で矢印は左側に沿ってラベル配置。

### 凡例
- 構造を大きく拡張: タイトルの配置 (`top` / `left`)、書き方向 (`horizontal` / `vertical`)、揃え (`left` / `center` / `right`)、左側配置時の上下揃え (`top` / `middle` / `bottom`)。
- 項目: アイコンは中央揃え、テキストは左揃えに固定。
- サンプル図形サイズ (`sampleWidth` / `sampleHeight`) を設定で変更可能に。
- 列数: 横型 (`columnsHorizontal`) と縦型 (`columnsVertical`) を独立指定、上限撤廃。
- 背景 (`white` / `none`)、枠線（太さ / 色 / 0=なし）、P-EFP の凡例プレビューを二重点線に。
- 2行目（説明文）既定は **非表示** に変更。項目別 `itemOverrides` で上書き（ラベル・説明・表示フラグ）、一括操作ボタンを設定画面に追加。
- 凡例をダブルクリックで設定ダイアログの凡例タブを直接開けるように。

### 設定ダイアログ
- タブ化（全体 / スナップ / タイプラベル / 時間矢印 / 凡例 / 時期区分 / プロジェクト）。
- モーダル幅を 640px で固定、`overflow: hidden` でコンテンツによる伸縮を抑止。
- ヘッダをドラッグしてダイアログを移動可能に。

### 出力
- リボンの「出力」タブを廃止し、**ファイルタブに「出力…」ボタン** を集約。
- 新規 `ExportDialog`: PNG / SVG / PPTX の共通ダイアログ。出力範囲 (`visible` / `all`、既定 `all`・オフセット 0.1)、含める要素（グリッド / 用紙枠 / 上ルーラー / 左ルーラー、既定すべてオフ）、背景（白 / 透明）を選択後、フォーマットごとの出力ボタンで保存。
- `exportImage.ts`: `includeGrid` / `includePaperGuides` / `background` / ルーラー除外オプションに対応。PNG/SVG はフィルタでルーラー・グリッド・用紙枠を除外可能。

### 初期サンプル図
- Item1(出発点) → OPP1(必須通過点) → BFP1(分岐点) → EFP1(等至点) / P_EFP1(両極化等至点) の構成に変更。
- SD1 / SG1 を BFP1 に紐付け。時期ラベル「時期1」「時期2」を既定で配置。
- Line ID を `RL_1` … / `XL_1` に統一。

### PropertyPanel
- Line に始点 / 終点 の Time / Item オフセット、及び方向沿いマージンの入力欄を追加。
- SDSG にサブラベル入力欄追加。
- Box にタイプラベル個別スタイル（サイズ / B / I / フォント / ASCII 向き）とサブラベル ASCII 向き。

### 関連ファイル変更（主なもの）
- 新規: `components/ExportDialog.tsx`, `components/edges/LineEdge.tsx`, `utils/verticalText.tsx`, `utils/fitBounds.ts`
- 拡張: `types.ts`, `store/defaults.ts`, `store/store.ts`, `components/SettingsDialog.tsx`, `components/LegendOverlay.tsx`, `components/PeriodLabelsOverlay.tsx`, `components/PropertyPanel.tsx`, `components/Ribbon.tsx`, `components/Canvas.tsx`, `components/nodes/BoxNode.tsx`, `components/nodes/SDSGNode.tsx`, `components/DataSheet.tsx`, `utils/exportImage.ts`, `utils/timeArrow.ts`, `utils/periodLabels.ts`, `App.tsx`, `App.css`

### 次の作業（PPTX 実装）
- `exportPPT.ts` を刷新して、ExportDialog の各種オプション（範囲、オフセット、含める要素、背景、横型/縦型）を受け入れる。
- SDSG は五角形ではなくブロック矢印（`right-arrow`）を 90°/270°回転で表現。
- 横型レイアウトは横型 PPTX、縦型レイアウトは同一サイズの縦型 PPTX で出力。

---

## 2026-04-19 夕方: PPTX 出力の全面刷新 + 二重線ポストプロセス

### 方針確定（ユーザと相談）
- **Q1**: 「表示部分を出力」は PPTX では **全体にフォールバック**（UI 上で注意表示）
- **Q2**: PPTX では `slide.background` を設定しない固定（UI から背景選択を非表示）
- **Q3**: PPTX はグリッド / 用紙枠 / ルーラーを含めない固定（UI から該当オプションを非表示）
- **Q4**: スケーリング有無をユーザ選択可能（既定 ON、bbox + offset をスライドに fit）
- **Q5**: 二重線は **案 B（XML ポストプロセス）** を採用 → 本物の `cmpd="dbl"` を出力

### 新 exportPPT.ts 実装内容
- **スライドサイズ**: 横型 13.333×7.5 inch、縦型は w/h を入れ替えて 7.5×13.333 inch
- **座標変換**: `buildTransform(bbox, slideW, slideH, scale, offset)` で全コンテンツを一律にスケール＋中央寄せ。スケーリング OFF の場合は倍率 1 で中央寄せ
- **Box**:
  - 通常 / BFP（太線 2pt）/ OPP（極太 3pt）/ annotation（sysDot 点線）/ 楕円対応
  - EFP, 2nd-EFP: **マーカー色 `#2E2D2D` で描画し、後段ポストプロセスで `cmpd="dbl"` を注入**
  - P-EFP, P-2nd-EFP: 外枠 + 内枠の 2 矩形重ね（両方破線）で二重点線
  - タイプラベル（外部）、サブラベル（外部）も配置
- **Line**: `startOffset(Time|Item)` / `endOffset(Time|Item)` + 方向沿い `startMargin` / `endMargin` を反映。XLine または P-系端点接続で自動 dash。triangle 矢印付き
- **SDSG**: `rightArrow`（PptxGenJS ブロック矢印、既定右向き）を回転で向き付け
  - 横型: SD=90°（下向き）/ SG=270°（上向き）、矩形 w/h を入れ替えて縦長領域に配置
  - 縦型: SD=0°（右向き）/ SG=180°（左向き）
  - タイプラベル / サブラベルも Box と同形式
- **時間矢印**: `TimeArrowSettings` の新フィールド（`labelOffset` / `labelSide*` / `labelAlign*` / `labelFontFamily` / `labelBold/Italic/Underline`）を反映
- **時期区分**: band / tick 両スタイル、`labelSideHorizontal` / `labelSideVertical` を反映
- **凡例**: タイトル位置 top/left、書き方向、装飾、列数（横型/縦型別）、サンプル図形サイズ、項目別上書き、P-EFP は二重点線プレビュー、SDSG は rightArrow アイコン

### 二重線ポストプロセス
- PptxGenJS v3.x の `ShapeProps` に `altText` が無いため、**マーカー色方式** を採用
  - 二重線対象 Box は線色を `#2E2D2D` で描画（視覚上はほぼ黒、XML 上でユニーク）
  - `pres.write({ outputType: 'arraybuffer' })` でバイナリ取得
  - JSZip で展開し、`ppt/slides/slide*.xml` 内の `<a:ln ...>...<a:srgbClr val="2E2D2D"/>...</a:ln>` ブロックを正規表現で検出
  - 開始タグに `cmpd="dbl"` を付与し、色を `#222222` に復元
  - 再圧縮して Blob ダウンロード
- 依存追加: `jszip` ^3.x

### ExportDialog 改修
- `pptxScale` トグル追加（既定 ON）
- PPTX 選択時:
  - 「含める要素」「背景」セクションを非表示
  - `visible` 範囲選択時は `all` に自動フォールバック＋注意メッセージ
  - スケーリング設定の hint を表示
- 画像系（PNG/SVG）は従来通り

### 動作確認保留（次回）
- 実際に PPTX を PowerPoint で開いての見た目確認が未実施
- 特に検証が必要:
  1. EFP / 2nd-EFP が本物の二重線として表示されるか（`cmpd="dbl"` 注入の効き）
  2. SDSG の向き（横型 SD=下向き, SG=上向き / 縦型 SD=右向き, SG=左向き）
  3. スケーリング後に全要素がスライド内に収まっているか
  4. 時間矢印 / 時期区分のラベル位置・揃え
  5. 凡例タイトル位置 `left` 時のレイアウト

### 変更ファイル
- 全面刷新: `webApp/src/utils/exportPPT.ts`
- 更新: `webApp/src/components/ExportDialog.tsx`, `webApp/package.json` / `package-lock.json`（jszip 追加）

---

## 2026-04-19 夜: Box 編集強化（インライン編集 / リサイズハンドル / 自動拡張 / 部分装飾）

### 追加機能
1. **インライン編集**: `BoxNode` ダブルクリックで `textarea` に切替、Enter 確定 / Esc キャンセル / blur でも確定。React Flow のドラッグ/選択との干渉を `stopPropagation` で回避。
2. **リサイズハンドル**: React Flow 内蔵 `NodeResizer` を組込み。選択時のみ 8 点ハンドル表示、最小 30×20、`onResize` で `updateBox` に反映。
3. **autoFitBoxMode**: Box 個別と全体既定の両方で設定可能
   - `'none'`（自動拡張なし）/ `'width-fixed'`（横幅固定で高さ自動）/ `'height-fixed'`（高さ固定で横幅自動）
   - 既定値 `width-fixed`
   - `BoxNode` の `useEffect` がラベル/フォント/幅/高さの変化を検知し、`computeAutoFitSize` で必要サイズを計算 → 既存より大きい方向のみ自動更新（手動リサイズを尊重）
   - 縦書き Box も対応（計測時に `writing-mode: vertical-rl`）
4. **「文字に合わせる」ボタン**: 選択 Box サイズをラベルにぴったり合わせる（最小 Fit）
   - `store.fitBoxesToLabel(ids)` アクション追加
   - `utils/boxFit.ts` に `measureLabel` / `computeAutoFitSize` / `computeFitToLabelSize` を実装（非表示 div に描画して `getBoundingClientRect` で実測、padding 8px 付加）
   - 編集リボン（Home > 編集グループ）と PropertyPanel Box セクション両方にボタン配置
5. **ラベル部分装飾タグ**:
   - `utils/richText.tsx` に簡易パーサ実装
   - 対応: `<b>/<i>/<u>/<s>/<size=N>/<color=#...>/<font=Name>`
   - ネスト対応、`\n` 改行、タグ解析失敗時はリテラル表示
   - 横書き Box で `renderRichText` を使用。縦書き Box は既存の `renderVerticalAwareText` を維持（縦書き部分装飾は未対応）
   - `stripTags` は `measureLabel` などサイズ計算でプレーン化に使用

### 型定義変更
- `types.ts`: `AutoFitBoxMode` 型追加、`Box.autoFitBoxMode`、`ProjectSettings.defaultAutoFitBoxMode` 追加
- `defaults.ts`: `defaultAutoFitBoxMode: 'width-fixed'` を既定値に
- 既存 `autoFitText` / `autoFitBox` は残置（互換保持、今回は未使用）

### UI 配置まとめ
| 機能 | 位置 |
|---|---|
| インライン編集 | Box ダブルクリック |
| リサイズ | Box 選択時の 8 点ハンドル |
| 自動拡張モード（個別） | PropertyPanel > Box > "Box 自動調整" |
| 自動拡張モード（既定） | 設定ダイアログ > 全体 > "Box 自動調整（既定）" |
| 文字に合わせる | 編集リボン / PropertyPanel Box |

### 変更ファイル
- 新規: `webApp/src/utils/boxFit.ts`, `webApp/src/utils/richText.tsx`
- 更新: `webApp/src/types.ts`, `webApp/src/store/defaults.ts`, `webApp/src/store/store.ts`, `webApp/src/components/nodes/BoxNode.tsx`, `webApp/src/components/Canvas.tsx`, `webApp/src/components/PropertyPanel.tsx`, `webApp/src/components/Ribbon.tsx`, `webApp/src/components/SettingsDialog.tsx`

### 既知の制限（次回検討候補）
- 縦書き Box での部分装飾タグ適用（現状は装飾なしで描画）
- 部分装飾タグ挿入 UI（選択範囲に `<b>...</b>` を挿入するボタン等）
- `autoFitText`（文字サイズ縮小で Box に収める）は現状未実装

---

## 2026-04-19 深夜: 選択サイズ統一 + PDF/用紙自動縮尺/論文レポート

- `store.matchBoxesSize(ids, 'width'|'height'|'both', basis)`、`matchBoxesFontSize` 追加
  先頭選択 Box を基準に選択 Box の幅/高さ/両方/文字サイズを揃える
- リボン「サイズ統一」グループと PropertyPanel 複数選択時ボタン追加
- `utils/paperSizes.ts` で A4/A3/16:9/4:3 を px・inch 両系統で定義
- `utils/exportPDF.ts`: `jsPDF` + `html-to-image` で PDF 出力。用紙サイズ / マージンに fit
- PPTX に `paperSize` オプション追加（横型: 16:9、縦型: A4 縦 がデフォルト）
- `utils/exportReport.ts` + `PaperReportDialog`: 論文レポート(.docx)出力
  メタデータ（記号体系 / 協力者 / インタビュー / 表記方針）の入力タブ、図埋込、Box/Line description 表
  PropertyPanel に description と noDescriptionNeeded フィールド追加
- リボン File タブに「論文レポート...」ボタン

---

## 2026-04-20: 印刷レイアウト変換層 + プレビュー付き統合出力ダイアログ（Phase 1+2）

### 方針確定（ユーザ相談）
- プレビューは完全一致（C1=React Flow 二重化）
- 変換パラメータは大雑把に開始、後で詳細化
- ExportPreviewDialog に統合、旧 ExportDialog 廃止
- 将来の「横分割」機能もここに統合予定
- **データ不変性**: 元 doc は触らず、deep copy 変換後 doc のみ操作

### 新規ファイル
- `utils/exportTransform.ts`: ExportTransform 型 + applyExportTransform（immer）+ computeFitScale + EXPORT_PRESETS
- `context/TEMViewContext.tsx`: sheet/settings/view/アクションを Context で共有、Provider 未設定なら store フォールバック
- `components/ExportPreviewCanvas.tsx`: ReactFlowProvider 入れ子で独立キャンバス、既存ノードを完全再利用、ズーム/パン/スクロール対応
- `components/ExportPreviewDialog.tsx`: 1000px 幅、左に調整パラメータ / 右にプレビュー / 下にフォーマットタブ

### 既存コンポーネントの Context 化
- `BoxNode` / `SDSGNode` / `LineEdge` / `LegendOverlay` / `PeriodLabelsOverlay` / `TimeArrowOverlay` を `useTEMStore` から `useTEMView` に置換
- `isPreview` フラグでインライン編集・リサイズハンドル・ドラッグ等を抑止
- 旧 ExportDialog 削除

### FitMode 実装
- `manual`: ユーザ指定倍率
- `fit-width`: 横幅基準
- `fit-height`: 縦幅基準
- `fit-both`: min(横倍率, 縦倍率) でアスペクト維持

### 微調整パラメータ
- 文字サイズ ±/×、枠線太さ、線太さ、Box 間距離 ×（中心基準）
- タイプラベル・サブラベル・時間矢印・凡例・時期区分のフォント ±

### 出力フロー
- PNG/SVG/PDF: プレビュー DOM を直接キャプチャして保存（見たまま）
- PPTX: 変換後 sheet と settings を渡し、PPTX 側のスケーリングは OFF

---

## 2026-04-20 深夜: シート実データリサイズ機能

エクスポート時変換（非破壊）と別に、**シートそのものをリサイズする**破壊的機能:

- `store.resizeActiveSheet(scale, { includeFontSize })`: アクティブシートの Box 座標・寸法 / SDSG / 時期ラベル position を倍率乗算、Undo 可能
- `components/ResizeDialog.tsx`: パーセント指定 or 用紙サイズ fit（縦/横/両方）、文字サイズ連動トグル、プレビュー表示
- 編集リボン > 「シート」グループ > 「リサイズ...」
- 出力プレビューと機能は分離: リサイズは編集状態そのものを変更（以後の編集に反映）、出力プレビューは出力時のみ変換

---

## 2026-04-21: 大規模 UI 拡張

### 追加機能
1. **整列ガイド（スマートガイド）**: ドラッグ中に他 Box の端（左/右/中央 x、上/下/中央 y）と 5px 以内で揃うと点線（#ff6b9d）を描画
2. **装飾タグ挿入 UI**（`RichTextToolbar`）: `<b>/<i>/<u>/<s>/<size=N>/<color=#...>/<font=Name>` を textarea 選択範囲に挿入
3. **縦書き Box での部分装飾対応**: `renderRichText` に `vertical/asciiUpright` オプション、半角ハイフンを 90°回転させつつタグ装飾を維持
4. **autoFitText**: `computeFitFontSize` 二分探索で Box に収まる最大フォント。縮小も拡大も可
5. **CSV インポート**: papaparse、自動ヘッダ判定、列マッピング、TYPE_DICT で日英対応、Box 間挿入（以後シフト）
6. **Box 自動調整の位置ずれ修正**: 左辺中点アンカーを維持（fitBoxesToLabel / matchBoxesSize / autoFitBoxMode）
7. **一括移動**（`ShiftContentDialog` + `shiftActiveSheetContent`）: Box/SDSG を Level 単位で平行移動、時期区分・時間矢印・凡例は対象外
8. **レイアウト変更時に原点（Level 0,0）へ自動フィット**
9. **用紙枠拡張**: `PaperBaseKey` (A4/A3/16:9/4:3/custom)、layout で長辺方向、`pageCount` で複数枚、短辺中央が Level 0、`maskOutside` で枠外を薄グレー、枠線色指定
10. **カスタム Controls**（右下）: ZoomIn / ZoomOut / 全体fit / 横fit / 縦fit / toggleInteractivity
11. **横fit で時期区分が収まらない問題修正**: fitBounds.ts に時期ラベルテキスト領域を含める
12. **凡例選択時のプロパティパネル表示**: `Selection.legendSelected` フラグ、LegendOverlay クリックで select、`LegendSettingsSection` export → `PropertyPanel` で再利用
13. **Box プロパティタブ化**: 基本 / 装飾・調整 / 論文 の 3 タブ
14. **文字を Box に合わせる**（`fitBoxesTextToBox`）: 1 回限りの文字サイズフィット
15. **設定ボタンをファイルタブへ移動**
16. **用紙枠設定 UI**: 設定ダイアログ全体タブに用紙サイズ/枚数/枠外マスク/枠線色の項目追加
    - 既定: A4（1:√2 ≈ 1:1.414）、2 枚、枠線黒、枠外薄グレー

### 既存 Context 化
- `context/TEMViewContext.tsx`（一段前で作成済）を利用、メインとプレビューで共通ノードを再利用

### 主な変更ファイル
- 新規: `components/ShiftContentDialog.tsx`, `components/RichTextToolbar.tsx`, `components/CSVImportDialog.tsx`, `utils/csvImport.ts`
- 更新: `components/Canvas.tsx`, `components/PropertyPanel.tsx`, `components/Ribbon.tsx`, `components/SettingsDialog.tsx`, `components/LegendOverlay.tsx`, `components/nodes/BoxNode.tsx`, `components/edges/LineEdge.tsx`, `store/store.ts`, `store/defaults.ts`, `types.ts`, `utils/boxFit.ts`, `utils/fitBounds.ts`, `utils/richText.tsx`, `App.tsx`, `App.css`

---

## 2026-04-20 ～ 2026-04-21: UI フィードバック第9・10・11・12弾

ユーザからの連続したフィードバック反映。コミット単位:
- `d7aabdd` プレビュー倍率の凡例連動・位置ズレ修正 / 論文レポート一時停止
- `04dfd00` UI フィードバック第9弾（選択モード/SDSG編集/時期区分統合/タイプラベル切替 他）
- `b9d0ba4` 移動モードで編集ロック / ラベル編集 Undo / SDSG が Box リサイズに追従
- `48a5e45` 設定タブ切替の再発火 / SDSGラベル装飾UI拡充
- `e4e7e79` SDSG 揃え設定 / 全モード編集対応 / 時期・時間矢印のダブルクリック確実化

### 新機能・修正内容

**エクスポートプレビュー**
- ホイール=ズーム / ドラッグ=パンに分離（`panOnScroll=false`, `zoomOnScroll=true`, `preventScrolling=true`）
- `exportTransform`: `effectiveScale` を凡例の position / fontSize / titleFontSize / minWidth / width / height / sampleWidth / sampleHeight にも適用
- `autoCenterOnPaper` のシフト処理で凡例 position も同じオフセットだけ移動（メインと印刷プレビューで同じ相対位置）
- 時期ラベル position も全体スケールに連動
- 論文レポート出力は調整中のため一時無効化（ラベル変更 + クリック時案内 alert）

**編集モード 3 種**
- 移動（`move`）: ドラッグで画面パン。`nodesDraggable=false`, `nodesConnectable=false`。NodeResizer 非表示
- 選択（`pointer`）: パン/範囲選択なしの自由編集。クリック/ドラッグでノード操作
- 範囲選択（`select`）: ドラッグで矩形選択
- 移動モードでも Box/SDSG のダブルクリック文字編集は可能（`editingDisabled = isPreview` のみ、`resizeDisabled = isPreview || editLocked`）

**Box 関連**
- 「幅を文字に」「高さを文字に」ボタンを編集リボンに追加（`fitBoxesToLabel(ids, mode)` の mode 引数）
- ラベル編集の Undo 対応: `commitEdit` 内で autoFit のサイズ/フォント計算を行い、ラベル更新と一緒に 1 回の `updateBox` にまとめる
- Box 幅/高さ変更時に attached SD/SG の `timeOffset`/`itemOffset` を変化量の半分だけ補正して追従

**SDSG**
- ダブルクリックでラベル編集（`commitEdit`/`cancelEdit` を BoxNode と同形式で実装）
- SD=上部/左、SG=下部/右にタイプラベル配置
- プロパティパネルを Box と同等に拡張:
  - 本体ラベル: フォント・太字/斜体/下線・文字色・背景色・枠線色・ASCII 縦向き
  - 左右方向の揃え / 上下方向の揃え（CSS Grid `justifyItems`/`alignItems` で writing-mode 非依存）
  - タイプラベル: フォント・太字/斜体・サイズ・ASCII 縦向き
  - サブラベル: ASCII 縦向き
- SDSGNode のラベル描画を italic / underline / fontFamily / writingMode / textOrientation に対応

**表示リボン**
- タイプラベル一括表示切替ボタン追加
- グリッド / スナップを設定ダイアログに集約（グリッド px、整列ガイド、距離スナップ、ON/OFF）、背景も `gridPx` に追従
- 時期区分 UI 統合: 設定 > 時期区分タブに時期ラベル一覧編集を移設。「時期編集...」ボタンと時期ラベルダブルクリックで該当タブを開く
- 非可逆的時間: タブ名を「時間矢印」→「非可逆的時間」に改名、矢印ラベルダブルクリックで当該タブを開く
- リボン文字サイズ: 設定 > 全体 にスライダを追加、CSS 変数 `--ribbon-font-size` で反映

**整列ガイド**
- 選択解除（`onPaneClick` / 選択空）で即座に消えるよう修正（以前のガイドが残る問題）

**設定ダイアログ**
- `tabNonce` を導入し、同じ `initialTab` を連続指定してもタブが切り替わるよう修正（`useState` 初期化関数で即時反映 + `useEffect` で変更検出）
- オーバーレイのラベル要素（時期区分・非可逆的時間）に `onMouseDown` / `onClick` の `stopPropagation` を追加して ReactFlow 側の事象取りこぼしを防止

### 主な変更ファイル
- 更新: `components/Canvas.tsx`, `components/ExportPreviewCanvas.tsx`, `components/Ribbon.tsx`, `components/SettingsDialog.tsx`, `components/PropertyPanel.tsx`, `components/PeriodLabelsOverlay.tsx`, `components/nodes/BoxNode.tsx`, `components/nodes/SDSGNode.tsx`, `context/TEMViewContext.tsx`, `store/store.ts`, `store/defaults.ts`, `types.ts`, `utils/exportTransform.ts`, `App.tsx`, `App.css`

### ビルド検証
- TypeScript typecheck OK
- Vitest 40 tests pass
- `vite build` OK（warning: chunk > 500kB、既知）
