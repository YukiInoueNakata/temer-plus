# HISTORY.md - TEMerPlus 開発履歴

## 概要

TEMerPlus（TEM作図ツール）のVBA構造解析、開発履歴、問題追跡を記録します。

---

## テスト再開方法

Claude Code再起動時やPC再起動時に：

```
@HISTORY.md テスト再開
@HISTORY.md 開発再開
@HISTORY.md 状況報告
```

---

## 未完了タスク

### 解析タスク
- [x] VBAモジュール構造の把握
- [x] Dataシートのデータ構造の把握
- [x] Makefigシートの作図ロジックの把握
- [x] 主要プロシージャの役割の特定

### 機能追加タスク
- [x] Phase 1: clsShapeData（図形データキャッシュ）
- [x] Phase 2: clsDataAccess（データアクセス一元化）
- [x] Phase 3: clsFigureFactory（図形生成統一）
- [x] Phase 4: clsSettings（設定値管理）

### リファクタリングタスク
- [x] Git初期化・.gitignore作成
- [x] VBAクラスモジュール4つを作成
- [x] Excel VBEにクラスモジュールをインポート
- [x] 動作テスト（全クラス正常動作確認）
- [x] 既存モジュールの修正（3ファイル）
  - [x] Module_Make_Box.bas - 最適化版関数追加
  - [x] Edit_Line.bas - 最適化版関数追加
  - [x] Edit_SD_SG.bas - 最適化版関数追加
- [x] clsSettings修正（General_Settingシートとの互換性）
- [x] Make_Box_Optimized動作確認
- [x] Make_Line_by_ID_Optimized動作確認
- [x] MakeArrowCalloutByID_Optimized動作確認
- [x] Main_making_TEM_Fig_Optimized動作確認
- [x] MakeFigシートのボタン割り当て更新
- [x] clsFigureFactory内部関数を最適化版に移行
- [x] UserForm_AddBoxを最適化版に移行
- [x] フローティングツールバー実装
  - [x] frmToolbar UserForm作成
  - [x] MakeFigシートにイベントコード追加
  - [x] ヘルパー関数追加（Module_MakeFig_sh）
  - [x] 動作テスト完了

---

## 2025-12-29: データ列ずれ問題の修正

### 問題
ツールバーの「図作成」ボタンを押しても作図されない

### 原因
Dataシートのデータが1列左にずれていた：
- **現在の状態（間違い）**: ID列にType、Type列にText、Text列にTime_Level...
- **正しい状態**: ID列は空（自動付与）、Type列にType、Text列にText...

### 修正
`Module_FixDataColumns.bas`を作成
- `FixDataColumns`マクロを実行するとA列に空列を挿入
- データが正しい列位置に移動
- その後「図作成」ボタンでIDが自動付与され作図される

### テスト結果
- ✅ 図作成成功（横型図）

### 更新ファイル
- `C:\Temp\FixDataColumns.bas` - データ列修正モジュール
- `VBA_Backup/Module_FixDataColumns.bas` - バックアップ

---

## 2025-12-29: 矢印始点終点修正・文字エンコーディング修正

### テスト結果
- **単純な場合**: 矢印始点終点修正は正常動作
- **連動時**: 位置ずれが発生（今後の課題）

### 文字エンコーディング問題の修正
Module_adj_Box_level.basで日本語文字列がインポート時に文字化けする問題を修正：
```vba
' 修正前（文字化け）
If (cellValue = "実線矢印" Or cellValue = "点線矢印") Then

' 修正後（ChrW使用）
If (cellValue = ChrW(&H5B9F) & ChrW(&H7DDA) & ChrW(&H77E2) & ChrW(&H5370) Or _
    cellValue = ChrW(&H70B9) & ChrW(&H7DDA) & ChrW(&H77E2) & ChrW(&H5370)) Then
```

### 今後の課題
1. **連動時の位置ずれ**: 右移動→左移動でズレが発生
2. **2図形の高さ入れ替え機能**: 高さを維持するか入れ替えるか選択可能に
3. **縦型図の作成問題**: 現在は横型図のみ成功、縦型図は未対応

### 更新ファイル
- `C:\Temp\Module_adj_Box_level.bas` - 文字エンコーディング修正版
- `VBA_Backup/Module_adj_Box_level.bas` - バックアップ

---

## 2025-12-29: 追加機能実装（セットアップ必要）

### 実装内容

