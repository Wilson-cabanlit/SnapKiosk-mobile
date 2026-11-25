const {Images} = require('react-native-nitro-image');
const {Platform} = require('react-native');
const {listSessions, transitionSession, upsertSession} = require('../sessionRepository');
const {listTemplates} = require('../templateRepository');
const {loadDeviceConfig} = require('../deviceConfig');
const {loadBrand} = require('../brandSettings');
const {loadPrintLayout} = require('../printLayout');
const {drawText} = require('./bitmapText');
const {makePrintJobBytes, offsetMonochromePixels, rgbaToMonochrome} = require('../printer/escpos');
const {GIFEncoder, quantize, applyPalette} = require('gifenc');

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

function fitCrop(image, targetWidth, targetHeight, motion = 0.5, zoom = 1) {
  const sourceRatio = image.width / image.height;
  const targetRatio = targetWidth / targetHeight;
  const safeZoom = Math.max(1, zoom);
  if (sourceRatio > targetRatio) {
    const cropWidth = image.height * targetRatio / safeZoom;
    const left = Math.max(0, Math.min(image.width - cropWidth, (image.width - cropWidth) * motion));
    return image.crop(left, 0, left + cropWidth, image.height);
  }
  const cropHeight = image.width / targetRatio / safeZoom;
  const top = Math.max(0, Math.min(image.height - cropHeight, (image.height - cropHeight) * motion));
  return image.crop(0, top, image.width, top + cropHeight);
}

function paintDigitalLayout(rgba, width, height, printLayout, substitutions, referenceDots) {
  const mask = new Uint8Array(width * height);
  if (printLayout.frame) {
    const left = Math.round(width * 0.035);
    const right = width - left - 1;
    const top = Math.round(height * 0.012);
    const bottom = height - top - 1;
    const thickness = Math.max(1, Math.round(width * 0.002));
    for (let edge = 0; edge < thickness; edge += 1) {
      for (let x = left; x <= right; x += 1) {
        mask[(top + edge) * width + x] = 1;
        mask[(bottom - edge) * width + x] = 1;
      }
      for (let y = top; y <= bottom; y += 1) {
        mask[y * width + left + edge] = 1;
        mask[y * width + right - edge] = 1;
      }
    }
  }
  printLayout.elements.filter(element => element.enabled).forEach(element => {
    const text = element.text.replace(/\{(businessName|eventName|thankYouMessage|date)\}/gi, (_, token) => substitutions[token[0].toLowerCase() + token.slice(1)] || '');
    drawText(mask, width, height, {
      text,
      x: Math.round(element.x * width),
      y: Math.round(element.y * height),
      maxWidth: Math.round(element.width * width),
      scale: Math.max(1, Math.round(element.size * width / referenceDots)),
      align: element.align,
    });
  });
  for (let pixel = 0, offset = 0; pixel < mask.length; pixel += 1, offset += 4) {
    if (mask[pixel]) {
      rgba[offset] = 38;
      rgba[offset + 1] = 36;
      rgba[offset + 2] = 31;
      rgba[offset + 3] = 255;
    }
  }
  return rgba;
}

function encodeAnimatedGif(frames, width, height) {
  const gif = GIFEncoder();
  frames.forEach((rgba, index) => {
    const palette = quantize(rgba, 256, {format: 'rgb565'});
    const pixels = applyPalette(rgba, palette, 'rgb565');
    gif.writeFrame(pixels, width, height, {palette, delay: 380, repeat: 0, dispose: 2, first: index === 0});
  });
  gif.finish();
  return new Uint8Array(gif.bytes());
}

function parseColor(value, fallback = '#ffffff') {
  let hex = String(value || fallback).replace('#', '');
  if (hex.length === 3 || hex.length === 4) hex = hex.slice(0, 3).split('').map(character => character + character).join('');
  const number = Number.parseInt(hex.slice(0, 6), 16);
  if (!Number.isFinite(number)) return {r: 1, g: 1, b: 1};
  return {r: ((number >> 16) & 255) / 255, g: ((number >> 8) & 255) / 255, b: (number & 255) / 255};
}

