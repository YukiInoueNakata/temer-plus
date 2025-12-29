Attribute VB_Name = "Module_adj_Box_level"
Option Explicit

'@description("Rectangle �̏ꍇ�AAdjustItemAndTimeLevel �֐����Ăяo��")
Sub AdjustSelectedRectangles(adjItemLevel As Double, adjTimeLevel As Double, isUp As Boolean)
    Dim shp As shape
    
    '�I������Ă���}�`��1�ȏォ�m�F
    If get_count_selected_shape() = 0 Then
        MsgBox "�}�`���I������Ă��܂���B"
        Exit Sub
    End If
    
    For Each shp In Selection.ShapeRange
        If shp.Type = msoAutoShape Then
            If shp.AutoShapeType = msoShapeRectangle Then
                ' Rectangle �̏ꍇ�AAdjustItemAndTimeLevel �֐����Ăяo��Box�̈ʒu�𒲐�
                AdjustBoxOnItemAndTimeLevel shp, isUp, adjItemLevel, adjTimeLevel
                ' Rectangle �̏ꍇ�A�Ώ�Box�Ɋւ��SD/SG�CLine�̈ʒu�𒲐�
                'AdjustRelationShpOnItemAndTimeLevel shp, isUp, adjItemLevel, adjTimeLevel
            End If
        End If
    Next shp
        

End Sub

'@description("")
Sub AdjustBoxOnItemAndTimeLevel(shp As shape, isUp As Boolean, adjItemLevel As Double, adjTimeLevel As Double)
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Sheets("Data")
    Dim shp_Name As String
    
    ' Item_Level �𒲐�
    Dim itemCell As Range
    Set itemCell = GetWriteCellFromValue_typeAndshp_IDorItem(ws, "Item_Level", shp.Name)

    If Not itemCell Is Nothing Then

        itemCell.value = itemCell.value + IIf(isUp, adjItemLevel, -adjItemLevel)

    End If
    
    ' Time_Level �𒲐�
    Dim timeCell As Range
    Set timeCell = GetWriteCellFromValue_typeAndshp_IDorItem(ws, "Time_Level", shp.Name)
    If Not timeCell Is Nothing Then
        timeCell.value = timeCell.value + IIf(isUp, adjTimeLevel, -adjTimeLevel)
    End If
    
    ' �}�`�̈ʒu�𒲐�
    Dim rectWidth As Integer
    rectWidth = GetValueOfSearchValue("ItemBox_Width", GetDimensionValue)
    
    Dim Change_shp_Top As Double
    Change_shp_Top = IIf(isUp, -adjItemLevel, adjItemLevel) * Func_vertical_level_size()
    
    Dim Change_shp_Left As Double
    Change_shp_Left = IIf(isUp, adjTimeLevel, -adjTimeLevel) * (Func_time_level_size() + rectWidth)
    shp.Top = shp.Top + Change_shp_Top
    shp.Left = shp.Left + Change_shp_Left
    
    shp_Name = shp.Name

    Call adj_relation_SDSG_Line(shp, shp_Name, Change_shp_Top, Change_shp_Left)

    ' 連動チェックボックスがONの場合、右側の図形を一括移動
    On Error Resume Next
    If UserForm_Box_level_Change.CheckBox_Sync.Value = True Then
        Dim baseTimeLevel As Double
        Dim includeSame As Boolean

        ' 移動後のTime_Levelを取得
        baseTimeLevel = Datash_GetValueOfSearchValue(shp_Name, "Time_Level")

        ' 範囲選択（同列以上 or 右側のみ）
        includeSame = UserForm_Box_level_Change.OptionButton_SyncSameAndRight.Value

        Call MoveRightSideShapes(baseTimeLevel, Change_shp_Left, Change_shp_Top, includeSame, shp_Name)
    End If
    On Error GoTo 0

