VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "clsDataAccess"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Explicit

'=============================================================================
' clsDataAccess - Dataシートへの読み書きを一元化するクラス
' 用途: シート取得・列検索の重複を削減
'       GetValue/SetValueで統一的なアクセスを提供
'=============================================================================

' ワークシート参照
Private m_wsData As Worksheet
Private m_ColDict As Object  ' 列名→列番号のDictionary
Private m_IDCol As Long       ' ID列番号（キャッシュ）
Private m_LastRow As Long     ' 最終行（キャッシュ）
Private m_IsInitialized As Boolean

'=============================================================================
' 初期化・終了処理
'=============================================================================
Private Sub Class_Initialize()
    m_IsInitialized = False
    Set m_ColDict = CreateObject("Scripting.Dictionary")
End Sub

Private Sub Class_Terminate()
    Set m_wsData = Nothing
    Set m_ColDict = Nothing
End Sub

'=============================================================================
' 初期化メソッド
'=============================================================================

'@description("Dataシートを初期化して列辞書を構築")
Public Sub Initialize()
    If m_IsInitialized Then Exit Sub

    Set m_wsData = ThisWorkbook.Sheets("Data")
    Call BuildColumnDictionary

    If m_ColDict.Exists("ID") Then
        m_IDCol = m_ColDict("ID")
    Else
        m_IDCol = 1
    End If

    m_LastRow = m_wsData.Cells(m_wsData.Rows.Count, m_IDCol).End(xlUp).Row
    m_IsInitialized = True
End Sub

'=============================================================================
' 読み取りメソッド
'=============================================================================

'@description("指定IDの指定列の値を取得")
Public Function GetValue(ByVal shp_ID As String, ByVal colName As String) As Variant
    Dim targetRow As Long

    If Not m_IsInitialized Then Call Initialize

    targetRow = FindRowByID(shp_ID)
    If targetRow = 0 Then
        GetValue = ""
        Exit Function
    End If

    If m_ColDict.Exists(colName) Then
        GetValue = m_wsData.Cells(targetRow, m_ColDict(colName)).Value
    Else
        GetValue = ""
    End If
End Function

'@description("指定IDが存在するかチェック")
Public Function Exists(ByVal shp_ID As String) As Boolean
    If Not m_IsInitialized Then Call Initialize
    Exists = (FindRowByID(shp_ID) > 0)
End Function

'@description("指定Typeの全IDを配列で取得")
Public Function GetIDsByType(ByVal shapeType As String) As Variant
    Dim result() As String
    Dim count As Long
    Dim row As Long
    Dim typeCol As Long

    If Not m_IsInitialized Then Call Initialize

    If Not m_ColDict.Exists("Type") Then
        GetIDsByType = Array()
        Exit Function
    End If

    typeCol = m_ColDict("Type")
    count = 0
    ReDim result(1 To m_LastRow)

    For row = 2 To m_LastRow
        If CStr(m_wsData.Cells(row, typeCol).Value) = shapeType Then
            count = count + 1
            result(count) = CStr(m_wsData.Cells(row, m_IDCol).Value)
        End If
    Next row

    If count = 0 Then
        GetIDsByType = Array()
    Else
        ReDim Preserve result(1 To count)
        GetIDsByType = result
    End If
End Function

'@description("全IDを配列で取得")
Public Function GetAllIDs() As Variant
    Dim result() As String
    Dim count As Long
    Dim row As Long

    If Not m_IsInitialized Then Call Initialize

    count = 0
    ReDim result(1 To m_LastRow)

    For row = 2 To m_LastRow
        If m_wsData.Cells(row, m_IDCol).Value <> "" Then
            count = count + 1
            result(count) = CStr(m_wsData.Cells(row, m_IDCol).Value)
        End If
    Next row

    If count = 0 Then
        GetAllIDs = Array()
    Else
        ReDim Preserve result(1 To count)
        GetAllIDs = result
    End If
End Function

'=============================================================================
' 書き込みメソッド
'=============================================================================

'@description("指定IDの指定列に値を設定")
Public Sub SetValue(ByVal shp_ID As String, ByVal colName As String, ByVal value As Variant)
    Dim targetRow As Long

    If Not m_IsInitialized Then Call Initialize

    targetRow = FindRowByID(shp_ID)
    If targetRow = 0 Then Exit Sub

    If m_ColDict.Exists(colName) Then
        m_wsData.Cells(targetRow, m_ColDict(colName)).Value = value
    End If
End Sub

'=============================================================================
' プライベートヘルパー
'=============================================================================

'@description("列名辞書を構築")
Private Sub BuildColumnDictionary()
    Dim lastCol As Long
    Dim col As Long
    Dim colName As String

    m_ColDict.RemoveAll
    lastCol = m_wsData.Cells(1, m_wsData.Columns.Count).End(xlToLeft).Column

    For col = 1 To lastCol
        colName = CStr(m_wsData.Cells(1, col).Value)
        If colName <> "" And Not m_ColDict.Exists(colName) Then
            m_ColDict.Add colName, col
        End If
    Next col
End Sub

'@description("IDから行番号を検索")
Private Function FindRowByID(ByVal shp_ID As String) As Long
    Dim foundCell As Range

    Set foundCell = m_wsData.Range(m_wsData.Cells(2, m_IDCol), m_wsData.Cells(m_LastRow, m_IDCol)).Find( _
        What:=shp_ID, _
        LookIn:=xlValues, _
        LookAt:=xlWhole)

    If Not foundCell Is Nothing Then
        FindRowByID = foundCell.Row
    Else
        FindRowByID = 0
    End If
End Function

'=============================================================================
' 行管理メソッド
'=============================================================================

'@description("キャッシュを更新（行追加後に呼び出し）")
Public Sub Refresh()
    m_LastRow = m_wsData.Cells(m_wsData.Rows.Count, m_IDCol).End(xlUp).Row
End Sub

'@description("最終行番号を取得")
Public Property Get LastRow() As Long
    If Not m_IsInitialized Then Call Initialize
    LastRow = m_LastRow
End Property

'@description("列番号を取得")
Public Function GetColumnNumber(ByVal colName As String) As Long
    If Not m_IsInitialized Then Call Initialize

    If m_ColDict.Exists(colName) Then
        GetColumnNumber = m_ColDict(colName)
    Else
        GetColumnNumber = 0
    End If
End Function