function colorBytes(value, fallback = '#26241f') {
  const {r, g, b} = parseColor(value, fallback);
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function rotateRgba(source, width, height, degrees = 0) {
  const angle = (Number(degrees) || 0) * Math.PI / 180;
  if (!angle) return {rgba: source, width, height};
  const cosine = Math.cos(angle); const sine = Math.sin(angle);
  const outputWidth = Math.max(1, Math.ceil(Math.abs(width * cosine) + Math.abs(height * sine)));
  const outputHeight = Math.max(1, Math.ceil(Math.abs(height * cosine) + Math.abs(width * sine)));
  const output = new Uint8Array(outputWidth * outputHeight * 4);
  const centerX = (width - 1) / 2; const centerY = (height - 1) / 2;
  const outputCenterX = (outputWidth - 1) / 2; const outputCenterY = (outputHeight - 1) / 2;
  for (let y = 0; y < outputHeight; y += 1) for (let x = 0; x < outputWidth; x += 1) {
    const dx = x - outputCenterX; const dy = y - outputCenterY;
    const sourceX = Math.round(cosine * dx + sine * dy + centerX);
    const sourceY = Math.round(-sine * dx + cosine * dy + centerY);
    if (sourceX < 0 || sourceX >= width || sourceY < 0 || sourceY >= height) continue;
    const sourceOffset = (sourceY * width + sourceX) * 4;
    const outputOffset = (y * outputWidth + x) * 4;
    output.set(source.subarray(sourceOffset, sourceOffset + 4), outputOffset);
  }
  return {rgba: output, width: outputWidth, height: outputHeight};
}

async function renderLayer(canvas, rgba, width, height, x, y, canvasWidth, canvasHeight) {
  const left = Math.max(0, x); const top = Math.max(0, y);
  const right = Math.min(canvasWidth, x + width); const bottom = Math.min(canvasHeight, y + height);
  if (right <= left || bottom <= top) return canvas;
  let clipped = rgba; let clippedWidth = width; let clippedHeight = height;
  if (left !== x || top !== y || right !== x + width || bottom !== y + height) {
    clippedWidth = right - left; clippedHeight = bottom - top;
    clipped = new Uint8Array(clippedWidth * clippedHeight * 4);
    const sourceX = left - x; const sourceY = top - y;
    for (let row = 0; row < clippedHeight; row += 1) {
      const sourceOffset = ((sourceY + row) * width + sourceX) * 4;
      clipped.set(rgba.subarray(sourceOffset, sourceOffset + clippedWidth * 4), row * clippedWidth * 4);
    }
  }
  const layer = await Images.loadFromRawPixelDataAsync({buffer: clipped.buffer, width: clippedWidth, height: clippedHeight, pixelFormat: 'RGBA'});
  return Platform.OS === 'android'
    ? canvas.renderIntoAsync(layer, left, top, right, bottom)
    : canvas.renderIntoAsync(layer, left, top, clippedWidth, clippedHeight);
}

async function renderPhotoSlot(source, width, height, element, background, motion, zoom) {
  if (element.fit === 'fill') return source.resize(width, height);
  if (element.fit !== 'contain') return fitCrop(source, width, height, motion, zoom).resize(width, height);
  const scale = Math.min(width / source.width, height / source.height);
  const fittedWidth = Math.max(1, Math.round(source.width * scale));
  const fittedHeight = Math.max(1, Math.round(source.height * scale));
  const fitted = source.resize(fittedWidth, fittedHeight);
  let frame = await Images.createBlankImageAsync(width, height, false, parseColor(background));
  const x = Math.round((width - fittedWidth) / 2); const y = Math.round((height - fittedHeight) / 2);
  frame = Platform.OS === 'android'
    ? await frame.renderIntoAsync(fitted, x, y, x + fittedWidth, y + fittedHeight)
    : await frame.renderIntoAsync(fitted, x, y, fittedWidth, fittedHeight);
  return frame;
}

function resolveTemplateText(text, {brand, session}) {
  const event = session.templateSnapshot?.eventVariables || {};
  const values = {
    'business.name': brand.businessName || '',
    'business.logo': '',
    'event.name': event.eventName || session.eventName || brand.eventName || '',
    'event.coupleNames': event.coupleNames || event.eventCoupleNames || event.eventName || session.eventName || brand.eventName || '',
    'event.date': event.eventDate || event.date || new Date(session.createdAt).toLocaleDateString('en-US', {year: 'numeric', month: 'short', day: '2-digit'}),
    'event.venue': event.venue || '', 'event.startTime': event.startTime || '', 'event.reference': event.reference || '', 'event.logo': '',
    'session.captureDate': new Date(session.createdAt).toLocaleDateString('en-US'),
    'session.captureTime': new Date(session.createdAt).toLocaleTimeString('en-US'),
    // The API provides no guest token before this renderer runs. Leave the
    // reserved QR placeholder blank rather than printing a fake QR code.
    'session.qrCode': '',
  };
  return String(text || '').replace(/\{\{([^}]+)\}\}/g, (_match, key) => values[key.trim()] ?? '');
}