End Sub
Sub adj_relation_SDSG_Line(shp As shape, shp_Name As String, Change_shp_Top As Double, Change_shp_Left As Double)
    Dim DataWs As Worksheet
    Dim lastRow As Long, i As Long
    Dim idColumn As Integer, typeColumn As Integer, fromColumn As Integer, toColumn As Integer
    Dim matchingIds As New Collection
    Dim matchingIdShp As String
    
       
    Set DataWs = ThisWorkbook.Sheets("Data")
    
    ' �񌩏o����T��
    For i = 1 To DataWs.Cells(1, Columns.count).End(xlToLeft).Column
        If DataWs.Cells(1, i).value = "ID" Then
            idColumn = i
        ElseIf DataWs.Cells(1, i).value = "Type" Then
            typeColumn = i
        ElseIf DataWs.Cells(1, i).value = "From_shp_Name" Then
            fromColumn = i
        ElseIf DataWs.Cells(1, i).value = "To_shp_Name" Then
            toColumn = i
        End If
    Next i
    
    ' �ŏI�s��T��
    lastRow = DataWs.Cells(DataWs.Rows.count, idColumn).End(xlUp).row
    
    ' �������m�F���A�����ɍ��v����ID���R���N�V�����ɒǉ�
    For i = 2 To lastRow
       
        
        If ((DataWs.Cells(i, typeColumn).value = "SD" Or DataWs.Cells(i, typeColumn).value = "SG") _
            And (DataWs.Cells(i, fromColumn).value = shp_Name Or DataWs.Cells(i, toColumn).value = shp_Name)) Then
            'debug.print "ID"; DataWs.Cells(i, idColumn).Value
            
            matchingIdShp = DataWs.Cells(i, idColumn).value
            Call MoveSDSG(matchingIdShp, Change_shp_Top, Change_shp_Left)
            
            
        End If
        
        
        Dim cellValue As String
        cellValue = DataWs.Cells(i, typeColumn).value

        If (cellValue = "�������" Or cellValue = "�_�����") Then
            If (DataWs.Cells(i, fromColumn).value = shp_Name Or DataWs.Cells(i, toColumn).value = shp_Name) Then
                matchingIdShp = DataWs.Cells(i, idColumn).value
                MoveLine matchingIdShp
            End If
        End If
        
    Next i
End Sub

    
Function GetMatchingIds(shp_Name As String, Change_shp_Top As Double, Change_shp_Left As Double) As Collection

    
    Set GetMatchingIds = matchingIds
End Function



Sub MoveSDSG(matchingIdShp As String, Change_shp_Top As Double, Change_shp_Left As Double)
    Dim ws As Worksheet
    Dim shp As shape
    
    ' Makefig�V�[�g��ݒ�
    Set ws = ThisWorkbook.Sheets("MakeFig")
    
    ' �w�肳�ꂽ���O�̐}�`���������A�ʒu�𒲐�
    For Each shp In ws.Shapes
        If shp.Name = matchingIdShp Then
        
            ' .Top��.Left��ύX
            shp.Top = shp.Top + Change_shp_Top
            shp.Left = shp.Left + Change_shp_Left
            

            
            Exit For                             ' �Y������}�`�����������烋�[�v�𔲂���
        End If
    Next shp
End Sub


'@description("newBeginX��newBeginY��newEndX��newEndY�Ɋ�Â��āAmyConnector���ړ�")
Sub MoveLineNewPosition(myConnector As shape, _
                        newBeginX As Double, newBeginY As Double, _
                        newEndX As Double, newEndY As Double)
    '@todo time���x����3�������ۂɖ�肠��
    With myConnector

        '        Debug.Print
        '        'debug.print "�Â�Shape�ʒu"
        '        Debug.Print
        '        'debug.print ".Left"; .Left
        '        'debug.print ".Top"; .Top
        '        'debug.print ".Width"; .Width
        '        'debug.print ".Height"; .Height
        '
        '        Debug.Print
        '        'debug.print ".VerticalFlip"; .VerticalFlip
        '        'debug.print ".HorizontalFlip"; .HorizontalFlip
        '        Debug.Print
        '        'debug.print "Min(newBeginX, newEndX)"; Min(newBeginX, newEndX)
        '        'debug.print "Min(newBeginY, newEndY)"; Min(newBeginY, newBeginY)
        '        'debug.print "Abs(newBeginX - newEndX)"; Abs(newBeginX - newEndX)
        '        'debug.print "Abs(newBeginY - newEndY)"; Abs(newBeginY - newEndY)
        '        Debug.Print
        
        .Left = Min(newBeginX, newEndX)          ' �I�u�W�F�N�g�̍��[
        .Top = Min(newBeginY, newEndY)           ' �I�u�W�F�N�g�̏�[
        .Width = Abs(newBeginX - newEndX)        ' �I�u�W�F�N�g�̕�
        .Height = Abs(newBeginY - newEndY)       ' �I�u�W�F�N�g�̍���
        
        '    Debug.Print
        '    'debug.print "newBeginY"; newBeginY
        '    'debug.print "newEndY"; newEndY
        '    'debug.print ".VerticalFlip"; .VerticalFlip
    
    
        If newBeginY > newEndY Then
            If .VerticalFlip = 0 Then
                .Flip msoFlipVertical
            End If
        ElseIf newBeginY < newEndY Then
            If .VerticalFlip = -1 Then
                .Flip msoFlipVertical
            End If
    
        End If
        
        '    Debug.Print
        '    'debug.print "�V����Shape�ʒu"
        '    Debug.Print
        '    'debug.print ".Left"; .Left
        '    'debug.print ".Top"; .Top
        '    'debug.print ".Width"; .Width
        '    'debug.print ".Height"; .Height
        '
        '    Debug.Print
        '    'debug.print ".VerticalFlip"; .VerticalFlip
        '    'debug.print ".HorizontalFlip"; .HorizontalFlip
        '    Debug.Print


    End With

