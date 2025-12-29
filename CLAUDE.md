# CLAUDE.md - TEMerPlus

TEM（複線径路等至性モデル）の作図ツール「TEMerPlus」の開発プロジェクトです。

---

## プロジェクト概要

### TEMerPlusとは
- TEM（Trajectory Equifinality Model：複線径路等至性モデル）の作図支援ツール
- ExcelのVBAで実装
- Dataシートのデータを基にMakefigシートに再現性のある図を作成

### ファイル構成

| ファイル | 説明 |
|---------|------|
| `最新版/TEMerPlus_202400715.xlsm` | メインのExcelファイル（VBAマクロ付き） |
| `CLAUDE.md` | 本ファイル（プロジェクト指示） |
| `HISTORY.md` | 開発履歴・VBA構造・問題追跡 |

---

## 開発ルール

### 変更管理
1. **すべての変更はHISTORY.mdに記録**
2. **未確認・未実装事項はチェックリスト形式で管理**
3. **VBAコードの変更前に必ずバックアップ**

### テスト再開コマンド
```
@HISTORY.md テスト再開
@HISTORY.md 開発再開
@HISTORY.md 状況報告
```

---

## 許可されている操作

このフォルダ（D:\OneDrive\01プログラム作成\TEMerPlus\）では以下の操作が許可されています：
- Edit（ファイル編集）
- Read（ファイル読み取り）
- Write（ファイル書き込み）
- Bash（コマンド実行）
- mcp_*（MCPツール使用）

---

## VBA開発のポイント

### Excel VBE MCPの使用
VBAコードの読み取り・編集には `mcp__excel-vbe__*` ツールを使用：
- `get_form_code` - UserFormのコード取得
- `set_form_code` - UserFormのコード設定
- `execute_vba` - VBAコード実行

### 注意事項
1. **トラストセンター設定が必要**
   - Excel → ファイル → オプション → トラストセンター
   - 「VBAプロジェクトオブジェクトモデルへのアクセスを信頼する」を有効化

2. **Excelファイルを開いた状態で作業**
   - MCPツールは開いているワークブックに対して操作

---

## 関連ドキュメント

- [HISTORY.md](./HISTORY.md) - VBA構造解析・開発履歴・問題追跡
- [親プロジェクトのCLAUDE.md](../CLAUDE.md) - 全体のプロジェクト構成
