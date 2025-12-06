# In-App Purchase Testing Guide for Xcode

## Overview
This guide provides multiple methods to test in-app purchases for Toss or Taste on iOS.

## Method 1: StoreKit Testing (Recommended for Development)

### Setup in Xcode:

1. **Add StoreKit Configuration to Xcode Project:**
   - Open `ios/App/App.xcworkspace` in Xcode
   - Drag the `TossOrTaste.storekit` file into your Xcode project navigator
   - Make sure it's added to the App target

2. **Configure Scheme to Use StoreKit Configuration:**
   - In Xcode, go to **Product > Scheme > Edit Scheme**
   - Select **Run** on the left sidebar
   - Go to the **Options** tab
   - Under **StoreKit Configuration**, select `TossOrTaste.storekit`
   - Click Close

3. **Run the App:**
   - Build and run the app on simulator or device
   - IAP purchases will use the local StoreKit configuration
   - No internet connection needed
   - No sandbox account needed
   - Instant purchase processing

### Advantages:
- ✅ Test without App Store Connect setup
- ✅ Works offline
- ✅ Fast iteration (no backend verification delays)
- ✅ Easy to test edge cases and error scenarios
- ✅ Can simulate different storefronts/locales
- ✅ Can test transaction failures

### Using StoreKit Test Environment in Debug:

While running the app with StoreKit configuration enabled:

1. **View Transactions:**
   - In Xcode, go to **Debug > StoreKit > Manage Transactions**
   - See all test purchases
   - Manually approve/decline purchases
   - Refund transactions
   - Clear purchase history

2. **Test Different Scenarios:**
   - **Slow Network:** Debug > StoreKit > Enable **Slow Network**
   - **Purchase Failures:** Edit the `.storekit` file and enable errors
   - **Interrupted Purchases:** Stop/restart the app during purchase flow
   - **Different Storefronts:** Change locale in StoreKit settings

3. **Clear Purchase History:**
   - Debug > StoreKit > Clear All Transactions
   - Tests consumables and subscriptions from scratch

---

## Method 2: Sandbox Testing (Real App Store Environment)

### Setup:

