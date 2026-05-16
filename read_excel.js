const XLSX = require('xlsx')
const wb = XLSX.readFile('C:/Users/Admin/Downloads/202604_P008.DS3.TD.xlsx')
console.log('Sheets:', wb.SheetNames)
wb.SheetNames.forEach(name => {
  const ws = wb.Sheets[name]
  console.log('\n=== Sheet:', name, '===')
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  data.forEach((row, i) => {
    if (row.some(c => c !== '')) {
      console.log(`Row ${i+1}:`, JSON.stringify(row))
    }
  })
})