async function renderTemplateLayout(layout, template, session, filterId, frameShift = 0, motion = 0.5) {
  const width = 1200;
  const height = Math.max(1, Math.round(width * layout.height / layout.width));
  const brand = await loadBrand();
  let canvas = await Images.createBlankImageAsync(width, height, false, parseColor(layout.background));
  let nextPhotoIndex = 0;
  const elements = [...layout.elements].sort((left, right) => (left.zIndex || 0) - (right.zIndex || 0));
  for (const element of elements) {
    const x = Math.round(element.x * width / layout.width);
    const y = Math.round(element.y * height / layout.height);
    const elementWidth = Math.max(1, Math.round(element.width * width / layout.width));
    const elementHeight = Math.max(1, Math.round(element.height * height / layout.height));
    if (element.type === 'shape') {
      const [red, green, blue] = colorBytes(element.fill || '#ffffff');
      const raw = new Uint8Array(elementWidth * elementHeight * 4);
      for (let offset = 0; offset < raw.length; offset += 4) {raw[offset] = red; raw[offset + 1] = green; raw[offset + 2] = blue; raw[offset + 3] = 255;}
      const rotated = rotateRgba(raw, elementWidth, elementHeight, element.rotation);
      canvas = await renderLayer(canvas, rotated.rgba, rotated.width, rotated.height, x - Math.round((rotated.width - elementWidth) / 2), y - Math.round((rotated.height - elementHeight) / 2), width, height);
    } else if (element.type === 'photo') {
      const explicitIndex = Number(String(element.id || '').match(/photo[-_ ]?(\d+)/i)?.[1]);
      const slotIndex = Number.isFinite(explicitIndex) && explicitIndex > 0 ? explicitIndex - 1 : nextPhotoIndex;
      nextPhotoIndex += 1;
      const photoIndex = (slotIndex + frameShift) % session.photos.length;
      const source = await Images.loadFromFileAsync(session.photos[photoIndex].filePath);
      const zoom = frameShift || session.photos.length === 1 ? 1 + 0.06 * Math.sin(motion * Math.PI) : 1;
      const cropped = await renderPhotoSlot(source, elementWidth, elementHeight, element, element.fill || layout.background, motion, zoom);
      const raw = await cropped.toRawPixelDataAsync(false);
      const rgba = filteredRgba(toRgba(raw), filterId);
      const rotated = rotateRgba(rgba, raw.width, raw.height, element.rotation);
      canvas = await renderLayer(canvas, rotated.rgba, rotated.width, rotated.height, x - Math.round((rotated.width - elementWidth) / 2), y - Math.round((rotated.height - elementHeight) / 2), width, height);
    } else if (element.type === 'text') {
      const text = resolveTemplateText(element.text, {brand, session});
      if (!text) continue;
      const mask = new Uint8Array(elementWidth * elementHeight);
      const size = Math.max(1, Math.min(8, Math.round((element.fontSize || 14) * width / layout.width / 7)));
      drawText(mask, elementWidth, elementHeight, {text, x: 0, y: 0, maxWidth: elementWidth, scale: size, align: element.align || 'left'});
      const [red, green, blue] = colorBytes(element.color || '#26241f');
      const raw = new Uint8Array(elementWidth * elementHeight * 4);
      for (let pixel = 0, offset = 0; pixel < mask.length; pixel += 1, offset += 4) {
        raw[offset] = red; raw[offset + 1] = green; raw[offset + 2] = blue; raw[offset + 3] = mask[pixel] ? 255 : 0;
      }
      const rotated = rotateRgba(raw, elementWidth, elementHeight, element.rotation);
      canvas = await renderLayer(canvas, rotated.rgba, rotated.width, rotated.height, x - Math.round((rotated.width - elementWidth) / 2), y - Math.round((rotated.height - elementHeight) / 2), width, height);
    }
  }
  return {canvas, width, height};
}

