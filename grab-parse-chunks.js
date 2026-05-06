'use strict'
const https = require('https')
const fs = require('fs')

async function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, (res) => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

;(async () => {
  const chunkUrls = [
    'https://merchant.grab.com/static/js/single.4148d939.js',
    'https://merchant.grab.com/static/js/1854.df18fc14.chunk.js',
    'https://merchant.grab.com/static/js/6429.9c3f4e28.chunk.js',
    'https://merchant.grab.com/static/js/2063.7bc5a781.chunk.js',
    'https://merchant.grab.com/static/js/5809.ff437ea5.chunk.js',
    'https://merchant.grab.com/static/js/7037.900f179c.chunk.js',
    'https://merchant.grab.com/static/js/7166.d48ef0ad.chunk.js',
    'https://merchant.grab.com/static/js/155.6b50aef0.chunk.js',
    'https://merchant.grab.com/static/js/2601.172cc068.chunk.js',
    'https://merchant.grab.com/static/js/53.4afee24f.chunk.js',
    'https://merchant.grab.com/static/js/6516.c5bf190b.chunk.js',
    'https://merchant.grab.com/static/js/3018.8de7e06f.chunk.js',
    'https://merchant.grab.com/static/js/2242.b0d31b15.chunk.js',
    'https://merchant.grab.com/static/js/2859.e083492b.chunk.js',
    'https://merchant.grab.com/static/js/1890.311159dc.chunk.js',
    'https://merchant.grab.com/static/js/8099.ec5f0b51.chunk.js',
    'https://merchant.grab.com/static/js/6340.f677c598.chunk.js',
    'https://merchant.grab.com/static/js/9994.8195016b.chunk.js',
    'https://merchant.grab.com/static/js/9945.07e5e57c.chunk.js',
    'https://merchant.grab.com/static/js/602.15be4d8a.chunk.js',
  ]

  const allOrderStrings = []

  for (const url of chunkUrls) {
    const name = url.split('/').pop()
    process.stdout.write(`Fetching ${name}...`)
    try {
      const content = await fetchText(url)
      process.stdout.write(` ${content.length} chars`)
      
      const hasOrder = content.toLowerCase().includes('order')
      if (!hasOrder) { process.stdout.write(' [no order]\n'); continue }
      process.stdout.write(' [HAS ORDER]\n')
      
      console.log(`\n=== ${name} (${content.length} chars) ===`)
      
      // Extract all unique strings containing 'order' 
      const stringPattern = /"([^"]{0,80}[Oo]rder[^"]{0,80})"/g
      let m
      const found = new Set()
      while ((m = stringPattern.exec(content)) !== null) {
        const s = m[1]
        if (!s.includes('\\n') && !s.includes('<') && !s.includes('class')) {
          found.add(s)
        }
      }
      
      // Also look for paths starting with /
      const pathPattern = /"(\/[a-z][a-z0-9-\/]{3,60})"/g
      const paths = new Set()
      while ((m = pathPattern.exec(content)) !== null) {
        const p = m[1]
        if (!p.includes('.') || p.includes('/v')) paths.add(p)
      }
      
      console.log('Order strings:')
      for (const s of found) console.log(' STR:', s.substring(0, 150))
      console.log('API paths:')
      for (const p of paths) console.log(' PATH:', p)
      
      allOrderStrings.push(...[...found].map(s => `[${name}] ${s}`))
    } catch (e) {
      console.log(` ERROR: ${e.message}`)
    }
  }
  
  console.log('\n=== SUMMARY: ALL ORDER-RELATED STRINGS ===')
  for (const s of allOrderStrings) console.log(s.substring(0, 200))
})()
