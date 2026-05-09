param(
  [string[]]$Patterns = @()
)

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
  $results = @()

  foreach ($sheet in $workbook.Worksheets) {
    $used = $sheet.UsedRange

    for ($rowIndex = 1; $rowIndex -le $used.Rows.Count; $rowIndex++) {
      $row = @()

      for ($colIndex = 1; $colIndex -le $used.Columns.Count; $colIndex++) {
        $row += [string]$used.Item($rowIndex, $colIndex).Text
      }

      $joined = ($row -join ' | ')
      $isMatch = $false
      foreach ($pattern in $Patterns) {
        if ($joined -match [Regex]::Escape($pattern)) {
          $isMatch = $true
          break
        }
      }

      if ($isMatch) {
        $results += [pscustomobject]@{
          Sheet = $sheet.Name
          Row = $rowIndex
          Data = $row
        }
      }
    }
  }

  $workbook.Close($false)
  $results | ConvertTo-Json -Depth 5
}
finally {
  if ($excel) {
    $excel.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  }

  [gc]::Collect()
  [gc]::WaitForPendingFinalizers()
}