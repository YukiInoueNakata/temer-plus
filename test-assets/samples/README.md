# サンプルファイル

CSV インポートや .tem 読み込みで動作確認するためのサンプル。

## CSV サンプル

| ファイル | 用途 | Box 数 |
|---|---|---|
| `labels-only.csv` | ラベルだけの最小 CSV（ヘッダなし 1 列） | 5 |
| `with-types.csv` | ラベル + 英名種別 | 5 |
| `japanese-types.csv` | ラベル + 日本語種別（分岐点 → BFP 等の辞書マップ確認） | 6 |
| `full-columns.csv` | label / type / timeLevel / itemLevel / subLabel / description 全列 | 5 |
| `large-branch.csv` | 2nd-EFP / P-2nd-EFP / annotation を含む複雑構成 | 9 |
| **`20-boxes-complex.csv`** | **大量 Box・複数分岐・annotation 含む実用テスト** | **20** |

## .tem サンプル（直接開ける TEM 図）

| ファイル | 用途 |
|---|---|
| `sample-simple.tem` | 最小構成：Item → OPP → BFP → EFP/P-EFP + SD/SG + 時期 1/2 |
| `sample-vertical.tem` | 縦型レイアウトの基本図 |

## 使い方

### CSV インポート
1. アプリ左上の「ファイル」タブ
2. 「CSV インポート…」ボタン
3. 上記 CSV のいずれかを選ぶ
4. 列割り当てを確認 → 「インポート」

### .tem 読み込み
1. 「ファイル」タブ
2. 「開く (Ctrl+O)」ボタン
3. `.tem` ファイルを選択

## 期待動作

### `labels-only.csv`
- ヘッダなし判定
- 1 列 → ラベルに自動割当
- 同じ Item_Level で Time_Level 0, 1, 2... と配置、5 個水平に並ぶ

### `20-boxes-complex.csv`（20 個の複雑テスト）
- 高校入学から社会人まで、TEM 図として実用的なストーリー
- 複数の分岐点（BFP）と等至点（EFP / P-EFP / 2nd-EFP / P-2nd-EFP）
- annotation（潜在経験）が途中途中に
- 配置は指定された timeLevel / itemLevel に基づく
- 順次接続オプション ON にすると実線でつなげられる
- 自動縮尺・スマートガイド・凡例自動生成が負荷テスト的に機能するか確認
