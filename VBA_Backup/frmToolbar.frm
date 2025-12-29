VERSION 5.00
Begin {C62A69F0-16DC-11CE-9E98-00AA00574A4F} frmToolbar 
   Caption         =   "UserForm1"
   ClientHeight    =   3015
   ClientLeft      =   120
   ClientTop       =   465
   ClientWidth     =   4560
   OleObjectBlob   =   "frmToolbar.frx":0000
   StartUpPosition =   1  'オーナー フォームの中央
End
Attribute VB_Name = "frmToolbar"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Explicit

'=============================================================================
' frmToolbar - フローティングツールバー
' 用途: MakeFigシートでよく使う機能をワンクリックで実行
'=============================================================================

Private Sub UserForm_Initialize()
    ' フォームをツールバー風に設定
    Me.Caption = "TEMerPlus ツールバー"
    Me.Width = 350
    Me.Height = 40
    Me.StartUpPosition = 0 ' 手動配置
    Me.Top = 50
    Me.Left = 100
End Sub

Private Sub btnMakeFig_Click()
    ' 図を一括作成
    Call Main_making_TEM_Fig_Optimized
End Sub

Private Sub btnAddBox_Click()
    ' Box追加フォームを表示
    UserForm_AddBox.Show vbModeless
End Sub

Private Sub btnAddLine_Click()
    ' 線追加フォームを表示
    UserForm_Make_Line.Show vbModeless
End Sub

Private Sub btnAddSDSG_Click()
    ' SD/SG追加フォームを表示
    UserForm_Make_SD_SG.Show vbModeless
End Sub

Private Sub btnSettings_Click()
    ' 設定フォームを表示
    UserForm_General_Setting.Show vbModeless
End Sub

Private Sub btnLevel_Click()
    ' レベル調整フォームを表示
    UserForm_Box_level_Change.Show vbModeless
End Sub

