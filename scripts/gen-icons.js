// Generates PWA icon PNGs from scratch (no external deps)
// Run: node scripts/gen-icons.js
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

function makePNG(size, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // CRC32 table
  const crcTable = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c
  }
  function crc32(data) {
    let c = 0xFFFFFFFF
    for (const byte of data) c = crcTable[(c ^ byte) & 0xFF] ^ (c >>> 8)
    return (c ^ 0xFFFFFFFF) >>> 0
  }

  function chunk(type, data) {
    const tb = Buffer.from(type, 'ascii')
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([tb, data])))
    return Buffer.concat([len, tb, data, crcBuf])
  }

  // IHDR: width, height, 8-bit RGB
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2  // bit depth 8, color type RGB

  // Build pixel rows: filter(0) + R G B per pixel
  const row = Buffer.alloc(1 + size * 3)
  row[0] = 0
  for (let x = 0; x < size; x++) {
    row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b
  }
  const raw = Buffer.concat(Array.from({ length: size }, () => Buffer.from(row)))
  const compressed = zlib.deflateSync(raw, { level: 9 })

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const publicDir = path.join(__dirname, '..', 'public')

// Warm cream background: #FEF8EE = R:254, G:248, B:238
const [r, g, b] = [0xFE, 0xF8, 0xEE]

fs.writeFileSync(path.join(publicDir, 'icon-192.png'), makePNG(192, r, g, b))
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), makePNG(512, r, g, b))
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), makePNG(180, r, g, b))

console.log('PWA icons generated: icon-192.png, icon-512.png, apple-touch-icon.png')
