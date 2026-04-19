# サンプル CSV

CSV インポート機能のテスト用。

| ファイル | 概要 |
|---|---|
| `labels-only.csv` | 1 列のみ（ラベルだけ）。ヘッダなし。最小構成。 |
| `with-types.csv` | ラベル + 英名種別（BFP/EFP/OPP/P-EFP）。ヘッダあり。 |
| `japanese-types.csv` | ラベル + 日本語種別（分岐点/等至点 等）。ヘッダあり。 |
| `full-columns.csv` | label / type / timeLevel / itemLevel / subLabel / description 全列。 |
| `large-branch.csv` | 2nd-EFP / P-2nd-EFP / annotation を含む 9 個 Box。分岐の大きい図のテスト。 |

## 使い方

1. webApp 起動（`npm run dev`）
2. ファイルタブ > CSV インポート
3. 上記のいずれかを選ぶ
4. 列マッピング・配置オプションを確認してインポート

## 期待動作

### `labels-only.csv`
- ヘッダなし判定、1 列 → label に自動割当
- 同じ Item_Level で Time_Level 0, 1, 2, ... と配置
- 5 個の通常 Box が水平に並ぶ

### `with-types.csv`
- ヘッダあり判定、`label` / `type` 列が自動認識
- 「normal / OPP / BFP / EFP / P-EFP」が適切な種別で配置

### `japanese-types.csv`
- TYPE_DICT により日本語 → 英名マップ
- 凡例自動生成で使用記号が表示される

### `full-columns.csv`
- 協力者を想定した典型的な TEM データ
- subLabel に「Aさん」、description に各 Box の意味
- 論文レポート出力で description が表に出る

### `large-branch.csv`
- 複数分岐 + 潜在経験を含む充実した図
- Box 9 個でスケーリング / エクスポートの動作確認に
