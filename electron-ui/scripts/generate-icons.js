/**
 * generate-icons.js
 * Generates build/icon.png and build/icon.ico without external dependencies.
 * Uses Node.js built-in zlib and fs.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createPngChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  chunk.writeUInt32BE(crc32(typeAndData), 8 + len);
  return chunk;
}

function createPng(size, renderFn) {
  const width = size;
  const height = size;

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Raw image data: height rows, each: 1 byte filter (0) + width * 4 RGBA bytes
  const rowBytes = 1 + width * 4;
  const raw = Buffer.alloc(height * rowBytes);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowBytes;
    raw[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = renderFn(x / (width - 1), y / (height - 1));
      const pxOffset = rowOffset + 1 + x * 4;
      raw[pxOffset] = Math.max(0, Math.min(255, Math.round(r)));
      raw[pxOffset + 1] = Math.max(0, Math.min(255, Math.round(g)));
      raw[pxOffset + 2] = Math.max(0, Math.min(255, Math.round(b)));
      raw[pxOffset + 3] = Math.max(0, Math.min(255, Math.round(a)));
    }
  }

  const idatData = zlib.deflateSync(raw, { level: 9 });
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrChunk = createPngChunk('IHDR', ihdr);
  const idatChunk = createPngChunk('IDAT', idatData);
  const iendChunk = createPngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Renders AIPA's branding at normalized coordinates u, v in [0, 1].
 * Returns [r, g, b, a] in 0-255.
 */
function renderAipaIcon(u, v) {
  // Center is (0.5, 0.5), coordinates in [-1, 1]
  const x = (u - 0.5) * 2;
  const y = (v - 0.5) * 2;

  // Squircle background: |x|^4 + |y|^4 <= R^4 with rounded corners
  // Corner radius ~ 0.85
  const squircle = Math.pow(Math.abs(x), 3.5) + Math.pow(Math.abs(y), 3.5);
  const bgThreshold = 0.65;
  const borderFeather = 0.05;

  if (squircle > bgThreshold + borderFeather) {
    return [0, 0, 0, 0]; // Transparent outside squircle
  }

  let bgAlpha = 1;
  if (squircle > bgThreshold) {
    bgAlpha = 1 - (squircle - bgThreshold) / borderFeather;
  }

  // Gradient background: indigo (#6366f1 = 99, 102, 241) to violet (#8b5cf6 = 139, 92, 246)
  // Diagonal t from (-1, -1) to (1, 1)
  const gradT = Math.max(0, Math.min(1, (x + y + 1.4) / 2.8));
  let bgR = 99 + (139 - 99) * gradT;
  let bgG = 102 + (92 - 102) * gradT;
  let bgB = 241 + (246 - 241) * gradT;

  // Subtle inner highlight near top
  const innerHighlight = Math.max(0, -y * 0.15);
  bgR = Math.min(255, bgR + innerHighlight * 40);
  bgG = Math.min(255, bgG + innerHighlight * 40);
  bgB = Math.min(255, bgB + innerHighlight * 40);

  // Bot silhouette drawing
  // 1. Antenna dot at (0, -0.62), radius 0.07
  const distAntennaDot = Math.hypot(x, y - (-0.60));
  const isAntennaDot = distAntennaDot < 0.07;
  const isAntennaStem = Math.abs(x) < 0.025 && y >= -0.58 && y <= -0.42;

  // 2. Head rounded rect: center (0, -0.05), width 0.72, height 0.62, radius 0.2
  const headW = 0.36;
  const headH = 0.31;
  const headR = 0.16;
  const headYCenter = -0.05;
  const hdx = Math.max(0, Math.abs(x) - (headW - headR));
  const hdy = Math.max(0, Math.abs(y - headYCenter) - (headH - headR));
  const headDist = Math.hypot(hdx, hdy);
  const isHead = headDist < headR;

  // 3. Ears: left (-0.42, -0.05), right (0.42, -0.05), size 0.06 x 0.14
  const isLeftEar = Math.abs(x - (-0.41)) < 0.04 && Math.abs(y - headYCenter) < 0.09;
  const isRightEar = Math.abs(x - 0.41) < 0.04 && Math.abs(y - headYCenter) < 0.09;

  // 4. Eyes: left (-0.16, -0.08), right (0.16, -0.08), radius 0.065
  const leftEyeDist = Math.hypot(x - (-0.16), y - (-0.08));
  const rightEyeDist = Math.hypot(x - 0.16, y - (-0.08));
  const isEye = leftEyeDist < 0.065 || rightEyeDist < 0.065;

  // 5. Visor / Mouth: smile curve at y = 0.10, width 0.24
  const isMouth = Math.abs(x) < 0.12 && Math.abs(y - (0.08 + x * x * 0.8)) < 0.025;

  // Combine bot features
  const isBotWhite = (isHead || isLeftEar || isRightEar || isAntennaDot || isAntennaStem);

  if (isBotWhite) {
    if (isEye || isMouth) {
      // Dark eye/mouth inside white bot head
      return [30, 32, 60, Math.round(bgAlpha * 255)];
    }
    // Bot body color: crisp clean white/light-indigo (#f8fafc)
    return [248, 250, 252, Math.round(bgAlpha * 255)];
  }

  return [bgR, bgG, bgB, Math.round(bgAlpha * 255)];
}

function generateIconFiles() {
  const buildDir = path.join(__dirname, '..', 'build');
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }

  // Resolutions for Windows .ico
  const sizes = [16, 32, 48, 64, 128, 256];
  const pngBuffers = sizes.map(sz => createPng(sz, renderAipaIcon));

  // Write high-res 256x256 PNG as build/icon.png
  const iconPngPath = path.join(buildDir, 'icon.png');
  fs.writeFileSync(iconPngPath, pngBuffers[pngBuffers.length - 1]);
  console.log(`[generate-icons] Generated ${iconPngPath} (${pngBuffers[pngBuffers.length - 1].length} bytes)`);

  // Build .ico format
  // Header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(sizes.length, 4); // count

  // Directory entries: 16 bytes each
  const dirSize = 16 * sizes.length;
  let currentOffset = 6 + dirSize;
  const dirBuffers = [];

  for (let i = 0; i < sizes.length; i++) {
    const sz = sizes[i];
    const png = pngBuffers[i];
    const entry = Buffer.alloc(16);
    entry[0] = sz >= 256 ? 0 : sz; // width
    entry[1] = sz >= 256 ? 0 : sz; // height
    entry[2] = 0; // color palette count
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8); // image size in bytes
    entry.writeUInt32LE(currentOffset, 12); // image offset
    dirBuffers.push(entry);
    currentOffset += png.length;
  }

  const icoBuffer = Buffer.concat([header, ...dirBuffers, ...pngBuffers]);
  const iconIcoPath = path.join(buildDir, 'icon.ico');
  fs.writeFileSync(iconIcoPath, icoBuffer);
  console.log(`[generate-icons] Generated ${iconIcoPath} (${icoBuffer.length} bytes, ${sizes.length} resolutions)`);
}

generateIconFiles();
