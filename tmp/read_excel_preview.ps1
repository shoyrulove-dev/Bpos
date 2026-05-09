$excel = $null

try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false

  $desktopPath = Join-Path $env:USERPROFILE 'Desktop'
  $targetFile = Get-ChildItem -LiteralPath $desktopPath -Filter 'ID*.xlsx' |
    Where-Object { $_.Name -notlike '~$*' } |
    Select-Object -First 1

  if (-not $targetFile) {
    throw 'Excel file starting with ID was not found on Desktop'
  }

  $workbook = $excel.Workbooks.Open($targetFile.FullName, $null, $true)

  $out = @()

  foreach ($sheet in $workbook.Worksheets) {
    $used = $sheet.UsedRange
    $rows = [Math]::Min($used.Rows.Count, 12)
    $cols = [Math]::Min($used.Columns.Count, 12)
    $preview = @()

    for ($rowIndex = 1; $rowIndex -le $rows; $rowIndex++) {
      $row = @()
      for ($colIndex = 1; $colIndex -le $cols; $colIndex++) {
        $row += [string]$used.Item($rowIndex, $colIndex).Text
      }
      $preview += ,@($row)
    }

    $out += [pscustomobject]@{
      Sheet = $sheet.Name
      Rows = $used.Rows.Count
      Cols = $used.Columns.Count
      Preview = $preview
    }
  }

  $workbook.Close($false)
  $out | ConvertTo-Json -Depth 6
}
finally {
  if ($excel) {
    $excel.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  }

  [gc]::Collect()
  [gc]::WaitForPendingFinalizers()
}