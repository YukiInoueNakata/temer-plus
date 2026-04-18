VERSION 5.00
Begin {C62A69F0-16DC-11CE-9E98-00AA00574A4F} UserForm_AddBox 
   Caption         =   "Add Box"
   ClientHeight    =   4860
   ClientLeft      =   120
   ClientTop       =   465
   ClientWidth     =   4185
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
    

    
    '選択されている図形の数を確認
    Dim shapeCount As Integer
    shapeCount = get_count_selected_shape()
    
    Select Case shapeCount
        Case 0
            MsgBox "図形が選択されていません。"
            Exit Sub
        
        Case 1
            ' 従来の処理: 1つ選択時
            Call AddBoxWith1Shape(DataWs, dict)
        
        Case 2
            ' 新機能: 2つ選択時
            Call AddBoxWith2Shapes(DataWs, dict)
        
        Case Else
            MsgBox "3つ以上の図形が選択されています。1つまたは2つの図形を選択してください。"
            Exit Sub
    End Select
                    

   
End Sub

' 1つの図形が選択されている場合の処理（従来のロジック）
Private Sub AddBoxWith1Shape(DataWs As Worksheet, dict As Object)
    Dim TargetShp As shape
    Set TargetShp = Selection.ShapeRange(1)
    
    ' CheckIfRectangle関数を使用して四角形かどうかを確認
    If Not CheckIfRectangle(TargetShp) Then
        MsgBox "選択された図形は四角形ではありません。", vbExclamation
        Exit Sub
    End If
    
    'Box作成のために，新しいBoxの情報をDataシートに入力
    Dim TargetTimeLevel As Double
    TargetTimeLevel = Datash_GetValueOfSearchValue(TargetShp.Name, "Time_Level")
    
    Dim lastRow As Long
    lastRow = DataWs.Cells(DataWs.Rows.count, FindItemColumn(DataWs, "ID")).End(xlUp).Row + 1
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
    
    'Boxを作る
    Call Make_Box(shp_ID)
    
    '線をつくる
    Dim FigWs As Worksheet
    Set FigWs = Sheets("MakeFig")
           
    ' 対象シェイプを選択
    If Me.before_Button = True Then
        FigWs.Shapes(shp_ID).Select
        TargetShp.Select Replace:=False
    Else
        TargetShp.Select
        FigWs.Shapes(shp_ID).Select Replace:=False
    End If

    ' 線を作成
    Call CreateLineForNewBox(shp_ID)
End Sub

' 2つの図形が選択されている場合の処理（新機能）
Private Sub AddBoxWith2Shapes(DataWs As Worksheet, dict As Object)
    Dim Shp1 As shape, Shp2 As shape
    Dim LeftShp As shape, RightShp As shape
    Dim TL1 As Double, TL2 As Double
    Dim NewTimeLevel As Double
    
    Set Shp1 = Selection.ShapeRange(1)
    Set Shp2 = Selection.ShapeRange(2)
    
    ' 両方とも四角形か確認
    If Not CheckIfRectangle(Shp1) Or Not CheckIfRectangle(Shp2) Then
        MsgBox "選択された図形は両方とも四角形である必要があります。", vbExclamation
        Exit Sub
    End If
    
    ' Time_Levelを取得
    TL1 = Datash_GetValueOfSearchValue(Shp1.Name, "Time_Level")
    TL2 = Datash_GetValueOfSearchValue(Shp2.Name, "Time_Level")
    
    ' 左右を判定
    If TL1 < TL2 Then
        Set LeftShp = Shp1
        Set RightShp = Shp2
    Else
        Set LeftShp = Shp2
        Set RightShp = Shp1
        ' TL1とTL2を入れ替え
        Dim tempTL As Double
        tempTL = TL1
        TL1 = TL2
        TL2 = tempTL
    End If
    
    ' モード判定
    On Error Resume Next
    Dim isInsertBetween As Boolean
    isInsertBetween = Me.OptionButton_InsertBetween.value
    On Error GoTo 0
    
    If isInsertBetween Then
        ' 間に挿入: 中間のTime_Levelに作成
        NewTimeLevel = (TL1 + TL2) / 2
    Else
        ' 移動して挿入: 右側の図形をシフト
        NewTimeLevel = TL1 + 1
        Call ShiftShapesRight(DataWs, TL1, 1)
    End If
    
    ' 新しいBoxをDataシートに追加
    Dim lastRow As Long
    lastRow = DataWs.Cells(DataWs.Rows.count, FindItemColumn(DataWs, "ID")).End(xlUp).Row + 1
    DataWs.Cells(lastRow, FindItemColumn(DataWs, "Type")) = ComboBox_BoxType.value
    DataWs.Cells(lastRow, FindItemColumn(DataWs, "Text")) = AddBox_Text.value
    DataWs.Cells(lastRow, FindItemColumn(DataWs, "Time_Level")) = NewTimeLevel
    DataWs.Cells(lastRow, FindItemColumn(DataWs, "Item_Level")) = Vertical_level_Box.value
    DataWs.Cells(lastRow, FindItemColumn(DataWs, "Height")) = TextBox_Height.value
    DataWs.Cells(lastRow, FindItemColumn(DataWs, "Width")) = TextBox_Width.value
    
    'IDをふる
    Call ID_Named
    
    Dim shp_ID As String
    shp_ID = DataWs.Cells(lastRow, FindItemColumn(DataWs, "ID")).value
    
    'Boxを作る
    Call Make_Box(shp_ID)
    
    ' 線を作成（左シェイプ→新Box→右シェイプ）
    Dim FigWs As Worksheet
    Set FigWs = Sheets("MakeFig")
    
    ' 左シェイプと新Boxを選択して線を作成
    LeftShp.Select
    FigWs.Shapes(shp_ID).Select Replace:=False
    Call CreateLineForNewBox(shp_ID)
    
    ' 新Boxと右シェイプを選択して線を作成
    FigWs.Shapes(shp_ID).Select
    RightShp.Select Replace:=False
    Call CreateLineForNewBox(shp_ID)
    
    MsgBox "2つの図形の間に新しいBoxを作成しました。", vbInformation