#### 1. レベル調整時の矢印始点・終点修正 (Module_adj_Box_level.bas)
- **問題**: 図形AがBより前→後に移動した際、矢印の始点・終点が不正になる
- **修正**: `MoveLine`関数を改修
  - FromTimeLevel > ToTimeLevelの場合、**Dataシートを更新**
  - `SwapFromToInDataSheet`関数を新規追加
    - From_shp_Name ↔ To_shp_Name を入れ替え
    - Start_Margin ↔ End_Margin を入れ替え
    - Adj_Start_Height ↔ Adj_End_Height を入れ替え
  - これにより図を再生成しても矢印の方向が正しく維持される

#### 2. 連動チェックボックス (UserForm_Box_level_Change + Module_adj_Box_level.bas)
- **機能**: 選択した図形より右側の図形を一括移動
- **バックエンド実装済み**:
  - `MoveRightSideShapes(baseTimeLevel, changeLeft, changeTop, includeSameLevel, excludeShpName)`
  - 基準Time_Level以上/超の全図形を移動
  - 自分自身は除外
- **フロントエンド（UserFormコントロール）**: セットアップが必要
  - `Module_SetupUserForm.bas`をインポート
  - `AddSyncControlsToBoxLevelForm`を一度実行

#### 3. Box追加の2選択時対応 (UserForm_AddBox.frm)
- **機能**: 2つの図形を選択した状態でBox追加可能
- **モード**:
  - `OptionButton_InsertBetween`: 2図形の間に挿入（中間Time_Level）
  - 移動挿入: 右側図形をシフトして挿入
- **新規関数**:
  - `AddBoxWith2Shapes()`: 2選択時のメイン処理
  - `ShiftShapesRight(DataWs, baseTimeLevel, shiftAmount)`: 右側図形のシフト
  - `CreateLineForNewBox(shp_ID)`: 線作成の共通処理

### セットアップ手順

**連動チェックボックスを有効にするには:**

1. `VBA_Backup/Module_SetupUserForm.bas`をExcelにインポート
2. VBAエディタで`AddSyncControlsToBoxLevelForm`を実行
3. UserForm_Box_level_Changeに以下のコントロールが追加される:
   - `CheckBox_Sync`: 連動ON/OFF
   - `OptionButton_SyncSameAndRight`: 同列以上を移動
   - `OptionButton_SyncRightOnly`: 右側のみを移動

### テスト状況
- [ ] 横型図での矢印始点・終点修正テスト
- [ ] 連動チェックボックス動作テスト（セットアップ後）
- [ ] Box追加2選択時テスト（間に挿入）
- [ ] Box追加2選択時テスト（シフト挿入）
- [ ] 縦型図でのテスト（後回し）

### 更新ファイル
- `VBA_Backup/Module_adj_Box_level.bas` - MoveLine修正 + SwapFromToInDataSheet追加
- `VBA_Backup/Module_SetupUserForm.bas` - 新規（連動コントロール追加用）
- `VBA_Backup/UserForm_AddBox.frm` - 2選択時対応追加

---

## 2025-12-29: バグ修正・ツールバー改善

### 修正内容

1. **MoveLine sub Nullチェック追加** (Module_adj_Box_level)
   - 問題: レベル調整時に`ToShp.Name`でエラー発生
   - 原因: `FindShapeByName`が図形を見つけられない場合にNothingを返すが、チェックがなかった
   - 修正: FromShp, ToShp, shpのNullチェックを追加し、見つからない場合はExit Sub

2. **UserForm_AddBox修正**
   - 問題: Box追加の位置がおかしい
   - 原因: `Make_Box_Optimized`を使用していた
   - 修正: オリジナルの`Make_Box`に戻す

3. **ツールバー（toolbar）修正**
   - フォーム名を`toolbar`に統一
   - ボタンイベントを`Main_making_TEM_Fig_from_data`に変更（Optimized版から戻す）
   - Nullチェック付きのエラーハンドリング

### 更新ファイル
- `VBA_Backup/Module_adj_Box_level.bas` - MoveLine修正
- `VBA_Backup/UserForm_AddBox.frm` - Make_Boxに戻す
- `VBA_Backup/toolbar.frm` - 新規ツールバー
- `VBA_Backup/CreateToolbarForm.bas` - ツールバー作成用コード

---

## 2025-12-29: フローティングツールバー実装

### 目的
MakeFigシートでよく使う機能をワンクリックで実行できるようにする

### 実装内容
1. **frmToolbar** - フローティングツールバー UserForm
   - 6つのボタン: 図作成、Box追加、線追加、SD/SG、設定、レベル調整
   - モードレスで表示（他の操作を妨げない）

