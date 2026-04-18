Attribute VB_Name = "Module_adj_Box_level"
Option Explicit

'@description("Rectangle no baai, AdjustItemAndTimeLevel kansuu wo yobidasu")
Sub AdjustSelectedRectangles(adjItemLevel As Double, adjTimeLevel As Double, isUp As Boolean)
    Dim shp As Shape

    ' Check if at least one shape is selected
    If get_count_selected_shape() = 0 Then
        MsgBox "No shape selected."
        Exit Sub
    End If

    For Each shp In Selection.ShapeRange
        If shp.Type = msoAutoShape Then
            If shp.AutoShapeType = msoShapeRectangle Then
                ' Rectangle: call AdjustBoxOnItemAndTimeLevel
                AdjustBoxOnItemAndTimeLevel shp, isUp, adjItemLevel, adjTimeLevel
            End If
        End If
    Next shp

End Sub

'@description("")
Sub AdjustBoxOnItemAndTimeLevel(shp As Shape, isUp As Boolean, adjItemLevel As Double, adjTimeLevel As Double)
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Sheets("Data")
    Dim shp_Name As String

    ' Adjust Item_Level
    Dim itemCell As Range
    Set itemCell = GetWriteCellFromValue_typeAndshp_IDorItem(ws, "Item_Level", shp.Name)

    If Not itemCell Is Nothing Then
        itemCell.Value = itemCell.Value + IIf(isUp, adjItemLevel, -adjItemLevel)
    End If

    ' Adjust Time_Level
    Dim timeCell As Range
    Set timeCell = GetWriteCellFromValue_typeAndshp_IDorItem(ws, "Time_Level", shp.Name)
    If Not timeCell Is Nothing Then
        timeCell.Value = timeCell.Value + IIf(isUp, adjTimeLevel, -adjTimeLevel)
    End If

    ' Adjust shape position
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

    ' Sync checkbox: move right side shapes together
    On Error Resume Next
    If UserForm_Box_level_Change.CheckBox_Sync.Value = True Then
        Dim baseTimeLevel As Double
        Dim includeSame As Boolean

        ' Get Time_Level after move
        baseTimeLevel = Datash_GetValueOfSearchValue(shp_Name, "Time_Level")

        ' Range selection (same level or right only)
        includeSame = UserForm_Box_level_Change.OptionButton_SyncSameAndRight.Value

        Call MoveRightSideShapes(baseTimeLevel, Change_shp_Left, Change_shp_Top, includeSame, shp_Name)
    End If
    On Error GoTo 0

End Sub

Sub adj_relation_SDSG_Line(shp As Shape, shp_Name As String, Change_shp_Top As Double, Change_shp_Left As Double)
    Dim DataWs As Worksheet
    Dim lastRow As Long, i As Long
    Dim idColumn As Integer, typeColumn As Integer, fromColumn As Integer, toColumn As Integer
    Dim matchingIds As New Collection
    Dim matchingIdShp As String


    Set DataWs = ThisWorkbook.Sheets("Data")

    ' Find column indices
    For i = 1 To DataWs.Cells(1, Columns.Count).End(xlToLeft).Column
        If DataWs.Cells(1, i).Value = "ID" Then
            idColumn = i
        ElseIf DataWs.Cells(1, i).Value = "Type" Then
            typeColumn = i
        ElseIf DataWs.Cells(1, i).Value = "From_shp_Name" Then
            fromColumn = i
        ElseIf DataWs.Cells(1, i).Value = "To_shp_Name" Then
            toColumn = i
        End If
    Next i

    ' Find last row
    lastRow = DataWs.Cells(DataWs.Rows.Count, idColumn).End(xlUp).Row

    ' Check conditions and add matching IDs to collection
    For i = 2 To lastRow

        If ((DataWs.Cells(i, typeColumn).Value = "SD" Or DataWs.Cells(i, typeColumn).Value = "SG") _
            And (DataWs.Cells(i, fromColumn).Value = shp_Name Or DataWs.Cells(i, toColumn).Value = shp_Name)) Then

            matchingIdShp = DataWs.Cells(i, idColumn).Value
            Call MoveSDSG(matchingIdShp, Change_shp_Top, Change_shp_Left)
        End If

        Dim cellValue As String
        cellValue = DataWs.Cells(i, typeColumn).Value

        ' Check for arrow types (jissen yajirushi / tensen yajirushi)
        If (cellValue = ChrW(&H5B9F) & ChrW(&H7DDA) & ChrW(&H77E2) & ChrW(&H5370) Or _
            cellValue = ChrW(&H70B9) & ChrW(&H7DDA) & ChrW(&H77E2) & ChrW(&H5370)) Then
            If (DataWs.Cells(i, fromColumn).Value = shp_Name Or DataWs.Cells(i, toColumn).Value = shp_Name) Then
                matchingIdShp = DataWs.Cells(i, idColumn).Value
                MoveLine matchingIdShp
            End If
        End If

    Next i
