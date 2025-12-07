import { shouldUseApplePayments } from '../../utils/platformUtils';
import { supabase } from '../supabase/client';

// TypeScript declarations for cordova-plugin-purchase
declare global {
  interface Window {
    store?: {
      CONSUMABLE: string;
      PAID_SUBSCRIPTION: string;
      APPLE_APPSTORE: string;
      register: (product: { id: string; type: string; platform: string }) => void;
      ready: (callback: () => void) => void;
      refresh: () => void;
      when: (productId: string) => {
        initiated: (callback: (product: any) => void) => any;
        approved: (callback: (product: any) => void) => any;
        verified: (callback: (product: any) => void) => any;
        finished: (callback: (product: any) => void) => any;
        error: (callback: (error: any) => void) => any;
      };
      order: (productId: string) => void;
      get: (productId: string) => any;
      registeredProducts: any[];
    };
    CdvPurchase?: any;
  }
}

// Your App Store Connect Product IDs
export const APPLE_PRODUCT_IDS = {
  SINGLE_CREDIT: 'com.linksmarttech.tossortaste.single_credit',
  CREDIT_PACK: 'com.linksmarttech.tossortaste.credit_pack',
  PREMIUM_MONTHLY: 'com.linksmarttech.tossortaste.premium_monthly',
  PREMIUM_ANNUAL: 'com.linksmarttech.tossortaste.premium_annual',
} as const;

export class AppleIAPService {
  private static instance: AppleIAPService;
  private isInitialized = false;
  private purchaseCompleteCallbacks: Array<(productId: string) => void> = [];

  static getInstance(): AppleIAPService {
    if (!AppleIAPService.instance) {
      AppleIAPService.instance = new AppleIAPService();
    }
    return AppleIAPService.instance;
  }

  onPurchaseComplete(callback: (productId: string) => void): void {
    this.purchaseCompleteCallbacks.push(callback);
  }

  private notifyPurchaseComplete(productId: string): void {
    console.log('🍎 notifyPurchaseComplete called with productId:', productId);
    console.log('🍎 Number of callbacks registered:', this.purchaseCompleteCallbacks.length);

    // Dispatch custom event that components can listen to
    window.dispatchEvent(new CustomEvent('iap-purchase-complete', {
      detail: { productId }
    }));

    this.purchaseCompleteCallbacks.forEach(callback => {
      try {
        callback(productId);
      } catch (error) {
        console.error('Error in purchase complete callback:', error);
      }
    });
  }

