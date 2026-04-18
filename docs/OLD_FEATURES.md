# TEMerPlus（旧版 VBA）機能棚卸しレポート

調査日: 2026-04-18
目的: Web版（新TEMer）への移植範囲を決めるため、旧VBA実装の全機能を網羅
対象: `old_file/VBA_Backup/` 全29ファイル + `old_file/HISTORY.md`

---

## 凡例

| 記号 | 意味 |
|---|---|
| ✅ | 実装済み・テスト完了 |
| ⚠️ | 部分実装 または 部分テスト |
| ⏳ | 実装済みだが未テスト |
| ⚙️ | 開発中（修正コード実装済み、テスト前） |
| 🔄 | 計画中（未実装） |
| ❌ | 未実装 |

---

## 1. Box 作成・編集機能

### 1.1 Box 作成
- **1選択時**: 選択したBoxの直後に新Boxを挿入 ✅
- **2選択時 - 間に挿入モード**: 2Box間に中間Time_LevelでBoxを挿入 ⏳
- **2選択時 - シフト挿入モード**: 右側Boxをシフト移動して新Boxを挿入 ⚠️（Line/SD/SG連動が開発中）

### 1.2 Box 種別
- 通常Item ✅
- OPP（必須通過点） ✅
- BFP（分岐点） ✅
- EFP（等至点） ✅
- P-EFP（両極化等至点） ✅
- 注釈用Box ✅
- **※ 文献標準とのずれ** → `docs/literature/OLD_VS_LITERATURE.md` 参照（EFPとOPPの線種が逆転していた）

### 1.3 Box プロパティ
- 位置（Item_Level, Time_Level） ✅
- サイズ（Width, Height） ✅
- テキスト（Text） ✅
- フォント・色（ApplyShapeStyle経由） ✅

### 1.4 Box 削除・複製
- 削除（Dataシートの対応行も自動削除） ✅
- **複製**: ❌ 未実装（UserFormで同じパラメータを手動再入力）

---

## 2. Line（矢印）作成・編集

### 2.1 Line 作成
- IDベース自動生成（Make_Line_by_ID） ✅
- 2Box選択→UserFormから手動作成 ✅

### 2.2 Line 種別
- **実線矢印（RLine）** ✅
- **点線矢印（XLine）** ✅
- 線太さ: 固定（3pt） — 設定値 `Line_Line_Width` は未参照
- 矢印: ExcelのmsoArrowheadOpen ✅

### 2.3 接続パラメータ
- From_shp_Name / To_shp_Name ✅
- Start_Margin / End_Margin ✅
- Adj_Start_Height / Adj_End_Height ✅

### 2.4 自動修正機能
- **MoveLine**: Box移動時に接続先に自動追従 ✅
- **From/To 自動入れ替え**: 時系列が逆転したら SwapFromToInDataSheet ✅

---

## 3. SD / SG（五角形）機能

### 3.1 SD/SG 作成
- msoShapePentagon（五角形） ✅
- SG（arrowDirection=1）: 下/右配置 ✅
- SD（arrowDirection=0）: 上/左配置 ✅
- 親図形（Box/Line）からのオフセット（SDSG_Item_Adj, SDSG_Time_Adj） ✅

### 3.2 SD/SG 編集・削除
- 親図形移動時の自動追従（MoveSDSG） ✅
- 親図形削除時の連動削除（adj_relation_SDSG_Line） ✅

---

## 4. レベル調整・レイアウト自動化

### 4.1 レベル調整操作
- **Item_Level / Time_Level 数値指定**でBox移動 ✅
- ↑↓ボタンで方向指定 ✅
- Dataシートの自動更新 ✅

### 4.2 連動機能
- **ShiftShapesRight** — 挿入時の右側図形の一括シフト ⚙️（修正中）
- **MoveRightSideShapes** — 連動チェックボックス機能 ⚙️（修正中）
  - 「同列以上」モード ⏳
  - 「右側のみ」モード ⏳

