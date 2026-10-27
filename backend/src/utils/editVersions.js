'use strict';
const conflict = () => Object.assign(new Error('These child assignments changed in another view. Refresh and review before saving.'), {statusCode:409});
function assertChildVersions(rows, expected) {
  if (!Array.isArray(expected) || expected.length !== rows.length) throw conflict();
  const versions = new Map();
  for (const item of expected) {
    if (!Number.isSafeInteger(item?.id) || !Number.isSafeInteger(item?.version) || item.version < 1 || versions.has(item.id)) throw conflict();
    versions.set(item.id, item.version);
  }
  if (rows.some(row => versions.get(row.id) !== row.version)) throw conflict();
}
module.exports = {assertChildVersions};
