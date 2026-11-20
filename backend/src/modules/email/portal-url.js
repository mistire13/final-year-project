'use strict';
function portalUrl(value = process.env.FRONTEND_URL, environment = process.env.NODE_ENV) {
  const url = new URL(value);
  const octets = url.hostname.split('.').map(Number);
  const privateIp = octets.length === 4 && octets.every(n => Number.isInteger(n) && n >= 0 && n <= 255)
    && (octets[0] === 10 || (octets[0] === 192 && octets[1] === 168) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31));
  const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname) || privateIp;
  if (url.username || url.password || (url.protocol !== 'https:' && !(environment === 'development' && url.protocol === 'http:' && local))) {
    throw new Error('Configure a secure FRONTEND_URL for email links.');
  }
  return url;
}
module.exports = { portalUrl };
