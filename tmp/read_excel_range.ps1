param(
  [string]$SheetName,
  [int]$StartRow = 1,
  [int]$EndRow = 20,
  [int]$MaxCols = 12
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
  $sheet = $workbook.Worksheets.Item($SheetName)
  $used = $sheet.UsedRange
  $lastRow = [Math]::Min($EndRow, $used.Rows.Count)
  $lastCol = [Math]::Min($MaxCols, $used.Columns.Count)
  $rows = @()

  for ($rowIndex = $StartRow; $rowIndex -le $lastRow; $rowIndex++) {
    $row = @()
    for ($colIndex = 1; $colIndex -le $lastCol; $colIndex++) {
      $row += [string]$used.Item($rowIndex, $colIndex).Text
    }

    $rows += [pscustomobject]@{
      Row = $rowIndex
      Data = $row
    }
  }

  $workbook.Close($false)
  $rows | ConvertTo-Json -Depth 5
}
finally {
  if ($excel) {
    $excel.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  }

  [gc]::Collect()
  [gc]::WaitForPendingFinalizers()
}