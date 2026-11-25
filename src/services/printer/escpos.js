const ORDERED_4X4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

function assertImage(width, height, rgba) {
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new Error('Raster dimensions must be positive integers.');
  }
  if (!(rgba instanceof Uint8Array) || rgba.length !== width * height * 4) {
    throw new Error('RGBA pixel data must contain exactly width × height × 4 bytes.');
  }
}

function normalizeTone({brightness = 0, contrast = 1, gamma = 1} = {}) {
  if (!Number.isFinite(brightness) || brightness < -1 || brightness > 1) throw new Error('Brightness must be between -1 and 1.');
  if (!Number.isFinite(contrast) || contrast < 0 || contrast > 3) throw new Error('Contrast must be between 0 and 3.');
  if (!Number.isFinite(gamma) || gamma <= 0 || gamma > 4) throw new Error('Gamma must be greater than 0 and at most 4.');
  return {brightness, contrast, gamma};
}

function applyTone(value, {brightness, contrast, gamma}) {
  const brightened = Math.max(0, Math.min(255, value + brightness * 255));
  const contrasted = Math.max(0, Math.min(255, (brightened - 128) * contrast + 128));
  return Math.round(255 * Math.pow(contrasted / 255, 1 / gamma));
}

function toneCorrect(value, options = {}) {
  return applyTone(value, normalizeTone(options));
}

function rgbaToMonochrome(width, height, rgba, options = {}) {
  assertImage(width, height, rgba);
  const mode = options.mode || 'floyd-steinberg';
  const tone = normalizeTone(options);
  const threshold = options.threshold ?? 160;
  const cleanBackground = options.cleanBackground !== false;
  const paperWhiteThreshold = options.paperWhiteThreshold ?? 250;
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 255) throw new Error('Threshold must be an integer from 0 to 255.');
  if (!Number.isInteger(paperWhiteThreshold) || paperWhiteThreshold < 200 || paperWhiteThreshold > 255) throw new Error('Paper white threshold must be an integer from 200 to 255.');
  const corrected = new Float32Array(width * height);
  const paperWhite = cleanBackground ? new Uint8Array(width * height) : null;
  for (let pixel = 0, offset = 0; pixel < corrected.length; pixel += 1, offset += 4) {
    const alpha = rgba[offset + 3] / 255;
    const red = 255 - (255 - rgba[offset]) * alpha;
    const green = 255 - (255 - rgba[offset + 1]) * alpha;
    const blue = 255 - (255 - rgba[offset + 2]) * alpha;
    const gray = 0.299 * red + 0.587 * green + 0.114 * blue;
    if (paperWhite && gray >= paperWhiteThreshold) {
      paperWhite[pixel] = 1;
      corrected[pixel] = 255;
    } else {
      corrected[pixel] = applyTone(gray, tone);
    }
  }
  const black = new Uint8Array(width * height);

  if (mode === 'threshold') {
    for (let i = 0; i < corrected.length; i += 1) black[i] = !(paperWhite && paperWhite[i]) && corrected[i] < threshold ? 1 : 0;
    return black;
  }
  if (mode === 'ordered') {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const cutoff = ((ORDERED_4X4[(y % 4) * 4 + (x % 4)] + 0.5) * 256) / 16;
        const index = y * width + x;
        black[index] = !(paperWhite && paperWhite[index]) && corrected[index] < cutoff ? 1 : 0;
      }
    }
    return black;
  }
  if (mode !== 'floyd-steinberg' && mode !== 'atkinson') throw new Error(`Unsupported dithering mode: ${mode}`);

  const distribute = (x, y, amount, divisor) => {
    if (x >= 0 && x < width && y >= 0 && y < height) corrected[y * width + x] += amount / divisor;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (paperWhite && paperWhite[index]) {black[index] = 0; continue;}
      const oldValue = Math.max(0, Math.min(255, corrected[index]));
      const newValue = oldValue < threshold ? 0 : 255;
      black[index] = newValue === 0 ? 1 : 0;
      const error = oldValue - newValue;
      if (mode === 'floyd-steinberg') {
        distribute(x + 1, y, error * 7, 16);
        distribute(x - 1, y + 1, error * 3, 16);
        distribute(x, y + 1, error * 5, 16);
        distribute(x + 1, y + 1, error, 16);
      } else {
        distribute(x + 1, y, error, 8);
        distribute(x + 2, y, error, 8);
        distribute(x - 1, y + 1, error, 8);
        distribute(x, y + 1, error, 8);
        distribute(x + 1, y + 1, error, 8);
        distribute(x, y + 2, error, 8);
      }
    }
  }
  return black;
}

function packRasterRows(width, height, blackPixels) {
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1 || !(blackPixels instanceof Uint8Array) || blackPixels.length !== width * height) {
    throw new Error('Monochrome pixels must contain exactly width × height bytes.');
  }
  const rowBytes = Math.ceil(width / 8);
  if (rowBytes > 0xffff || height > 0xffff) throw new Error('ESC/POS raster dimensions cannot exceed 65535 bytes/rows.');
  const raster = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (blackPixels[y * width + x]) raster[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return {rowBytes, raster};
}

function offsetMonochromePixels(width, height, blackPixels, offsetDots = 0) {
  if (!Number.isInteger(offsetDots) || Math.abs(offsetDots) > width) throw new Error('Horizontal offset must be a whole number of dots within the print width.');
  if (!(blackPixels instanceof Uint8Array) || blackPixels.length !== width * height) throw new Error('Monochrome pixels must contain exactly width × height bytes.');
  if (offsetDots === 0) return new Uint8Array(blackPixels);
  const shifted = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const targetX = x + offsetDots;
      if (targetX >= 0 && targetX < width) shifted[y * width + targetX] = blackPixels[y * width + x];
    }
  }
  return shifted;
}

function concatBytes(parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {result.set(part, offset); offset += part.length;}
  return result;
}

function makeRasterCommand(width, height, blackPixels) {
  const {rowBytes, raster} = packRasterRows(width, height, blackPixels);
  return concatBytes([
    Uint8Array.from([0x1d, 0x76, 0x30, 0x00, rowBytes & 0xff, (rowBytes >> 8) & 0xff, height & 0xff, (height >> 8) & 0xff]),
    raster,
  ]);
}

function splitBytes(bytes, chunkSize = 8192) {
  if (!(bytes instanceof Uint8Array) || !Number.isInteger(chunkSize) || chunkSize < 1) throw new Error('Provide bytes and a positive chunk size.');
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) chunks.push(bytes.slice(offset, Math.min(offset + chunkSize, bytes.length)));
  return chunks;
}

function makePrintJobBytes({width, height, rgba, tone = {}, feedLines = 3, cut = true}) {
  if (!Number.isInteger(feedLines) || feedLines < 0 || feedLines > 255) throw new Error('Feed lines must be an integer from 0 to 255.');
  const monochrome = rgbaToMonochrome(width, height, rgba, tone);
  const parts = [Uint8Array.from([0x1b, 0x40, 0x1b, 0x61, 0x00]), makeRasterCommand(width, height, monochrome)];
  if (feedLines) parts.push(Uint8Array.from([0x1b, 0x64, feedLines]));
  if (cut) parts.push(Uint8Array.from([0x1d, 0x56, 0x00]));
  return concatBytes(parts);
}

module.exports = {assertImage, concatBytes, makePrintJobBytes, makeRasterCommand, normalizeTone, offsetMonochromePixels, packRasterRows, rgbaToMonochrome, splitBytes, toneCorrect};
