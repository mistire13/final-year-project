# Test rerun audit and Word test-plan comparison

Date: 31 October 2026, Africa/Addis_Ababa. Document reviewed: `C:/Users/Mistire/Desktop/ANKELBA_SOFTWARE_TEST_PLAN.docx`. Source baseline: Git HEAD `14c2b0d` plus the pre-existing uncommitted project changes. Application source, existing tests, configuration and the Word document were not edited by this audit. New audit harnesses, exports, logs and this report were created.

## Verdict

The current functional regression evidence is substantially stronger than the Word document describes, but the entire available test collection is **not green**. Retained subscription tests fail against superseded requirements; the legacy portal suite fails during setup; lint cannot execute; dependency advisories remain. Development CORS and unavailable biometric verification reproduce the document's limitations. Logout and external AI now pass focused replay.

Revise the Word report before submission. Do not replace its 220-case campaign with the numbers below: the test populations differ. This rerun executes every available `backend/scripts/*.test.cjs` file, selected document scenarios and additional operational checks. It does not recreate all 220 original document IDs or repeat GUI/device acceptance.

## Fresh execution results

| Activity | Result | Interpretation |
| --- | --- | --- |
| Main backend run: 28 test files | **263 node:test tests: 256 PASS, 7 FAIL**, no skipped/cancelled tests | All seven failures belong to `practical-subscriptions.test.cjs`: six failed subtests and their failed enclosing test. The other 27 files contribute 255 passing tests. The legacy subscription file also has one passing standalone test. |
| Legacy portal file, separately isolated | **0 PASS, 7 FAIL** | All seven fail in the shared setup hook with `relation "roles" does not exist`. Workflow bodies did not run. These are fixture/setup failures, not seven demonstrated product workflow defects. |
| Endpoint authentication/role matrix, included in main run | **176 mounted routes/aliases; 707 denial checks; zero failures** | Covers missing/invalid sessions and forbidden roles, including logout revocation. It does not establish every allowed user's object-level access condition; separate tenant/privacy suites supply additional evidence. |
| Focused document replay | 9 observations: **6 PASS, 3 FAIL** | Includes one corrected variant of TC-STORE-007. Two failures reproduce product limitations; the third demonstrates the incorrect order-test sequence. See comparison below. |
| Performance and backup supplement | **3 PASS** | Two local HTTP performance smoke checks plus a reconstructed backup/restore check. |
| TypeScript | **PASS**, exit 0 | `npx tsc --noEmit`. |
| Production web export | **PASS**, exit 0 | `tmp/test-plan-rerun-web`. |
| Android JS/Hermes export | **PASS**, exit 0 | `tmp/test-plan-rerun-android`; not an installed app/device test. |
| Backend lint | **Unable to execute**, exit 2 | ESLint 9.39.5 cannot find `eslint.config.js/mjs/cjs`. Not a lint pass or a completed source lint assessment. |
| Backend dependency audit | **6 advisories** | 1 high, 5 moderate; no critical. High advisory reported against direct dependency `joi`. |
| Frontend dependency audit | **15 advisories** | 3 high, 11 moderate, 1 low; no critical. High entries: `@expo/cli`, `follow-redirects`, `zod` (transitive). |

Dependency findings are package advisory results, not proof that a particular application endpoint is exploitable. No packages were upgraded or automatic fixes applied.

Raw results: [backend TAP](evidence/test-plan-rerun-20261031/backend.tap), [portal TAP](evidence/test-plan-rerun-20261031/legacy-portal.tap), [endpoint matrix](evidence/test-plan-rerun-20261031/endpoint-matrix.json), [focused replay](evidence/test-plan-rerun-20261031/focused-document-replay.json), [operational replay](evidence/test-plan-rerun-20261031/operations-replay.json).

## Comparison with specific document cases

| Document item | Word result | Fresh observation | Required report change |
| --- | --- | --- | --- |
| TC-AUTH-016: logout | FAIL; token reuse returned 200 | Logout 200; previous token reuse **401** | Retain historical failure and record fix/retest PASS. |
| TC-AI-001: fallback | PASS | Missing-key request **200, prepared_guidance** | Still supported. |
| TC-AI-002: medical request | PASS | **200, safety_redirected=true** | Still supported. |
| TC-AI-006: external provider | BLOCKED; no key | **200, nvidia_nim, provider_connected=true** using `nvidia/nemotron-3.5-lightning-30b-a3b` | Record live retest PASS with date/model. One successful request is not an availability guarantee. Synthetic general guidance only was sent externally. |
| TC-STORE-006: missing version | PASS | **422** | Still supported. |
| TC-STORE-007: ready for pickup | PASS, but actual recorded as confirmed | A placed/paid order changed directly to ready_for_pickup returns **409**, invalid transition. After **confirmed**, ready_for_pickup returns **200** with correct status. | Correct the preconditions/steps to include confirmation. The recorded Word result does not satisfy its own expected result. Treat as a test-definition/report defect, not a broken valid fulfillment flow. |
| TC-PICK-004: biometric verification | FAIL | **503**, provider/device unavailable | Keep open as a feature gap; manual verification remains a separate supported flow. |
| TC-SEC-003: development CORS | FAIL | OPTIONS returns **204** and allows `https://evil.example` in development | Keep the development-policy finding. This replay does not test production CORS configuration or prove authentication bypass. |
| TC-PERF-001: 50 sequential child-list requests | PASS; avg 8.4 ms, max 16.7 ms | **50/50 HTTP 200**, avg **6.83 ms**, max **19.20 ms** | Add fresh measurements with fixture/machine scope. Do not present as production capacity. |
| TC-PERF-002: 20 concurrent snapshots | PASS; 467 ms | **20/20 HTTP 200**, **244.01 ms** total | Add fresh smoke result and same limitation. |
| TC-DB-008: backup/restore (referenced, detailed case absent) | Claimed PASS | pg_dump/pg_restore into another generated DB preserved sentinel daycare and two children | A reconstructed check passes. Add actual steps and evidence; do not claim the missing original case was reproduced exactly. |

