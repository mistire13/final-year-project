# Pricing journey review

## Initial inspection

- The current home page owns the registration popup, payment component, application form and recovery handler. Every Register CTA and the footer currently opens that popup.
- The route gate has no explicit `/pricing` route, so the path currently falls back to the home page.
- `SubscriptionPayment` currently combines package selection, billing-period radios, payment-session creation and receipt verification. The new page must separate selection from checkout so the old cycle-first radios do not remain in the journey.
- The catalog exposes Standard and Premium with monthly, six-month and annual payable prices. There are no original-price, sale-price or discount fields. An advertised percentage discount must not be fabricated from those payable prices. Valid savings can be derived from configured monthly pricing when longer-term pricing is genuinely lower, or explicit reference prices can be added through a separately defined configuration.

## Integration requirements

1. Route `/pricing` directly to the new pricing page. Send all Register CTAs there, including the footer. Preserve an optional daycare-name draft without placing payment secrets in query strings.
2. Show package comparison first; choosing Standard or Premium reveals three full billing-period comparison cards. Payment is a subsequent inline section and application fields appear only after confirmed payment.
3. Preserve the payment intent ID, bearer token, email binding, accepted package/cycle snapshot, pending-review status, correction/restart handling and protection against duplicate application submission.
4. A recovered payment session must keep its accepted terms; a newly displayed catalog offer must not overwrite a paid session.
5. Reuse `HeroAtmosphere`, home navigation classes, the brand font and home color tokens. The animation component already supports reduced motion, offscreen/tab pause and a visible pause control.
6. Inline application success and errors must retain the existing safe behavior: no invented success, input preservation after errors, and no duplicate submit during a pending request.

## Integrated source review

Reviewed `PricingJourney.web.tsx`, `PricingPage.web.tsx`, `EnrollmentCheckout.web.tsx`, `SubscriptionPayment.web.tsx`, `LandingPage.web.tsx`, `LandingFooter.web.tsx`, `PortalGate.web.tsx`, the shared subscription types and backend safe-intent response shape. No product files were changed by this reviewer.

The integrated flow meets the intended package-first ordering. `/pricing` is explicit, registration CTAs navigate there, three billing-period comparison cards follow package choice, payment is inline, and the daycare application follows a verified payment. The existing bearer token, email binding and accepted-term snapshot are retained. The displayed longer-period savings use configured monthly totals, rather than invented original prices. The homepage atmosphere component is reused with its animation pause and reduced-motion support.

### Findings sent to the implementation owner

1. **P2 — A restarted recovery session could return after changing package.** `PricingJourney` retained the original `resume` prop after the child cleared storage. Remounting checkout would restore the old expired/rejected intent. **Source fix verified:** the explicit null-session callback now clears parent recovery and selection and closes checkout.
2. **P2 — Change plan remained available while an intent was being created.** The parent did not know the child was busy, so a slow creation could finish after checkout was unmounted, save the old intent and conflict with a new selection. **Source fix verified:** payment/recovery busy state is now propagated to the parent and guards Change plan.
3. **P2 — Recovery credentials were not retained until the first status call succeeded.** A valid emailed recovery link was scrubbed immediately, but the new token was saved only after the server responded. An initial connection error followed by refresh could lose the new token and restore an older invalid token. **Source fix verified:** valid registration recovery is stored before the status request, and the child removes it after successful restoration.
4. **P2 — Page navigation remained possible during application submission.** Leaving can lose the form and confirmation while the server consumes the payment. **Source fix verified:** busy-only beforeunload and captured-link-click protection cover full page navigation. The gate additionally dispatches a cancelable route-change event before committing history navigation; the pending application cancels it, so the gate restores the accepted URL and preserves the mounted checkout. The listeners are removed after the request settles.
5. **P3 — Success did not change the numeric progress stage.** The focus effect observed stage 3 for both the application and submitted states, so it did not move focus to the success heading. **Source fix verified:** focus now tracks a compound progress/application-state key, so application-to-submitted transitions focus the new heading.

All five findings above are resolved in the final source recheck. No additional actionable source issue was found within this review's scope.

### Checks and limits

- Source confirms duplicate submit is guarded by a synchronous ref, payment-bound director email is read-only, and network/server errors preserve entered fields and verified payment in the mounted page.
- The gate synchronizes its route after subscribing, which preserves renewal recovery navigation from a child mount effect.
- Package prices and availability remain controlled by the backend catalog. Unconfigured periods cannot proceed to payment.
- QA owns execution of the new regression suites and browser checks. This source review does not claim real-provider verification or live payment testing.