2. **Sheet4 (MakeFig) イベント**
   - `Worksheet_Activate`: ツールバーを表示
   - `Worksheet_Deactivate`: ツールバーを非表示（Unload）

3. **Module_MakeFig_sh ヘルパー関数**
   - `IsUserFormLoaded()`: UserFormがロードされているか確認
   - `ShowToolbar()`: ツールバーを表示
   - `HideToolbar()`: ツールバーをアンロード

### 動作確認
- MakeFigシートに移動 → ツールバー表示: OK
- 別のシートに移動 → ツールバー非表示: OK

### 新規ファイル
- `VBA_Backup/frmToolbar.frm`
- `VBA_Backup/Sheet4_MakeFig.cls`
- `VBA_Backup/Module_MakeFig_sh.bas` (更新)

---

## 2025-12-29: VBA解析完了

### 作業内容
- [x] CLAUDE.md 作成
- [x] HISTORY.md 作成
- [x] settings.json に許可設定追加
- [x] VBAコード取得・解析
- [x] VBAモジュールをVBA_Backupフォルダにエクスポート

### 対象ファイル
`D:\OneDrive\01プログラム作成\TEMerPlus\最新版\TEMerPlus_202400715.xlsm`

### エクスポート先
`D:\OneDrive\01プログラム作成\TEMerPlus\VBA_Backup\`

---

## VBA構造

### シート構成
| シート名 | 役割 |
|---------|------|
| Data | 入力データ格納（ID, Type, Text, Item_Level, Time_Level等） |
| MakeFig | 作図出力先シート |
| デモ用 | デモンストレーション用 |
| デモ2 | デモンストレーション用2 |
| General_Setting | 一般設定（レイアウト方向、サイズ等） |
| Setting1 | 追加設定 |
| dic_fig_type | 図形タイプの辞書（Type→ID名のマッピング） |

### モジュール一覧

#### 標準モジュール（Standard Modules）
| モジュール名 | 主な役割 |
|-------------|---------|
| **Module_Make_Box** | Box作成のメイン処理 |
| **Data_Cleaning** | IDの自動付与、辞書機能 |
| **Edit_Line** | 線（矢印・コネクタ）の作成・接続 |
| **Edit_SD_SG** | SD（分岐先駆け）/SG（分岐後）図形の作成 |
| **Module_General_setting** | 軸ラベル作成、レイアウト設定 |
| **Module_adj_Box_level** | Box位置（レベル）の調整 |
| **Module_MakeFig_sh** | 作図シートの管理、ボタン処理 |
| **Module_userform** | UserForm用ユーティリティ |
| **Module_debug** | デバッグ用機能 |
| **Module_よく使う** | 汎用ユーティリティ関数 |
| Module1 | 雑多な機能 |
| TestModule1 | テスト用 |

#### UserForm（フォーム）
| フォーム名 | 役割 |
|-----------|------|
| UserForm_AddBox | Box追加ダイアログ |
| UserForm_Make_Line | 線/矢印作成ダイアログ |
| UserForm_Make_SD_SG | SD/SG図形作成ダイアログ |
| UserForm_Box_level_Change | Box位置調整ダイアログ |
| UserForm_General_Setting | 一般設定ダイアログ |

---

### 主要プロシージャ

#### メイン処理フロー
```
Main_making_TEM_Fig_from_data()  ← DataシートからTEM図を生成
    ├── ID_Named()              ← 各行にID自動付与
    ├── Make_Box()              ← 各Boxを作成
    ├── Make_Line_by_ID()       ← 線/矢印を作成
    ├── MakeArrowCalloutByID()  ← SD/SG図形を作成
    └── MakeAxisLabel()         ← 軸ラベルを作成
