VERSION 5.00
Begin {C62A69F0-16DC-11CE-9E98-00AA00574A4F} toolbar 
   Caption         =   "UserForm2"
   ClientHeight    =   570
   ClientLeft      =   120
   ClientTop       =   465
   ClientWidth     =   5550
   OleObjectBlob   =   "toolbar.frx":0000
   StartUpPosition =   1  'オーナー フォームの中央
End
Attribute VB_Name = "toolbar"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Explicit

Private Sub btnMakeFig_Click()
    Main_making_TEM_Fig_from_data
End Sub

Private Sub btnAddBox_Click()
    UserForm_AddBox.Show 0
End Sub

Private Sub btnAddLine_Click()
    UserForm_Make_Line.Show 0
End Sub

Private Sub btnAddSDSG_Click()
    UserForm_Make_SD_SG.Show 0
End Sub

Private Sub btnSettings_Click()
    UserForm_General_Setting.Show 0
End Sub

Private Sub btnLevel_Click()
    UserForm_Box_level_Change.Show 0
End Sub

