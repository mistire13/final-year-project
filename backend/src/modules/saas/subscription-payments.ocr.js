'use strict';
const { spawn } = require('node:child_process');

let active = 0;
const failure = (message, statusCode = 422) => Object.assign(new Error(message), { statusCode });

function candidates(text) {
  const found = [];
  const add = word => {
    const value = word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
    // Dashen references can contain digits only. Avoid short incidental numbers;
    // every candidate remains untrusted until the payer and verifier check it.
    if (value.length >= 8 && value.length <= 32 && /\d/.test(value) && !found.includes(value)) found.push(value);
  };
  const lines = String(text).split(/\r?\n/);
  // Labelled lines first. Candidates are hints only; the customer must confirm.
  for (const line of lines.filter(l => /reference|receipt|transaction|ref\b/i.test(l))) {
    for (const word of line.split(/\s+/)) add(word);
  }
  for (const line of lines) for (const word of line.split(/\s+/)) add(word);
  return found.slice(0, 12);
}

async function extract(buffer, mime, options = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16 || buffer.length > 3 * 1024 * 1024) throw failure('Upload a PNG or JPEG image of at most 3 MB.');
  const png = buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (!(mime === 'image/png' && png) && !(mime === 'image/jpeg' && jpeg)) throw failure('Upload a valid PNG or JPEG image.');
  if (active >= 2) throw failure('Receipt scanning is busy. Please try again or enter the reference.', 503);
  active += 1;
  try {
    const output = await new Promise((resolve, reject) => {
      let child;
      try { child = (options.spawn ?? spawn)(options.command ?? process.env.SUBSCRIPTION_OCR_COMMAND ?? 'tesseract',
        ['stdin','stdout','-l','eng','--psm','6'], { stdio:['pipe','pipe','ignore'], windowsHide:true }); }
      catch (_) { reject(failure('Receipt scanning is unavailable. Enter the reference instead.',503)); return; }
      let text = '', settled = false;
      const finish = (err, value) => { if (settled) return; settled=true; clearTimeout(timer); err ? reject(err) : resolve(value); };
      const timer = setTimeout(() => { child.kill(); finish(failure('Receipt scanning timed out. Enter the reference instead.',503)); }, 20000);
      child.on('error', () => finish(failure('Receipt scanning is unavailable. Enter the reference instead.',503)));
      child.stdin.on('error', () => {});
      child.stdout.on('data', chunk => { text += chunk.toString('utf8'); if (text.length > 20000) { child.kill(); finish(failure('Receipt text is too large.')); } });
      child.on('close', code => code === 0 ? finish(null,text) : finish(failure('Receipt could not be read. Enter the reference instead.')));
      child.stdin.end(buffer);
    });
    return { candidates: candidates(output) };
  } finally { active -= 1; }
}
module.exports = { extract, candidates };