async function composeSession(sessionId, filterId = 'original', {includeGif = false} = {}) {
  const [sessions, templates, config, brand, printLayout] = await Promise.all([listSessions(), listTemplates(), loadDeviceConfig(), loadBrand(), loadPrintLayout()]);
  const session = sessions.find(item => item.id === sessionId);
  if (!session) throw new Error('Photo session was not found.');
  const template = session.templateSnapshot || templates.find(item => item.id === session.templateId);
  if (!template) throw new Error('The selected photo layout no longer exists.');
  const requiredPhotoCount = template.requiredPhotoCount || template.photoSlots.length;
  if (!Array.isArray(session.photos) || session.photos.length < requiredPhotoCount) throw new Error('Take every photo in the selected layout before composing.');
  if (!FILTERS.some(filter => filter.id === filterId)) throw new Error('Choose a supported photo filter.');

  const canvasWidth = 1200;
  const canvasHeight = Math.round(canvasWidth * template.canvas.height / template.canvas.width);
  // Use true paper white outside photos so dithering cannot turn the design's
  // empty canvas into a field of printed dots.
  const photoScale = 1 - (printLayout.photoTop || 0) - (printLayout.photoBottom || 0);
  const renderComposition = async (frameShift = 0, motion = 0.5) => {
    let composed = await Images.createBlankImageAsync(canvasWidth, canvasHeight, false, {r: 1, g: 1, b: 1});
    for (let index = 0; index < template.photoSlots.length; index += 1) {
      const slot = template.photoSlots[index];
      const x = Math.round(slot.x * canvasWidth);
      const y = Math.round(((printLayout.photoTop || 0) + slot.y * photoScale) * canvasHeight);
      const slotWidth = Math.max(1, Math.round(slot.width * canvasWidth));
      const slotHeight = Math.max(1, Math.round(slot.height * photoScale * canvasHeight));
      const photoIndex = (index + frameShift) % session.photos.length;
      const source = await Images.loadFromFileAsync(session.photos[photoIndex].filePath);
      const zoom = frameShift || session.photos.length === 1 ? 1 + 0.07 * Math.sin(motion * Math.PI) : 1;
      const cropped = fitCrop(source, slotWidth, slotHeight, motion, zoom).resize(slotWidth, slotHeight);
      const raw = await cropped.toRawPixelDataAsync(false);
      const rgba = filteredRgba(toRgba(raw), filterId);
      const filtered = await Images.loadFromRawPixelDataAsync({buffer: rgba.buffer, width: raw.width, height: raw.height, pixelFormat: 'RGBA'});
      composed = Platform.OS === 'android'
        ? await composed.renderIntoAsync(filtered, x, y, x + slotWidth, y + slotHeight)
        : await composed.renderIntoAsync(filtered, x, y, slotWidth, slotHeight);
    }
    return composed;
  };

  const isCentralTemplate = template.source === 'central' && template.templateSchema;
  const printerVariant = config.printer.paperWidthMm === 80 ? 'thermal80' : 'thermal58';
  const colorLayout = isCentralTemplate ? (template.templateSchema.variants?.color || template.templateSchema) : null;
  const thermalLayout = isCentralTemplate ? (template.templateSchema.variants?.[printerVariant] || template.templateSchema.variants?.thermal58 || template.templateSchema.variants?.thermal80 || colorLayout) : null;
  const renderedColor = isCentralTemplate ? await renderTemplateLayout(colorLayout, template, session, filterId) : null;
  const renderedThermal = isCentralTemplate ? await renderTemplateLayout(thermalLayout, template, session, filterId) : null;
  const canvas = renderedColor?.canvas || await renderComposition();
  const dots = config.printer.printableDots || (config.printer.paperWidthMm === 80 ? 576 : 384);
  const dateText = new Date(session.createdAt).toLocaleDateString('en-US', {year: 'numeric', month: 'short', day: '2-digit'});
  const substitutions = {
    businessName: brand.businessName || '',
    eventName: session.eventName || brand.eventName || '',
    thankYouMessage: brand.thankYouMessage || '',
    date: dateText,
  };

  const digitalPixels = isCentralTemplate
    ? toRgba(await canvas.toRawPixelDataAsync(false))
    : paintDigitalLayout(toRgba(await canvas.toRawPixelDataAsync(false)), canvasWidth, canvasHeight, printLayout, substitutions, dots);
  const digitalImage = await Images.loadFromRawPixelDataAsync({buffer: digitalPixels.buffer, width: canvasWidth, height: canvasHeight, pixelFormat: 'RGBA'});
  const digitalPath = await digitalImage.saveToTemporaryFileAsync('jpg', 94);

  const gifWidth = includeGif ? Math.min(480, canvasWidth) : null;
  const gifHeight = includeGif ? Math.max(1, Math.round(gifWidth * canvasHeight / canvasWidth)) : null;
  const gifFrameCount = includeGif ? Math.max(2, Math.min(6, session.photos.length)) : 0;
  let gifBytes = null;
  if (includeGif) {
    const gifFrames = [];
    for (let frame = 0; frame < gifFrameCount; frame += 1) {
      const frameMotion = frame / gifFrameCount;
      const animatedCanvas = frame === 0 ? canvas : isCentralTemplate
        ? (await renderTemplateLayout(colorLayout, template, session, filterId, frame % session.photos.length, frameMotion)).canvas
        : await renderComposition(frame % session.photos.length, frameMotion);
      const thumbnail = await animatedCanvas.resizeAsync(gifWidth, gifHeight);
      const framePixels = isCentralTemplate
        ? toRgba(await thumbnail.toRawPixelDataAsync(false))
        : paintDigitalLayout(toRgba(await thumbnail.toRawPixelDataAsync(false)), gifWidth, gifHeight, printLayout, substitutions, dots);
      gifFrames.push(framePixels);
    }
    gifBytes = encodeAnimatedGif(gifFrames, gifWidth, gifHeight);
  }
  const thermalCanvasWidth = renderedThermal?.width || canvasWidth;
  const thermalCanvasHeight = renderedThermal?.height || canvasHeight;
  const printCanvas = renderedThermal?.canvas || canvas;
  const thermalHeight = Math.max(1, Math.round(dots * thermalCanvasHeight / thermalCanvasWidth));
  const thermalImage = await printCanvas.resizeAsync(dots, thermalHeight);
  const thermalPixels = toRgba(await thermalImage.toRawPixelDataAsync(false));
  const tone = {mode: config.printer.ditherMode || 'floyd-steinberg', threshold: config.printer.threshold ?? 160, brightness: config.printer.brightness ?? 0, contrast: config.printer.contrast ?? 1, gamma: config.printer.gamma ?? 1};
  const black = offsetMonochromePixels(
    dots,
    thermalHeight,
    rgbaToMonochrome(dots, thermalHeight, thermalPixels, {...tone, cleanBackground: config.printer.cleanBackground !== false}),
    config.printer.horizontalOffsetDots ?? 0,
  );
  const offsetDots = config.printer.horizontalOffsetDots ?? 0;
  if (!isCentralTemplate && printLayout.frame) {
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
  if (!isCentralTemplate) printLayout.elements.filter(element => element.enabled).forEach(element => {
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
  updated = await upsertSession({...updated, composition: {digitalPath, thermalPath, filterId, gifWidth, gifHeight, gifFrameCount, width: canvasWidth, height: canvasHeight, thermalWidth: dots, thermalHeight, tone, templateVersion: template.version, templateVersionId: template.templateVersionId || null, generatedAt: new Date().toISOString()}});
  return {digitalPath, thermalPath, gifBytes, gifWidth, gifHeight, gifFrameCount, printPayload, session: updated, template, width: canvasWidth, height: canvasHeight, thermalWidth: dots, thermalHeight};
}

module.exports = {FILTERS, composeSession, filteredRgba, fitCrop, toRgba};
