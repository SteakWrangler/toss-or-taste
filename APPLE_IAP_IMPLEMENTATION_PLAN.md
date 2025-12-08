# Apple In-App Purchase Implementation Plan

## Overview
This plan addresses Apple's App Review feedback for in-app purchases, specifically:
1. Receipt validation (fixes "paywall failed to load" issue)
2. Required subscription information (Terms, Privacy Policy, pricing display)

## Implementation Phases

---

## PHASE 1: Database Setup
**Goal:** Create transaction tracking to prevent duplicate purchases

### Task 1.1: Create Purchase Transactions Table
**Files to create:**
- `supabase/migrations/[timestamp]_create_apple_iap_transactions.sql`

**What it does:**
- Stores all Apple purchase receipts
- Tracks transaction IDs to prevent replay attacks
- Records purchase status and validation results

**Testing:**
- Run migration locally first
- Verify table structure
- Test with sample data

**Deploy:**
```bash
# You run this after reviewing:
supabase db push
```

---

## PHASE 2: Receipt Validation - Credits
**Goal:** Validate credit purchases with Apple's servers

### Task 2.1: Update apple-iap-process-credits Edge Function
**Files to modify:**
- `supabase/functions/apple-iap-process-credits/index.ts`

**Changes:**
1. Accept receipt data from client
2. Validate receipt with Apple (production first, then sandbox)
3. Check for duplicate transactions
4. Only update credits if validation succeeds

**Testing:**
- Deploy to Supabase
- Test with StoreKit testing in Xcode
- Verify receipts are validated properly

**Deploy:**
```bash
# I can run this:
supabase functions deploy apple-iap-process-credits
```

### Task 2.2: Update Frontend to Send Receipts (Credits)
**Files to modify:**
- `src/integrations/apple/appleIAP.ts` (updateBackendCredits method)

**Changes:**
1. Extract receipt data from purchase object
2. Send receipt to edge function instead of direct DB update
3. Handle validation errors properly

**Testing:**
- Build and test in Xcode
- Verify purchase flow works
- Check logs for validation

---

## PHASE 3: Receipt Validation - Subscriptions
**Goal:** Validate subscription purchases with Apple's servers

### Task 3.1: Update apple-iap-process-subscription Edge Function
**Files to modify:**
- `supabase/functions/apple-iap-process-subscription/index.ts`

**Changes:**
1. Accept receipt data from client
2. Validate receipt with Apple (production first, then sandbox)
3. Extract subscription expiry from Apple's response (don't calculate manually)
4. Check for duplicate transactions
5. Store original transaction ID for renewal tracking

**Testing:**
- Deploy to Supabase
- Test with StoreKit testing in Xcode
- Verify subscription dates come from Apple

**Deploy:**
```bash
# I can run this:
supabase functions deploy apple-iap-process-subscription
```

### Task 3.2: Update Frontend to Send Receipts (Subscriptions)
**Files to modify:**
- `src/integrations/apple/appleIAP.ts` (updateBackendSubscription method)

**Changes:**
1. Extract receipt data from purchase object
2. Send receipt to edge function instead of direct DB update
3. Handle validation errors properly

**Testing:**
- Build and test in Xcode
- Verify subscription purchase flow works

---

## PHASE 4: Legal Requirements
**Goal:** Add required Terms of Use and Privacy Policy links

### Task 4.1: Create Legal Pages
**Options:**
A. Create static pages in the app
B. Link to external hosted pages (easier to update)

**Files to create (Option A):**
- `src/pages/TermsOfService.tsx`
- `src/pages/PrivacyPolicy.tsx`
- Add routes in router

**OR (Option B):**
- Just add external links to existing hosted pages

### Task 4.2: Add Subscription Info Display
**Goal:** Show required subscription information before purchase

**Where:** Need to identify where users purchase subscriptions

**Must display:**
- Subscription title
- Duration (monthly/annual)
- Price
- Link to Terms of Use
- Link to Privacy Policy

**Files to find/create:**
- Find existing subscription purchase UI
- Add required information display
- Add clickable links to legal pages

**Testing:**
- Verify all information is visible before purchase
- Test links work correctly

---

## PHASE 5: Server Notifications (Future-Proofing)
**Goal:** Handle subscription lifecycle events from Apple

### Task 5.1: Create Apple Server Notifications Webhook
**Files to create:**
- `supabase/functions/apple-server-notifications/index.ts`

**What it handles:**
- Subscription renewals
- Cancellations
- Billing failures
- Refunds
- Grace periods

**Testing:**
- Deploy function
- Get webhook URL
- Configure in App Store Connect
- Test with Apple's testing tools

**Deploy:**
```bash
# I can run this:
supabase functions deploy apple-server-notifications
```

---

## Risk Mitigation

### For Each Phase:
1. ✅ Create/modify files
2. ✅ Review changes together
3. ✅ Test locally if possible
4. ✅ Deploy one component at a time
5. ✅ Verify it works before moving to next phase

### Rollback Plan:
- All changes are additive (won't break existing functionality)
- Database migrations are versioned
- Edge functions can be redeployed with previous versions
- Frontend changes can be reverted via git

---

## What You Need to Provide

Before we start:

1. **Terms of Use & Privacy Policy:**
   - Do you have these documents already?
   - Should I create basic templates?
   - Or do you have URLs to existing pages?

2. **Subscription Purchase UI:**
   - Where in your app do users buy subscriptions?
   - Is there an existing screen/component?
   - Or should I create a new one?

3. **Testing Environment:**
   - Do you have sandbox test accounts set up in App Store Connect?
   - Have you accepted the Paid Apps Agreement?

---

## After Implementation - Your Manual Steps

### In App Store Connect:
1. Add Privacy Policy URL (App → General → Privacy Policy URL)
2. Add Terms of Use (either use Apple's standard or upload custom)
3. Configure Server Notification URL (after Phase 5)
4. Ensure all IAP products are "Ready to Submit"

### Testing:
1. Build and upload to TestFlight
2. Test complete purchase flow with sandbox account
3. Verify paywall loads correctly
4. Verify all legal links work
5. Submit for review

---

## Estimated Implementation Order

**Recommended sequence:**
1. Phase 1 (Database) - Foundation
2. Phase 2 (Credits) - Test validation with simpler flow
3. Phase 3 (Subscriptions) - Apply learnings to subscriptions
4. Phase 4 (Legal) - Required for submission
5. Phase 5 (Webhooks) - Nice to have, critical for production

**Can we start with Phase 1?** Or would you prefer a different order?
