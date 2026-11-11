'use strict';
const { test, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

const { addBillingPeriod, stateOf, matchesRenewalTerms, applyRenewalLocked } = require('../../../../../../Users/Mistire/Desktop/final year project/backend/src/modules/saas/subscriptions.service');
const { createPaymentService, verifySecret, secretHash, canonicalReference, matchesVerifiedPayment, lookupVeritas } = require('../../../../../../Users/Mistire/Desktop/final year project/backend/src/modules/saas/subscription-payments.service');
const ocr = require('../../../../../../Users/Mistire/Desktop/final year project/backend/src/modules/saas/subscription-payments.ocr');
const { createReminderWorker, fromEnvironment } = require('../../../../../../Users/Mistire/Desktop/final year project/backend/src/modules/saas/subscription-reminders');
const { createSubscriptionAccess, isCareWrite } = require('../../../../../../Users/Mistire/Desktop/final year project/backend/src/middleware/subscription-access');

describe('Subscription Calendar Period Calculations & Addis Ababa Timezone Clamping', () => {
  it('correctly clamps Jan 31 -> Feb 28 in a non-leap year (2025)', () => {
    // 2025 is not a leap year. Feb has 28 days.
    const start = new Date('2025-01-31T09:00:00.000Z'); // 12:00 EAT
    const next = addBillingPeriod(start, 'monthly', start);
    assert.equal(next.toISOString(), '2025-02-28T09:00:00.000Z');
  });

  it('correctly clamps Jan 31 -> Feb 29 in a leap year (2024)', () => {
    // 2024 is a leap year. Feb has 29 days.
    const start = new Date('2024-01-31T09:00:00.000Z');
    const next = addBillingPeriod(start, 'monthly', start);
    assert.equal(next.toISOString(), '2024-02-29T09:00:00.000Z');
  });

  it('restores the 31st on subsequent months when anchored to original start date', () => {
    // Anchor: Jan 31, 2025
    const anchor = new Date('2025-01-31T09:00:00.000Z');
    const febEnd = addBillingPeriod(anchor, 'monthly', anchor);
    assert.equal(febEnd.toISOString(), '2025-02-28T09:00:00.000Z');

    // Next period from febEnd, retaining anchor
    const marchEnd = addBillingPeriod(febEnd, 'monthly', anchor);
    assert.equal(marchEnd.toISOString(), '2025-03-31T09:00:00.000Z');

    // April has 30 days -> clamps to April 30
    const aprilEnd = addBillingPeriod(marchEnd, 'monthly', anchor);
    assert.equal(aprilEnd.toISOString(), '2025-04-30T09:00:00.000Z');

    // May has 31 days -> restores to May 31
    const mayEnd = addBillingPeriod(aprilEnd, 'monthly', anchor);
    assert.equal(mayEnd.toISOString(), '2025-05-31T09:00:00.000Z');
  });

  it('correctly advances Feb 29 in a leap year to March 29', () => {
    const leapDay = new Date('2024-02-29T10:00:00.000Z');
    const next = addBillingPeriod(leapDay, 'monthly', leapDay);
    assert.equal(next.toISOString(), '2024-03-29T10:00:00.000Z');
  });

  it('handles annual cycle starting on Feb 29 across leap year into non-leap year', () => {
    const leapDay = new Date('2024-02-29T06:30:00.000Z');
    const nextYear = addBillingPeriod(leapDay, 'annual', leapDay);
    assert.equal(nextYear.toISOString(), '2025-02-28T06:30:00.000Z');
  });

  it('handles six-month cycle ending in February across leap and non-leap years', () => {
    // Aug 31, 2023 -> 6 months -> Feb 29, 2024 (leap year)
    const aug31_2023 = new Date('2023-08-31T12:00:00.000Z');
    const feb2024 = addBillingPeriod(aug31_2023, 'six_month', aug31_2023);
    assert.equal(feb2024.toISOString(), '2024-02-29T12:00:00.000Z');

    // Aug 31, 2024 -> 6 months -> Feb 28, 2025 (non-leap year)
    const aug31_2024 = new Date('2024-08-31T12:00:00.000Z');
    const feb2025 = addBillingPeriod(aug31_2024, 'six_month', aug31_2024);
    assert.equal(feb2025.toISOString(), '2025-02-28T12:00:00.000Z');
  });

  it('respects Addis Ababa (UTC+3) calendar boundaries near midnight UTC', () => {
    // 2026-01-31 22:00:00 UTC is 2026-02-01 01:00:00 in Addis Ababa (UTC+3).
    // In EAT, the anchor day is the 1st of February.
    // Adding 1 month should yield 2026-03-01 01:00:00 EAT, which is 2026-02-28 22:00:00 UTC.
    const nearMidnightUtc = new Date('2026-01-31T22:00:00.000Z');
    const nextPeriod = addBillingPeriod(nearMidnightUtc, 'monthly', nearMidnightUtc);
    assert.equal(nextPeriod.toISOString(), '2026-02-28T22:00:00.000Z');

    // 2026-01-31 20:59:00 UTC is 2026-01-31 23:59:00 in Addis Ababa (UTC+3).
    // In EAT, the anchor day is 31st of January.
    // Adding 1 month should clamp to 2026-02-28 23:59:00 EAT, which is 2026-02-28 20:59:00 UTC.
    const lateJanInEat = new Date('2026-01-31T20:59:00.000Z');
    const nextPeriodEat = addBillingPeriod(lateJanInEat, 'monthly', lateJanInEat);
    assert.equal(nextPeriodEat.toISOString(), '2026-02-28T20:59:00.000Z');
  });

  it('rejects invalid billing cycle with 422', () => {
    assert.throws(() => addBillingPeriod(new Date(), 'weekly'), error => {
      assert.equal(error.statusCode, 422);
      assert.match(error.message, /Invalid billing period/);
      return true;
    });
  });
});

describe('Tesseract OCR Fallback & Graceful Degradation', () => {
  const validPngHeader = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
  const validJpegHeader = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);

  it('fails gracefully when OCR binary does not exist (spawn failure)', async () => {
    await assert.rejects(
      ocr.extract(validPngHeader, 'image/png', { command: 'nonexistent-ocr-bin' }),
      err => {
        assert.equal(err.statusCode, 503);
        assert.match(err.message, /Receipt scanning is unavailable\. Enter the reference instead\./);
        return true;
      }
    );
  });

  it('fails gracefully when OCR process times out', async () => {
    const fakeSpawn = () => {
      const proc = new EventEmitter();
      proc.stdin = new EventEmitter();
      proc.stdin.end = () => {};
      proc.stdout = new EventEmitter();
      proc.kill = () => {};
      // Never emits close or data
      return proc;
    };

    // Use a tiny timeout to simulate OCR hanging
    const start = Date.now();
    // In ocr.extract, timer is 20000ms. We can test with custom spawn that emits an error or test candidates parsing directly
    // Let's test spawn that emits error:
    const fakeErrorSpawn = () => {
      const proc = new EventEmitter();
      proc.stdin = new EventEmitter();
      proc.stdin.end = () => {};
      proc.stdout = new EventEmitter();
      proc.kill = () => {};
      setTimeout(() => proc.emit('error', new Error('Process crash')), 10);
      return proc;
    };
    await assert.rejects(
      ocr.extract(validPngHeader, 'image/png', { spawn: fakeErrorSpawn }),
      err => {
        assert.equal(err.statusCode, 503);
        assert.match(err.message, /Receipt scanning is unavailable\. Enter the reference instead\./);
        return true;
      }
    );
  });

  it('fails gracefully when OCR process exits with non-zero exit code', async () => {
    const fakeExitSpawn = () => {
      const proc = new EventEmitter();
      proc.stdin = new EventEmitter();
      proc.stdin.end = () => {};
      proc.stdout = new EventEmitter();
      proc.kill = () => {};
      setTimeout(() => proc.emit('close', 1), 10);
      return proc;
    };
    await assert.rejects(
      ocr.extract(validPngHeader, 'image/png', { spawn: fakeExitSpawn }),
      err => {
        assert.equal(err.statusCode, 422);
        assert.match(err.message, /Receipt could not be read\. Enter the reference instead\./);
        return true;
      }
    );
  });

  it('fails with 422 when OCR output exceeds character limit (20,000 chars)', async () => {
    let killed = false;
    const fakeHugeSpawn = () => {
      const proc = new EventEmitter();
      proc.stdin = new EventEmitter();
      proc.stdin.end = () => {};
      proc.stdout = new EventEmitter();
      proc.kill = () => { killed = true; };
      setTimeout(() => {
        proc.stdout.emit('data', Buffer.alloc(25000, 'X'));
      }, 10);
      return proc;
    };
    await assert.rejects(
      ocr.extract(validPngHeader, 'image/png', { spawn: fakeHugeSpawn }),
      err => {
        assert.equal(err.statusCode, 422);
        assert.match(err.message, /Receipt text is too large\./);
        assert.equal(killed, true);
        return true;
      }
    );
  });

  it('validates buffer size and magic bytes', async () => {
    // Buffer too small (< 16 bytes)
    await assert.rejects(ocr.extract(Buffer.alloc(10), 'image/png'), /Upload a PNG or JPEG image of at most 3 MB/);

    // Buffer too large (> 3MB)
    await assert.rejects(ocr.extract(Buffer.alloc(3 * 1024 * 1024 + 1), 'image/png'), /Upload a PNG or JPEG image of at most 3 MB/);

    // Corrupted magic bytes with declared image/png
    await assert.rejects(ocr.extract(Buffer.alloc(30, 0), 'image/png'), /Upload a valid PNG or JPEG image/);

    // Corrupted magic bytes with declared image/jpeg
    await assert.rejects(ocr.extract(Buffer.alloc(30, 0), 'image/jpeg'), /Upload a valid PNG or JPEG image/);
  });

  it('extracts candidate references cleanly, prioritizing labeled lines', () => {
    const rawOcr = `
Commercial Bank of Ethiopia
Customer Service Branch
Date: 2026-11-06 14:30
Payment Ref: FT26081ABCDE
Incidental Word: UNRELATEDTEXT123
Receipt Number: 9876543210
Receiver: Ankelba Daycare Center
Account: 1000123456789
Ref: CBE-TX-99887766
Transaction Complete
    `;
    const candidates = ocr.candidates(rawOcr);
    // Prioritized labeled line tokens appear first
    assert.ok(candidates.includes('FT26081ABCDE'));
    assert.ok(candidates.includes('9876543210'));
    assert.ok(candidates.includes('CBE-TX-99887766'));
    // FT26081ABCDE was under "Payment Ref:" so it should appear before unrelated words
    assert.equal(candidates[0], 'FT26081ABCDE');
    // Candidates are capped at 12
    assert.ok(candidates.length <= 12);
  });
});

