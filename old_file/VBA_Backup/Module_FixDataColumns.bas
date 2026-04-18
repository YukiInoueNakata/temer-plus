Attribute VB_Name = "Module_FixDataColumns"
Option Explicit

'=============================================================================
' FixDataColumns - Data sheet no retsu wo 1 retsu migi ni shift suru
' ID retsu wo aketе, Type/Text/Time_Level nado wo tadashii ichi ni idou
'=============================================================================
Sub FixDataColumns()
    Dim ws As Worksheet
    Dim lastRow As Long, lastCol As Long
    Dim i As Long

    Set ws = ThisWorkbook.Sheets("Data")

    ' Get data range
    lastRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    lastCol = ws.Cells(1, ws.Columns.Count).End(xlToLeft).Column

    ' Check if already correct (ID column should be empty or have ID format)
    If ws.Cells(2, 1).Value = "" Or Left(ws.Cells(2, 1).Value, 4) = "Item" Then
        MsgBox "Data is already in correct format.", vbInformation
        Exit Sub
    End If

    ' Confirm with user
    If MsgBox("Data wo 1 retsu migi ni shift shimasu." & vbCrLf & _
              "ID retsu wa kara ni nari, jidou fuyo saremasu." & vbCrLf & vbCrLf & _
              "Jikkou shimasu ka?", vbYesNo + vbQuestion) = vbNo Then
        Exit Sub
    End If

    ' Insert column A (shift all data right)
    ws.Columns("A:A").Insert Shift:=xlToRight

    ' Set header for new ID column
    ws.Cells(1, 1).Value = "ID"

    MsgBox "Data wo shift shimashita." & vbCrLf & _
           "Tsugi ni [Figure Creation] button wo oshite kudasai.", vbInformation
End Sub

'=============================================================================
' TestDataStructure - Data sheet no kozo wo kakunin
'=============================================================================
Sub TestDataStructure()
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Sheets("Data")

    Debug.Print "=== Data Sheet Structure ==="
    Debug.Print "Row 1 (Header): " & ws.Cells(1, 1).Value & " | " & _
                ws.Cells(1, 2).Value & " | " & ws.Cells(1, 3).Value & " | " & _
                ws.Cells(1, 4).Value & " | " & ws.Cells(1, 5).Value
    Debug.Print "Row 2 (Data): " & ws.Cells(2, 1).Value & " | " & _
                ws.Cells(2, 2).Value & " | " & ws.Cells(2, 3).Value & " | " & _
                ws.Cells(2, 4).Value & " | " & ws.Cells(2, 5).Value
End Sub