End Sub

' 線を作成する共通処理
Private Sub CreateLineForNewBox(shp_ID As String)
    Dim Line_Type As Integer
    Dim Start_Margin As Integer
    Dim End_Margin As Integer
    Dim Adj_Start_Height As Integer
    Dim Adj_End_Height As Integer
    Dim Add_data As Boolean
    
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

' 右側の図形をシフトする処理
Private Sub ShiftShapesRight(DataWs As Worksheet, baseTimeLevel As Double, shiftAmount As Double)
    Dim lastRow As Long, Row As Long
    Dim timeLevelCol As Integer, idCol As Integer, typeCol As Integer
    Dim shpTimeLevel As Double, shpName As String, shpType As String
    Dim FigWs As Worksheet
    Dim rectWidth As Double
    Dim shiftPixels As Double
    Dim affectedLines As Collection
    Dim lineName As Variant

    Set FigWs = ThisWorkbook.Sheets("MakeFig")
    Set affectedLines = New Collection

    timeLevelCol = FindItemColumn(DataWs, "Time_Level")
    idCol = FindItemColumn(DataWs, "ID")
    typeCol = FindItemColumn(DataWs, "Type")

    rectWidth = Val(GetValueOfSearchValue("ItemBox_Width", GetDimensionValue()))
    shiftPixels = shiftAmount * (Func_time_level_size() + rectWidth)

    lastRow = DataWs.Cells(DataWs.Rows.count, idCol).End(xlUp).Row

    ' Pass 1: Update Time_Level in Data sheet for all shapes
    For Row = 2 To lastRow
        shpTimeLevel = Val(DataWs.Cells(Row, timeLevelCol).value)

        If shpTimeLevel > baseTimeLevel Then
            DataWs.Cells(Row, timeLevelCol).value = shpTimeLevel + shiftAmount
        End If
    Next Row

    ' Pass 2: Move all shapes (Box, Line, SD/SG)
    For Row = 2 To lastRow
        shpName = CStr(DataWs.Cells(Row, idCol).value)
        shpType = CStr(DataWs.Cells(Row, typeCol).value)
        shpTimeLevel = Val(DataWs.Cells(Row, timeLevelCol).value)

        ' If Time_Level was shifted
        If shpTimeLevel > baseTimeLevel + shiftAmount Then
            On Error Resume Next

            ' Move shape horizontally
            FigWs.Shapes(shpName).Left = FigWs.Shapes(shpName).Left + shiftPixels

            ' Collect Line shapes for endpoint recalculation
            If shpType Like "*Arrow*" Or shpType Like "*Line*" Or _
               InStr(shpType, ChrW(&H5B9F)) > 0 Then
                affectedLines.Add shpName
            End If

            On Error GoTo 0
        End If
    Next Row

    ' Pass 3: Recalculate Line endpoints
    For Each lineName In affectedLines
        On Error Resume Next
        Call MoveLine(CStr(lineName))
        On Error GoTo 0
    Next lineName

    ' Pass 4 (将来): Move Labels/SubLabels with parent shapes
    ' For row = 2 To lastRow
    '     shpName = CStr(DataWs.Cells(row, idCol).value)
    '     shpTimeLevel = Val(DataWs.Cells(row, timeLevelCol).value)
    '     If shpTimeLevel > baseTimeLevel + shiftAmount Then
    '         Call MoveLabelsWithParent(shpName, shiftPixels, 0)
    '     End If
    ' Next row
End Sub


