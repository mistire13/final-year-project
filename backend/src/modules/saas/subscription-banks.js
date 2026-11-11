'use strict';
const banks = {
  telebirr: 'Telebirr',
  cbe: 'Commercial Bank of Ethiopia',
  abyssinia: 'Bank of Abyssinia',
};
const bankCodes = Object.keys(banks);
const isBankAccount = value => typeof value === 'string' && /^\d{6,30}$/.test(value);
function cbeReceipt(reference) {
  const invalid = () => new Error('Paste the complete HTTPS CBE receipt link.');
  if (typeof reference !== 'string' || reference.length > 2048 || !/^[\x21-\x7e]+$/.test(reference)) throw invalid();
  let url; try { url = new URL(reference); } catch { throw invalid(); }
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
  if (/^FT[A-Za-z0-9]{10}$/i.test(identifier)) throw invalid();
  return {identifier, reference: legacy ? legacy[1] : identifier, ...(legacy ? {accountSuffix:legacy[2]} : {})};
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
  if (suffix) throw new Error('CBE only requires the complete receipt link; do not enter an account suffix.');
  const receipt = cbeReceipt(reference);
  return receipt.accountSuffix ? {reference:receipt.reference,accountSuffix:receipt.accountSuffix} : {reference};
}
function referenceMatches(actual, submitted, provider, canonical) {
  if (typeof actual !== 'string') return false;
  if (canonical(actual, provider) === submitted) return true;
  if (provider !== 'cbe' || !/^https:/i.test(submitted)) return false;
  try {
    const receipt = cbeReceipt(submitted);
    return [receipt.identifier,receipt.reference].some(part => canonical(part,provider) === canonical(actual,provider));
  } catch { return false; }
}
module.exports = { banks, bankCodes, isBankAccount, cbeReceipt, receiptInput, referenceMatches };
