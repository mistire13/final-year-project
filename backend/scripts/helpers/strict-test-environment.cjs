'use strict';
// Preload for isolated suites: local receipt-diagnostic preferences must never
// change test acceptance rules. This does not edit the application's .env.
process.env.NODE_ENV='test';
process.env.SUBSCRIPTION_NAME_AMOUNT_TEST_MODE='false';