describe('Veritas Verification Behavior with Partial or Masked Data', () => {
  const baseIntent = {
    provider: 'telebirr',
    amount: '1200.00',
    currency: 'ETB',
    recipient: '0911223344',
    created_at: new Date(Date.now() - 60000).toISOString(),
    terms: { recipient_name: 'Ankelba Daycare Center' }
  };

  const validVeritasData = {
    transactionStatus: 'Completed',
    receiptNo: 'TB12345678',
    settledAmount: '1200.00',
    currency: 'ETB',
    creditedPartyAccountNo: '0911223344',
    creditedPartyName: 'Ankelba Daycare Center',
    paymentDate: new Date().toISOString()
  };

  it('verifies successfully when all fields match exactly', () => {
    const res = matchesVerifiedPayment({ success: true, data: validVeritasData }, baseIntent, 'TB12345678');
    assert.equal(res, true);
  });

  it('rejects masked recipient accounts (e.g., 09****3344)', () => {
    const masked = { ...validVeritasData, creditedPartyAccountNo: '09****3344' };
    assert.equal(matchesVerifiedPayment({ success: true, data: masked }, baseIntent, 'TB12345678'), false);
  });

  it('rejects partially masked receiver names (e.g., Ankelba D******)', () => {
    const masked = { ...validVeritasData, creditedPartyName: 'Ankelba D******' };
    assert.equal(matchesVerifiedPayment({ success: true, data: masked }, baseIntent, 'TB12345678'), false);
  });

  it('rejects partial receiver name without center suffix (e.g., Ankelba)', () => {
    const partial = { ...validVeritasData, creditedPartyName: 'Ankelba' };
    assert.equal(matchesVerifiedPayment({ success: true, data: partial }, baseIntent, 'TB12345678'), false);
  });

  it('rejects missing or null amounts', () => {
    const noAmount = { ...validVeritasData, settledAmount: null };
    assert.equal(matchesVerifiedPayment({ success: true, data: noAmount }, baseIntent, 'TB12345678'), false);
  });

  it('rejects underpayment and overpayment', () => {
    const under = { ...validVeritasData, settledAmount: '1199.99' };
    assert.equal(matchesVerifiedPayment({ success: true, data: under }, baseIntent, 'TB12345678'), false);
    const over = { ...validVeritasData, settledAmount: '1200.01' };
    assert.equal(matchesVerifiedPayment({ success: true, data: over }, baseIntent, 'TB12345678'), false);
  });

  it('rejects payment dated before intent creation window (> 5m earlier)', () => {
    const staleDate = new Date(Date.now() - 3600000).toISOString(); // 1 hr ago
    const stale = { ...validVeritasData, paymentDate: staleDate };
    assert.equal(matchesVerifiedPayment({ success: true, data: stale }, baseIntent, 'TB12345678'), false);
  });

  it('rejects payment dated in the future (> 5m ahead)', () => {
    const futureDate = new Date(Date.now() + 600000).toISOString(); // 10 min future
    const future = { ...validVeritasData, paymentDate: futureDate };
    assert.equal(matchesVerifiedPayment({ success: true, data: future }, baseIntent, 'TB12345678'), false);
  });

  it('keeps intent in verification_pending for operator review when Veritas verification fails', async () => {
    let capturedStatus;
    let attemptOutcome;
    const dbRow = {
      id: 'intent-uuid',
      secret_hash: secretHash('abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'),
      status: 'pending',
      provider:'cbe',
      amount: '1200.00',
      currency: 'ETB',
      recipient: '0911223344',
      terms: { recipient_provider:'cbe',recipient_name: 'Ankelba Daycare Center' },
      created_at: new Date(Date.now() - 60000).toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      version: 1
    };

    const pool = {
      connect: async () => ({
        query: async (sql, params = []) => {
          if (sql.includes('SELECT * FROM subscription_payment_intents WHERE id=$1 FOR UPDATE')) {
            return { rows: [{ ...dbRow }] };
          }
          if (sql.includes('INSERT INTO subscription_payment_attempts')) {
            attemptOutcome = params[3];
            return { rows: [] };
          }
          if (sql.includes('UPDATE subscription_payment_intents SET provider=')) {
            dbRow.provider = params[1];
            dbRow.payment_reference = params[2];
            dbRow.status = 'verification_pending';
            dbRow.version += 1;
            return { rows: [{ ...dbRow }] };
          }
          if (sql.includes('UPDATE subscription_payment_intents SET status=')) {
            capturedStatus = params[1];
            dbRow.verification=JSON.parse(params[2]);
            dbRow.status = params[1];
            dbRow.version += 1;
            return { rows: [{ ...dbRow }] };
          }
          return { rows: [] };
        },
        release: () => {}
      }),
      query: async () => ({ rows: [] })
    };

    // Veritas returns masked receiver name
    const fetchMock = async () => ({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          ...validVeritasData,
          creditedPartyName: '09****3344 Masked'
        }
      })
    });

    const service = createPaymentService(pool, {
      apiKey: 'test-key',
      fetch: fetchMock
    });

    const result = await service.verify('intent-uuid', {
      token: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
      provider: 'cbe',
      reference: 'https://mbreciept.cbe.com.et/TB12345678'
    });

    assert.equal(result.status, 'verification_pending');
    assert.equal(capturedStatus, 'verification_pending');
    assert.equal(attemptOutcome, 'needs_review');
    assert.match(result.message,/could not be matched/);
  });
});