### 4.3 矢印の自動修正
- レベル調整時に接続Line全てでMoveLine()自動実行 ✅
- From/To自動入れ替え ⏳

### 4.4 レイアウト方向
- **横型（Horizontal）** ✅ 完了
- **縦型（Vertical）** ⚠️ 未完全（「後回し」指定）

---

## 5. ツールバー・UI

### 5.1 フローティングツールバー (frmToolbar)
- MakeFigシート表示時に自動表示 ✅
- 他シートで自動非表示 ✅
- **6ボタン**:
  1. 図作成（一括生成） ✅
  2. Box追加 ✅
  3. 線追加 ✅
  4. SD/SG追加 ✅
  5. 設定 ✅
  6. レベル調整 ✅
- ⚠️ アイコン・ツールチップ・多言語対応は未実装

### 5.2 UserForm一覧
- **UserForm_AddBox**: Box追加ダイアログ（1/2選択対応、挿入モード選択） ✅
- **UserForm_Make_Line**: Line追加ダイアログ（線種・マージン指定） ✅
- **UserForm_Make_SD_SG**: SD/SG追加ダイアログ（向き・オフセット指定） ✅
- **UserForm_Box_level_Change**: レベル調整ダイアログ（連動オプション付き） ✅
- **UserForm_General_Setting**: 設定ダイアログ（2ページタブ構成） ✅

---

## 6. 設定機能（General_Settingシート）

### 6.1 設定項目
| 項目 | デフォルト | 内容 |
|---|---|---|
| `drawing_facing_is_horizontal` | TRUE | レイアウト方向 |
| `vertical_level_size` | 80 | Item_Level 1単位のピクセル |
| `time_level_size` | 150 | Time_Level 1単位のピクセル |
| `drawing_fig_start_standard_col_num` | 8 | 図の開始列 |
| `drawing_fig_start_standard_row_num` | 7 | 図の開始行 |
| `ItemBox_Width / Height` | 80 / 40 | Box標準サイズ |
| `ItemBox_text_Font / Size` | Calibri / 11 | フォント |
| `Line_Start_Margin / End_Margin` | 3 / 3 | 線マージン |
| `Line_Adj_Start_Height / End_Height` | 0 / 0 | 線高さ調整 |

### 6.2 設定キャッシング
- **clsSettings** — General_Settingシートを初期化時に一括読み込み ✅

---

## 7. データ管理（Dataシート）

### 7.1 列構成（15列）
| 列 | 用途 |
|---|---|
| ID | 自動採番ID |
| Type | 図形タイプ |
| Text | 表示テキスト |
| Item_Level / Time_Level | 位置 |
| Height / Width | サイズ |
| From_shp_Name / To_shp_Name | 接続先 |
| Start_Margin / End_Margin | 線マージン |
| Adj_Start_Height / Adj_End_Height | 高さ調整 |
| SDSG_Item_Adj / SDSG_Time_Adj | SD/SGオフセット |

### 7.2 ID自動採番（ID_Named）
- dic_fig_type辞書から接頭辞取得 ✅
- 既存ID番号を辞書化して最大値+1 ✅

### 7.3 辞書シート（dic_fig_type）
- Type → ID接頭辞 → Category（Box/Line/SDSG）の3列マッピング ✅
- Item→Item, 実線矢印→RLine, SD→SD 等

### 7.4 データ整合性
- ID重複チェック ✅
- From/To_shp_Nameの参照先存在確認 ❌ 未実装
- Type↔ID接頭辞の整合性確認 ❌ 未実装

---

## 8. 一括生成・再生成

### 8.1 基本版 (Main_making_TEM_Fig_from_data)
- ID自動付与 → Box/Line/SD/SGの3パス生成 ✅

