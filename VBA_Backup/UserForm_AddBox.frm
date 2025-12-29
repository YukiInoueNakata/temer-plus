VERSION 5.00
Begin {C62A69F0-16DC-11CE-9E98-00AA00574A4F} UserForm_AddBox 
   Caption         =   "Add Box"
   ClientHeight    =   5235
   ClientLeft      =   120
   ClientTop       =   465
   ClientWidth     =   6165
   OleObjectBlob   =   "UserForm_AddBox.frx":0000
   StartUpPosition =   1  '�I�[�i�[ �t�H�[���̒���
End
Attribute VB_Name = "UserForm_AddBox"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Explicit



Private Sub UserForm_Initialize()
    '    MsgBox "Initialize Event Triggered"  ' ���̃��b�Z�[�W�{�b�N�X���\������邩�m�F

    Dim dict As Object
    Set dict = dic_fig_type("Box", 2)            ' ����: ���̊֐���Dictionary��Ԃ�
    
    
    '�R���{�{�b�N�X�̑I������ݒ�
    If dict Is Nothing Then
        MsgBox "Dictionary is not initialized!"
    Else
        ' ���X�g�{�b�N�X��Dictionary�̃L�[��ǉ�
        Dim key As Variant
        For Each key In dict.Keys
            Me.ComboBox_BoxType.AddItem key

        Next key
        
    End If
    
    '���̒����֌W�Z���̒l��General_Setting�V�[�g����擾
    Me.TextBox_Start_Margin.value = GetValueOfSearchValue("Line_Start_Margin", "Value")
    Me.TextBox_End_Margin.value = GetValueOfSearchValue("Line_End_Margin", "Value")
    Me.TextBox_Adj_Start_Height.value = GetValueOfSearchValue("Line_Adj_Start_Height", "Value")
    Me.TextBox_Adj_End_Height.value = GetValueOfSearchValue("Line_Adj_End_Height", "Value")

    '�쐬����Box�̑傫���̒l��General_Setting�V�[�g����擾

    Me.TextBox_Width.value = GetValueOfSearchValue("ItemBox_Width", GetDimensionValue())
    Me.TextBox_Height.value = GetValueOfSearchValue("ItemBox_Height", GetDimensionValue())

End Sub


'@description("Close�{�^���ŕ���")
Private Sub Close_UserForm_AddBox_Click()
    Unload Me
End Sub

Private Sub Add_Box_Click()
    Dim dict As Object
    Set dict = dic_fig_type("Box", 2)            ' ���̊֐���Dictionary��Ԃ�
    
    Dim DataWs As Worksheet
    Set DataWs = ThisWorkbook.Sheets("Data")

    Dim itemCol As Integer
    itemCol = FindItemColumn(DataWs, "Item")
    


    ' �e�L�X�g�{�b�N�X�̐��l�`�F�b�N�����[�v�ōs��
    Dim tb As Control
    For Each tb In Me.Controls
        If typeName(tb) = ComboBox_BoxType Then
            If Not dict.Exists(ComboBox_BoxType.value) Then
                MsgBox "���X�g����I�����Ă�������" & ComboBox_BoxType.value
                tb.SetFocus
                Exit Sub
            End If
        ElseIf tb.Name = "AddBox_Text" Then
               
        ElseIf typeName(tb) = "TextBox" Then     ' �R���g���[�����e�L�X�g�{�b�N�X�̏ꍇ
            If Not IsNumeric(tb.Text) Then       ' ���l�łȂ��ꍇ
                MsgBox "���l����͂��Ă�������", vbExclamation, "���̓G���["
                tb.SetFocus
                Exit Sub
            End If
        End If
    Next tb
    

    
    '�I������Ă���}�`�̐����m�F
    Dim shapeCount As Integer
    shapeCount = get_count_selected_shape()
    
    Select Case shapeCount
        Case 0
            MsgBox "�}�`���I������Ă��܂���B"
            Exit Sub
        
        Case 1
            ' �]���̏���: 1�I����
            Call AddBoxWith1Shape(DataWs, dict)
        
        Case 2
            ' �V�@�\: 2�I����
            Call AddBoxWith2Shapes(DataWs, dict)
        
        Case Else
            MsgBox "3�ȏ�̐}�`���I������Ă��܂��B1�܂���2�̐}�`��I�����Ă��������B"
            Exit Sub
    End Select
                    

   
End Sub

' 1�̐}�`���I������Ă���ꍇ�̏����i�]���̃��W�b�N�j
Private Sub AddBoxWith1Shape(DataWs As Worksheet, dict As Object)
    Dim TargetShp As shape
    Set TargetShp = Selection.ShapeRange(1)
    
    ' CheckIfRectangle�֐����g�p���Ďl�p�`���ǂ������m�F
    If Not CheckIfRectangle(TargetShp) Then
        MsgBox "�I�����ꂽ�}�`�͎l�p�`�ł͂���܂���B", vbExclamation
        Exit Sub
    End If
    
    'Box�쐬�̂��߂ɁC�V����Box�̏���Data�V�[�g�ɓ���
    Dim TargetTimeLevel As Double
    TargetTimeLevel = Datash_GetValueOfSearchValue(TargetShp.Name, "Time_Level")
    
    Dim lastRow As Long
    lastRow = DataWs.Cells(DataWs.Rows.count, FindItemColumn(DataWs, "ID")).End(xlUp).row + 1
    DataWs.Cells(lastRow, FindItemColumn(DataWs, "Type")) = ComboBox_BoxType.value
    DataWs.Cells(lastRow, FindItemColumn(DataWs, "Text")) = AddBox_Text.value
    
    If Me.before_Button = True Then
        DataWs.Cells(lastRow, FindItemColumn(DataWs, "Time_Level")) = TargetTimeLevel - time_level_Box.value
    ElseIf After_Button = True Then
        DataWs.Cells(lastRow, FindItemColumn(DataWs, "Time_Level")) = TargetTimeLevel + time_level_Box.value
    Else
        MsgBox "�쐬�ꏊ��I�����Ă�������"
        Exit Sub
    End If
    
    DataWs.Cells(lastRow, FindItemColumn(DataWs, "Item_Level")) = Vertical_level_Box.value
    DataWs.Cells(lastRow, FindItemColumn(DataWs, "Height")) = TextBox_Height.value
    DataWs.Cells(lastRow, FindItemColumn(DataWs, "Width")) = TextBox_Width.value
    
    'ID���ӂ�
    Call ID_Named
    
    Dim shp_ID As String
    shp_ID = DataWs.Cells(lastRow, FindItemColumn(DataWs, "ID")).value
    
    'Box�����
    Call Make_Box(shp_ID)
    
    '��������
    Dim FigWs As Worksheet
    Set FigWs = Sheets("MakeFig")
           
    ' �ΏۃV�F�C�v��I��
    If Me.before_Button = True Then
        FigWs.Shapes(shp_ID).Select
        TargetShp.Select Replace:=False
    Else
        TargetShp.Select
        FigWs.Shapes(shp_ID).Select Replace:=False
    End If

    ' �����쐬
    Call CreateLineForNewBox(shp_ID)
End Sub

' 2�̐}�`���I������Ă���ꍇ�̏����i�V�@�\�j
Private Sub AddBoxWith2Shapes(DataWs As Worksheet, dict As Object)
    Dim Shp1 As shape, Shp2 As shape
    Dim LeftShp As shape, RightShp As shape
    Dim TL1 As Double, TL2 As Double
    Dim NewTimeLevel As Double
    
    Set Shp1 = Selection.ShapeRange(1)
    Set Shp2 = Selection.ShapeRange(2)
    
    ' �����Ƃ��l�p�`���m�F
    If Not CheckIfRectangle(Shp1) Or Not CheckIfRectangle(Shp2) Then
        MsgBox "�I�����ꂽ�}�`�͗����Ƃ��l�p�`�ł���K�v������܂��B", vbExclamation
        Exit Sub
    End If
    
    ' Time_Level���擾
    TL1 = Datash_GetValueOfSearchValue(Shp1.Name, "Time_Level")
    TL2 = Datash_GetValueOfSearchValue(Shp2.Name, "Time_Level")
    
    ' ���E�𔻒�
    If TL1 < TL2 Then
        Set LeftShp = Shp1
        Set RightShp = Shp2
    Else
        Set LeftShp = Shp2
        Set RightShp = Shp1
        ' TL1��TL2�����ւ�
        Dim tempTL As Double
        tempTL = TL1
        TL1 = TL2
        TL2 = tempTL
    End If
    
    ' ���[�h����
    On Error Resume Next
    Dim isInsertBetween As Boolean
    isInsertBetween = Me.OptionButton_InsertBetween.value
    On Error GoTo 0
    
    If isInsertBetween Then
        ' �Ԃɑ}��: ���Ԃ�Time_Level�ɍ쐬
        NewTimeLevel = (TL1 + TL2) / 2
    Else
        ' �ړ����đ}��: �E���̐}�`���V�t�g
        NewTimeLevel = TL1 + 1
        Call ShiftShapesRight(DataWs, TL1, 1)
    End If
    
    ' �V����Box��Data�V�[�g�ɒǉ�
    Dim lastRow As Long
    lastRow = DataWs.Cells(DataWs.Rows.count, FindItemColumn(DataWs, "ID")).End(xlUp).row + 1
    DataWs.Cells(lastRow, FindItemColumn(DataWs, "Type")) = ComboBox_BoxType.value
    DataWs.Cells(lastRow, FindItemColumn(DataWs, "Text")) = AddBox_Text.value
    DataWs.Cells(lastRow, FindItemColumn(DataWs, "Time_Level")) = NewTimeLevel
    DataWs.Cells(lastRow, FindItemColumn(DataWs, "Item_Level")) = Vertical_level_Box.value
    DataWs.Cells(lastRow, FindItemColumn(DataWs, "Height")) = TextBox_Height.value
    DataWs.Cells(lastRow, FindItemColumn(DataWs, "Width")) = TextBox_Width.value
    
    'ID���ӂ�
    Call ID_Named
    
    Dim shp_ID As String
    shp_ID = DataWs.Cells(lastRow, FindItemColumn(DataWs, "ID")).value
    
    'Box�����
    Call Make_Box(shp_ID)
    
    ' �����쐬�i���V�F�C�v���VBox���E�V�F�C�v�j
    Dim FigWs As Worksheet
    Set FigWs = Sheets("MakeFig")
    
    ' ���V�F�C�v�ƐVBox��I�����Đ����쐬
    LeftShp.Select
    FigWs.Shapes(shp_ID).Select Replace:=False
    Call CreateLineForNewBox(shp_ID)
    
    ' �VBox�ƉE�V�F�C�v��I�����Đ����쐬
    FigWs.Shapes(shp_ID).Select
    RightShp.Select Replace:=False
    Call CreateLineForNewBox(shp_ID)
    
    MsgBox "2�̐}�`�̊ԂɐV����Box���쐬���܂����B", vbInformation
End Sub

' �����쐬���鋤�ʏ���
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
        MsgBox ("�������_�������͂��Ă�������")
        Exit Sub
    End If
    
    ' ���͂����ׂĐ��l�ł���ꍇ�A�ϐ��ɒl����
    Start_Margin = Val(TextBox_Start_Margin.Text)
    End_Margin = Val(TextBox_End_Margin.Text)
    Adj_Start_Height = Val(TextBox_Adj_Start_Height.Text)
    Adj_End_Height = Val(TextBox_Adj_End_Height.Text)
    Add_data = True
    
    ' �����̎��s
    Call Arrow_Connect_box(Line_Type, Add_data, _
                           Start_Margin, End_Margin, _
                           Adj_Start_Height, Adj_End_Height)
End Sub

' �E���̐}�`���V�t�g���鏈��
Private Sub ShiftShapesRight(DataWs As Worksheet, baseTimeLevel As Double, shiftAmount As Double)
    Dim lastRow As Long, row As Long
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

    lastRow = DataWs.Cells(DataWs.Rows.count, idCol).End(xlUp).row

    ' Pass 1: Update Time_Level in Data sheet for all shapes
    For row = 2 To lastRow
        shpTimeLevel = Val(DataWs.Cells(row, timeLevelCol).value)

        If shpTimeLevel > baseTimeLevel Then
            DataWs.Cells(row, timeLevelCol).value = shpTimeLevel + shiftAmount
        End If
    Next row

    ' Pass 2: Move all shapes (Box, Line, SD/SG)
    For row = 2 To lastRow
        shpName = CStr(DataWs.Cells(row, idCol).value)
        shpType = CStr(DataWs.Cells(row, typeCol).value)
        shpTimeLevel = Val(DataWs.Cells(row, timeLevelCol).value)

        ' If Time_Level was shifted
        If shpTimeLevel > baseTimeLevel + shiftAmount Then
            On Error Resume Next

            ' Move shape horizontally
            FigWs.Shapes(shpName).Left = FigWs.Shapes(shpName).Left + shiftPixels

            ' Collect Line shapes for endpoint recalculation
            If shpType Like "*Arrow*" Or shpType Like "*Line*" Or _
               InStr(shpType, ChrW(&H5B9F)) > 0 Then  ' �� (jissen)
                affectedLines.Add shpName
            End If

            On Error GoTo 0
        End If
    Next row

    ' Pass 3: Recalculate Line endpoints
    For Each lineName In affectedLines
        On Error Resume Next
        Call MoveLine(CStr(lineName))
        On Error GoTo 0
    Next lineName

    ' Pass 4 (����): Move Labels/SubLabels with parent shapes
    ' For row = 2 To lastRow
    '     shpName = CStr(DataWs.Cells(row, idCol).value)
    '     shpTimeLevel = Val(DataWs.Cells(row, timeLevelCol).value)
    '     If shpTimeLevel > baseTimeLevel + shiftAmount Then
    '         Call MoveLabelsWithParent(shpName, shiftPixels, 0)
    '     End If
    ' Next row
End Sub