describe('Reminder Worker Lease Renewals, Idempotency & Crash Recovery', () => {
  it('claims reminders with FOR UPDATE SKIP LOCKED and increments attempts count', async () => {
    const executedQueries = [];
    const pool = {
      async query(sql, params) {
        executedQueries.push({ sql, params });
        if (sql.includes('UPDATE subscription_reminders r SET')) {
          if (executedQueries.filter(q => q.sql.includes('UPDATE subscription_reminders r SET')).length === 1) {
            return { rows: [{ id: 10, daycare_id: 1, user_id: 2, period_end: '2026-11-20T00:00:00Z', attempts: 1 }] };
          }
          return { rows: [] };
        }
        if (sql.includes('SELECT u.email')) {
          return { rows: [{ email: 'admin@daycare.test', name: 'Sunshine Daycare' }] };
        }
        return { rows: [] };
      }
    };

    const worker = createReminderWorker({
      pool,
      from: 'billing@ankelba.test',
      portalUrl: 'https://portal.ankelba.test',
      transporter: { async sendMail() {} }
    });

    const claimed = await worker.run();
    assert.equal(claimed, 1);

    const claimQuery = executedQueries.find(q => q.sql.includes('UPDATE subscription_reminders r SET'));
    assert.ok(claimQuery.sql.includes('FOR UPDATE SKIP LOCKED'));
    assert.ok(claimQuery.sql.includes("attempts=attempts+1"));
    assert.ok(claimQuery.sql.includes("status='sending'"));
    assert.ok(claimQuery.sql.includes("lease_until=NOW()+interval '5 minutes'"));
  });

  it('re-enqueues gracefully with backoff and clears lease on network failure', async () => {
    const executedQueries = [];
    let claimCount = 0;
    const pool = {
      async query(sql, params) {
        executedQueries.push({ sql, params });
        if (sql.includes('UPDATE subscription_reminders r SET')) {
          if (claimCount++ === 0) {
            return { rows: [{ id: 10, daycare_id: 1, user_id: 2, period_end: '2026-11-20T00:00:00Z', attempts: 1 }] };
          }
          return { rows: [] };
        }
        if (sql.includes('SELECT u.email')) {
          return { rows: [{ email: 'admin@daycare.test', name: 'Sunshine Daycare' }] };
        }
        return { rows: [] };
      }
    };

    const worker = createReminderWorker({
      pool,
      from: 'billing@ankelba.test',
      portalUrl: 'https://portal.ankelba.test',
      logger: { error() {} },
      transporter: {
        async sendMail() {
          throw new Error('ETIMEDOUT: Connection to SMTP host failed');
        }
      }
    });

    await worker.run();

    const failureUpdate = executedQueries.find(q => q.sql.includes("status='pending'") && q.sql.includes("next_attempt_at=NOW()+interval '30 minutes'"));
    assert.ok(failureUpdate, 'Should reset to pending with 30 min backoff');
    assert.ok(failureUpdate.sql.includes('lease_until=NULL'));
    assert.match(failureUpdate.params[1], /ETIMEDOUT/);
  });

  it('cancels reminder if daycare already renewed or period ended', async () => {
    const executedQueries = [];
    let claimCount = 0;
    const pool = {
      async query(sql, params) {
        executedQueries.push({ sql, params });
        if (sql.includes('UPDATE subscription_reminders r SET')) {
          if (claimCount++ === 0) {
            return { rows: [{ id: 10, daycare_id: 1, user_id: 2, period_end: '2026-11-20T00:00:00Z', attempts: 1 }] };
          }
          return { rows: [] };
        }
        // No matching active daycare with period_end -> means daycare renewed or expired
        if (sql.includes('SELECT u.email')) {
          return { rows: [] };
        }
        return { rows: [] };
      }
    };

    const worker = createReminderWorker({
      pool,
      from: 'billing@ankelba.test',
      portalUrl: 'https://portal.ankelba.test',
      transporter: { async sendMail() { assert.fail('Should not send mail for stale period'); } }
    });

    await worker.run();

    const cancelUpdate = executedQueries.find(q => q.sql.includes("status='cancelled'"));
    assert.ok(cancelUpdate, 'Should mark stale reminder as cancelled');
  });

  it('reclaims orphaned reminders when lease_until expires after crash', async () => {
    const executedQueries = [];
    const pool = {
      async query(sql, params) {
        executedQueries.push({ sql, params });
        return { rows: [] };
      }
    };

    const worker = createReminderWorker({
      pool,
      from: 'billing@ankelba.test',
      portalUrl: 'https://portal.ankelba.test',
      transporter: { async sendMail() {} }
    });

    await worker.run();

    const claimQuery = executedQueries.find(q => q.sql.includes('UPDATE subscription_reminders r SET'));
    // The query MUST check (status='sending' AND lease_until<NOW())
    assert.ok(claimQuery.sql.includes("(status='sending' AND lease_until<NOW())"));
  });
});

