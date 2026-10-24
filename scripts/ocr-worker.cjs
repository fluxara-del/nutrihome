// A short-lived local process: no uploads, CDN downloads, image files or OCR cache.
const { readFileSync, copyFileSync } = require('node:fs');
const { join } = require('node:path');
const { createWorker, OEM } = require('tesseract.js');
(async () => {
  const image = readFileSync(0);
  const langPath = process.argv[2];
  if (!langPath) throw new Error('Local model directory required');
  for (const code of ['hrv', 'eng']) copyFileSync(join(require(`@tesseract.js-data/${code}`).langPath, `${code}.traineddata.gz`), join(langPath, `${code}.traineddata.gz`));
  const worker = await createWorker('hrv+eng', OEM.LSTM_ONLY, { langPath, cacheMethod: 'none', errorHandler: () => {} });
  try {
    const { data } = await worker.recognize(image);
    process.stdout.write(JSON.stringify({ text: data.text.slice(0, 20000), confidence: data.confidence }));
  } finally { await worker.terminate(); }
})().catch(() => { process.exitCode = 1; });
