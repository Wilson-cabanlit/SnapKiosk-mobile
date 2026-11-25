const AsyncStorage = require('@react-native-async-storage/async-storage').default;

const PRINT_QUEUE_KEY = 'snapkiosk.print-queue.v1';
const STATES = ['queued', 'printing', 'failed', 'sent'];

function createPrintJob({sessionId, imagePath, copies = 1, paperWidthMm = 58, printableDots = paperWidthMm === 58 ? 384 : 576, printOptions = {}}) {
  if (!sessionId || !imagePath) throw new Error('A session and composed image are required before queuing a print.');
  if (!Number.isInteger(copies) || copies < 1 || copies > 10) throw new Error('Print copies must be between 1 and 10.');
  if (![58, 80].includes(paperWidthMm)) throw new Error('Paper width must be 58 mm or 80 mm.');
  if (!Number.isInteger(printableDots) || printableDots < 1 || printableDots > 2048) throw new Error('Printable width must be from 1 to 2048 dots.');
  const now = new Date().toISOString();
  return {
    id: `print-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    sessionId, imagePath, copies, paperWidthMm, printableDots, printOptions,
    status: 'queued', attemptCount: 0, createdAt: now, updatedAt: now,
    lastError: null, attempts: [],
  };
}

function validateJob(job) {
  if (!job || typeof job.id !== 'string' || !job.id || !STATES.includes(job.status)) throw new Error('Invalid print job record.');
  if (!Array.isArray(job.attempts)) throw new Error('Print attempt history must be a list.');
  return job;
}

async function listPrintJobs() {
  const raw = await AsyncStorage.getItem(PRINT_QUEUE_KEY);
  const jobs = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(jobs)) throw new Error('Local print queue is invalid.');
  return jobs.map(job => validateJob(job?.status === 'printed' ? {...job, status: 'sent'} : job)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function saveJobs(jobs) {
  jobs.forEach(validateJob);
  await AsyncStorage.setItem(PRINT_QUEUE_KEY, JSON.stringify(jobs));
  return jobs;
}

async function enqueuePrintJob(input) {
  const job = createPrintJob(input);
  await saveJobs([job, ...(await listPrintJobs())]);
  return job;
}

async function setJobStatus(jobId, status, error = null) {
  if (!STATES.includes(status)) throw new Error(`Unknown print job status: ${status}`);
  const jobs = await listPrintJobs();
  const job = jobs.find(item => item.id === jobId);
  if (!job) throw new Error('Print job was not found.');
  const allowed = {
    queued: ['printing'],
    printing: ['failed', 'sent'],
    failed: ['queued'],
    sent: [],
  };
  if (!allowed[job.status].includes(status)) {
    throw new Error(job.status === 'sent' ? 'A sent print job cannot be reopened. Create an explicit reprint job instead.' : `Cannot change a ${job.status} print job to ${status}.`);
  }
  const now = new Date().toISOString();
  const changed = {...job, status, updatedAt: now, lastError: status === 'failed' ? String(error || 'Printer failed without an error message.') : null};
  if (status === 'printing' || status === 'failed' || status === 'sent') {
    changed.attemptCount += status === 'printing' ? 1 : 0;
    changed.attempts = [...job.attempts, {at: now, status, error: status === 'failed' ? changed.lastError : null}];
  }
  await saveJobs(jobs.map(item => item.id === jobId ? changed : item));
  return changed;
}

async function retryPrintJob(jobId) {
  const jobs = await listPrintJobs();
  const job = jobs.find(item => item.id === jobId);
  if (!job) throw new Error('Print job was not found.');
  if (job.status !== 'failed') throw new Error('Only failed print jobs can be retried.');
  return setJobStatus(jobId, 'queued');
}

async function createReprintJob(jobId) {
  const job = (await listPrintJobs()).find(item => item.id === jobId);
  if (!job) throw new Error('Print job was not found.');
  return enqueuePrintJob({...job, copies: job.copies});
}

async function printQueuedJob(jobId) {
  const job = (await listPrintJobs()).find(item => item.id === jobId);
  if (!job) throw new Error('Print job was not found.');
  if (job.status !== 'queued') throw new Error('Only queued jobs can be sent to a printer.');

  const {Platform} = require('react-native');
  if (Platform.OS !== 'android') throw new Error('Bluetooth Classic queue printing is available on Android only.');

  const {Images} = require('react-native-nitro-image');
  const {toRgba} = require('../composition/composer');
  const {makePrintJobBytes} = require('./escpos');
  const {connectPrinter, requestBluetoothPermissions, sendPrinterBytes} = require('./bluetooth');
  const {loadDeviceConfig} = require('../deviceConfig');

  await setJobStatus(jobId, 'printing');
  try {
    const config = await loadDeviceConfig();
    const selectedPrinter = config.printer.selectedPrinter;
    if (!selectedPrinter?.address) throw new Error('Select and connect a Bluetooth printer in Printer settings first.');
    await requestBluetoothPermissions();
    await connectPrinter(selectedPrinter.address);

    const image = await Images.loadFromFileAsync(job.imagePath);
    const raw = await image.toRawPixelDataAsync(false);
    const payload = makePrintJobBytes({
      width: job.printableDots,
      height: raw.height,
      rgba: toRgba(raw),
      tone: {mode: 'threshold', threshold: 128},
      feedLines: job.printOptions?.feedLines ?? config.printer.feedLines,
      cut: job.printOptions?.cutAfterPrint ?? config.printer.cutAfterPrint,
    });
    const byteArray = Array.from(payload);
    for (let copy = 0; copy < job.copies; copy += 1) await sendPrinterBytes(byteArray);
    return await setJobStatus(jobId, 'sent');
  } catch (error) {
    await setJobStatus(jobId, 'failed', error?.message || 'Could not send the print job.').catch(() => {});
    throw error;
  }
}

async function removePrintJob(jobId) {
  return saveJobs((await listPrintJobs()).filter(job => job.id !== jobId));
}

module.exports = {PRINT_QUEUE_KEY, STATES, createPrintJob, createReprintJob, enqueuePrintJob, listPrintJobs, printQueuedJob, removePrintJob, retryPrintJob, saveJobs, setJobStatus, validateJob};
