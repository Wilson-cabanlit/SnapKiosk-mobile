const test = require('node:test');
const assert = require('node:assert/strict');
const {makePrintJobBytes, makeRasterCommand, packRasterRows, rgbaToMonochrome, splitBytes, toneCorrect} = require('./escpos');

function rgba(values) {
  return Uint8Array.from(values.flatMap(gray => [gray, gray, gray, 255]));
}

test('packs black pixels MSB-first and leaves unused row bits white', () => {
  const pixels = Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 0, 1]);
  const packed = packRasterRows(9, 1, pixels);
  assert.equal(packed.rowBytes, 2);
  assert.deepEqual([...packed.raster], [0x80, 0x80]);
});

test('emits ESC/POS GS v 0 header with little-endian dimensions', () => {
  const command = makeRasterCommand(9, 1, Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 0, 1]));
  assert.deepEqual([...command.slice(0, 8)], [0x1d, 0x76, 0x30, 0, 2, 0, 1, 0]);
  assert.deepEqual([...command.slice(8)], [0x80, 0x80]);
});

test('threshold mode converts dark pixels to black and white pixels to white', () => {
  const pixels = rgbaToMonochrome(2, 1, rgba([50, 230]), {mode: 'threshold', threshold: 160});
  assert.deepEqual([...pixels], [1, 0]);
});

test('ordered and error-diffusion modes return one binary value per pixel', () => {
  const source = rgba([0, 80, 150, 220]);
  for (const mode of ['ordered', 'floyd-steinberg', 'atkinson']) {
    const pixels = rgbaToMonochrome(2, 2, source, {mode});
    assert.equal(pixels.length, 4);
    assert.ok([...pixels].every(value => value === 0 || value === 1));
  }
});

test('splits raster payload into bounded chunks without changing bytes', () => {
  const input = Uint8Array.from([1, 2, 3, 4, 5]);
  const chunks = splitBytes(input, 2);
  assert.deepEqual(chunks.map(chunk => chunk.length), [2, 2, 1]);
  assert.deepEqual([...chunks.flatMap(chunk => [...chunk])], [...input]);
});

test('builds a complete print payload with initialize, feed, and cut commands', () => {
  const payload = makePrintJobBytes({width: 1, height: 1, rgba: rgba([0]), tone: {mode: 'threshold'}, feedLines: 3, cut: true});
  assert.deepEqual([...payload.slice(0, 2)], [0x1b, 0x40]);
  assert.deepEqual([...payload.slice(-6)], [0x1b, 0x64, 3, 0x1d, 0x56, 0]);
  assert.equal(payload[payload.length - 1], 0);
});

test('rejects malformed source dimensions and invalid tone values', () => {
  assert.throws(() => rgbaToMonochrome(2, 1, rgba([1]), {mode: 'threshold'}), /exactly width/);
  assert.throws(() => toneCorrect(100, {gamma: 0}), /Gamma/);
  assert.throws(() => rgbaToMonochrome(1, 1, rgba([100]), {mode: 'other'}), /Unsupported dithering/);
});
