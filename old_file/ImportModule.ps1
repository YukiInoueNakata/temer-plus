try {
    $excel = [Runtime.Interopservices.Marshal]::GetActiveObject('Excel.Application')
    $wb = $excel.Workbooks | Where-Object { $_.Name -like 'TEMerPlus*' } | Select-Object -First 1

    if ($wb -eq $null) {
        Write-Host 'TEMerPlus workbook not found'
        exit 1
    }

    Write-Host "Workbook: $($wb.Name)"

    $vbProj = $wb.VBProject

    # Module_adj_Box_level をインポート
    $existingModule = $null
    foreach ($comp in $vbProj.VBComponents) {
        if ($comp.Name -eq 'Module_adj_Box_level') {
            $existingModule = $comp
            break
        }
    }

    if ($existingModule -ne $null) {
        Write-Host 'Module_adj_Box_level exists. Removing and reimporting.'
        $vbProj.VBComponents.Remove($existingModule)
    }

    $modulePath = 'C:\Temp\Module_adj_Box_level.bas'
    $vbProj.VBComponents.Import($modulePath)

    Write-Host 'Module_adj_Box_level imported successfully'
    Write-Host ''
    Write-Host 'MoveLine and SwapFromToInDataSheet functions updated.'
}
catch {
    Write-Host "Error: $_"
    Write-Host 'Check VBA project access permission in Trust Center'
}
