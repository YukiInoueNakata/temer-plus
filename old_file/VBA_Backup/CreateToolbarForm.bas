Attribute VB_Name = "CreateToolbarForm"
Option Explicit

'===========================================
' frmToolbar作成用コード
' このコードを実行してフローティングツールバーを作成
'===========================================

Sub CreateFrmToolbar()
    '===========================================
    ' 設定項目（ここを編集）
    '===========================================
    Const FORM_NAME As String = "frmToolbar"
    Const FORM_CAPTION As String = ""
    Const FORM_WIDTH As Single = 310
    Const FORM_HEIGHT As Single = 68

    Const BTN_COUNT As Integer = 6
    Const COLS As Integer = 6

    ' ボタンサイズ
    Const BTN_WIDTH As Single = 42
    Const BTN_HEIGHT As Single = 17

    ' 余白・間隔
    Const MARGIN_LEFT As Single = 5
    Const MARGIN_TOP As Single = 5
    Const GAP_H As Single = 3
    Const GAP_V As Single = 3

    '===========================================
    ' ボタン定義
    '===========================================
    Dim btnNames(1 To 6) As String
    Dim btnCaptions(1 To 6) As String

    btnNames(1) = "btnMakeFig": btnCaptions(1) = "図作成"
    btnNames(2) = "btnAddBox": btnCaptions(2) = "Box追加"
    btnNames(3) = "btnAddLine": btnCaptions(3) = "線追加"
    btnNames(4) = "btnAddSDSG": btnCaptions(4) = "SD/SG"
    btnNames(5) = "btnSettings": btnCaptions(5) = "設定"
    btnNames(6) = "btnLevel": btnCaptions(6) = "レベル"

    '===========================================
    ' 処理
    '===========================================
    Dim vbComp As Object
    Dim frm As Object
    Dim btn As Object
    Dim i As Integer
    Dim row As Integer, col As Integer
    Dim posX As Single, posY As Single

    ' 既存フォームを削除
    On Error Resume Next
    ThisWorkbook.VBProject.VBComponents.Remove _
        ThisWorkbook.VBProject.VBComponents(FORM_NAME)
    On Error GoTo 0

    ' 新規フォーム作成
    Set vbComp = ThisWorkbook.VBProject.VBComponents.Add(3)
    vbComp.Name = FORM_NAME
    Set frm = vbComp.Designer

    ' フォームプロパティ
    With frm
        .Caption = FORM_CAPTION
        .Width = FORM_WIDTH
        .Height = FORM_HEIGHT
    End With

    ' ボタン配置
    For i = 1 To BTN_COUNT
        col = (i - 1) Mod COLS
        row = (i - 1) \ COLS

        posX = MARGIN_LEFT + col * (BTN_WIDTH + GAP_H)
        posY = MARGIN_TOP + row * (BTN_HEIGHT + GAP_V)

        Set btn = frm.Controls.Add("Forms.CommandButton.1", btnNames(i))
        With btn
            .Left = posX
            .Top = posY
            .Width = BTN_WIDTH
            .Height = BTN_HEIGHT
            .Caption = btnCaptions(i)
        End With
    Next i

    ' イベントコード追加
    Call AddEventCode(vbComp)

    MsgBox "frmToolbar を作成しました", vbInformation
End Sub

Private Sub AddEventCode(vbComp As Object)
    Dim codeModule As Object
    Set codeModule = vbComp.CodeModule

    Dim code As String
    code = "Private Sub btnMakeFig_Click()" & vbCrLf & _
        "    Main_making_TEM_Fig_Optimized" & vbCrLf & _
        "End Sub" & vbCrLf & vbCrLf & _
        "Private Sub btnAddBox_Click()" & vbCrLf & _
        "    UserForm_AddBox.Show 0" & vbCrLf & _
        "End Sub" & vbCrLf & vbCrLf & _
        "Private Sub btnAddLine_Click()" & vbCrLf & _
        "    UserForm_Make_Line.Show 0" & vbCrLf & _
        "End Sub" & vbCrLf & vbCrLf & _
        "Private Sub btnAddSDSG_Click()" & vbCrLf & _
        "    UserForm_Make_SD_SG.Show 0" & vbCrLf & _
        "End Sub" & vbCrLf & vbCrLf & _
        "Private Sub btnSettings_Click()" & vbCrLf & _
        "    UserForm_General_Setting.Show 0" & vbCrLf & _
        "End Sub" & vbCrLf & vbCrLf & _
        "Private Sub btnLevel_Click()" & vbCrLf & _
        "    UserForm_Box_level_Change.Show 0" & vbCrLf & _
        "End Sub"

    codeModule.AddFromString code
End Sub
