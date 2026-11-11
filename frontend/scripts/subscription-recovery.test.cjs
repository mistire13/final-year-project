'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/landing/subscriptionRecovery.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const moduleObject = { exports: {} };
vm.runInNewContext(compiled, { module: moduleObject, exports: moduleObject.exports, URL, URLSearchParams });
const consume = moduleObject.exports.consumeSubscriptionRecovery;

test('recovery consumes the secret fragment and retains unrelated query state', () => {
  const id = '09e688c6-8e1d-4b3a-81c6-a80b0c09b123', token = 'A'.repeat(43);
  let replacement;
  const result = consume(`https://ankelba.example/?from=email&subscription_resume=${id}#token=${token}`, path => { replacement = path; });
  assert.equal(result.id, id); assert.equal(result.token, token); assert.equal(replacement, '/?from=email');
  assert.ok(!replacement.includes(token));
});
test('invalid recovery links are scrubbed and never used', () => {
  let replacement;
  assert.equal(consume('https://ankelba.example/?subscription_resume=bad#token=private', path => { replacement = path; }), null);
  assert.equal(replacement, '/');
});
test('renewal recovery stays separate from the registration flow', () => {
  const id = '09e688c6-8e1d-4b3a-81c6-a80b0c09b123', token = 'B'.repeat(43);
  let replacement;
  const result = consume(`https://ankelba.example/?subscription_resume=${id}#token=${token}&purpose=renewal`, path => { replacement = path; });
  assert.equal(result.purpose, 'renewal'); assert.equal(result.token, token); assert.equal(replacement, '/');
});