```

#### Box作成関連 (Module_Make_Box)
| 関数名 | 説明 |
|--------|------|
| `Main_making_TEM_Fig_from_data()` | Dataシートから図全体を作成 |
| `Make_Box(shp_ID)` | 指定IDのBoxを作成 |
| `CalculateBoxPosition()` | Box位置を計算 |
| `ApplyShapeStyle()` | Box見た目を適用 |
| `ApplyLineStyles()` | Box線スタイルを適用 |

#### ID・辞書関連 (Data_Cleaning)
| 関数名 | 説明 |
|--------|------|
| `ID_Named()` | TypeからIDを自動生成 |
| `dic_fig_type(ItemORAll, Value_col)` | dic_fig_typeシートから辞書を作成 |
| `ExtractRowsWithSubstring(Fig_Type)` | 指定Typeの既存ID番号を抽出 |
| `GetNextAvailableRow(dict)` | 次の利用可能番号を取得 |

#### 線・矢印関連 (Edit_Line)
| 関数名 | 説明 |
|--------|------|
| `Make_Line_by_ID(shp_ID)` | IDで線を作成 |
| `Arrow_Connect_box()` | 2つのBoxを矢印で接続 |
| `CreateAndConfigureConnector()` | コネクタを作成・設定 |
| `CalculateCoordinates()` | 始点・終点座標を計算 |

#### SD/SG関連 (Edit_SD_SG)
| 関数名 | 説明 |
|--------|------|
| `MakeArrowCalloutByID(shp_ID)` | IDでSD/SG図形を作成 |
| `CreateArrowCalloutBasedOnSelectedShape()` | 選択図形からSD/SG作成 |
| `CalculateNewShapePosition()` | SD/SG位置を計算 |
| `ConfigureSDSGShapeProperties()` | SD/SG見た目を設定 |

#### 設定・軸関連 (Module_General_setting)
| 関数名 | 説明 |
|--------|------|
| `MakeAxisLabel()` | 軸ラベルを作成 |
| `InsertNumLabelShape()` | 番号ラベルを挿入 |
| `Func_vertical_level_size()` | 縦方向サイズを取得 |
| `Func_time_level_size()` | 時間方向サイズを取得 |
| `is_type_vertical_or_horizontal()` | レイアウト方向を判定 |

#### ユーティリティ (Module_よく使う)
| 関数名 | 説明 |
|--------|------|
| `FindShapeByName(shp_Name)` | 名前で図形を検索 |
| `GetShapeByID(shp_Name)` | IDで図形を取得 |
| `Datash_GetValueOfSearchValue()` | Dataシートから値を検索 |
| `GetValueOfSearchValue()` | General_Settingから値を取得 |
| `get_count_selected_shape()` | 選択図形数を取得 |
| `CheckIfRectangle()` | 四角形かどうか判定 |
| `GetWriteCellFromValue_typeAndshp_IDorItem()` | 書き込みセルを取得 |

---

### データ構造

#### Dataシートの列構成
| 列名 | 説明 |
|------|------|
| ID | 図形の一意識別子（例: Item1, OPP2, Arrow_Item1_OPP1_1） |
| Type | 図形タイプ（Item, OPP, BFP, EFP, SD, SG, 実線矢印, 点線矢印） |
| Text | 表示テキスト |
| Item_Level | 縦方向位置（数値） |
| Time_Level | 時間方向位置（数値） |
| Height | 図形の高さ |
| Width | 図形の幅 |
| From_shp_Name | 矢印の始点図形名 |
| To_shp_Name | 矢印の終点図形名 |
| Start_Margin | 矢印始点のマージン |
| End_Margin | 矢印終点のマージン |
| Adj_Start_Height | 始点高さ調整 |
| Adj_End_Height | 終点高さ調整 |
| SDSG_Item_Adj | SD/SGのItem方向調整 |
| SDSG_Time_Adj | SD/SGのTime方向調整 |

#### dic_fig_typeシートの構成
| 列 | 説明 |
|----|------|
| 1列目 | Type（例: Item, OPP, BFP） |
| 2列目 | ID接頭辞（例: Item, OPP, BFP） |
| 3列目 | カテゴリ（例: Box） |

---

### ワークフロー

1. **データ入力**: DataシートにType, Text, Level等を入力
2. **ID自動付与**: `ID_Named()`でTypeに基づくIDを自動生成
3. **図形生成**: `Main_making_TEM_Fig_from_data()`で：
   - 各行のTypeに応じてBox/Line/SD/SGを作成
   - 位置はItem_Level/Time_Levelから計算
   - 矢印はFrom/To_shp_Nameで接続
4. **手動調整**: UserFormを使って追加・位置調整

---

## 問題・課題の追跡

### 現在の問題
（なし）

### 解決済みの問題
| 問題 | 解決方法 |
|------|----------|
| VBAコード取得困難 | execute_vbaでFileSystemObject使用しファイルエクスポート |
| UTF-16エンコーディング | エクスポートファイルは読み取り可能 |

---

## 変更履歴

| 日付 | 変更内容 | 結果 |
|------|----------|------|
| 2025-12-29 | CLAUDE.md, HISTORY.md 作成 | ✅ 完了 |
| 2025-12-29 | settings.json 許可設定追加 | ✅ 完了 |
| 2025-12-29 | VBAモジュールエクスポート | ✅ 完了 |
| 2025-12-29 | VBA構造解析完了 | ✅ 完了 |
| 2025-12-29 | Class化リファクタリング計画策定 | ✅ 完了 |
| 2025-12-29 | Git初期化・refactor/classブランチ作成 | ✅ 完了 |
| 2025-12-29 | VBAクラスモジュール4つ作成 | ✅ 完了 |
| 2025-12-29 | Excel VBEにクラスインポート・動作確認 | ✅ 完了 |
| 2025-12-29 | 既存モジュール修正（最適化版関数追加） | ✅ 完了 |
| 2025-12-29 | clsSettings修正（Dictionary.Add使用、列名修正） | ✅ 完了 |
| 2025-12-29 | Make_Box_Optimized動作テスト成功 | ✅ 完了 |
| 2025-12-29 | Make_Line_by_ID_Optimized動作テスト成功 | ✅ 完了 |
| 2025-12-29 | MakeArrowCalloutByID_Optimized動作テスト成功 | ✅ 完了 |
| 2025-12-29 | Main_making_TEM_Fig_Optimized動作テスト成功 | ✅ 完了 |
| 2025-12-29 | 全最適化関数のテスト完了 | ✅ 完了 |
| 2025-12-29 | Make_Fig_Buttonを最適化版に変更 | ✅ 完了 |
| 2025-12-29 | clsFigureFactory内部関数を最適化版に移行 | ✅ 完了 |
| 2025-12-29 | UserForm_AddBoxを最適化版に移行 | ✅ 完了 |
| 2025-12-29 | **全移行完了** | ✅ 完了 |

---

## 2025-12-29: 全最適化関数テスト完了

### テスト結果

| 関数名 | テスト結果 | 備考 |
|--------|-----------|------|
| `Make_Box_Optimized` | ✅ 成功 | Item1で動作確認 |
| `Make_Line_by_ID_Optimized` | ✅ 成功 | RLine_Item1_Item2_1で動作確認 |
| `MakeArrowCalloutByID_Optimized` | ✅ 成功 | SD_RLine_Item1_Item2_1_1で動作確認 |
| `Main_making_TEM_Fig_Optimized` | ✅ 成功 | 全図形一括生成（Box: 63, Line: 30, SDSG: 12） |

### 作成された図形数
- Box: 63個
- Line: 30個
- SD/SG: 12個

### ボタン割り当て変更
`Make_Fig_Button`を最適化版に更新済み：
- 変更前: `Main_making_TEM_Fig_from_data`
- 変更後: `Main_making_TEM_Fig_Optimized`

### 使用可能な状態
全ての最適化関数が正常動作し、本番運用可能。

---

## 2025-12-29: 既存モジュールの最適化

### 追加した最適化関数

| モジュール | 追加関数 | 効果 |
|-----------|---------|------|
| Module_Make_Box | `Main_making_TEM_Fig_Optimized()` | clsFigureFactoryで統一生成 |
| Module_Make_Box | `Make_Box_Optimized()` | clsShapeData+clsSettingsで8回→1回 |
| Edit_Line | `Make_Line_by_ID_Optimized()` | clsShapeDataで6回→1回 |
| Edit_SD_SG | `MakeArrowCalloutByID_Optimized()` | clsShapeDataで7回→1回 |

### 使用方法
既存の関数と並行して使用可能。段階的に移行するため、旧関数は残してあります。

---

## 2025-12-29: Class化リファクタリング計画

### 問題点の特定
| 問題 | 影響度 | 発生箇所 |
|------|--------|----------|
| Datash_GetValueOfSearchValue重複呼び出し | 高 | 32回/3モジュール |
| 同一データの繰り返し取得（キャッシュなし） | 高 | Make_Box, Edit_Line |
| 3重For Eachループ（Main_making） | 中 | Module_Make_Box |

### 提案するClass構成
```
clsShapeData       # 図形データのキャッシュ・アクセス
clsDataAccess      # Dataシートへの読み書き
clsSettings        # 設定値の一元管理
clsFigureFactory   # 図形生成の統一インターフェース
```

### 期待効果
- **コード行数**: 約150行削減（28%減）
- **関数呼び出し**: 32→4回（87%減）
- **ループ回数**: 3→1回（67%減）

### Git管理計画
- リポジトリ: `D:\OneDrive\01プログラム作成\TEMerPlus\`
- ブランチ: main（安定版）、refactor/class（作業用）
