Attribute VB_Name = "Module_SetupUserForm"
Option Explicit

'=============================================================================
' AddSyncControlsToBoxLevelForm
' UserForm_Box_level_Changeに連動チェックボックスを追加するセットアップ関数
' 一度だけ実行してください
'=============================================================================
Sub AddSyncControlsToBoxLevelForm()
    On Error GoTo ErrorHandler

    Dim vbProj As Object
    Dim vbComp As Object
    Dim frm As Object
    Dim ctrl As Object
    Dim hasCheckBox As Boolean

    Set vbProj = ThisWorkbook.VBProject
    Set vbComp = vbProj.VBComponents("UserForm_Box_level_Change")
    Set frm = vbComp.Designer

    ' 既存のコントロールがあるか確認
    hasCheckBox = False
    For Each ctrl In frm.Controls
        If ctrl.Name = "CheckBox_Sync" Then
            hasCheckBox = True
            Exit For
        End If
    Next ctrl

    If hasCheckBox Then
        MsgBox "連動コントロールは既に追加されています。", vbInformation
        Exit Sub
    End If

    ' フォームサイズを拡大
    frm.Height = 180
    frm.Width = 220

    ' 連動チェックボックスを追加
    Set ctrl = frm.Controls.Add("Forms.CheckBox.1", "CheckBox_Sync")
    ctrl.Left = 10
    ctrl.Top = 120
    ctrl.Width = 50
    ctrl.Height = 15
    ctrl.Caption = "連動"

    ' 同列以上オプションボタンを追加
    Set ctrl = frm.Controls.Add("Forms.OptionButton.1", "OptionButton_SyncSameAndRight")
    ctrl.Left = 70
    ctrl.Top = 120
    ctrl.Width = 70
    ctrl.Height = 15
    ctrl.Caption = "同列以上"
    ctrl.Value = True

    ' 右側のみオプションボタンを追加
    Set ctrl = frm.Controls.Add("Forms.OptionButton.1", "OptionButton_SyncRightOnly")
    ctrl.Left = 140
    ctrl.Top = 120
    ctrl.Width = 70
    ctrl.Height = 15
    ctrl.Caption = "右側のみ"

    MsgBox "連動コントロールを追加しました。" & vbCrLf & _
           "・CheckBox_Sync (連動ON/OFF)" & vbCrLf & _
           "・OptionButton_SyncSameAndRight (同列以上)" & vbCrLf & _
           "・OptionButton_SyncRightOnly (右側のみ)", vbInformation

    Exit Sub

ErrorHandler:
    MsgBox "エラーが発生しました: " & Err.Description & vbCrLf & vbCrLf & _
           "VBAプロジェクトへのアクセスが許可されているか確認してください。" & vbCrLf & _
           "Excel → ファイル → オプション → トラストセンター → マクロの設定" & vbCrLf & _
           "「VBAプロジェクトオブジェクトモデルへのアクセスを信頼する」を有効にしてください。", vbCritical
End Sub

'=============================================================================
' RemoveSyncControlsFromBoxLevelForm
' 追加したコントロールを削除する（元に戻す場合用）
'=============================================================================
Sub RemoveSyncControlsFromBoxLevelForm()
    On Error Resume Next

    Dim vbProj As Object
    Dim vbComp As Object
    Dim frm As Object

    Set vbProj = ThisWorkbook.VBProject
    Set vbComp = vbProj.VBComponents("UserForm_Box_level_Change")
    Set frm = vbComp.Designer

    ' コントロールを削除
    frm.Controls.Remove "CheckBox_Sync"
    frm.Controls.Remove "OptionButton_SyncSameAndRight"
    frm.Controls.Remove "OptionButton_SyncRightOnly"

    ' フォームサイズを元に戻す
    frm.Height = 120
    frm.Width = 140

    MsgBox "連動コントロールを削除しました。", vbInformation
End Sub