End Sub

Private Function Min(A As Double, b As Double) As Double

    Min = IIf(A < b, A, b)

End Function

Sub testMoveLine()
    
       
    Call MoveLine("RLine_Item1_OPP1_1", 0, 0, 0, -50)

End Sub



Sub MoveLine(matchingIdShp As String)
    Dim ws As Worksheet
    Dim shp As Shape
    Set ws = ThisWorkbook.Sheets("MakeFig")

    Dim FromShp As Shape
    Dim ToShp As Shape
    Dim Start_Margin As Double
    Dim Adj_Start_Height As Double
    Dim End_Margin As Double
    Dim Adj_End_Height As Double
    Dim Change_Start_shp_Left As Double
    Dim Change_Start_shp_Top As Double
    Dim Change_End_shp_Left As Double
    Dim Change_End_shp_Top As Double

    Dim FromShpName As String
    Dim ToShpName As String

    FromShpName = Datash_GetValueOfSearchValue(matchingIdShp, "From_shp_Name")
    ToShpName = Datash_GetValueOfSearchValue(matchingIdShp, "To_shp_Name")

    Start_Margin = Datash_GetValueOfSearchValue(matchingIdShp, "Start_Margin")
    Adj_Start_Height = Datash_GetValueOfSearchValue(matchingIdShp, "Adj_Start_Height")
    End_Margin = Datash_GetValueOfSearchValue(matchingIdShp, "End_Margin")
    Adj_End_Height = Datash_GetValueOfSearchValue(matchingIdShp, "Adj_End_Height")

    ' FromShpを取得（Nullチェック追加）
    Set FromShp = FindShapeByName(FromShpName)
    If FromShp Is Nothing Then
        Debug.Print "FromShp not found for: "; matchingIdShp
        Exit Sub
    End If

    ' ToShpを取得（Nullチェック追加）
    Set ToShp = FindShapeByName(ToShpName)
    If ToShp Is Nothing Then
        Debug.Print "ToShp not found for: "; matchingIdShp
        Exit Sub
    End If

    ' Time_Level比較: FromShpがToShpより右にある場合、Dataシートを更新
    Dim FromTimeLevel As Double
    Dim ToTimeLevel As Double
    FromTimeLevel = Datash_GetValueOfSearchValue(FromShp.Name, "Time_Level")
    ToTimeLevel = Datash_GetValueOfSearchValue(ToShp.Name, "Time_Level")

    If FromTimeLevel > ToTimeLevel Then
        ' From/Toを入れ替え（Dataシートを更新）
        Call SwapFromToInDataSheet(matchingIdShp, FromShpName, ToShpName)

        ' 変数も入れ替え
        Dim tempShp As Shape
        Set tempShp = FromShp
        Set FromShp = ToShp
        Set ToShp = tempShp

        ' Marginも入れ替え
        Dim tempMargin As Double, tempHeight As Double
        tempMargin = Start_Margin
        Start_Margin = End_Margin
        End_Margin = tempMargin
        tempHeight = Adj_Start_Height
        Adj_Start_Height = Adj_End_Height
        Adj_End_Height = tempHeight
    End If

    ' 通常の座標計算（From→To の順序が正しい状態）
    Change_Start_shp_Left = CalculateCoordinates("Start", FromShp, Start_Margin, Adj_Start_Height)(0)
    Change_Start_shp_Top = CalculateCoordinates("Start", FromShp, Start_Margin, Adj_Start_Height)(1)
    Change_End_shp_Left = CalculateCoordinates("End", ToShp, End_Margin, Adj_End_Height)(0)
    Change_End_shp_Top = CalculateCoordinates("End", ToShp, End_Margin, Adj_End_Height)(1)

    ' 矢印図形を取得（Nullチェック追加）
    Set shp = FindShapeByName(matchingIdShp)
    If shp Is Nothing Then
        Debug.Print "Line shape not found: "; matchingIdShp
        Exit Sub
    End If

    ' 矢印の位置を変更
    Call MoveLineNewPosition(shp, Change_Start_shp_Left, Change_Start_shp_Top, Change_End_shp_Left, Change_End_shp_Top)