  private waitForCdvPurchase(): Promise<void> {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 100; // 100 attempts * 100ms = 10 seconds
      
      const checkCdvPurchase = () => {
        attempts++;
        console.log(`🍎 CdvPurchase check attempt ${attempts}/${maxAttempts}`);
        
        // Check for CdvPurchase object
        if (window.CdvPurchase) {
          console.log('🍎 Found CdvPurchase, initializing store...');
          this.initializeCdvPurchase();
          resolve();
          return;
        }
        
        // Also check if window.store is properly populated
        if (window.store && Object.keys(window.store).length > 0) {
          console.log('🍎 Found populated window.store with keys:', Object.keys(window.store));
          resolve();
          return;
        }
        
        console.log('🍎 CdvPurchase not ready yet, available properties:', 
          Object.keys(window).filter(key => key.toLowerCase().includes('cdv') || key.toLowerCase().includes('store')));
        
        if (attempts >= maxAttempts) {
          console.log('🍎 CdvPurchase timeout - proceeding anyway');
          resolve();
        } else {
          setTimeout(checkCdvPurchase, 100);
        }
      };
      
      // Start checking immediately
      checkCdvPurchase();
    });
  }

  private initializeCdvPurchase(): void {
    if (!window.CdvPurchase) {
      console.log('🍎 CdvPurchase not available');
      return;
    }

    try {
      console.log('🍎 Initializing CdvPurchase store...');
      
      // Initialize the store with CdvPurchase
      const store = window.CdvPurchase.store;
      
      if (store) {
        console.log('🍎 CdvPurchase.store available, setting up window.store');
        window.store = store;
      } else {
        console.log('🍎 CdvPurchase.store not available');
      }
    } catch (error) {
      console.error('🍎 Error initializing CdvPurchase:', error);
    }
  }

  async initialize(userId: string): Promise<void> {
    if (!shouldUseApplePayments()) {
      console.log('Not iOS platform, skipping Apple IAP initialization');
      return;
    }

    if (this.isInitialized) {
      return;
    }

    try {
      console.log('🍎 Starting Apple IAP initialization...');
      
      // Wait for CdvPurchase to be available
      await this.waitForCdvPurchase();
      console.log('🍎 CdvPurchase initialization completed');

      console.log('🍎 Checking for window.store...', !!window.store);
      if (!window.store || !window.store.register) {
        console.error('🍎 Store plugin not properly initialized after waiting');
        console.log('🍎 Available window properties:', Object.keys(window).filter(key => 
          key.toLowerCase().includes('store') || key.toLowerCase().includes('cordova')));
        console.log('🍎 Window.store exists?', !!window.store);
        if (window.store) {
          console.log('🍎 Window.store properties:', Object.keys(window.store));
        }
        throw new Error('Store plugin failed to initialize');
      }

      console.log('🍎 Store object properties:', Object.keys(window.store));
      console.log('🍎 Store constants available:', {
        CONSUMABLE: !!window.store.CONSUMABLE,
        PAID_SUBSCRIPTION: !!window.store.PAID_SUBSCRIPTION,
        register: !!window.store.register,
        ready: !!window.store.ready
      });

      // Register all products
      console.log('🍎 Registering products...');
      
      try {
        window.store.register({
          id: APPLE_PRODUCT_IDS.SINGLE_CREDIT,
          type: window.store.CONSUMABLE,
          platform: window.store.APPLE_APPSTORE,
        });
        console.log('🍎 Registered SINGLE_CREDIT:', APPLE_PRODUCT_IDS.SINGLE_CREDIT);
      } catch (e) {
        console.error('🍎 Failed to register SINGLE_CREDIT:', e);
      }

      try {
        window.store.register({
          id: APPLE_PRODUCT_IDS.CREDIT_PACK,
          type: window.store.CONSUMABLE,
          platform: window.store.APPLE_APPSTORE,
        });
        console.log('🍎 Registered CREDIT_PACK:', APPLE_PRODUCT_IDS.CREDIT_PACK);
      } catch (e) {
        console.error('🍎 Failed to register CREDIT_PACK:', e);
      }

      try {
        window.store.register({
          id: APPLE_PRODUCT_IDS.PREMIUM_MONTHLY,
          type: window.store.PAID_SUBSCRIPTION,
          platform: window.store.APPLE_APPSTORE,
        });
        console.log('🍎 Registered PREMIUM_MONTHLY:', APPLE_PRODUCT_IDS.PREMIUM_MONTHLY);
      } catch (e) {
        console.error('🍎 Failed to register PREMIUM_MONTHLY:', e);
      }

      try {
        window.store.register({
          id: APPLE_PRODUCT_IDS.PREMIUM_ANNUAL,
          type: window.store.PAID_SUBSCRIPTION,
          platform: window.store.APPLE_APPSTORE,
        });
        console.log('🍎 Registered PREMIUM_ANNUAL:', APPLE_PRODUCT_IDS.PREMIUM_ANNUAL);
      } catch (e) {
        console.error('🍎 Failed to register PREMIUM_ANNUAL:', e);
      }

      console.log('🍎 All products registered, setting up handlers...');
      console.log('🍎 🚨 V2 - HANDLERS BEFORE REFRESH 🚨');

      // Set up global error handler BEFORE calling refresh
      window.store.error((error: any) => {
        console.error('🍎 Store error:', error);
        if (error.code) {
          console.error('🍎 Error code:', error.code);
        }
        if (error.message) {
          console.error('🍎 Error message:', error.message);
        }
      });
      console.log('🍎 ✓ Global error handler registered');

      // Set up purchase handlers BEFORE calling refresh (handlers don't need products to exist)
      console.log('🍎 Setting up purchase handlers before refresh...');
      this.setupPurchaseHandlers();
      console.log('🍎 ✓ Purchase handlers registered');

      // Set up ready callback
      window.store.ready(() => {
        console.log('🍎 ✅ Apple IAP store ready!');

        // Log product info immediately
        console.log('🍎 Store ready - checking all products...');
        console.log('🍎 Registered products:', window.store?.registeredProducts);

        Object.values(APPLE_PRODUCT_IDS).forEach(productId => {
          const product = window.store?.get(productId);
          console.log(`🍎 Product ${productId}:`, product || 'NOT FOUND');
          if (product) {
            console.log(`🍎 Product ${productId} details:`, {
              id: product.id,
              title: product.title,
              description: product.description,
              price: product.price,
              currency: product.currency,
              loaded: product.loaded,
              valid: product.valid,
              canPurchase: product.canPurchase
            });
          }
        });

        // Also log all available products
        const allProducts = window.store?.registeredProducts || [];
        console.log('🍎 All registered products:', allProducts.map((p: any) => ({
          id: p.id,
          loaded: p.loaded,
          valid: p.valid
        })));

        this.isInitialized = true;
        console.log('🍎 Apple IAP initialization complete (after ready)');
      });
      console.log('🍎 ✓ Ready callback registered');

      // Now call refresh to trigger product loading
      console.log('🍎 Calling refresh to load products...');
      window.store.refresh();
      console.log('🍎 ✓ Refresh called (async, waiting for ready callback)');
    } catch (error) {
      console.error('Failed to initialize Apple IAP:', error);
      throw error;
    }
  }

  private setupPurchaseHandlers(): void {
    console.log('🍎 [HANDLER SETUP] Starting setupPurchaseHandlers...');
    console.log('🍎 [HANDLER SETUP] window.store exists?', !!window.store);

    if (!window.store) {
      console.error('🍎 [HANDLER SETUP] window.store is null/undefined, returning early');
      return;
    }

    console.log('🍎 [HANDLER SETUP] window.store.when exists?', !!window.store.when);
    console.log('🍎 [HANDLER SETUP] typeof window.store.when:', typeof window.store.when);

    try {
      console.log('🍎 [HANDLER SETUP] Setting up purchase event handlers...');
      console.log('🍎 [HANDLER SETUP] Product IDs to register:', Object.values(APPLE_PRODUCT_IDS));

      // Handle all products with the new event system
      Object.values(APPLE_PRODUCT_IDS).forEach((productId, index) => {
        console.log(`🍎 [HANDLER SETUP] Processing product ${index + 1}/4: ${productId}`);

        try {
          console.log(`🍎 [HANDLER SETUP] Calling window.store.when('${productId}')...`);
          const productHandler = window.store?.when(productId);
          console.log(`🍎 [HANDLER SETUP] productHandler returned:`, !!productHandler, typeof productHandler);

          if (productHandler) {
            console.log(`🍎 [HANDLER SETUP] Setting up .approved() handler...`);
            productHandler
              .approved((product: any) => {
                console.log('🍎 Purchase approved:', product);
                // Finish the transaction
                product.finish();
              })
              .verified((product: any) => {
                console.log('🍎 Purchase verified:', product);
                // Update backend based on product type
                this.handleVerifiedPurchase(product);
              })
              .error((error: any) => {
                console.error('🍎 Purchase error:', error);
              });
            console.log(`🍎 [HANDLER SETUP] ✓ Event handlers set for product: ${productId}`);
          } else {
            console.warn(`🍎 [HANDLER SETUP] ⚠️ window.store.when() returned null/undefined for: ${productId}`);
          }
        } catch (productError) {
          console.error(`🍎 [HANDLER SETUP] ❌ Exception while setting up handlers for ${productId}:`, productError);
          console.error(`🍎 [HANDLER SETUP] Error type:`, typeof productError);
          console.error(`🍎 [HANDLER SETUP] Error message:`, productError?.message);
          console.error(`🍎 [HANDLER SETUP] Error stack:`, productError?.stack);
          // Don't throw - continue with other products
        }
      });

      console.log('🍎 [HANDLER SETUP] ✓ Completed setting up all product handlers');
    } catch (error) {
      console.error('🍎 [HANDLER SETUP] ❌ Outer exception in setupPurchaseHandlers:', error);
      console.error('🍎 [HANDLER SETUP] Error type:', typeof error);
      console.error('🍎 [HANDLER SETUP] Error message:', error?.message);
      console.error('🍎 [HANDLER SETUP] Error stack:', error?.stack);
      // Don't throw - let initialization continue
    }

    console.log('🍎 [HANDLER SETUP] setupPurchaseHandlers completed');
  }

  private async handleVerifiedPurchase(product: any): Promise<void> {
    const productId = product.id;

    try {
      if (productId === APPLE_PRODUCT_IDS.SINGLE_CREDIT) {
        await this.updateBackendCredits(1);
      } else if (productId === APPLE_PRODUCT_IDS.CREDIT_PACK) {
        await this.updateBackendCredits(5);
      } else if (productId === APPLE_PRODUCT_IDS.PREMIUM_MONTHLY) {
        await this.updateBackendSubscription('monthly');
      } else if (productId === APPLE_PRODUCT_IDS.PREMIUM_ANNUAL) {
        await this.updateBackendSubscription('annual');
      }

      // Notify listeners that purchase is complete and backend is updated
      console.log('🍎 Purchase verified and backend updated, notifying listeners');
      this.notifyPurchaseComplete(productId);
    } catch (error) {
      console.error('Failed to update backend after purchase:', error);
    }
  }

  async purchaseCredits(creditAmount: 1 | 5): Promise<boolean> {
    console.log('🍎 purchaseCredits called:', { creditAmount, isInitialized: this.isInitialized, hasStore: !!window.store });
    
    if (!shouldUseApplePayments()) {
      console.log('🍎 Not on iOS platform');
      return false;
    }
    
    if (!this.isInitialized) {
      console.log('🍎 Apple IAP not initialized');
      return false;
    }
    
    if (!window.store) {
      console.log('🍎 Window.store not available');
      return false;
    }

    try {
      const productId = creditAmount === 1 ? APPLE_PRODUCT_IDS.SINGLE_CREDIT : APPLE_PRODUCT_IDS.CREDIT_PACK;

      console.log('🍎 Initiating credit purchase:', productId);
      const product = window.store.get(productId);
      console.log('🍎 Product info before purchase:', product);

      if (!product || !product.loaded || !product.valid) {
        console.error('🍎 Product not loaded from App Store:', {
          exists: !!product,
          loaded: product?.loaded,
          valid: product?.valid,
          canPurchase: product?.canPurchase
        });
        throw new Error('Product not available for purchase');
      }

      if (!product.canPurchase) {
        console.error('🍎 Product cannot be purchased:', product);
        throw new Error('Product cannot be purchased at this time');
      }

      // Set up one-time listeners for this specific purchase
      this.setupSinglePurchaseHandler(productId);

      const result = window.store.order(productId);
      console.log('🍎 Purchase order result:', result);

      // Return true immediately - actual success is handled in the verified callback
      return true;
    } catch (error) {
      console.error('🍎 Failed to purchase credits:', error);
      return false;
    }
  }

  async purchaseSubscription(type: 'monthly' | 'annual'): Promise<boolean> {
    if (!shouldUseApplePayments() || !this.isInitialized || !window.store) {
      return false;
    }

    try {
      const productId = type === 'monthly' ? APPLE_PRODUCT_IDS.PREMIUM_MONTHLY : APPLE_PRODUCT_IDS.PREMIUM_ANNUAL;
      
      console.log('Initiating subscription purchase:', productId);
      window.store.order(productId);
      
      // Return true immediately - actual success is handled in the verified callback
      return true;
    } catch (error) {
      console.error('Failed to purchase subscription:', error);
      return false;
    }
  }

  private setupSinglePurchaseHandler(productId: string): void {
    try {
      console.log(`🍎 Setting up single purchase handler for: ${productId}`);

      const productHandler = window.store?.when(productId);
      if (productHandler) {
        productHandler
          .initiated((product: any) => {
            console.log('🍎 Purchase initiated:', product);
          })
          .approved(async (product: any) => {
            console.log('🍎 Purchase approved:', product);
            // Update backend immediately when approved (for StoreKit testing)
            await this.handleVerifiedPurchase(product);
            // Finish the transaction
            product.finish();
          })
          .verified((product: any) => {
            console.log('🍎 Purchase verified:', product);
            // Also handle in verified for production
            this.handleVerifiedPurchase(product);
          })
          .finished((product: any) => {
            console.log('🍎 Purchase finished:', product);
          })
          .error((error: any) => {
            console.error('🍎 Purchase error:', error);
          });
        console.log(`🍎 Single purchase handlers set for: ${productId}`);
      } else {
        console.error(`🍎 Failed to set single purchase handler for: ${productId}`);
      }
    } catch (error) {
      console.error('🍎 Error setting up single purchase handler:', error);
    }
  }

  async getProductInfo(productId: string): Promise<any> {
    if (!shouldUseApplePayments() || !this.isInitialized || !window.store) {
      return null;
    }

    return window.store.get(productId);
  }

  private async updateBackendCredits(creditAmount: number): Promise<void> {
    try {
      console.log(`🍎 Updating ${creditAmount} credits directly via Supabase...`);
      
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      // Get current profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('room_credits')
        .eq('id', user.id)
        .single();

      if (profileError) {
        throw new Error(`Failed to get user profile: ${profileError.message}`);
      }

      const currentCredits = profile?.room_credits || 0;
      const newCredits = currentCredits + creditAmount;

      // Update credits
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          room_credits: newCredits,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (updateError) {
        throw new Error(`Failed to update credits: ${updateError.message}`);
      }

      console.log(`🍎 Credits updated: ${currentCredits} → ${newCredits}`);
    } catch (error) {
      console.error('🍎 Error updating backend credits:', error);
      throw error;
    }
  }

  private async updateBackendSubscription(type: 'monthly' | 'annual'): Promise<void> {
    try {
      console.log(`🍎 Updating ${type} subscription directly via Supabase...`);
      
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      // Calculate subscription expiry date
      const now = new Date();
      const expiryDate = new Date(now);
      if (type === 'monthly') {
        expiryDate.setMonth(expiryDate.getMonth() + 1);
      } else {
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
      }

      // Update subscription
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          subscription_type: type,
          subscription_status: 'active',
          subscription_expires_at: expiryDate.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (updateError) {
        throw new Error(`Failed to update subscription: ${updateError.message}`);
      }

      console.log(`🍎 Subscription updated: ${type} until ${expiryDate.toISOString()}`);
    } catch (error) {
      console.error('🍎 Error updating backend subscription:', error);
      throw error;
    }
  }
}

export const appleIAP = AppleIAPService.getInstance();
