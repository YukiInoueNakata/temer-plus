VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "clsFigureFactory"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Explicit

'=============================================================================
' clsFigureFactory - 図形生成の統一インターフェース
' 用途: 3重For Eachループを1回のループに統合
'       TypeからBox/Line/SDSGを自動判別して生成
'=============================================================================

' 依存クラス
Private m_DataAccess As clsDataAccess
Private m_TypeDict As Object  ' Type→Category辞書

'=============================================================================
' 初期化・終了処理
'=============================================================================
Private Sub Class_Initialize()
    Set m_DataAccess = New clsDataAccess
    Set m_TypeDict = CreateObject("Scripting.Dictionary")
    Call BuildTypeDictionary
End Sub

Private Sub Class_Terminate()
    Set m_DataAccess = Nothing
    Set m_TypeDict = Nothing
End Sub

'=============================================================================
' メインメソッド
'=============================================================================

'@description("IDから適切な図形を生成")
Public Sub Create(ByVal shp_ID As String)
    Dim shapeType As String
    Dim category As String

    shapeType = m_DataAccess.GetValue(shp_ID, "Type")

    If shapeType = "" Then Exit Sub

    category = GetCategory(shapeType)

    Select Case category
        Case "Box"
            Call CreateBox(shp_ID)
        Case "Line"
            Call CreateLine(shp_ID)
        Case "SDSG"
            Call CreateSDSG(shp_ID)
        Case Else
            ' 未知のType - スキップ
    End Select
End Sub

'@description("全図形を一括生成（Main_making_TEM_Fig_from_dataの置き換え）")
Public Sub CreateAll()
    Dim ids As Variant
    Dim i As Long

    ids = m_DataAccess.GetAllIDs()

    If Not IsArray(ids) Then Exit Sub
    If UBound(ids) < 1 Then Exit Sub

    ' 順序: Box → Line → SDSG
    ' まずBoxを全て作成
    For i = LBound(ids) To UBound(ids)
        If GetCategory(m_DataAccess.GetValue(ids(i), "Type")) = "Box" Then
            Call CreateBox(ids(i))
        End If
    Next i

    ' 次にLineを作成
    For i = LBound(ids) To UBound(ids)
        If GetCategory(m_DataAccess.GetValue(ids(i), "Type")) = "Line" Then
            Call CreateLine(ids(i))
        End If
    Next i

    ' 最後にSDSGを作成
    For i = LBound(ids) To UBound(ids)
        If GetCategory(m_DataAccess.GetValue(ids(i), "Type")) = "SDSG" Then
            Call CreateSDSG(ids(i))
        End If
    Next i
End Sub

'=============================================================================
' プライベート生成メソッド（既存関数へのラッパー）
'=============================================================================

'@description("Box図形を生成")
Private Sub CreateBox(ByVal shp_ID As String)
    ' 最適化版を呼び出し
    Call Make_Box_Optimized(shp_ID)
End Sub

'@description("Line/Arrow図形を生成")
Private Sub CreateLine(ByVal shp_ID As String)
    ' 最適化版を呼び出し
    Call Make_Line_by_ID_Optimized(shp_ID)
End Sub

'@description("SD/SG図形を生成")
Private Sub CreateSDSG(ByVal shp_ID As String)
    ' 最適化版を呼び出し
    Call MakeArrowCalloutByID_Optimized(shp_ID)
End Sub

'=============================================================================
' ヘルパーメソッド
'=============================================================================

'@description("dic_fig_typeシートから辞書を構築")
Private Sub BuildTypeDictionary()
    Dim wsDic As Worksheet
    Dim lastRow As Long
    Dim row As Long
    Dim typeName As String
    Dim category As String

    On Error Resume Next
    Set wsDic = ThisWorkbook.Sheets("dic_fig_type")
    On Error GoTo 0

    If wsDic Is Nothing Then Exit Sub

    lastRow = wsDic.Cells(wsDic.Rows.Count, 1).End(xlUp).Row

    For row = 2 To lastRow
        typeName = CStr(wsDic.Cells(row, 1).Value)
        category = CStr(wsDic.Cells(row, 3).Value)

        If typeName <> "" And Not m_TypeDict.Exists(typeName) Then
            m_TypeDict.Add typeName, category
        End If
    Next row
End Sub

'@description("TypeからCategoryを取得")
Private Function GetCategory(ByVal shapeType As String) As String
    If m_TypeDict.Exists(shapeType) Then
        GetCategory = m_TypeDict(shapeType)
    Else
        ' デフォルトマッピング
        Select Case shapeType
            Case "Item", "OPP", "BFP", "EFP"
                GetCategory = "Box"
            Case "SD", "SG"
                GetCategory = "SDSG"
            Case Else
                If InStr(shapeType, "矢印") > 0 Or InStr(shapeType, "Arrow") > 0 Then
                    GetCategory = "Line"
                Else
                    GetCategory = ""
                End If
        End Select
    End If
End Function

'=============================================================================
' ユーティリティ
'=============================================================================

'@description("サポートするTypeの一覧を取得")
Public Function GetSupportedTypes() As Variant
    GetSupportedTypes = m_TypeDict.Keys
End Function
