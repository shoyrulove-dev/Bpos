try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $wb = $excel.Workbooks.Open("C:\Users\Admin\Desktop\ID Đăng Nhập ALL.xlsx")
  $ws = $wb.Sheets.Item(1)
  $rows = $ws.UsedRange.Rows.Count
  $cols = $ws.UsedRange.Columns.Count
  Write-Host "Rows: $rows, Cols: $cols"
  for ($r = 1; $r -le [Math]::Min($rows, 60); $r++) {
    $line = ""
    for ($c = 1; $c -le $cols; $c++) {
      $line += $ws.Cells.Item($r, $c).Text + "|"
    }
    Write-Host $line
  }
  $wb.Close($false)
  $excel.Quit()
} catch {
  Write-Host "Error: $($_.Exception.Message)"
}
