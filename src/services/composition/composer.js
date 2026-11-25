const {Images} = require('react-native-nitro-image');
const {Platform} = require('react-native');
const {listSessions, transitionSession, upsertSession} = require('../sessionRepository');
const {listTemplates} = require('../templateRepository');
const {loadDeviceConfig} = require('../deviceConfig');
const {loadBrand} = require('../brandSettings');
const {loadPrintLayout} = require('../printLayout');
const {drawText} = require('./bitmapText');
const {makePrintJobBytes, offsetMonochromePixels, rgbaToMonochrome} = require('../printer/escpos');

const FILTERS = [
  {id: 'original', name: 'Original'},
  {id: 'warm', name: 'Warm'},
  {id: 'soft', name: 'Soft'},
  {id: 'monochrome', name: 'Black & white'},
  {id: 'sepia', name: 'Sepia'},
];

function toRgba(raw) {
  const input = new Uint8Array(raw.buffer);
  const output = new Uint8Array(raw.width * raw.height * 4);
  for (let i = 0; i < input.length; i += 4) {
    const target = i;
    switch (raw.pixelFormat) {
      case 'RGBA': output.set(input.subarray(i, i + 4), target); break;
      case 'BGRA': output[target] = input[i + 2]; output[target + 1] = input[i + 1]; output[target + 2] = input[i]; output[target + 3] = input[i + 3]; break;
      case 'ARGB': output[target] = input[i + 1]; output[target + 1] = input[i + 2]; output[target + 2] = input[i + 3]; output[target + 3] = input[i]; break;
      case 'RGBX': output[target] = input[i]; output[target + 1] = input[i + 1]; output[target + 2] = input[i + 2]; output[target + 3] = 255; break;
      case 'BGRX': output[target] = input[i + 2]; output[target + 1] = input[i + 1]; output[target + 2] = input[i]; output[target + 3] = 255; break;
      default: throw new Error(`The image pixel format ${raw.pixelFormat} is not supported for composition.`);
    }
  }
  return output;
}

function filteredRgba(rgba, filterId) {
  const result = new Uint8Array(rgba);
  for (let i = 0; i < result.length; i += 4) {
    const red = result[i]; const green = result[i + 1]; const blue = result[i + 2];
    if (filterId === 'monochrome') {
      const gray = Math.round(0.299 * red + 0.587 * green + 0.114 * blue);
      result[i] = gray; result[i + 1] = gray; result[i + 2] = gray;
    } else if (filterId === 'warm') {
      result[i] = Math.min(255, Math.round(red * 1.06 + 8));
      result[i + 1] = Math.min(255, Math.round(green * 1.01 + 3));
      result[i + 2] = Math.max(0, Math.round(blue * 0.91 - 2));
    } else if (filterId === 'soft') {
      result[i] = Math.min(255, Math.round((red - 128) * 0.88 + 134));
      result[i + 1] = Math.min(255, Math.round((green - 128) * 0.88 + 134));
      result[i + 2] = Math.min(255, Math.round((blue - 128) * 0.88 + 134));
    } else if (filterId === 'sepia') {
      result[i] = Math.min(255, Math.round(red * 0.393 + green * 0.769 + blue * 0.189));
      result[i + 1] = Math.min(255, Math.round(red * 0.349 + green * 0.686 + blue * 0.168));
      result[i + 2] = Math.min(255, Math.round(red * 0.272 + green * 0.534 + blue * 0.131));
    } else if (filterId !== 'original') {
      throw new Error(`Unknown photo filter: ${filterId}`);
    }
  }
  return result;
}

function fitCrop(image, targetWidth, targetHeight) {
  const sourceRatio = image.width / image.height;
  const targetRatio = targetWidth / targetHeight;
  if (sourceRatio > targetRatio) {
    const cropWidth = image.height * targetRatio;
    const left = (image.width - cropWidth) / 2;
    return image.crop(left, 0, left + cropWidth, image.height);
  }
  const cropHeight = image.width / targetRatio;
  const top = (image.height - cropHeight) / 2;
  return image.crop(0, top, image.width, top + cropHeight);
}