End Sub


Function GetMatchingIds(shp_Name As String, Change_shp_Top As Double, Change_shp_Left As Double) As Collection
    Dim matchingIds As New Collection
    Set GetMatchingIds = matchingIds
End Function



Sub MoveSDSG(matchingIdShp As String, Change_shp_Top As Double, Change_shp_Left As Double)
    Dim ws As Worksheet
    Dim shp As Shape

    ' Set MakeFig sheet
    Set ws = ThisWorkbook.Sheets("MakeFig")

    ' Find shape by name and adjust position
    For Each shp In ws.Shapes
        If shp.Name = matchingIdShp Then
            shp.Top = shp.Top + Change_shp_Top
            shp.Left = shp.Left + Change_shp_Left
            Exit For
        End If
    Next shp
End Sub


'@description("Move connector based on newBeginX, newBeginY, newEndX, newEndY")
Sub MoveLineNewPosition(myConnector As Shape, _
                        newBeginX As Double, newBeginY As Double, _
                        newEndX As Double, newEndY As Double)
    With myConnector
        .Left = Min(newBeginX, newEndX)
        .Top = Min(newBeginY, newEndY)
        .Width = Abs(newBeginX - newEndX)
        .Height = Abs(newBeginY - newEndY)

        If newBeginY > newEndY Then
            If .VerticalFlip = 0 Then
                .Flip msoFlipVertical
            End If
        ElseIf newBeginY < newEndY Then
            If .VerticalFlip = -1 Then
                .Flip msoFlipVertical
            End If
        End If
    End With
End Sub

Private Function Min(A As Double, B As Double) As Double
    Min = IIf(A < B, A, B)
End Function

Sub testMoveLine()
    Call MoveLine("RLine_Item1_OPP1_1")
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

    ' Get FromShp (with Null check)
    Set FromShp = FindShapeByName(FromShpName)
    If FromShp Is Nothing Then
        Debug.Print "FromShp not found for: "; matchingIdShp
        Exit Sub
    End If

    ' Get ToShp (with Null check)
    Set ToShp = FindShapeByName(ToShpName)
    If ToShp Is Nothing Then
        Debug.Print "ToShp not found for: "; matchingIdShp
        Exit Sub
    End If

    ' Compare Time_Level: If FromShp is to the right of ToShp, update Data sheet
    Dim FromTimeLevel As Double
    Dim ToTimeLevel As Double
    FromTimeLevel = Datash_GetValueOfSearchValue(FromShp.Name, "Time_Level")
    ToTimeLevel = Datash_GetValueOfSearchValue(ToShp.Name, "Time_Level")

    If FromTimeLevel > ToTimeLevel Then
        ' Swap From/To (update Data sheet)
        Call SwapFromToInDataSheet(matchingIdShp, FromShpName, ToShpName)

        ' Swap variables too
        Dim tempShp As Shape
        Set tempShp = FromShp
        Set FromShp = ToShp
        Set ToShp = tempShp

        ' Swap Margins too
        Dim tempMargin As Double, tempHeight As Double
        tempMargin = Start_Margin
        Start_Margin = End_Margin
        End_Margin = tempMargin
        tempHeight = Adj_Start_Height
        Adj_Start_Height = Adj_End_Height
        Adj_End_Height = tempHeight
    End If

    ' Normal coordinate calculation (From->To order is correct)
    Change_Start_shp_Left = CalculateCoordinates("Start", FromShp, Start_Margin, Adj_Start_Height)(0)
    Change_Start_shp_Top = CalculateCoordinates("Start", FromShp, Start_Margin, Adj_Start_Height)(1)
    Change_End_shp_Left = CalculateCoordinates("End", ToShp, End_Margin, Adj_End_Height)(0)
    Change_End_shp_Top = CalculateCoordinates("End", ToShp, End_Margin, Adj_End_Height)(1)

    ' Get arrow shape (with Null check)
    Set shp = FindShapeByName(matchingIdShp)
    If shp Is Nothing Then
        Debug.Print "Line shape not found: "; matchingIdShp
        Exit Sub
    End If

    ' Change arrow position
    Call MoveLineNewPosition(shp, Change_Start_shp_Left, Change_Start_shp_Top, Change_End_shp_Left, Change_End_shp_Top)
End Sub

