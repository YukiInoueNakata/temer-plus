VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "clsSettings"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Explicit

'=============================================================================
' clsSettings - 設定値の一元管理クラス
' 用途: General_SettingシートからGetValueOfSearchValueの重複呼び出しを削減
'       プロパティとしてキャッシュして提供
'=============================================================================

' ワークシート参照
Private m_wsSetting As Worksheet
Private m_SettingDict As Object  ' 設定名→Dictionary(Value列名→値)
Private m_IsInitialized As Boolean

' レイアウト設定キャッシュ
Private m_IsVertical As Boolean
Private m_DimensionValue As String

'=============================================================================
' 初期化・終了処理
'=============================================================================
Private Sub Class_Initialize()
    m_IsInitialized = False
    Set m_SettingDict = CreateObject("Scripting.Dictionary")
End Sub

Private Sub Class_Terminate()
    Set m_wsSetting = Nothing
    Set m_SettingDict = Nothing
End Sub

'=============================================================================
' 初期化メソッド
'=============================================================================

'@description("General_Settingシートを読み込み")
Public Sub Initialize()
    Dim lastRow As Long
    Dim lastCol As Long
    Dim row As Long
    Dim col As Long
    Dim itemName As String
    Dim colName As String
    Dim innerDict As Object

    If m_IsInitialized Then Exit Sub

    On Error Resume Next
    Set m_wsSetting = ThisWorkbook.Sheets("General_Setting")
    On Error GoTo 0

    If m_wsSetting Is Nothing Then Exit Sub

    lastRow = m_wsSetting.Cells(m_wsSetting.Rows.Count, 1).End(xlUp).Row
    lastCol = m_wsSetting.Cells(1, m_wsSetting.Columns.Count).End(xlToLeft).Column

    ' 全設定を辞書に格納
    For row = 2 To lastRow
        itemName = CStr(m_wsSetting.Cells(row, 1).Value)
        If itemName <> "" Then
            Set innerDict = CreateObject("Scripting.Dictionary")

            For col = 2 To lastCol
                colName = CStr(m_wsSetting.Cells(1, col).Value)
                If colName <> "" Then
                    innerDict(colName) = m_wsSetting.Cells(row, col).Value
                End If
            Next col

            m_SettingDict(itemName) = innerDict
        End If
    Next row

    ' レイアウト方向を判定
    m_IsVertical = DetermineLayoutDirection()
    m_DimensionValue = IIf(m_IsVertical, "Vertical", "Horizontal")

    m_IsInitialized = True
End Sub

'=============================================================================
' 汎用取得メソッド
'=============================================================================

'@description("設定値を取得（既存のGetValueOfSearchValueと互換）")
Public Function GetValue(ByVal itemName As String, ByVal colName As String) As Variant
    Dim innerDict As Object

    If Not m_IsInitialized Then Call Initialize

    If m_SettingDict.Exists(itemName) Then
        Set innerDict = m_SettingDict(itemName)
        If innerDict.Exists(colName) Then
            GetValue = innerDict(colName)
        Else
            GetValue = ""
        End If
    Else
        GetValue = ""
    End If
End Function

'=============================================================================
' Box設定プロパティ
'=============================================================================

Public Property Get ItemBoxWidth() As Double
    ItemBoxWidth = Val(GetValue("ItemBox_Width", m_DimensionValue))
End Property

Public Property Get ItemBoxHeight() As Double
    ItemBoxHeight = Val(GetValue("ItemBox_Height", m_DimensionValue))
End Property

Public Property Get ItemBoxFont() As String
    ItemBoxFont = CStr(GetValue("ItemBox_text_Font", "Value"))
End Property

Public Property Get ItemBoxFontSize() As Double
    ItemBoxFontSize = Val(GetValue("ItemBox_text_FontSize", "Value"))
End Property

Public Property Get OPPBoxWidth() As Double
    OPPBoxWidth = Val(GetValue("OPPBox_Width", m_DimensionValue))
End Property

Public Property Get OPPBoxHeight() As Double
    OPPBoxHeight = Val(GetValue("OPPBox_Height", m_DimensionValue))
End Property

Public Property Get BFPBoxWidth() As Double
    BFPBoxWidth = Val(GetValue("BFPBox_Width", m_DimensionValue))
End Property

Public Property Get BFPBoxHeight() As Double
    BFPBoxHeight = Val(GetValue("BFPBox_Height", m_DimensionValue))
End Property

Public Property Get EFPBoxWidth() As Double
    EFPBoxWidth = Val(GetValue("EFPBox_Width", m_DimensionValue))
End Property

Public Property Get EFPBoxHeight() As Double
    EFPBoxHeight = Val(GetValue("EFPBox_Height", m_DimensionValue))
End Property

'=============================================================================
' レイアウト設定プロパティ
'=============================================================================

Public Property Get IsVerticalLayout() As Boolean
    If Not m_IsInitialized Then Call Initialize
    IsVerticalLayout = m_IsVertical
End Property

Public Property Get DimensionValue() As String
    If Not m_IsInitialized Then Call Initialize
    DimensionValue = m_DimensionValue
End Property

Public Property Get VerticalLevelSize() As Double
    VerticalLevelSize = Val(GetValue("Vertical_level_size", m_DimensionValue))
End Property

Public Property Get TimeLevelSize() As Double
    TimeLevelSize = Val(GetValue("Time_level_size", m_DimensionValue))
End Property

'=============================================================================
' 位置設定プロパティ
'=============================================================================

Public Property Get StartTop() As Double
    StartTop = Val(GetValue("Start_Top", "Value"))
End Property

Public Property Get StartLeft() As Double
    StartLeft = Val(GetValue("Start_Left", "Value"))
End Property

'=============================================================================
' プライベートヘルパー
'=============================================================================

'@description("レイアウト方向を判定")
Private Function DetermineLayoutDirection() As Boolean
    Dim layoutValue As Variant

    If m_SettingDict.Exists("Layout_Direction") Then
        Dim innerDict As Object
        Set innerDict = m_SettingDict("Layout_Direction")
        If innerDict.Exists("Value") Then
            layoutValue = innerDict("Value")
        End If
    End If

    ' "Vertical"または"縦"ならTrue
    DetermineLayoutDirection = (CStr(layoutValue) = "Vertical" Or CStr(layoutValue) = "縦")
End Function

'=============================================================================
' リフレッシュ
'=============================================================================

'@description("設定を再読み込み")
Public Sub Refresh()
    m_IsInitialized = False
    m_SettingDict.RemoveAll
    Call Initialize
End Sub
