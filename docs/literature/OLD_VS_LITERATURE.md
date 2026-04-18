# 旧TEMerPlus実装 vs 文献標準 線種マッピング照合

調査日: 2026-04-18
根拠:
- 旧実装: `old_file/VBA_Backup/Module_Make_Box.bas` `ApplyLineStyles` (L233-250)
- 文献: Arakawa 2012 図5、Kawai 2016 図1 凡例、Sato 2006 図5 ほか

---

## 結論

**旧TEMerPlusには線種マッピングの誤りがある**（主にEFPとOPPの取り違え）。Web版では**文献標準に従う**べき。

---

## 1. 旧TEMerPlus の実装

`Module_Make_Box.bas` L233-250:

```vba
Public Sub ApplyLineStyles(ByRef shp As shape, ByVal BoxType As String)
    With shp.Line
        Select Case BoxType
        Case "分岐点(BFP)", "EFP", "P-EFP", "必須通過点(OPP)"
            .Weight = 3                    ' 全て太線
            If BoxType = "必須通過点(OPP)" Then
                .Style = msoLineThinThin   ' OPP → 二重線
            ElseIf BoxType = "P-EFP" Then
                .DashStyle = msoLineDash   ' P-EFP → 点線
            End If
        Case "実際には書いてない項目"
            .Weight = 1
            .DashStyle = msoLineDash       ' 注釈用 → 細点線
        Case Else
            .Weight = 1                    ' 通常 → 細実線
        End Select
    End With
End Sub
```

### 旧実装のマッピング

| Type | 太さ | 線種 |
|---|---|---|
| 通常Item | 細(1pt) | 実線 |
| BFP | **太(3pt)** | 実線 |
| **EFP** | **太(3pt)** | **実線（単純な太線）** |
| **OPP** | 太(3pt) | **二重線** (msoLineThinThin) |
| P-EFP | 太(3pt) | 点線 |
| 注釈用 | 細(1pt) | 点線 |

---

## 2. 文献標準のマッピング

根拠:
- **Arakawa 2012 図5** （描き方の模範例「ある人と親友になった過程」）
- **Kawai 2016 図1 凡例** （右側に明示されたLegend）
- **Sato 2009** "Depicting the dynamics of living the life"

| Type | 太さ | 線種 |
|---|---|---|
| 通常Item | 細 | 実線 |
| BFP | 細〜中 | **実線長方形** または **楕円** |
| **EFP** | 中 | **二重線長方形** |
| **OPP** | **太** | **実線長方形**（単純な太線） |
| P-EFP | 細〜中 | 点線長方形 |
| 注釈用 | 細 | 点線 |

---

## 3. 差異（重要度順）

### 3.1 【致命的】EFP と OPP の線種が入れ替わっている

| | EFP | OPP |
|---|---|---|
| **文献標準** | **二重線** | 太線（単線） |
| **旧実装** | 太線（単線） | **二重線** |

→ **旧TEMerPlusでEFPとOPPを逆に描画している**。TEMの最も重要な2要素の表記が文献と食い違う。

**歴史的考察**: 旧実装の開発者は `msoLineThinThin`（二重線）を OPP（必須通過点）に使ったが、文献上は二重線は**EFP（等至点）**に使う作法。名称が似た要素なので取り違えた可能性。

### 3.2 【注意】BFPが太線固定

- 旧実装: BFP = 太線実線（Weight=3）
- 文献: BFP = **通常の細〜中線の実線**、楕円形も多い

→ 旧実装ではBFPを過度に強調している。

### 3.3 【軽微】BFPに楕円オプションなし

- 文献（Kawai 2016 ほか）では BFP を **楕円** で描く例が多い
- 旧実装は長方形固定

---

## 4. Web版（TEMer）での方針

### 4.1 **基本方針: 文献標準を採用**

旧実装のバグを引き継がず、文献で確立されたデファクト標準に従う。

```typescript
type BoxSubtype =
  | 'normal'    // 細線実線長方形
  | 'BFP'       // 細〜中線実線、長方形 or 楕円
  | 'EFP'       // 中線 二重線 長方形  ← 旧実装から変更
  | 'P-EFP'     // 細〜中線 点線 長方形
  | 'OPP'       // 太線 実線 長方形    ← 旧実装から変更
  | 'annotation' // 細線 点線（注釈用）

type BoxShape = 'rect' | 'ellipse';  // BFPは楕円も選択可
```

### 4.2 具体的な視覚仕様（提案）

| Type | 枠線 | 太さ(pt) | 備考 |
|---|---|---|---|
| normal | solid | 1.5 | 通常Item |
| BFP | solid | 1.5 | 形状: rect or ellipse |
| **EFP** | **double** | **2.5** | **二重線（最重要要素）** |
| P-EFP | dashed | 1.5 | EFPの対 |
| **OPP** | solid | **3.0** | **単純な太線** |
| annotation | dotted | 1.0 | 注釈・補足 |

### 4.3 将来拡張

- 2nd EFP / P-2nd EFP（Hosaka 2026 に準拠）
- BFP-1, BFP-2 等の自動番号採番
- EFP/P-EFP は楕円形状もオプション化

### 4.4 旧データとの互換性

旧 `.xlsm` からの移行時、Type名は保持しつつ線種だけを文献標準に**自動修正**する（ユーザに説明表示）:

```
旧Dataシートのインポート時:
- Type = "必須通過点(OPP)" → OPP（太線・単線）【線種を二重線から単線に修正】
- Type = "EFP" → EFP（中線・二重線）【線種を単線から二重線に修正】
- その他は変更なし
```

---

## 5. ユーザへの提案

Web版への移行は**バグ修正の機会**。以下のように進めるのが適切:

1. **新規作成** の場合: 無条件で文献標準を採用
2. **旧 `.xlsm` からインポート** の場合: 自動修正 + 画面に修正内容をサマリ表示
3. 互換モード（旧表記を維持したい場合）は設定で選択可能にしても良いが、推奨はOFF

### ユーザ判断が必要な点

- [ ] 文献標準に従って修正する方針で進めて良いか
- [ ] 過去の TEM図資料（`old_file/` 内の pptx 等）を見て、実際に旧実装の誤り表記のまま論文/資料に掲載されたことがあるか確認（あれば互換モードの需要があるかも）
- [ ] 旧版ユーザ（もしいれば）への移行説明は必要か

---

## 6. 関連ファイル・根拠

- **旧実装コード**: `old_file/VBA_Backup/Module_Make_Box.bas` L233-250
- **辞書シート**: 旧xlsm内 `dic_fig_type` シート（Type→Categoryマッピング）
- **文献図画像**:
  - `docs/literature/figures/Arakawa2012_p11.png` — 模範例「親友になった過程」
  - `docs/literature/figures/Kawai2016_p05.png` — 凡例明示の好例
  - `docs/literature/figures/Sato2006_p10.png` — P-EFP原図
- **調査レポート**: `docs/literature/RESEARCH_REPORT_VISUAL.md`