### 8.2 最適化版 (Main_making_TEM_Fig_Optimized) ✅
- **clsFigureFactory** を使った最適化版
- clsDataAccess, clsSettings, clsShapeData のキャッシュ活用
- Box 63個 / Line 30個 / SDSG 12個を高速生成

### 8.3 軸ラベル生成
- MakeAxisLabel(Time_label_num, Item_label_num) ✅ 横型のみ

---

## 9. 開発中・計画中

### 9.1 ⚙️ 開発中 (2025-12-30)
**図形移動時のLine/SD/SG連動修正**
- ShiftShapesRight関数: 4パスアプローチに改修（修正コード実装済み）
  - Pass 1: Dataシート全図形のTime_Levelを加算
  - Pass 2: 全図形の.Leftプロパティを変更
  - Pass 3: 影響を受けたLineに対してMoveLine()実行
  - Pass 4: Label/SubLabel移動（コメントアウト、将来用）
- MoveRightSideShapes関数: Box移動後にMoveLine()を全Lineで実行

### 9.2 ⏳ 未テスト（実装済みだが動作未検証）
- レベル調整時の矢印始点終点修正
- 連動チェックボックス（セットアップ後）
- Box追加2選択時（間に挿入 / シフト挿入）
- 縦型図の作成・調整

### 9.3 🔄 計画中
- **Label/SubLabel 機能**（親図形プロパティ管理、移動追従コードは準備済み）
- **図形複製機能**
- **テンプレート機能**（分岐構造など頻出パターン）
- **CSVインポート**
- **PDF/PNG エクスポート**

---

## 10. 既知のバグ・制限事項

### 10.1 修正済み
- データ列ずれ（2025-12-29 修正）
- MoveLine関数のNullチェック欠落（修正済み）
- UserForm_AddBoxの位置ずれ（修正済み）
- 日本語文字列の文字化け（ChrW()対応済み）

### 10.2 残存
1. **縦型図が未完全** — 横型のみテスト完了
2. **Line/SD/SG連動が未完成** — 修正コード実装済み、テスト前
3. **ツールバーUIが簡素** — アイコン・ToolTip・多言語なし
4. **2選択時Box追加の動作未検証**
5. **データ整合性チェック不十分** — 参照先Box存在確認なし
6. **パフォーマンス未最適化** — Find関数、For Eachループ

### 10.3 文献標準との乖離（新発見）
- **EFPとOPPの線種が逆転**（`docs/literature/OLD_VS_LITERATURE.md`）
- BFPが太線固定（文献は通常太さ）

---

## 11. 内部クラスモジュール（移植時の内部設計参考）

| クラス | 役割 | Web版での対応 |
|---|---|---|
| clsShapeData | 図形データのキャッシング | Zustandストア内 |
| clsDataAccess | Dataシートへの一元化アクセス | ストアのgetter/setter |
| clsSettings | General_Settingシートキャッシング | 設定ストア |
| clsFigureFactory | 図形生成の統一インターフェース | React Flow自動生成 |

---

## 12. Web版移植の優先度総括

### 🔴 高優先度（コア機能、Phase 2で実装必須）
- Box作成（1選択 / 2選択 / 挿入モード）
- Line作成（実線 / 点線 + 矢印）
- SD/SG作成（五角形・向き指定）
- レベル調整機能（Item_Level / Time_Level）
- Box・Line・SD/SG削除
- 一括生成・再生成
- データシート管理（ID自動採番、辞書）
- 設定機能
- ツールバー + UserForm相当のUI

### 🟡 中優先度（Phase 3で実装）
- 図形移動時のLine/SD/SG連動（旧版で開発中だった機能）
- 連動チェックボックス（同列以上 / 右側のみ）
- 矢印始点終点の自動修正
- 縦型レイアウト
- 軸ラベル生成

### 🟢 低優先度（Phase 4以降）
- Label/SubLabel機能
- 図形複製
- テンプレート機能
- データ整合性チェック強化
- ツールバーのUI改善（アイコン等）
