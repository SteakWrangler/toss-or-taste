# Android Implementation Checklist

This document outlines everything needed to implement Android support for the Toss or Taste app using Google Play Billing.

**Legend:**
- ↗️ = Can borrow/adapt from iOS or web implementation
- ✅ = Already complete
- 🆕 = New implementation needed

---

## 1. Google Play Billing Integration

### 1.1 Create Android Billing Service
- [ ] **File**: `src/integrations/google/googlePlayBilling.ts` (NEW)
  - ↗️ **Borrow from**: `src/integrations/apple/appleIAP.ts` (mirror the structure)
  - Use existing `PurchasePlugin.java` in Android project
  - Implement same interface: `initialize()`, `purchaseSubscription()`, `purchaseCredits()`
  - Handle Google purchase tokens (similar to Apple receipts)
  - Set up event listeners for purchase completion

### 1.2 Create Google Payment Service Class
- [ ] **File**: Update `src/services/paymentService.ts`
  - ↗️ **Borrow from**: `ApplePaymentService` class pattern
  - Add `GooglePlayPaymentService` class
  - Implement: `subscribe()`, `buyCredits()`, `manageSubscription()`
  - Handle Google-specific subscription management

### 1.3 Update Platform Detection
- [ ] **File**: `src/utils/platformUtils.ts`
  - ↗️ **Already exists**: `isAndroid()` function
  - Add: `shouldUseGooglePay()` function
  - Update `getPaymentService()` factory to return `GooglePlayPaymentService` for Android

### 1.4 Update Subscription Manager UI
- [ ] **File**: `src/components/SubscriptionManager.tsx`
  - ↗️ **Mostly done**: Already has platform detection logic
  - Update Android-specific button handling
  - Add Google Play subscription management instructions
  - Handle loading states for Google billing

### 1.5 Configure Google Play Products
- [ ] **Location**: Google Play Console (web interface)
  - ↗️ **Use same structure as iOS**:
    - Premium Monthly: `com.tossortaste.app.premium_monthly`
    - Premium Annual: `com.tossortaste.app.premium_annual`
    - Single Credit: `com.tossortaste.app.single_credit`
    - Credit Pack (5x): `com.tossortaste.app.credit_pack`
  - Set same pricing as iOS ($5/month, $50/year, etc.)
  - Mark subscriptions vs consumables appropriately

---

## 2. Backend Validation & Database

### 2.1 Create Google Play Validation Edge Functions

#### Subscription Processing
- [ ] **File**: `supabase/functions/google-iap-process-subscription/index.ts` (NEW)
  - ↗️ **Borrow from**: `supabase/functions/apple-iap-process-subscription/index.ts`
  - Validate purchase tokens with Google Play API (instead of Apple)
  - Use Google service account JSON for authentication
  - Update user subscription status in database
  - Return validation result to app

#### Credits Processing
- [ ] **File**: `supabase/functions/google-iap-process-credits/index.ts` (NEW)
  - ↗️ **Borrow from**: `supabase/functions/apple-iap-process-credits/index.ts`
  - Validate consumable purchases
  - Update user credit balance
  - Prevent duplicate credit grants