'=============================================================================
' SwapFromToInDataSheet - Swap From_shp_Name and To_shp_Name in Data sheet
'=============================================================================
Sub SwapFromToInDataSheet(ByVal lineId As String, ByVal fromName As String, ByVal toName As String)
    Dim wsData As Worksheet
    Dim fromCell As Range, toCell As Range
    Dim startMarginCell As Range, endMarginCell As Range
    Dim adjStartCell As Range, adjEndCell As Range
    Dim tempVal As Variant

    Set wsData = ThisWorkbook.Sheets("Data")

    ' Get From/To cells
    Set fromCell = GetWriteCellFromValue_typeAndshp_IDorItem(wsData, "From_shp_Name", lineId)
    Set toCell = GetWriteCellFromValue_typeAndshp_IDorItem(wsData, "To_shp_Name", lineId)

    If Not fromCell Is Nothing And Not toCell Is Nothing Then
        ' Swap From/To
        fromCell.Value = toName
        toCell.Value = fromName
    End If

    ' Swap Start_Margin/End_Margin
    Set startMarginCell = GetWriteCellFromValue_typeAndshp_IDorItem(wsData, "Start_Margin", lineId)
    Set endMarginCell = GetWriteCellFromValue_typeAndshp_IDorItem(wsData, "End_Margin", lineId)

    If Not startMarginCell Is Nothing And Not endMarginCell Is Nothing Then
        tempVal = startMarginCell.Value
        startMarginCell.Value = endMarginCell.Value
        endMarginCell.Value = tempVal
    End If

    ' Swap Adj_Start_Height/Adj_End_Height
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
' MoveRightSideShapes - Sync function: Move all shapes on the right side
' baseTimeLevel: Reference Time_Level
' changeLeft: Left/Right movement amount
' changeTop: Up/Down movement amount
' includeSameLevel: True=Same level and above(>=), False=Right only(>)
'=============================================================================
Sub MoveRightSideShapes(ByVal baseTimeLevel As Double, ByVal changeLeft As Double, _
                        ByVal changeTop As Double, ByVal includeSameLevel As Boolean, _
                        ByVal excludeShpName As String)
    Dim wsData As Worksheet, wsFig As Worksheet
    Dim lastRow As Long, Row As Long
    Dim shpTimeLevel As Double, shpName As String, shpType As String
    Dim shouldMove As Boolean
    Dim idCol As Integer, timeLevelCol As Integer, typeCol As Integer
    Dim shp As Shape

    Set wsData = ThisWorkbook.Sheets("Data")
    Set wsFig = ThisWorkbook.Sheets("MakeFig")

    ' Find columns
    idCol = FindItemColumn(wsData, "ID")
    timeLevelCol = FindItemColumn(wsData, "Time_Level")
    typeCol = FindItemColumn(wsData, "Type")

    lastRow = wsData.Cells(wsData.Rows.Count, idCol).End(xlUp).Row

    For Row = 2 To lastRow
        shpName = CStr(wsData.Cells(Row, idCol).Value)

        ' Exclude self
        If shpName = excludeShpName Then GoTo NextRow

        shpTimeLevel = Val(wsData.Cells(Row, timeLevelCol).Value)

        ' Determine sync range
        If includeSameLevel Then
            shouldMove = (shpTimeLevel >= baseTimeLevel)
        Else
            shouldMove = (shpTimeLevel > baseTimeLevel)
        End If

        If shouldMove Then
            ' Move shape
            On Error Resume Next
            Set shp = wsFig.Shapes(shpName)
            If Not shp Is Nothing Then
                shp.Left = shp.Left + changeLeft
                shp.Top = shp.Top + changeTop
            End If
            On Error GoTo 0
        End If
NextRow:
    Next Row

    ' After moving all boxes, update connected lines
    For Row = 2 To lastRow
        shpName = CStr(wsData.Cells(Row, idCol).Value)
        shpType = CStr(wsData.Cells(Row, typeCol).Value)
        shpTimeLevel = Val(wsData.Cells(Row, timeLevelCol).Value)

        ' Check if this is a Line and was affected by the shift
        If (shpType Like "*Arrow*" Or shpType Like "*Line*" Or _
            InStr(shpType, ChrW(&H5B9F)) > 0) Then

            If includeSameLevel Then
                shouldMove = (shpTimeLevel >= baseTimeLevel)
            Else
                shouldMove = (shpTimeLevel > baseTimeLevel)
            End If

            If shouldMove Then
                On Error Resume Next
                Call MoveLine(shpName)
                On Error GoTo 0
            End If
        End If
    Next Row

    ' (����) Move Labels/SubLabels with affected shapes
    ' For Row = 2 To lastRow
    '     shpName = CStr(wsData.Cells(Row, idCol).Value)
    '     shpTimeLevel = Val(wsData.Cells(Row, timeLevelCol).Value)
    '
    '     If includeSameLevel Then
    '         shouldMove = (shpTimeLevel >= baseTimeLevel)
    '     Else
    '         shouldMove = (shpTimeLevel > baseTimeLevel)
    '     End If
    '
    '     If shouldMove Then
    '         Call MoveLabelsWithParent(shpName, changeLeft, changeTop)
    '     End If
    ' Next Row
End Sub