End Sub

'=============================================================================
' SwapFromToInDataSheet - DataシートのFrom_shp_NameとTo_shp_Nameを入れ替える
'=============================================================================
Sub SwapFromToInDataSheet(ByVal lineId As String, ByVal fromName As String, ByVal toName As String)
    Dim wsData As Worksheet
    Dim fromCell As Range, toCell As Range
    Dim startMarginCell As Range, endMarginCell As Range
    Dim adjStartCell As Range, adjEndCell As Range
    Dim tempVal As Variant

    Set wsData = ThisWorkbook.Sheets("Data")

    ' From/Toセルを取得
    Set fromCell = GetWriteCellFromValue_typeAndshp_IDorItem(wsData, "From_shp_Name", lineId)
    Set toCell = GetWriteCellFromValue_typeAndshp_IDorItem(wsData, "To_shp_Name", lineId)

    If Not fromCell Is Nothing And Not toCell Is Nothing Then
        ' From/Toを入れ替え
        fromCell.Value = toName
        toCell.Value = fromName
    End If

    ' Start_Margin/End_Marginも入れ替え
    Set startMarginCell = GetWriteCellFromValue_typeAndshp_IDorItem(wsData, "Start_Margin", lineId)
    Set endMarginCell = GetWriteCellFromValue_typeAndshp_IDorItem(wsData, "End_Margin", lineId)

    If Not startMarginCell Is Nothing And Not endMarginCell Is Nothing Then
        tempVal = startMarginCell.Value
        startMarginCell.Value = endMarginCell.Value
        endMarginCell.Value = tempVal
    End If

    ' Adj_Start_Height/Adj_End_Heightも入れ替え
    Set adjStartCell = GetWriteCellFromValue_typeAndshp_IDorItem(wsData, "Adj_Start_Height", lineId)
    Set adjEndCell = GetWriteCellFromValue_typeAndshp_IDorItem(wsData, "Adj_End_Height", lineId)

    If Not adjStartCell Is Nothing And Not adjEndCell Is Nothing Then
        tempVal = adjStartCell.Value
        adjStartCell.Value = adjEndCell.Value
        adjEndCell.Value = tempVal
    End If

    Debug.Print "Swapped From/To for: "; lineId; " ("; fromName; " <-> "; toName; ")"
End Sub

'=============================================================================
' MoveRightSideShapes - 連動機能: 右側の全図形を移動
' baseTimeLevel: 基準となるTime_Level
' changeLeft: 左右移動量
' changeTop: 上下移動量
' includeSameLevel: True=同列以上(>=), False=右側のみ(>)
'=============================================================================
Sub MoveRightSideShapes(ByVal baseTimeLevel As Double, ByVal changeLeft As Double, _
                        ByVal changeTop As Double, ByVal includeSameLevel As Boolean, _
                        ByVal excludeShpName As String)
    Dim wsData As Worksheet, wsFig As Worksheet
    Dim lastRow As Long, row As Long
    Dim shpTimeLevel As Double, shpName As String
    Dim shouldMove As Boolean
    Dim idCol As Integer, timeLevelCol As Integer
    Dim shp As Shape

    Set wsData = ThisWorkbook.Sheets("Data")
    Set wsFig = ThisWorkbook.Sheets("MakeFig")

    ' 列を特定
    idCol = FindItemColumn(wsData, "ID")
    timeLevelCol = FindItemColumn(wsData, "Time_Level")

    lastRow = wsData.Cells(wsData.Rows.Count, idCol).End(xlUp).row

    For row = 2 To lastRow
        shpName = CStr(wsData.Cells(row, idCol).Value)

        ' 自分自身は除外
        If shpName = excludeShpName Then GoTo NextRow

        shpTimeLevel = Val(wsData.Cells(row, timeLevelCol).Value)

        ' 連動範囲の判定
        If includeSameLevel Then
            shouldMove = (shpTimeLevel >= baseTimeLevel)  ' 同列以上
        Else
            shouldMove = (shpTimeLevel > baseTimeLevel)   ' 右側のみ
        End If

        If shouldMove Then
            ' 図形を移動
            On Error Resume Next
            Set shp = wsFig.Shapes(shpName)
            If Not shp Is Nothing Then
                shp.Left = shp.Left + changeLeft
                shp.Top = shp.Top + changeTop
            End If
            On Error GoTo 0
        End If
NextRow:
    Next row
End Sub
