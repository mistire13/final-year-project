const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const toqr = require('toqr');

const EXPO_URL = 'exp://192.168.8.114:8081';

function createPng(matrix, size, margin = 4, scale = 14) {
  const width = (size + margin * 2) * scale;
  const height = width;
  
  const rowBytes = width;
  const rawData = Buffer.alloc((rowBytes + 1) * height);
  
  for (let y = 0; y < height; y++) {
    const rawOffset = y * (rowBytes + 1);
    rawData[rawOffset] = 0; // Filter type 0 (None)
    
    const matrixY = Math.floor(y / scale) - margin;
    for (let x = 0; x < width; x++) {
      const matrixX = Math.floor(x / scale) - margin;
      let isDark = false;
      if (matrixY >= 0 && matrixY < size && matrixX >= 0 && matrixX < size) {
        isDark = matrix[matrixY * size + matrixX] === 1;
      }
      rawData[rawOffset + 1 + x] = isDark ? 0 : 255;
    }
  }
  
  const compressed = zlib.deflateSync(rawData);
  
  const crc32Table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crc32Table[i] = c;
  }
  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = crc32Table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  
  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const body = Buffer.concat([typeBuf, data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crcBuf]);
  }
  
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function generateAscii(matrix, extent) {
  const CHAR_00 = '\u2588';
  const CHAR_10 = '\u2584';
  const CHAR_01 = '\u2580';
  const CHAR_11 = ' ';
  let output = '';
  output += CHAR_10.repeat(extent + 2);
  for (let row = 0; row < extent; row += 2) {
    output += '\n' + CHAR_00;
    for (let col = 0; col < extent; col++) {
      const top = matrix[row * extent + col] || 0;
      const bottom = (row + 1 < extent) ? (matrix[(row + 1) * extent + col] || 0) : 0;
      const val = (top << 1) | bottom;
      switch (val) {
        case 0: output += CHAR_00; break;
        case 1: output += CHAR_01; break;
        case 2: output += CHAR_10; break;
        case 3: output += CHAR_11; break;
      }
    }
    output += CHAR_00;
  }
  if (extent % 2 === 0) {
    output += '\n' + CHAR_01.repeat(extent + 2);
  }
  return output;
}

const qrModules = toqr.toQR(EXPO_URL);
const size = Math.sqrt(qrModules.byteLength) | 0;
const pngBuf = createPng(qrModules, size, 4, 14);

const screenshotsDir = path.resolve(__dirname, '../screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}
const screenshotPath = path.join(screenshotsDir, 'expo_qr.png');
fs.writeFileSync(screenshotPath, pngBuf);

const artifactDir = 'C:\\Users\\Mistire\\.gemini\\antigravity-ide\\brain\\45ab757b-420c-4909-924b-46993b6d65a1';
if (fs.existsSync(artifactDir)) {
  fs.writeFileSync(path.join(artifactDir, 'expo_qr.png'), pngBuf);
}

console.log('PNG written to:', screenshotPath);
console.log('Artifact PNG written to:', path.join(artifactDir, 'expo_qr.png'));
console.log('Image dimensions:', (size + 8) * 14, 'x', (size + 8) * 14);
console.log('\nASCII Terminal QR:\n' + generateAscii(qrModules, size));
