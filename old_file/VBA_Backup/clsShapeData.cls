VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "clsShapeData"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Explicit

'=============================================================================
' clsShapeData - 図形データのキャッシュ・アクセスクラス
' 用途: Datash_GetValueOfSearchValueの重複呼び出しを削減
'       1回のLoad呼び出しで全プロパティをキャッシュ
'=============================================================================

' プライベート変数（キャッシュ）
Private m_ShpID As String
Private m_Type As String
Private m_Text As String
Private m_ItemLevel As Double
Private m_TimeLevel As Double
Private m_Height As Double
Private m_Width As Double
Private m_FromShpName As String
Private m_ToShpName As String
Private m_StartMargin As Double
Private m_EndMargin As Double
Private m_AdjStartHeight As Double
Private m_AdjEndHeight As Double
Private m_SDSGItemAdj As Double
Private m_SDSGTimeAdj As Double
Private m_IsLoaded As Boolean

' ワークシート参照
Private m_wsData As Worksheet
Private m_ColDict As Object  ' 列名→列番号のDictionary

'=============================================================================
' 初期化・終了処理
'=============================================================================
Private Sub Class_Initialize()
    m_IsLoaded = False
    Set m_ColDict = CreateObject("Scripting.Dictionary")
End Sub

Private Sub Class_Terminate()
    Set m_wsData = Nothing
    Set m_ColDict = Nothing
End Sub

'=============================================================================
' メインメソッド
'=============================================================================

'@description("指定IDの全プロパティを一括読み込み")
Public Sub Load(ByVal shp_ID As String)
    Dim targetRow As Long

    ' Dataシート取得
    If m_wsData Is Nothing Then
        Set m_wsData = ThisWorkbook.Sheets("Data")
        Call BuildColumnDictionary
    End If

    ' 対象行を検索
    targetRow = FindRowByID(shp_ID)
    If targetRow = 0 Then
        m_IsLoaded = False
        Exit Sub
    End If

    ' 全プロパティを一括読み込み
    m_ShpID = shp_ID
    m_Type = GetCellValue(targetRow, "Type")
    m_Text = GetCellValue(targetRow, "Text")
    m_ItemLevel = Val(GetCellValue(targetRow, "Item_Level"))
    m_TimeLevel = Val(GetCellValue(targetRow, "Time_Level"))
    m_Height = Val(GetCellValue(targetRow, "Height"))
    m_Width = Val(GetCellValue(targetRow, "Width"))
    m_FromShpName = GetCellValue(targetRow, "From_shp_Name")
    m_ToShpName = GetCellValue(targetRow, "To_shp_Name")
    m_StartMargin = Val(GetCellValue(targetRow, "Start_Margin"))
    m_EndMargin = Val(GetCellValue(targetRow, "End_Margin"))
    m_AdjStartHeight = Val(GetCellValue(targetRow, "Adj_Start_Height"))
    m_AdjEndHeight = Val(GetCellValue(targetRow, "Adj_End_Height"))
    m_SDSGItemAdj = Val(GetCellValue(targetRow, "SDSG_Item_Adj"))
    m_SDSGTimeAdj = Val(GetCellValue(targetRow, "SDSG_Time_Adj"))

    m_IsLoaded = True
End Sub

'=============================================================================
' プライベートヘルパー
'=============================================================================

'@description("列名辞書を構築")
Private Sub BuildColumnDictionary()
    Dim lastCol As Long
    Dim col As Long
    Dim colName As String

    lastCol = m_wsData.Cells(1, m_wsData.Columns.Count).End(xlToLeft).Column

    For col = 1 To lastCol
        colName = m_wsData.Cells(1, col).Value
        If colName <> "" And Not m_ColDict.Exists(colName) Then
            m_ColDict.Add colName, col
        End If
    Next col
End Sub

'@description("IDから行番号を検索")
Private Function FindRowByID(ByVal shp_ID As String) As Long
    Dim idCol As Long
    Dim lastRow As Long
    Dim foundCell As Range

    If Not m_ColDict.Exists("ID") Then
        FindRowByID = 0
        Exit Function
    End If

    idCol = m_ColDict("ID")
    lastRow = m_wsData.Cells(m_wsData.Rows.Count, idCol).End(xlUp).Row

    Set foundCell = m_wsData.Range(m_wsData.Cells(2, idCol), m_wsData.Cells(lastRow, idCol)).Find( _
        What:=shp_ID, _
        LookIn:=xlValues, _
        LookAt:=xlWhole)

    If Not foundCell Is Nothing Then
        FindRowByID = foundCell.Row
    Else
        FindRowByID = 0
    End If
End Function

'@description("指定行・列の値を取得")
Private Function GetCellValue(ByVal rowNum As Long, ByVal colName As String) As String
    If m_ColDict.Exists(colName) Then
        GetCellValue = CStr(m_wsData.Cells(rowNum, m_ColDict(colName)).Value)
    Else
        GetCellValue = ""
    End If
End Function

'=============================================================================
' 読み取り専用プロパティ
'=============================================================================

Public Property Get ShpID() As String
    ShpID = m_ShpID
End Property

Public Property Get ShapeType() As String
    ShapeType = m_Type
End Property

Public Property Get Text() As String
    Text = m_Text
End Property

Public Property Get ItemLevel() As Double
    ItemLevel = m_ItemLevel
End Property

Public Property Get TimeLevel() As Double
    TimeLevel = m_TimeLevel
End Property

Public Property Get Height() As Double
    Height = m_Height
End Property

Public Property Get Width() As Double
    Width = m_Width
End Property

Public Property Get FromShpName() As String
    FromShpName = m_FromShpName
End Property

Public Property Get ToShpName() As String
    ToShpName = m_ToShpName
End Property

Public Property Get StartMargin() As Double
    StartMargin = m_StartMargin
End Property

Public Property Get EndMargin() As Double
    EndMargin = m_EndMargin
End Property

Public Property Get AdjStartHeight() As Double
    AdjStartHeight = m_AdjStartHeight
End Property

Public Property Get AdjEndHeight() As Double
    AdjEndHeight = m_AdjEndHeight
End Property

Public Property Get SDSGItemAdj() As Double
    SDSGItemAdj = m_SDSGItemAdj
End Property

Public Property Get SDSGTimeAdj() As Double
    SDSGTimeAdj = m_SDSGTimeAdj
End Property

Public Property Get IsLoaded() As Boolean
    IsLoaded = m_IsLoaded
End Property
