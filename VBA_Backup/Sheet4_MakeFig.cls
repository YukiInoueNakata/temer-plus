VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Sheet4"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = True
Option Explicit

'==============================================================================
' MakeFigシートイベント - フローティングツールバー制御
'==============================================================================

Private Sub Worksheet_Activate()
    Call ShowToolbar
End Sub

Private Sub Worksheet_Deactivate()
    Call HideToolbar
End Sub

