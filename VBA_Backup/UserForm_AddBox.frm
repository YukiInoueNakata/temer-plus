VERSION 5.00
Begin {C62A69F0-16DC-11CE-9E98-00AA00574A4F} UserForm_AddBox 
   Caption         =   "Add Box"
   ClientHeight    =   5235
   ClientLeft      =   120
   ClientTop       =   465
   ClientWidth     =   6165
   OleObjectBlob   =   "UserForm_AddBox.frx":0000
   StartUpPosition =   1  'オーナー フォームの中央
End
Attribute VB_Name = "UserForm_AddBox"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Explicit



Private Sub UserForm_Initialize()
    '    MsgBox "Initialize Event Triggered"  ' このメッセージボックスが表示されるか確認

    Dim dict As Object
    Set dict = dic_fig_type("Box", 2)            ' 仮定: この関数がDictionaryを返す
    
    
    'コンボボックスの選択肢を設定
    If dict Is Nothing Then
        MsgBox "Dictionary is not initialized!"
    Else
        ' リストボックスにDictionaryのキーを追加
        Dim key As Variant
        For Each key In dict.Keys
            Me.ComboBox_BoxType.AddItem key

        Next key
        
    End If
    
    '線の調整関係セルの値をGeneral_Settingシートから取得
    Me.TextBox_Start_Margin.value = GetValueOfSearchValue("Line_Start_Margin", "Value")
    Me.TextBox_End_Margin.value = GetValueOfSearchValue("Line_End_Margin", "Value")
    Me.TextBox_Adj_Start_Height.value = GetValueOfSearchValue("Line_Adj_Start_Height", "Value")
    Me.TextBox_Adj_End_Height.value = GetValueOfSearchValue("Line_Adj_End_Height", "Value")

    '作成するBoxの大きさの値をGeneral_Settingシートから取得

    Me.TextBox_Width.value = GetValueOfSearchValue("ItemBox_Width", GetDimensionValue())
    Me.TextBox_Height.value = GetValueOfSearchValue("ItemBox_Height", GetDimensionValue())

End Sub


'@description("Closeボタンで閉じる")
Private Sub Close_UserForm_AddBox_Click()
    Unload Me
End Sub
Private Sub Add_Box_Click()
    Dim dict As Object
    Set dict = dic_fig_type("Box", 2)            ' この関数がDictionaryを返す
    
    Dim DataWs As Worksheet
    Set DataWs = ThisWorkbook.Sheets("Data")

    Dim itemCol As Integer
    itemCol = FindItemColumn(DataWs, "Item")
    


    ' テキストボックスの数値チェックをループで行う
    Dim tb As Control
    For Each tb In Me.Controls
        If typeName(tb) = ComboBox_BoxType Then
            If Not dict.Exists(ComboBox_BoxType.value) Then
                MsgBox "リストから選択してください" & ComboBox_BoxType.value
                tb.SetFocus
                Exit Sub
            End If
        ElseIf tb.Name = "AddBox_Text" Then
               
        ElseIf typeName(tb) = "TextBox" Then     ' コントロールがテキストボックスの場合
            If Not IsNumeric(tb.Text) Then       ' 数値でない場合
                MsgBox "数値を入力してください", vbExclamation, "入力エラー"
                tb.SetFocus
                Exit Sub
            End If
        End If
    Next tb
    

    
    '選択されている図形が1以上か確認
    If get_count_selected_shape() = 1 Then
        
        '選択されている図形が0以上か確認
    ElseIf get_count_selected_shape() = 0 Then
        MsgBox "図形が選択されていません。"
        Exit Sub
    Else
        MsgBox "2つ以上の図形が選択されています．選択されている図形を1つにしてください。"
        Exit Sub
    End If
    
    Dim TargetShp As shape
    Set TargetShp = Selection.ShapeRange(1)
    ' CheckIfRectangle関数を使用して四角形かどうかを確認
    If CheckIfRectangle(TargetShp) Then
    Else
        MsgBox "選択された図形は四角形ではありません。", vbExclamation
        Exit Sub
    End If
    
    
    'Box作成のために，新しいBoxの情報をDataシートに入力
    Dim TargetTimeLevel As Double
    
    TargetTimeLevel = Datash_GetValueOfSearchValue(TargetShp.Name, "Time_Level")
    'debug.print TargetTimeLevel
    
    Dim lastRow As Long
    lastRow = DataWs.Cells(DataWs.Rows.count, FindItemColumn(DataWs, "ID")).End(xlUp).row + 1
    DataWs.Cells(lastRow, FindItemColumn(DataWs, "Type")) = ComboBox_BoxType.value
    DataWs.Cells(lastRow, FindItemColumn(DataWs, "Text")) = AddBox_Text.value
    
    If Me.before_Button = True Then
        DataWs.Cells(lastRow, FindItemColumn(DataWs, "Time_Level")) = TargetTimeLevel - time_level_Box.value
    ElseIf After_Button = True Then
        DataWs.Cells(lastRow, FindItemColumn(DataWs, "Time_Level")) = TargetTimeLevel + time_level_Box.value
    Else
        MsgBox "作成場所を選択してください"
        Exit Sub
    End If
    
    DataWs.Cells(lastRow, FindItemColumn(DataWs, "Item_Level")) = Vertical_level_Box.value
    DataWs.Cells(lastRow, FindItemColumn(DataWs, "Height")) = TextBox_Height.value
    DataWs.Cells(lastRow, FindItemColumn(DataWs, "Width")) = TextBox_Width.value
    
    'IDをふる
    Call ID_Named
    
    Dim shp_ID As String
    shp_ID = DataWs.Cells(lastRow, FindItemColumn(DataWs, "ID")).value
    
    'Boxを作る（元のMake_Boxに戻す）
    Call Make_Box(shp_ID)
    
    
    '線をつくる
    Dim FigWs As Worksheet
        
    ' アクティブなシートを設定
    Set FigWs = Sheets("MakeFig")
           
    ' 対象シェイプを選択
    If Me.before_Button = True Then
                
        FigWs.Shapes(shp_ID).Select
        TargetShp.Select Replace:=False
    Else
        TargetShp.Select
        FigWs.Shapes(shp_ID).Select Replace:=False
    End If

    
    Dim Line_Type As Integer
    Dim Start_Margin As Integer
    Dim End_Margin As Integer
    Dim Adj_Start_Height As Integer
    Dim Adj_End_Height As Integer
    Dim Add_data  As Boolean
    
    If Real_Line_Button.value = True Then
        Line_Type = 1
    ElseIf x_Button.value = True Then
        Line_Type = 2
    Else
        MsgBox ("実線か点線か入力してください")
        Exit Sub
    End If
    
    ' 入力がすべて数値である場合、変数に値を代入
    Start_Margin = Val(TextBox_Start_Margin.Text)
    End_Margin = Val(TextBox_End_Margin.Text)
    Adj_Start_Height = Val(TextBox_Adj_Start_Height.Text)
    Adj_End_Height = Val(TextBox_Adj_End_Height.Text)
    Add_data = True
    
    ' 処理の実行
    Call Arrow_Connect_box(Line_Type, Add_data, _
                           Start_Margin, End_Margin, _
                           Adj_Start_Height, Adj_End_Height)
                    

   
End Sub