async function composeSession(sessionId, filterId = 'original') {
  const [sessions, templates, config, brand, printLayout] = await Promise.all([listSessions(), listTemplates(), loadDeviceConfig(), loadBrand(), loadPrintLayout()]);
  const session = sessions.find(item => item.id === sessionId);
  if (!session) throw new Error('Photo session was not found.');
  const template = templates.find(item => item.id === session.templateId);
  if (!template) throw new Error('The selected photo layout no longer exists.');
  if (!Array.isArray(session.photos) || session.photos.length < template.photoSlots.length) throw new Error('Take every photo in the selected layout before composing.');
  if (!FILTERS.some(filter => filter.id === filterId)) throw new Error('Choose a supported photo filter.');

  const canvasWidth = 1200;
  const canvasHeight = Math.round(canvasWidth * template.canvas.height / template.canvas.width);
  // Use true paper white outside photos so dithering cannot turn the design's
  // empty canvas into a field of printed dots.
  let canvas = await Images.createBlankImageAsync(canvasWidth, canvasHeight, false, {r: 1, g: 1, b: 1});
  for (let index = 0; index < template.photoSlots.length; index += 1) {
    const slot = template.photoSlots[index];
    const x = Math.round(slot.x * canvasWidth);
    const photoScale = 1 - (printLayout.photoTop || 0) - (printLayout.photoBottom || 0);
    const y = Math.round(((printLayout.photoTop || 0) + slot.y * photoScale) * canvasHeight);
    const width = Math.max(1, Math.round(slot.width * canvasWidth));
    const height = Math.max(1, Math.round(slot.height * photoScale * canvasHeight));
    const source = await Images.loadFromFileAsync(session.photos[index].filePath);
    // Crop and resize natively before reading pixels into JS. Camera captures
    // can be several megapixels, while a layout slot only needs about 1 MP.
    const cropped = fitCrop(source, width, height).resize(width, height);
    const raw = await cropped.toRawPixelDataAsync(false);
    const rgba = filteredRgba(toRgba(raw), filterId);
    const filtered = await Images.loadFromRawPixelDataAsync({buffer: rgba.buffer, width: raw.width, height: raw.height, pixelFormat: 'RGBA'});
    // Nitro Image's Android backend maps the final two arguments to Rect's
    // right/bottom coordinates, while iOS treats them as width/height.
    // Pass the correct form on each platform so every template slot is drawn.
    canvas = Platform.OS === 'android'
      ? await canvas.renderIntoAsync(filtered, x, y, x + width, y + height)
      : await canvas.renderIntoAsync(filtered, x, y, width, height);
  }

  const digitalPath = await canvas.saveToTemporaryFileAsync('jpg', 94);
  const dots = config.printer.printableDots || (config.printer.paperWidthMm === 80 ? 576 : 384);
  const thermalHeight = Math.max(1, Math.round(dots * canvasHeight / canvasWidth));
  const thermalImage = await canvas.resizeAsync(dots, thermalHeight);
  const thermalPixels = toRgba(await thermalImage.toRawPixelDataAsync(false));
  const tone = {mode: config.printer.ditherMode || 'floyd-steinberg', threshold: config.printer.threshold ?? 160, brightness: config.printer.brightness ?? 0, contrast: config.printer.contrast ?? 1, gamma: config.printer.gamma ?? 1};
  const black = offsetMonochromePixels(
    dots,
    thermalHeight,
    rgbaToMonochrome(dots, thermalHeight, thermalPixels, {...tone, cleanBackground: config.printer.cleanBackground !== false}),
    config.printer.horizontalOffsetDots ?? 0,
  );
  const offsetDots = config.printer.horizontalOffsetDots ?? 0;
  if (printLayout.frame) {
    const left = Math.round(dots * 0.035) + offsetDots;
    const right = dots - Math.round(dots * 0.035) - 1 + offsetDots;
    const top = Math.round(thermalHeight * 0.012);
    const bottom = thermalHeight - top - 1;
    for (let x = left; x <= right; x += 1) {
      if (x >= 0 && x < dots) {black[top * dots + x] = 1; black[bottom * dots + x] = 1;}
    }
    for (let y = top; y <= bottom; y += 1) {
      if (left >= 0 && left < dots) black[y * dots + left] = 1;
      if (right >= 0 && right < dots) black[y * dots + right] = 1;
    }
  }
  const dateText = new Date(session.createdAt).toLocaleDateString('en-US', {year: 'numeric', month: 'short', day: '2-digit'});
  const substitutions = {
    businessName: brand.businessName || '',
    eventName: session.eventName || brand.eventName || '',
    thankYouMessage: brand.thankYouMessage || '',
    date: dateText,
  };
  printLayout.elements.filter(element => element.enabled).forEach(element => {
    const text = element.text.replace(/\{(businessName|eventName|thankYouMessage|date)\}/gi, (_, token) => substitutions[token[0].toLowerCase() + token.slice(1)] || '');
    drawText(black, dots, thermalHeight, {
      text,
      x: Math.round(element.x * dots) + offsetDots,
      y: Math.round(element.y * thermalHeight),
      maxWidth: Math.round(element.width * dots),
      scale: element.size,
      align: element.align,
    });
  });
  const bwRgba = new Uint8Array(dots * thermalHeight * 4);
  for (let pixel = 0, offset = 0; pixel < black.length; pixel += 1, offset += 4) {
    const value = black[pixel] ? 0 : 255;
    bwRgba[offset] = value; bwRgba[offset + 1] = value; bwRgba[offset + 2] = value; bwRgba[offset + 3] = 255;
  }
  const thermalPreview = await Images.loadFromRawPixelDataAsync({buffer: bwRgba.buffer, width: dots, height: thermalHeight, pixelFormat: 'RGBA'});
  const thermalPath = await thermalPreview.saveToTemporaryFileAsync('png');
  const printPayload = makePrintJobBytes({width: dots, height: thermalHeight, rgba: bwRgba, tone: {mode: 'threshold', threshold: 128}, feedLines: config.printer.feedLines, cut: config.printer.cutAfterPrint});

  let updated = session;
  if (updated.status === 'capture') updated = transitionSession(updated, 'review');
  if (updated.status === 'review') updated = transitionSession(updated, 'compose');
  updated = await upsertSession({...updated, composition: {digitalPath, thermalPath, filterId, width: canvasWidth, height: canvasHeight, thermalWidth: dots, thermalHeight, tone, generatedAt: new Date().toISOString()}});
  return {digitalPath, thermalPath, printPayload, session: updated, template, width: canvasWidth, height: canvasHeight, thermalWidth: dots, thermalHeight};
}

module.exports = {FILTERS, composeSession, filteredRgba, fitCrop, toRgba};
