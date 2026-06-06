export type FloorTableSpot = {
  key: string
  x: number
  y: number
  w: number
  h: number
}

export type FloorPlant = {
  x: number
  y: number
  size: number
}

export const DAP_DA_DUNG_TABLE_SPOTS: FloorTableSpot[] = [
  { key: '1', x: 16, y: 24, w: 4.8, h: 7.4 },
  { key: '2', x: 22.4, y: 24, w: 4.8, h: 7.4 },
  { key: '3', x: 28.8, y: 24, w: 4.8, h: 7.4 },
  { key: '4', x: 35.2, y: 24, w: 4.8, h: 7.4 },
  { key: '5', x: 41.6, y: 24, w: 4.8, h: 7.4 },
  { key: '6', x: 48, y: 24, w: 4.8, h: 7.4 },
  { key: '7', x: 54.4, y: 24, w: 4.8, h: 7.4 },
  { key: '8', x: 68.2, y: 24, w: 4.8, h: 7.4 },
  { key: '9', x: 74.6, y: 24, w: 4.8, h: 7.4 },
  { key: '18', x: 15.4, y: 38.6, w: 4.8, h: 7.4 },
  { key: '17', x: 21.8, y: 38.6, w: 4.8, h: 7.4 },
  { key: '16', x: 28.2, y: 38.6, w: 4.8, h: 7.4 },
  { key: '15', x: 34.6, y: 38.6, w: 4.8, h: 7.4 },
  { key: '14', x: 41, y: 38.6, w: 4.8, h: 7.4 },
  { key: '13', x: 47.4, y: 38.6, w: 4.8, h: 7.4 },
  { key: '12', x: 53.8, y: 38.6, w: 4.8, h: 7.4 },
  { key: '11', x: 60.2, y: 38.6, w: 4.8, h: 7.4 },
  { key: '10', x: 70.8, y: 38.6, w: 4.8, h: 11.5 },
  { key: '22', x: 19.2, y: 55.6, w: 4.8, h: 7.4 },
  { key: '23', x: 25.8, y: 55.6, w: 4.8, h: 7.4 },
  { key: '24', x: 32.6, y: 55.6, w: 4.8, h: 7.4 },
  { key: '25', x: 39.2, y: 55.6, w: 4.8, h: 7.4 },
  { key: '26', x: 51.6, y: 55.6, w: 4.8, h: 7.4 },
  { key: '27', x: 58.2, y: 55.6, w: 4.8, h: 7.4 },
  { key: '28', x: 71, y: 55.6, w: 4.8, h: 7.4 },
  { key: '32', x: 19.2, y: 70, w: 4.8, h: 7.4 },
  { key: '31', x: 25.8, y: 70, w: 4.8, h: 7.4 },
  { key: '30', x: 32.6, y: 70, w: 4.8, h: 7.4 },
  { key: '29', x: 39.2, y: 70, w: 4.8, h: 7.4 },
  { key: '20', x: 1.8, y: 39.8, w: 4.8, h: 7.4 },
  { key: '19', x: 7.2, y: 39.8, w: 4.8, h: 7.4 },
  { key: '21', x: 3.2, y: 56.4, w: 4.8, h: 7.4 },
  { key: '34', x: 1.8, y: 74.2, w: 4.8, h: 7.4 },
  { key: '33', x: 7.2, y: 74.2, w: 4.8, h: 7.4 },
  { key: '35', x: 31, y: 80.2, w: 4.8, h: 7.4 },
  { key: '36', x: 37.1, y: 80.9, w: 4.8, h: 7.4 },
  { key: '37', x: 43, y: 86.4, w: 4.8, h: 7.4 },
  { key: '38', x: 55.2, y: 80.2, w: 4.8, h: 7.4 },
  { key: '39', x: 61.2, y: 80.2, w: 4.8, h: 7.4 },
  { key: '40', x: 67.2, y: 80.2, w: 4.8, h: 7.4 },
  { key: '43', x: 55.2, y: 91, w: 4.8, h: 7.4 },
  { key: '42', x: 61.2, y: 91, w: 4.8, h: 7.4 },
  { key: '41', x: 67.2, y: 91, w: 4.8, h: 7.4 },
  { key: 'vip1', x: 78, y: 42.4, w: 3.8, h: 9.8 },
  { key: 'vip2', x: 82.8, y: 42.4, w: 3.8, h: 9.8 },
  { key: 'vip3', x: 87.6, y: 42.4, w: 3.8, h: 9.8 },
  { key: 'vip4', x: 92.4, y: 42.4, w: 3.8, h: 9.8 },
  { key: 'vip5', x: 97.2, y: 42.4, w: 3.8, h: 9.8 },
]

export const DAP_DA_DUNG_PLANTS: FloorPlant[] = [
  { x: 0.6, y: 32, size: 5.4 },
  { x: 7.4, y: 32, size: 5.4 },
  { x: 79.8, y: 30.6, size: 5.2 },
  { x: 86.2, y: 30.6, size: 5.2 },
  { x: 92.6, y: 30.6, size: 5.2 },
  { x: 44.2, y: 54, size: 5.4 },
  { x: 21, y: 78.4, size: 7.2 },
  { x: 4.8, y: 95.2, size: 8 },
  { x: 24.6, y: 84.8, size: 7.6 },
  { x: 12.6, y: 87.2, size: 9.8 },
]

export function getTableLayoutKey(name: string) {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

  const vipMatch = normalized.match(/vip(\d+)/)
  if (vipMatch) return `vip${vipMatch[1]}`

  const numberMatch = normalized.match(/(\d+)/)
  if (numberMatch) return numberMatch[1]

  return normalized
}
