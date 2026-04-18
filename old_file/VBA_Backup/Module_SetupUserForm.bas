Attribute VB_Name = "Module_SetupUserForm"
Option Explicit

'=============================================================================
' AddSyncControlsToBoxLevelForm
' UserForm_Box_level_Change ni rendou checkbox wo tsuika suru setup kansuu
' Ichido dake jikkou shite kudasai
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

    ' Check if controls already exist
    hasCheckBox = False
    For Each ctrl In frm.Controls
        If ctrl.Name = "CheckBox_Sync" Then
            hasCheckBox = True
            Exit For
        End If
    Next ctrl

    If hasCheckBox Then
        MsgBox "Rendou controls wa sudeni tsuika sarete imasu.", vbInformation
        Exit Sub
    End If

    ' Expand form size
    frm.Height = 180
    frm.Width = 220

    ' Add Sync CheckBox
    Set ctrl = frm.Controls.Add("Forms.CheckBox.1", "CheckBox_Sync")
    ctrl.Left = 10
    ctrl.Top = 120
    ctrl.Width = 50
    ctrl.Height = 15
    ctrl.Caption = "Sync"

    ' Add SameAndRight OptionButton
    Set ctrl = frm.Controls.Add("Forms.OptionButton.1", "OptionButton_SyncSameAndRight")
    ctrl.Left = 70
    ctrl.Top = 120
    ctrl.Width = 70
    ctrl.Height = 15
    ctrl.Caption = "Same+"
    ctrl.Value = True

    ' Add RightOnly OptionButton
    Set ctrl = frm.Controls.Add("Forms.OptionButton.1", "OptionButton_SyncRightOnly")
    ctrl.Left = 140
    ctrl.Top = 120
    ctrl.Width = 70
    ctrl.Height = 15
    ctrl.Caption = "Right only"

    MsgBox "Rendou controls wo tsuika shimashita." & vbCrLf & _
           "- CheckBox_Sync (Rendou ON/OFF)" & vbCrLf & _
           "- OptionButton_SyncSameAndRight (Douretu ijou)" & vbCrLf & _
           "- OptionButton_SyncRightOnly (Migigawa nomi)", vbInformation

    Exit Sub

ErrorHandler:
    MsgBox "Error: " & Err.Description & vbCrLf & vbCrLf & _
           "VBA Project access ga kyoka sarete iru ka kakunin shite kudasai." & vbCrLf & _
           "Excel -> File -> Options -> Trust Center -> Macro Settings" & vbCrLf & _
           "'Trust access to the VBA project object model' wo yuukou ni shite kudasai.", vbCritical
End Sub

'=============================================================================
' RemoveSyncControlsFromBoxLevelForm
' Tsuika shita controls wo sakujo suru (moto ni modosu baai you)
'=============================================================================
Sub RemoveSyncControlsFromBoxLevelForm()
    On Error Resume Next

    Dim vbProj As Object
    Dim vbComp As Object
    Dim frm As Object

    Set vbProj = ThisWorkbook.VBProject
    Set vbComp = vbProj.VBComponents("UserForm_Box_level_Change")
    Set frm = vbComp.Designer

    ' Remove controls
    frm.Controls.Remove "CheckBox_Sync"
    frm.Controls.Remove "OptionButton_SyncSameAndRight"
    frm.Controls.Remove "OptionButton_SyncRightOnly"

    ' Reset form size
    frm.Height = 120
    frm.Width = 140

    MsgBox "Rendou controls wo sakujo shimashita.", vbInformation
End Sub