### 2.2 Create Google Play Transactions Table
- [ ] **File**: `supabase/migrations/YYYYMMDDHHMMSS_create_google_play_transactions.sql` (NEW)
  - ↗️ **Copy structure from**: `supabase/migrations/20251208061709_create_apple_iap_transactions.sql`
  - Replace Apple-specific fields with Google equivalents:
    - `purchase_token` (instead of `transaction_id`)
    - `order_id` (Google's unique order ID)
    - `acknowledgement_state` (Google requires acknowledgment)
  - Keep same indexes and constraints pattern

### 2.3 Set Up Google Service Account
- [ ] **Location**: Google Cloud Console
  - Create service account for Google Play API access
  - Download JSON key file
  - ↗️ **Add to Supabase secrets**: Same pattern as Apple shared secret
  - Use in backend validation functions

---

## 3. App Configuration & Permissions

### 3.1 Verify Android Manifest Permissions
- [x] **File**: `android/app/src/main/AndroidManifest.xml`
  - ✅ **Already has**: `INTERNET` permission
  - ✅ **Already has**: Location permissions (if using geolocation plugin)
  - No additional permissions needed for Google Play Billing

### 3.2 Update Capacitor Configuration (if needed)
- [x] **File**: `capacitor.config.ts`
  - ✅ **Already configured**: All Capacitor plugins
  - ↗️ **Same as iOS**: SplashScreen, StatusBar, Keyboard config
  - No Android-specific changes needed

### 3.3 Verify Build Configuration
- [x] **File**: `android/variables.gradle`
  - ✅ **Already correct**: targetSdkVersion = 35 (exceeds requirement)
  - ✅ **Already has**: Google Play Billing library v7.1.1
  - No changes needed

---

## 4. App Assets & Branding

### 4.1 Create Android App Icons
- [ ] **Location**: `android/app/src/main/res/mipmap-*/ic_launcher.png`
  - Create icons for all DPI variants:
    - `mipmap-mdpi` (48x48)
    - `mipmap-hdpi` (72x72)
    - `mipmap-xhdpi` (96x96)
    - `mipmap-xxhdpi` (144x144)
    - `mipmap-xxxhdpi` (192x192)
  - ↗️ **Use same design as iOS**: Your app icon/logo
  - Consider using a tool like Android Asset Studio to generate all sizes

### 4.2 Create Adaptive Icons (Optional but Recommended)
- [ ] **Location**: `android/app/src/main/res/mipmap-*/ic_launcher_foreground.png`
  - Foreground layer (app logo)
  - Background layer (solid color or pattern)
  - Allows Android to shape icon based on device theme

### 4.3 Update Splash Screen (if needed)
- [x] ✅ **Already configured**: capacitor.config.ts has SplashScreen settings
  - ↗️ **Same as iOS**: Orange spinner (#f97316)
  - No changes needed

---

## 5. Google Play Store Listing Requirements

### 5.1 Privacy Policy
- [ ] **What you need**: URL to your privacy policy
  - ✅ **Already exists**: https://linksmarttechnologies.com/tossortaste-privacy-policy
  - ↗️ **Already linked in app**: PrivacyPolicy.tsx component
  - Action: Verify it covers:
    - Location data collection for restaurant discovery
    - Google Play Billing usage
    - Data deletion rights
    - Third-party services (Supabase, etc.)

### 5.2 Terms of Service (Optional but Recommended)
- [ ] **What you need**: URL to your terms of service
  - ✅ **Already exists**: TermsOfService.tsx component
  - ↗️ **Same as iOS**: Already accessible in app
  - Action: Host online and get URL (or keep in-app only)

### 5.3 App Screenshots
- [ ] **Required**: Minimum 2 screenshots, recommended 4-8
  - Create screenshots showing:
    - Restaurant discovery/swiping interface
    - Room creation/joining
    - Match results
    - Subscription options
  - Recommended resolution: 1080x1920 (portrait) or 1920x1080 (landscape)
  - Can add text overlays to highlight features
  - ↗️ **Can use same screenshots as iOS** (if similar UI)

### 5.4 Feature Graphic
- [ ] **Required**: 1024x500 pixel graphic
  - Used for promotional display on Play Store
  - Should include app name and key visual
  - ↗️ **Can adapt from iOS marketing materials**

### 5.5 App Icon for Store
- [ ] **Required**: 512x512 pixel high-res icon
  - ↗️ **Use same design as iOS app icon**
  - Must be uploaded separately from app bundle

### 5.6 App Description
- [ ] **Required**: Short description (80 chars) + Full description (4000 chars max)
  - ↗️ **Can use iOS App Store description** as starting point
  - Describe: Restaurant discovery, swiping, real-time matching, credits system
  - Mention subscription benefits
  - Don't mention iOS or Apple (Google allows it, but unnecessary)

---

## 6. Play Console Compliance Forms

### 6.1 Data Safety Form
- [ ] **Required**: Complete during app submission
  - Declare what data you collect:
    - ✅ Location data (precise/approximate)
      - Purpose: "Restaurant discovery and recommendations"
      - Collected: Yes
      - Shared: (Specify if sharing with Google Maps API, etc.)
    - ✅ Personal info (name, email)
      - Purpose: "Account creation and management"
    - ✅ Purchase history
      - Purpose: "Subscription and credit management"
    - ✅ App activity
      - Purpose: "Analytics and app functionality"
  - Security practices:
    - Data encrypted in transit (HTTPS)
    - Data encrypted at rest (specify if using Supabase encryption)
    - Users can request data deletion
  - ↗️ **Reference your Privacy Policy** for details

### 6.2 IARC Content Rating Questionnaire
- [ ] **Required**: Takes ~10 minutes
  - Questions about:
    - Violence (none in your app)
    - Sexual content (none)
    - Language (user-generated, moderate if applicable)
    - Controlled substances (none)
    - Gambling (none)
    - Location sharing (yes - explain it's for restaurant discovery)
  - Result: Age rating assigned (likely E for Everyone or T for Teen)

### 6.3 Target Audience Declaration
- [ ] **Required**: Specify age groups
  - Likely: 13+ or 18+ (depending on your policy)
  - ↗️ **Match iOS age rating** for consistency
  - Affects ad policies and data collection rules

### 6.4 App Category
- [ ] **Required**: Primary and secondary category
  - Suggested primary: "Lifestyle" or "Food & Drink"
  - Suggested secondary: "Social"

---

## 7. Testing & Quality Assurance

### 7.1 Set Up Internal Testing Track
- [ ] **Location**: Google Play Console
  - Create internal testing track
  - Add test users by email
  - Upload first APK/AAB for testing
  - Test subscription purchases with test products

### 7.2 Configure Test Products
- [ ] **Location**: Google Play Console
  - Set up test product IDs (same as production products)
  - Add test accounts that can make purchases without being charged
  - Test subscription flow end-to-end

### 7.3 Test Purchase Flow
- [ ] Test scenarios:
  - Purchase monthly subscription
  - Purchase annual subscription
  - Purchase credits (1x and 5x)
  - Verify backend validation works
  - Verify credits/subscription reflected in user profile
  - Test subscription cancellation
  - Test subscription management

### 7.4 Test Platform Detection
- [ ] Verify app correctly detects Android platform
- [ ] Verify Google Play Billing service is used (not Stripe or Apple)
- [ ] Test on multiple Android devices/versions
  - ↗️ **Similar testing as iOS**, but on Android devices

---

## 8. Legal & Compliance

### 8.1 Subscription Disclosure UI
- [ ] **File**: `src/components/SubscriptionManager.tsx`
  - ✅ **Already has Apple disclosure**
  - Update for Android to mention:
    - "Subscriptions managed through Google Play"
    - "Cancel anytime in Google Play subscriptions settings"
    - ↗️ **Similar to iOS disclaimer**, just change "Apple" to "Google Play"

### 8.2 Refund Policy
- [ ] **Where**: In Terms of Service or separate page
  - State Google Play's 48-hour refund window
  - ↗️ **Can borrow from Apple refund policy**, adjust for Google

### 8.3 User Data Deletion
- [ ] ✅ **Already implemented**: (Verify if you have account deletion feature)
  - If not, add account deletion option in UserProfileModal
  - Should delete user data from Supabase
  - GDPR/CCPA requirement

---

## 9. Build & Release Preparation

### 9.1 Generate Signed APK/AAB
- [ ] **Command**: `cd android && ./gradlew bundleRelease`
  - Creates Android App Bundle (.aab) for Play Store
  - Requires signing key (create keystore if you don't have one)
  - Configure signing in `android/app/build.gradle`

### 9.2 Create Keystore for Signing
- [ ] **Command**: `keytool -genkey -v -keystore my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000`
  - Store keystore file securely
  - Document password and alias
  - ↗️ **Different from iOS**: Uses keystore instead of provisioning profiles

### 9.3 Update Version Code & Version Name
- [ ] **File**: `android/app/build.gradle`
  - Set `versionCode` = 1 (increment for each release)
  - Set `versionName` = "1.0" (human-readable version)
  - ↗️ **Similar to iOS CFBundleVersion**

### 9.4 Configure ProGuard (Optional)
- [ ] **File**: `android/proguard-rules.pro`
  - Enables code obfuscation and optimization
  - Reduces APK size
  - May need rules to preserve certain classes

---

## 10. Launch Checklist

### 10.1 Pre-Submission Verification
- [ ] Google Play Billing fully integrated and tested
- [ ] Backend validation functions deployed
- [ ] Database tables created
- [ ] Products configured in Google Play Console
- [ ] App icons generated for all DPI variants
- [ ] Screenshots created (4-8 images)
- [ ] Feature graphic created (1024x500)
- [ ] Privacy Policy URL ready
- [ ] Data Safety form answers prepared
- [ ] IARC rating questionnaire completed
- [ ] App description written
- [ ] Signed APK/AAB generated
- [ ] Internal testing completed successfully

### 10.2 Play Console Submission
- [ ] Upload APK/AAB
- [ ] Fill in store listing (title, description, graphics)
- [ ] Complete Data Safety form
- [ ] Complete content rating
- [ ] Set pricing (free app with in-app purchases)
- [ ] Select countries/regions for distribution
- [ ] Submit for review

### 10.3 Post-Submission
- [ ] Monitor review status (usually 1-3 days)
- [ ] Address any policy violations if flagged
- [ ] Plan rollout strategy (staged rollout recommended)
- [ ] Monitor crash reports and user feedback

---

## Summary: What Can Be Reused vs What's New

### ✅ Can Reuse from iOS/Web (No or Minimal Changes)
- Privacy Policy and Terms of Service pages/URLs
- SubscriptionManager component (with minor Android-specific updates)
- UserProfileModal component
- Platform detection utilities (already exists)
- Database schema for user profiles, subscriptions, credits
- App icon design (just need to generate Android sizes)
- Legal compliance text (adjust "Apple" to "Google Play")
- Marketing screenshots (if UI is similar enough)
- App description (adapt from iOS)

### 🔄 Needs Adaptation from iOS
- Payment service integration (AppleIAPService → GooglePlayPaymentService)
- Backend validation functions (Apple API → Google Play API)
- Transaction tracking table (Apple-specific fields → Google-specific fields)
- Product IDs (same structure, different prefix)
- Subscription management UI text ("Apple Settings" → "Google Play Settings")

### 🆕 Completely New for Android
- `googlePlayBilling.ts` service file
- Google Play product configuration (via Play Console)
- Google service account setup
- Data Safety form (Google-specific requirement)
- IARC content rating
- Keystore generation and signing configuration
- Android app icons in all DPI variants (mipmap folders)
- Feature graphic (1024x500, specific to Play Store)

---

## Estimated Timeline

- **Week 1**: Google Play Billing integration + backend functions (items 1-2)
- **Week 2**: Database setup + testing infrastructure (items 2.2, 7.1-7.4)
- **Week 3**: App assets + Play Console forms (items 4-6)
- **Week 4**: Testing, polish, and submission (items 9-10)

**Total: 3-4 weeks** from start to submission

---

## Quick Reference: Key File Locations

### New Files to Create
- `src/integrations/google/googlePlayBilling.ts`
- `supabase/functions/google-iap-process-subscription/index.ts`
- `supabase/functions/google-iap-process-credits/index.ts`
- `supabase/migrations/YYYYMMDDHHMMSS_create_google_play_transactions.sql`

### Files to Modify
- `src/services/paymentService.ts` (add GooglePlayPaymentService class)
- `src/utils/platformUtils.ts` (add shouldUseGooglePay function)
- `src/components/SubscriptionManager.tsx` (Android-specific UI updates)
- `android/app/build.gradle` (signing configuration, version codes)

### Files to Reference from iOS
- `src/integrations/apple/appleIAP.ts` (structure template)
- `supabase/functions/apple-iap-process-subscription/index.ts` (validation logic)
- `supabase/migrations/20251208061709_create_apple_iap_transactions.sql` (schema)

---

## Resources

### Google Play Documentation
- [Google Play Billing](https://developer.android.com/google/play/billing)
- [Developer Program Policies](https://play.google.com/about/developer-program-policies/)
- [Data Safety Form Guide](https://support.google.com/googleplay/android-developer/answer/10787469)
- [Publishing Overview](https://developer.android.com/studio/publish)

### Tools
- [Android Asset Studio](https://romannurik.github.io/AndroidAssetStudio/) - Generate app icons
- [Google Play Console](https://play.google.com/console) - App submission and management
- [Google Cloud Console](https://console.cloud.google.com) - Service account setup

### Internal References
- iOS implementation: `src/integrations/apple/appleIAP.ts`
- Payment service architecture: `src/services/paymentService.ts`
- Privacy Policy: https://linksmarttechnologies.com/tossortaste-privacy-policy