1. **Create Sandbox Test User:**
   - Go to [App Store Connect](https://appstoreconnect.apple.com/)
   - Navigate to **Users and Access > Sandbox Testers**
   - Click the **+** button to add a new sandbox tester
   - Use a **unique email** that's never been used with Apple ID
   - Remember the password

2. **Sign Out of Production App Store:**
   - On your iOS device: Settings > App Store > Sign Out
   - **DO NOT** sign in with the sandbox account yet

3. **Build & Install App:**
   - Archive and export the app for development distribution, OR
   - Run directly from Xcode to your device

4. **Make a Purchase:**
   - When you attempt a purchase, iOS will prompt you to sign in
   - Sign in with your sandbox test account
   - Complete the purchase (you won't be charged)
   - Confirmation will say **[Environment: Sandbox]**

### Advantages:
- ✅ Tests real App Store Connect product configuration
- ✅ Tests receipt validation
- ✅ Tests subscription renewals
- ✅ Closer to production environment

### Disadvantages:
- ❌ Requires App Store Connect products to be configured
- ❌ Requires sandbox test account
- ❌ Can be slower
- ❌ Receipt validation may fail if backend isn't configured

---

## Method 3: TestFlight (Pre-Production Testing)

### Setup:

1. **Upload Build to TestFlight:**
   ```bash
   # Archive the app in Xcode
   # Product > Archive
   # Distribute App > App Store Connect
   # Upload
   ```

2. **Add Internal/External Testers:**
   - In App Store Connect, go to TestFlight
   - Add testers via email
   - They'll receive an invitation

3. **Install via TestFlight:**
   - Testers install the TestFlight app
   - Install your app from TestFlight
   - Make purchases using sandbox accounts

### Advantages:
- ✅ Tests complete production flow
- ✅ Tests with real users
- ✅ Tests push notifications and other entitlements

---

## Method 4: Enable Enhanced Logging

### Add Debug Logging to Check IAP Status:

You can add these to your [appleIAP.ts](src/integrations/apple/appleIAP.ts) to get better visibility:

```typescript
// Add this to your initialize() method after store.ready():
window.store.verbosity = window.store.DEBUG;

// Add transaction monitoring
window.store.when().registered((product) => {
  console.log('🍎 Product registered:', product);
});

window.store.when().updated((product) => {
  console.log('🍎 Product updated:', product);
});
```

---

## Debugging Common Issues

### Issue 1: Products Not Loading

**Check:**
1. Product IDs match exactly in App Store Connect
2. At least one product is in "Ready to Submit" state
3. Agreements are signed (Paid Apps agreement)
4. Banking info is complete

**StoreKit Test:**
- Verify product IDs in `.storekit` file match code
- Check Xcode console for product registration logs

### Issue 2: Purchase Dialog Doesn't Appear

**Check:**
1. `window.store` is initialized
2. Product is `loaded`, `valid`, and `canPurchase`
3. Not testing on iOS Simulator (some IAP features don't work)
4. StoreKit configuration is enabled in scheme

**Debug:**
```javascript
const product = window.store.get('com.linksmarttech.tossortaste.single_credit');
console.log('Product status:', {
  exists: !!product,
  loaded: product?.loaded,
  valid: product?.valid,
  canPurchase: product?.canPurchase,
  state: product?.state
});
```

### Issue 3: Purchase Succeeds but Credits Don't Update

**Check:**
1. Backend endpoint is accessible
2. Supabase credentials are correct
3. Receipt validation logic is working
4. Transaction is being finished properly

**Debug:**
- Add extensive logging in `handleVerifiedPurchase()`
- Check Supabase logs
- Verify network requests in Safari Web Inspector

---

## Testing Checklist

### Before Each Test Session:
- [ ] Clear StoreKit transactions (Debug > StoreKit > Clear All)
- [ ] Fresh app install (delete and reinstall)
- [ ] Check Xcode console for initialization logs
- [ ] Verify products are loaded

### Test Scenarios:
- [ ] Purchase single credit
- [ ] Purchase credit pack
- [ ] Subscribe to monthly plan
- [ ] Subscribe to annual plan
- [ ] Cancel during purchase
- [ ] Interrupted purchase (kill app mid-purchase)
- [ ] Restore purchases
- [ ] Purchase with poor network
- [ ] Multiple rapid purchases

### Verification:
- [ ] Credits reflect in UI immediately
- [ ] Database updated correctly
- [ ] Subscription status reflects properly
- [ ] Receipt saved correctly
- [ ] No duplicate charges

---

## Quick Start for StoreKit Testing

1. Open Xcode: `open ios/App/App.xcworkspace`
2. Edit Scheme: Product > Scheme > Edit Scheme
3. Set StoreKit Config: Options tab > Select `TossOrTaste.storekit`
4. Run app on simulator/device
5. Make test purchases - they'll use local config
6. Monitor: Debug > StoreKit > Manage Transactions

---

## Useful Xcode Console Commands

```bash
# Enable verbose StoreKit logging
defaults write com.apple.appstored DebugLogging -bool true

# View StoreKit daemon logs
log stream --predicate 'subsystem contains "com.apple.storekit"' --level debug
```

---

## Resources

- [StoreKit Testing in Xcode](https://developer.apple.com/documentation/xcode/setting-up-storekit-testing-in-xcode)
- [Testing In-App Purchases](https://developer.apple.com/documentation/storekit/in-app_purchase/testing_in-app_purchases)
- [Sandbox Testing](https://developer.apple.com/documentation/storekit/in-app_purchase/testing_in-app_purchases_with_sandbox)
- [cordova-plugin-purchase Documentation](https://github.com/j3k0/cordova-plugin-purchase)

---

## Current Mock Implementation Note

Your code currently has a mock purchase fallback at [appleIAP.ts:330-348](src/integrations/apple/appleIAP.ts#L330-L348) when products aren't loaded. This is helpful for UI testing but should be removed before production.

```typescript
// TEMPORARY: Mock successful purchase for testing
if (!product || !product.loaded || !product.valid) {
  console.log('🍎 Product not loaded from App Store - using MOCK PURCHASE for testing');
  // ... mock implementation
}
```

**Recommendation:** Once StoreKit testing is working, remove the mock fallback to ensure you're testing the real purchase flow.