The performance fixture used small synthetic data and an in-process API with the provisioning pool. It did not benchmark the real deployment or restricted-runtime pools under pilot load. Separate security suites did exercise restricted database logins/RLS.

## Failure analysis

### Retired subscription expectations

The first failing subscription subtest expects trial/package input to be rejected and accepted package terms to be enforced. Current onboarding follows the 31 October scope decision that removes platform subscriptions. That early failure leaves setup values/tokens unset, producing subsequent failures such as 401 instead of expected 403 and undefined `center.id`. These are not six independent confirmed security/product defects.

The six failed subtest names are:

1. Public catalog, package selection, application status and pending access.
2. Operator roles, tenant-owned summary and protected application status.
3. Catalog version checks and accepted price snapshots.
4. Manual renewal retries and mismatches.
5. Cancellation, resume and trial-only extension history.
6. Second tenant, payment references, expired trial and rejected status.

Retire the obsolete subscription assertions and keep/rehome still-relevant application-status/operator authorization cases with valid independent setup. This audit does not change tests or restore removed features. Existing current authentication/tenant/deletion suites and the 707-check matrix pass independently.

### Portal fixture

`portal.test.cjs` normally creates a schema inside configured `DB_NAME`, uses an older connection/search-path setup and performs fixture deletes. It was run inside an additional generated disposable database so the normal application database could not be touched. It fails before its test bodies execute. Correcting the fixture is future test-maintenance work; this audit did not edit it. Current phase-four front-desk/security tests passed in the main run, but they do not turn the failed legacy file green.

### Static/tooling and release observations

- ESLint configuration is missing: source lint remains unverified.
- Dependency audits report high advisories: investigate affected usage and validate upgrades before release.
- Actual rerun environment: **Node 22.11.0**, PostgreSQL server **18.6**. This differs from the Word campaign's Node 22.13.1/PostgreSQL 17.11. Historical environments may differ, but the new execution must identify its own environment accurately.
- Expo reports Node 22.11.0 below its required minimum 22.13.0. Both exports nevertheless completed. A successful export does not remove the runtime-version warning.

## Document completeness and scope

The Word file contains **151 detailed cases: 140 PASS, 3 FAIL, 4 BLOCKED, 4 NOT RUN**. It references **220 distinct IDs**, leaving **69 referenced cases without detailed definitions**: database (8), static (4), tenant (19), UAT (4), UI (11) and unit (23). Its summary claims 200 PASS, 8 FAIL, 4 BLOCKED and 8 NOT RUN. The claimed 96.2% is arithmetically valid for 200/208, but the supporting full case population/evidence is absent.

There were **10 detailed document IDs replayed directly** in this audit; the corrected order variant is extra. The backup check reconstructs one referenced-only ID. The other 141 detailed rows must not automatically receive PASS from aggregate suite results. The comparison CSV identifies exact replay versus related-suite evidence, retired scope and not-run cases.

[All 220 referenced IDs and their comparison status](evidence/test-plan-rerun-20261031/document-case-comparison.csv). [Document inventory and SHA-256](evidence/test-plan-rerun-20261031/document-inventory.json).

Other document changes still required:

- Mark platform packages, trials, renewals and subscription quotas as superseded/out of scope. Preserve application status, operator isolation, onboarding, center fees and store payments as applicable.
- Add coverage/evidence for logical daycare deletion, admin parent–caregiver message oversight, richer caregiver reporting, AI consent/minimization and provider recovery. Related new suites passed in this rerun.
- Supply the referenced defect records/GUI and execution-report chapters, or link the separate documents explicitly.
- The claimed `docs/qa/tests/api_system_tests.cjs` is unavailable in this workspace. The original full HTTP campaign cannot be replayed from that reference.
- Do not mark exit criteria fully met solely from a high aggregate pass percentage. Accepted risks need an explicit acceptance record, and setup/tooling failures need distinct treatment.
- Remove plaintext test-account passwords from the teacher-facing report; provide access details separately when needed.

## Testing not performed here

No fresh browser GUI acceptance, browser compatibility matrix, native device interaction, real-user UAT, WCAG audit, biometric hardware test, real payment movement, external notification-delivery campaign or production recovery/load test was performed. Earlier browser evidence remains historical, not a fresh rerun. `npm test`/`master_audit.js` was not launched against the running normal application because it targets port 5000/configured DB and mutates data. All 29 individual `.test.cjs` files were attempted safely instead.

## Reproduction and preservation

Audit-only orchestration commands from the repository root:

```text
node tmp/test-document-rerun.cjs
node tmp/test-document-portal-isolated.cjs
node tmp/test-document-focused.cjs
node tmp/test-document-operations.cjs
```

Main run uses `node --test --test-concurrency=2 --test-timeout=180000` on 28 files; the manifest lists them. Portal is the 29th file, wrapped in an outer disposable database. TypeScript, web/Android exports, lint and `npm audit --json` ran separately. The generated endpoint matrix was copied into this evidence directory and the pre-existing matrix file restored byte-for-byte.

Fixtures used generated disposable databases and cleaned up their own resources. The normal backend/frontend were not stopped or used for audit mutations. The Word document and project implementation remain unchanged by this rerun.
