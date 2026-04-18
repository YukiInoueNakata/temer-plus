# TEMer - Web版 最小プロトタイプ

TEM（複線径路等至性モデル）作図支援ツールのWeb版。React + Vite + TypeScript + React Flow で実装。

## 起動方法

### 必要環境
- Node.js 18 以上（推奨: 20 LTS）
- npm（またはpnpm/yarn）
- 推奨ブラウザ: Chrome / Edge

### セットアップ

```bash
cd webApp
npm install
npm run dev
```

ブラウザが自動で開き、`http://localhost:5173/` でアプリが起動します。

## ビルド（配布用）

```bash
npm run build
# → dist/ に静的ファイルが出力される
npm run preview
# → ビルド結果をローカルで確認
```

## 使い方（プロトタイプ）

1. **サンプル読込**ボタンで3つのサンプルBox（通常・点線・二重線）が表示されます
2. 左側の**データシート**でBox/Lineの各プロパティを編集 → 右側の作図ビューに即反映
3. 右側の**作図ビュー**でBoxをドラッグ移動 → データシートの座標が更新
4. Boxのハンドル（左右の●）同士をドラッグで接続 → 新しいLineが追加
5. **PNG出力** / **PPTX出力**で画像・PowerPointとしてダウンロード

## プロトタイプ範囲

| 機能 | 対応状況 |
|---|---|
| Box 3種（通常 / 二重線 / 点線） | ✅ |
| Line 2種（実線 / 点線）+ 矢印 | ✅ |
| 表↔図の双方向同期 | ✅ |
| ドラッグでBox移動 | ✅ |
| 接続でLine追加 | ✅ |
| PNG出力 | ✅ |
| PPTX出力（二重線は `cmpd=dbl` でネイティブ） | ✅ |
| .tem ファイル保存/読込 | ❌（Phase 2） |
| SD/SG（Pentagon） | ❌（Phase 2） |
| 自動レイアウト | ❌（Phase 3） |

## ディレクトリ構成

```
webApp/
├── src/
│   ├── main.tsx          # エントリーポイント
│   ├── App.tsx           # メインレイアウト
│   ├── App.css           # グローバルスタイル
│   ├── types.ts          # Box / Line 型定義
│   ├── store/
│   │   └── store.ts      # Zustand ストア
│   ├── components/
│   │   ├── Toolbar.tsx
│   │   ├── DataSheet.tsx
│   │   ├── DiagramView.tsx
│   │   └── nodes/
│   │       └── BoxNode.tsx
│   └── utils/
│       ├── exportPPT.ts  # PptxGenJS でpptx生成
│       └── exportImage.ts # html-to-image でPNG生成
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
└── README.md
```
