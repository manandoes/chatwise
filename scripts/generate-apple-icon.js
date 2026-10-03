const fs = require('fs');
const path = require('path');

// Generate minimal 180x180 apple-touch-icon (solid green circle on dark bg)
// We use canvas-like approach via raw bytes for a minimal valid PNG
const s = 180;
const cx = Math.floor(s / 2), cy = Math.floor(s / 2);
const r = 55;

// Create a minimal valid PNG using pure JS
// PNG structure: signature + IHDR + IDAT + IEND
function createSimplePNG(width, height, fillColor, circleR, cx, cy) {
  const zlib = require('zlib');

  // RGB color
  const R = (fillColor >> 16) & 0xFF;
  const G = (fillColor >> 8) & 0xFF;
  const B = fillColor & 0xFF;

  // For each row, create filter byte + pixel data
  const rawRows = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      const dx = x - cx, dy = y - cy;
      const inCircle = (dx * dx + dy * dy) <= circleR * circleR;
      if (inCircle) {
        row.push(0, R, G, B); // no filter, RGB
      } else {
        row.push(0, 15, 23, 42); // dark bg #0f172a
      }
    }
    rawRows.push(Buffer.from(row));
  }

  // Filter rows (sub filter)
  const filteredRows = rawRows.map(row => {
    const filtered = Buffer.alloc(row.length);
    filtered[0] = 1; // sub filter
    for (let i = 4; i < row.length; i++) {
      filtered[i] = (row[i] + row[i - 4]) & 0xFF;
    }
    return Buffer.concat([Buffer.from([0]), row]); // filter byte 0 = None
  });

  const deflated = zlib.deflateSync(Buffer.concat(filteredRows));

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const chunks = [];
  function chunk(type, data) {
    const c = Buffer.alloc(4 + 4 + data.length + 4);
    c.writeUInt32BE(data.length, 0);
    c.write(type, 4);
    data.copy(c, 8);
    const crc = zlib.crc32(Buffer.concat([Buffer.from(type), data]));
    c.writeUInt32BE(crc, 8 + data.length);
    return c;
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  chunks.push(chunk('IHDR', ihdrData));
  chunks.push(chunk('IDAT', deflated));
  chunks.push(chunk('IEND', Buffer.alloc(0)));

  return Buffer.concat([sig, ...chunks]);
}

// Background: #0f172a = rgb(15, 23, 42)
const BG = 0x0f172a;
const FG = 0x22c55e; // green

const png = createSimplePNG(180, 180, FG, 55, 90, 90);
fs.writeFileSync(path.join(__dirname, 'public', 'apple-touch-icon.png'), png);
console.log('Created apple-touch-icon.png:', png.length, 'bytes');
