# 公開・配信ガイド

## 1. GitHub リポジトリ作成と公開

### 1-1 GitHub リポジトリ作成

1. https://github.com/new で新規リポジトリ
2. リポジトリ名: 例 `temer-plus`（このまま URL に使われます）
3. 可視性: **Public** 推奨（Pages が Free プランで使えるため）
4. **README / .gitignore / LICENSE は追加しない**（既に手元にあるため）
5. 「Create repository」

### 1-2 ローカルからプッシュ

```bash
cd "D:/OneDrive/01プログラム作成/TEMerPlus"
git remote add origin https://github.com/<username>/temer-plus.git
git branch -M main     # デフォルトブランチ名を main に（まだ master ならこちらで）
git push -u origin main
```

すでに `master` ブランチで運用していたので、変更なしで `master` に push したい場合は上の `git branch -M main` は不要。ワークフロー側で `main, master` 両方対応にしてあります。

### 1-3 GitHub Pages の設定

リポジトリの **Settings > Pages** を開く:
- **Source**: `GitHub Actions` を選択
- 保存

### 1-4 デプロイ

1. `git push` するだけで `.github/workflows/deploy.yml` が自動起動
2. リポジトリの **Actions** タブでビルドログを確認
3. 成功すると https://&lt;username&gt;.github.io/temer-plus/ で公開

### 1-5 カスタムドメイン（任意）

独自ドメインで配信したい場合:
- Settings > Pages > **Custom domain** に `example.com` などを入力
- DNS で A レコード or CNAME を GitHub に向ける
- HTTPS 自動取得

---

## 2. テスター用配布セット

### 2-1 推奨配布物
- **公開 URL**: https://&lt;username&gt;.github.io/temer-plus/
- **TEST-GUIDE.md**: テスト実施手順
- **CHECKLIST.md**: 確認項目（PDF 化して渡しても OK）
- **samples/**: サンプル CSV / .tem ファイル
- **Google Form URL**: フィードバック送信先（GOOGLE-FORM-TEMPLATE.md で作成）

### 2-2 依頼メール例

```
件名: TEMer Plus テスターのお願い

○○様

開発中のTEM図作成ツール「TEMer Plus」のテストにご協力ください。

■ 公開URL
https://example.github.io/temer-plus/

■ 動作ブラウザ
Chrome / Edge 推奨（File System Access API 使用）

■ テスト手順
添付の TEST-GUIDE.md を参照してください。5 分でできる簡易動作確認から、
全機能の網羅的確認まで段階的に記載しています。

■ サンプルファイル（添付 zip）
- samples/labels-only.csv   ラベルのみの最小 CSV
- samples/full-columns.csv  全列指定 CSV
- samples/sample-simple.tem 基本的な TEM 図（読み込んでテスト可）
- samples/sample-vertical.tem 縦型レイアウトの例

■ フィードバック
https://forms.gle/xxxxxxxx
動作に関する不具合 / UX の感想 / 要望 をお願いします。

ご不明点は &lt;連絡先&gt; までお願いします。
```

---

## 3. PWA 対応でオフライン動作とは

### 3-1 PWA とは

**PWA (Progressive Web App)** は、Web アプリをネイティブアプリのように扱える仕組みです。
特徴:

| 機能 | 意味 |
|---|---|
| **インストール可能** | ブラウザの「ホーム画面に追加」やアドレスバー横の「⊕」ボタンでアプリとして登録できる |
| **オフライン動作** | インターネット接続がなくても起動・編集できる（初回アクセス時にアセットをキャッシュ） |
| **ネイティブ風の起動** | ブラウザ UI なしの独立ウィンドウで起動（Chrome/Edge/Safari/Android 対応） |
| **ファイル関連付け** | OS の「.tem ファイルを開く」メニューに TEMer Plus を登録可（一部 OS） |

### 3-2 TEMer Plus でのメリット

- **電車・出張先など通信が不安定な場所**でも作図続行
- **研究室内で配布**しやすい（GitHub Pages に 1 回つなぐだけで以降オフライン）
- **学会のデモ**で Wi-Fi トラブルを回避
- `.tem` ファイルはローカル保存なので、元々オフライン性は高い → PWA で起動面も完全ローカル化

### 3-3 実装方法

`vite-plugin-pwa` を追加:

```bash
cd webApp
npm install -D vite-plugin-pwa
```

`vite.config.ts` に:
```ts
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'TEMer Plus',
        short_name: 'TEMer',
        description: 'TEM 図作成ツール',
        theme_color: '#2684ff',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
  // ...
});
```

アイコン画像（192×192、512×512 px）を `webApp/public/` に配置。

### 3-4 対応のトレードオフ

**メリット:**
- オフライン動作
- インストール可能
- 高速ロード（2 回目以降）

**デメリット:**
- 初回の追加開発コスト（アイコン、manifest）
- キャッシュ更新のトラブル対応が必要（ユーザーが旧バージョンを使い続けるリスク）
- File System Access API 等の一部ブラウザ API はまだ PWA でも制約あり

**推奨タイミング:**
- 公開直後に PWA 対応するとユーザーが古いキャッシュのまま残る可能性があるので、**最初の安定版がリリースされてから** PWA 対応するのが無難
- まずは GitHub Pages で普通のウェブ公開 → テスター反応を見ながら必要に応じて PWA 化

---

## 4. 公開後のワークフロー

### 4-1 修正 → 再デプロイ

```bash
git add -A
git commit -m "fix: ..."
git push
```

→ GitHub Actions が自動でビルド & デプロイ（通常 2〜3 分）

### 4-2 バージョン管理

将来的には `package.json` の `version` をリリース毎に上げて、ユーザーが「自分が触ってるのは何版か」わかるように。

### 4-3 ユーザーキャッシュ問題

ユーザーが古いバージョンを見てしまう場合:
- Ctrl+F5 でハードリロード
- それでも解決しない場合は開発者ツール > Application > Clear storage

PWA 対応後は Service Worker の更新通知を追加すると親切。
