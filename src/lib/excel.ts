import * as XLSX from 'xlsx'

export type ExcelSheet = {
  name: string
  rows: Array<Record<string, unknown>>
}

function buildWorkbook(sheets: ExcelSheet[]) {
  const workbook = XLSX.utils.book_new()

  sheets.forEach((sheet) => {
    const rows = sheet.rows.length > 0 ? sheet.rows : [{ 'Thông báo': 'Không có dữ liệu' }]
    const worksheet = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31) || 'Sheet1')
  })

  return workbook
}

function normalizeFilename(filename: string) {
  const safeName = filename.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').toLowerCase()
  return safeName.endsWith('.xlsx') ? safeName : `${safeName}.xlsx`
}

export function createWorkbookBuffer(sheets: ExcelSheet[]) {
  const workbook = buildWorkbook(sheets)
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

export function downloadWorkbook(filename: string, sheets: ExcelSheet[]) {
  const workbook = buildWorkbook(sheets)
  XLSX.writeFile(workbook, normalizeFilename(filename), { compression: true })
}

export function getDownloadFilename(filename: string) {
  return normalizeFilename(filename)
}