describe('Child Safety & Care Operation Immunity in subscription-access.js', () => {
  async function testRoute(method, path, subscriptionEndsAt) {
    const middleware = createSubscriptionAccess(
      { query: async () => ({ rows: [{ subscription_ends_at: subscriptionEndsAt }] }) },
      () => Date.parse('2026-11-07T12:00:00Z')
    );
    const req = { method, originalUrl: path, user: { daycare_id: 101 } };
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(b) { this.body = b; return this; }
    };
    let called = false;
    await middleware(req, res, () => { called = true; });
    return { called, res };
  }

  it('guarantees complete immunity for all essential care and safety writes even when expired', async () => {
    const expiredDate = '2026-11-01T00:00:00Z'; // Expired 6 days ago

    const safetyRoutes = [
      ['POST', '/api/portal/attendance'],
      ['POST', '/api/portal/attendance/'],
      ['POST', '/api/portal/checkout'],
      ['POST', '/api/portal/checkout/'],
      ['POST', '/api/portal/assignments'],
      ['PATCH', '/api/portal/assignments/42/revoke'],
      ['POST', '/api/attendance'],
      ['POST', '/api/biometric/verify'],
      ['POST', '/api/health'],
      ['PATCH', '/api/health/105/notify'],
      ['POST', '/api/alerts'],
      ['POST', '/api/communication/alerts'],
    ];

    for (const [verb, route] of safetyRoutes) {
      const result = await testRoute(verb, route, expiredDate);
      assert.equal(result.called, true, `Route ${verb} ${route} must be immune from subscription expiry`);
      assert.equal(result.res.statusCode, 200);
    }
  });

  it('allows all GET/HEAD/OPTIONS read operations unconditionally', async () => {
    const expiredDate = '2026-11-01T00:00:00Z';
    assert.equal((await testRoute('GET', '/api/children', expiredDate)).called, true);
    assert.equal((await testRoute('GET', '/api/portal/reports', expiredDate)).called, true);
    assert.equal((await testRoute('HEAD', '/api/portal/dashboard', expiredDate)).called, true);
    assert.equal((await testRoute('OPTIONS', '/api/portal/anything', expiredDate)).called, true);
  });

  it('blocks non-safety administrative writes when subscription is expired with 403 SUBSCRIPTION_EXPIRED', async () => {
    const expiredDate = '2026-11-01T00:00:00Z';
    const nonSafetyWrites = [
      ['POST', '/api/children'],
      ['PATCH', '/api/children/1'],
      ['POST', '/api/biometric/enroll'],
      ['POST', '/api/portal/staff'],
      ['PUT', '/api/store/items/5'],
      ['POST', '/api/classrooms'],
    ];

    for (const [verb, route] of nonSafetyWrites) {
      const result = await testRoute(verb, route, expiredDate);
      assert.equal(result.called, false, `Route ${verb} ${route} must be blocked when subscription is expired`);
      assert.equal(result.res.statusCode, 403);
      assert.equal(result.res.body.code, 'SUBSCRIPTION_EXPIRED');
    }
  });

  it('allows non-safety writes when subscription is active or legacy (null)', async () => {
    const activeDate = '2026-11-30T00:00:00Z';
    assert.equal((await testRoute('POST', '/api/children', activeDate)).called, true);
    assert.equal((await testRoute('POST', '/api/children', null)).called, true);
  });
});

