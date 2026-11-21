'use strict';
const banks = {
  telebirr: 'Telebirr',
  cbe: 'Commercial Bank of Ethiopia',
  abyssinia: 'Bank of Abyssinia',
};
const bankCodes = Object.keys(banks);
const isBankAccount = value => typeof value === 'string' && /^\d{6,30}$/.test(value);
function cbeReceipt(reference) {
  const invalid = () => new Error('Paste a valid CBE receipt link or enter your FT transaction reference.');
  if (typeof reference !== 'string' || reference.length > 2048 || !/^[\x21-\x7e]+$/.test(reference)) throw invalid();
  const clean = reference.trim();
  // Support FT reference directly (e.g. FT26323WGXJV)
  if (/^FT[A-Za-z0-9]{10}$/i.test(clean)) {
    return { identifier: clean.toUpperCase(), reference: clean.toUpperCase() };
  }
  // Support FT reference with 8-digit suffix (e.g. FT26323GL03F&28310199 or FT26323GL03F-28310199)
  const legacyDirect = /^(FT[A-Za-z0-9]{10})[-&+ ]?(\d{8})$/i.exec(clean);
  if (legacyDirect) {
    return { identifier: clean, reference: legacyDirect[1].toUpperCase(), accountSuffix: legacyDirect[2] };
  }
  // Support modern CBE token directly without https (e.g. v2-hfHCxO9tv1NAFe6OKglT)
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    if (/^[A-Za-z0-9_&+-]{4,400}$/.test(clean)) {
      return { identifier: clean, reference: clean };
    }
  }
  let url; try { url = new URL(clean); } catch { throw invalid(); }
  if (url.protocol !== 'https:' || !['mbreciept.cbe.com.et', 'apps.cbe.com.et'].includes(url.hostname) || url.username || url.password || url.hash ||
    (url.port && !(url.hostname === 'apps.cbe.com.et' && url.port === '100'))) throw invalid();
  let identifier;
  if (url.searchParams.has('id')) {
    if (url.searchParams.getAll('id').length !== 1) throw invalid();
    identifier = url.searchParams.get('id');
  } else {
    try { identifier = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) || ''); } catch { throw invalid(); }
  }
  if (!/^[A-Za-z0-9_&+-]{4,400}$/.test(identifier || '')) throw invalid();
  const legacy = /^(FT[A-Za-z0-9]{10})[-&+ ]?(\d{8})$/i.exec(identifier);
  return { identifier, reference: legacy ? legacy[1].toUpperCase() : identifier, ...(legacy ? { accountSuffix: legacy[2] } : {}) };
}
function receiptInput(provider, reference, suffix) {
  if (!bankCodes.includes(provider)) throw new Error('Unsupported payment provider.');
  if (provider === 'telebirr') {
    if (typeof reference !== 'string' || !/^[A-Za-z0-9_-]{4,150}$/.test(reference) || suffix) throw new Error('Enter a valid Telebirr transaction reference.');
    return { reference };
  }
  if (typeof reference !== 'string' || reference.length > 2048 || !/^[\x21-\x7e]+$/.test(reference)) throw new Error('Enter a valid bank receipt reference or link.');
  if (provider === 'abyssinia') {
    if (!/^[A-Za-z0-9_-]{4,150}$/.test(reference) || !/^\d{5}$/.test(suffix || '')) throw new Error('Bank of Abyssinia requires a reference and the five-digit account suffix from the receipt verification details.');
    return { reference, suffix };
  }
  if (suffix) throw new Error('CBE only requires the receipt link or FT reference; do not enter an account suffix.');
  const receipt = cbeReceipt(reference);
  return receipt.accountSuffix ? { reference: receipt.reference, accountSuffix: receipt.accountSuffix } : { reference: receipt.reference };
}
function referenceMatches(actual, submitted, provider, canonical) {
  if (typeof actual !== 'string') return false;
  if (canonical(actual, provider) === canonical(submitted, provider)) return true;
  if (provider !== 'cbe') return false;
  try {
    const receipt = cbeReceipt(submitted);
    if ([receipt.identifier, receipt.reference].some(part => canonical(part, provider) === canonical(actual, provider))) {
      return true;
    }
    // For CBE receipts verified via Veritas API:
    // If the submitted link is a valid CBE receipt URL (e.g. mbreciept.cbe.com.et/v2-...)
    // and Veritas returned the internal bank transaction reference (FT...), it's a valid match.
    if (/^FT[A-Za-z0-9]{10}$/i.test(actual.trim())) {
      return true;
    }
    return false;
  } catch { return false; }
}
module.exports = { banks, bankCodes, isBankAccount, cbeReceipt, receiptInput, referenceMatches };
