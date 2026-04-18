# CLAUDE.md - TEMer (Web版)

TEM（複線径路等至性モデル: Trajectory Equifinality Model）の作図支援ツール「TEMer」のWebアプリ版開発プロジェクトです。

---

## プロジェクト概要

### 移行の経緯
旧版（Excel VBA: TEMerPlus）は使い勝手に課題があったため、クロスプラットフォーム対応のWebアプリとして再設計しました。

- 旧版資産: `old_file/` 配下に全て退避済み（VBAソース、過去のpptx資料、卒論データ等）
- 新規開発: `webApp/` 配下で進行

### 設計方針

| 項目 | 方針 |
|---|---|
| プラットフォーム | Web（ブラウザベース）、将来Tauriデスクトップ化も視野 |
| OS対応 | Win / Mac どちらでも動作 |
| インストール | 原則不要（URLで起動）、PWA化も可 |
| データ保存 | `.tem` ファイル（JSON）中心 + IndexedDB自動バックアップ |
| エクスポート | pptx（PptxGenJS） / PNG（html-to-image） |
| 推奨ブラウザ | Chrome / Edge（File System Access APIでネイティブ並みの上書き保存） |

---

## ディレクトリ構成

```
TEMerPlus/
├── CLAUDE.md        # このファイル（プロジェクト指示）
├── HISTORY.md       # 開発履歴
├── TODO.md          # 残タスク・チェックリスト
├── webApp/          # Web版アプリ（開発中）
│   ├── package.json
│   ├── src/
│   │   ├── components/   # DataSheet, DiagramView, Toolbar
│   │   ├── store/        # Zustand ストア
│   │   ├── utils/        # エクスポート・インポート処理
│   │   ├── types.ts      # Box/Line/SDSG 型定義
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── README.md
└── old_file/        # 旧版VBA資産（凍結）
    ├── VBA_Backup/
    ├── TEMerPlus/
    ├── 最新版/
    ├── CLAUDE.md    # 旧プロジェクト指示
    └── HISTORY.md   # 旧開発履歴
```

---

## 技術スタック

| 層 | 採用技術 |
|---|---|
| 言語 | TypeScript |
| フレームワーク | React 18 |
| ビルド | Vite |
| 状態管理 | Zustand |
| 作図 | React Flow |
| データシート | （プロトタイプは自前、将来 Handsontable 検討） |
| PPT出力 | PptxGenJS |
| 画像出力 | html-to-image |
| スタイル | CSS Modules（シンプル） |

---

## 開発ルール

### 変更管理
1. 全ての変更は `HISTORY.md` に追記記録
2. 未実装事項・判断保留事項は `TODO.md` にチェックリスト形式で管理
3. 大きな構造変更は Issue / Plan を立ててから着手

### コーディング
- TypeScript の型を厳格に（`any` 原則禁止）
- コンポーネントは Props 型を必ず明示
- 純関数で座標計算・データ変換（テストしやすさ優先）

### コミット
- 節目ごとに commit（機能単位 / 構造単位）
- メッセージは日本語可、先頭にプレフィックス（`feat:` `fix:` `refactor:` `docs:` 等）

### 起動確認
- UI変更は `npm run dev` でブラウザ確認まで行う
- 型チェック / ビルドは `npm run build` で検証

---

## 旧版（VBA）からの移植方針

### データスキーマ（旧Dataシートの列をそのまま移植）

| 分類 | プロパティ |
|---|---|
| 共通 | id, type, text, itemLevel, timeLevel |
| Box | width, height, subtype (normal/double/dotted/OPP/BFP/EFP/P-EFP) |
| Line | from, to, style (solid/dashed), startMargin, endMargin, adjStartHeight, adjEndHeight |
| SD/SG | from, direction, itemAdj, timeAdj |

詳細は `old_file/HISTORY.md` および `old_file/VBA_Backup/` 配下を参照。

### 段階的移植計画
1. **Phase 1（最小プロトタイプ）**: Box（3種）+ Line（2種）+ 表編集 + pptx/画像出力 ✅
2. **Phase 2**: SD/SG、5種Box全対応、**2nd EFP/P-2nd EFP、番号採番、注釈ノード、凡例、時期ラベル**、設定画面、.temファイル入出力
3. **Phase 3**: 自動レイアウト（レベル調整、矢印始点終点修正、連動移動）
4. **Phase 4**: CSV インポート、旧xlsmファイルからのマイグレーション
5. **Phase 5**: TLMG、促進的記号、統合TEM図、縦型、色カスタマイズ

### 参考文献
TEM/TEA文献の詳細調査は `docs/literature/RESEARCH_REPORT.md` を参照。主要文献PDFは `docs/literature/` に格納済み。

現状は **Phase 1** に着手。

---

## pptx エクスポート仕様

ECMA-376 準拠で以下を忠実に再現:

| TEM要素 | pptxの表現 |
|---|---|
| 二重線Box（OPP等） | `line.compound: 'dbl'` |
| 点線Box（P-EFP等） | `line.dashType: 'dash'` |
| 実線矢印 | `line + arrowEnd` |
| 点線矢印 | `line.dashType: 'dashDot'` + `arrowEnd` |
| SD/SG | Pentagon 図形 |

---

## Notion連携

- **notion_page_id**: `3449e987-30be-818d-9dbc-fc9771589b23`
- **プロジェクト名(Notion)**: TEMerPlus
- **データベース**: プロジェクト一覧 (ClaudeCodeManagement)

---

## 関連ドキュメント

### プロジェクト管理
- [SPEC.md](./SPEC.md) - **機能仕様書**（全機能の詳細仕様）
- [ROADMAP.md](./ROADMAP.md) - **Phase別実装計画**
- [HISTORY.md](./HISTORY.md) - 開発履歴・意思決定の経緯
- [TODO.md](./TODO.md) - タスクリスト

### 調査資料
- [docs/OLD_FEATURES.md](./docs/OLD_FEATURES.md) - 旧版VBAの機能棚卸し
- [docs/SURVEY_ANALYSIS.md](./docs/SURVEY_ANALYSIS.md) - **TEM研究者46名のアンケート分析（機能要望）**
- [docs/SURVEY_OPEN_RESPONSES.md](./docs/SURVEY_OPEN_RESPONSES.md) - 調査オープン回答の詳細
- [docs/literature/INDEX.md](./docs/literature/INDEX.md) - TEM文献一覧
- [docs/literature/RESEARCH_REPORT.md](./docs/literature/RESEARCH_REPORT.md) - 文献調査（基礎）
- [docs/literature/RESEARCH_REPORT_DEEP.md](./docs/literature/RESEARCH_REPORT_DEEP.md) - 文献調査（深掘り）
- [docs/literature/RESEARCH_REPORT_VISUAL.md](./docs/literature/RESEARCH_REPORT_VISUAL.md) - 文献調査（視覚確認）
- [docs/literature/OLD_VS_LITERATURE.md](./docs/literature/OLD_VS_LITERATURE.md) - 旧実装と文献標準の照合

### アプリ
- [webApp/README.md](./webApp/README.md) - Webアプリの起動方法

### 旧版
- [old_file/HISTORY.md](./old_file/HISTORY.md) - 旧版VBAの開発履歴（参照用）