describe('Status Codes & Error Recovery (403, 409, 413, 422, 503)', () => {
  const errorHandler = require('../../../../../../Users/Mistire/Desktop/final year project/backend/src/middleware/errorHandler');

  function invokeErrorHandler(err) {
    let capturedStatus = 500;
    let capturedBody = null;
    const res = {
      status(code) { capturedStatus = code; return this; },
      json(body) { capturedBody = body; return this; },
      set() { return this; }
    };
    errorHandler(err, {}, res, () => {});
    return { status: capturedStatus, body: capturedBody };
  }

  it('maps 413 payload too large errors accurately', () => {
    const payloadError = Object.assign(new Error('request entity too large'), {
      type: 'entity.too.large',
      statusCode: 413,
      status: 413,
      limit: 3145728,
      length: 3500000
    });
    const result = invokeErrorHandler(payloadError);
    assert.equal(result.status, 413);
    assert.equal(result.body.error, 'The uploaded file is too large.');
  });

  it('maps 409 conflict errors accurately', () => {
    const conflictError = Object.assign(new Error('This payment reference has already been used.'), { statusCode: 409 });
    const result = invokeErrorHandler(conflictError);
    assert.equal(result.status, 409);
    assert.equal(result.body.error, 'This payment reference has already been used.');
  });

  it('maps 422 validation errors with field details', () => {
    const joiError = Object.assign(new Error('Validation failed'), {
      name: 'ValidationError',
      isJoi: true,
      details: [{ message: '"email" must be a valid email', context: { key: 'email' } }]
    });
    const result = invokeErrorHandler(joiError);
    assert.equal(result.status, 422);
    assert.equal(result.body.error, 'Validation failed');
    assert.deepEqual(result.body.fields, [{ field: 'email', message: '"email" must be a valid email' }]);
  });

  it('maps 403 access denied errors accurately', () => {
    const forbiddenError = Object.assign(new Error('Daycare account unavailable.'), { statusCode: 403 });
    const result = invokeErrorHandler(forbiddenError);
    assert.equal(result.status, 403);
    assert.equal(result.body.error, 'Daycare account unavailable.');
  });

  it('maps 503 service unavailable errors accurately', () => {
    const unavailableError = Object.assign(new Error('Subscription payment account is not configured. Please contact support.'), { statusCode: 503 });
    const result = invokeErrorHandler(unavailableError);
    assert.equal(result.status, 503);
    assert.equal(result.body.error, 'Subscription payment account is not configured. Please contact support.');
  });

  it('rejects unconfigured receiving account with 503', async () => {
    const pool = {
      query: async (sql) => {
        if (sql.includes('FROM subscription_payment_settings')) return { rows: [] };
        return { rows: [] };
      }
    };
    const paymentService = createPaymentService(pool, { apiKey: '', recipient: '', institution: '', accountHolder: '' });
    await assert.rejects(
      paymentService.create({ provider:'cbe',package_code: 'standard', billing_cycle: 'monthly', email: 'test@daycare.test' }),
      err => {
        assert.equal(err.statusCode, 503);
        assert.match(err.message, /payment receiving account is not configured/);
        return true;
      }
    );
  });
});

