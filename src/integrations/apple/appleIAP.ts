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

        // Check for CdvPurchase object
        if (window.CdvPurchase) {
          this.initializeCdvPurchase();
          resolve();
          return;
        }

        // Also check if window.store is properly populated
        if (window.store && Object.keys(window.store).length > 0) {
          resolve();
          return;
        }

        if (attempts >= maxAttempts) {
          console.warn('Apple IAP: CdvPurchase timeout - proceeding anyway');
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
      return;
    }

    try {
      // Initialize the store with CdvPurchase
      const store = window.CdvPurchase.store;

      if (store) {
        window.store = store;
      }
    } catch (error) {
      console.error('Apple IAP: Error initializing CdvPurchase:', error);
    }
  }

  async initialize(userId: string): Promise<void> {
    if (!shouldUseApplePayments()) {
      return;
    }

    if (this.isInitialized) {
      return;
    }

    try {
      // Wait for CdvPurchase to be available
      await this.waitForCdvPurchase();

      if (!window.store || !window.store.register) {
        throw new Error('Store plugin failed to initialize');
      }

      // Register all products
      window.store.register({
        id: APPLE_PRODUCT_IDS.SINGLE_CREDIT,
        type: window.store.CONSUMABLE,
        platform: window.store.APPLE_APPSTORE,
      });

      window.store.register({
        id: APPLE_PRODUCT_IDS.CREDIT_PACK,
        type: window.store.CONSUMABLE,
        platform: window.store.APPLE_APPSTORE,
      });

      window.store.register({
        id: APPLE_PRODUCT_IDS.PREMIUM_MONTHLY,
        type: window.store.PAID_SUBSCRIPTION,
        platform: window.store.APPLE_APPSTORE,
      });

      window.store.register({
        id: APPLE_PRODUCT_IDS.PREMIUM_ANNUAL,
        type: window.store.PAID_SUBSCRIPTION,
        platform: window.store.APPLE_APPSTORE,
      });

      // Set up global error handler
      window.store.error((error: any) => {
        console.error('Apple IAP error:', error);
      });

      // Set up purchase handlers
      this.setupPurchaseHandlers();

      // Set up ready callback
      window.store.ready(() => {
        this.isInitialized = true;
      });

      // Initialize to trigger product loading
      window.store.initialize();
    } catch (error) {
      console.error('Failed to initialize Apple IAP:', error);
      throw error;
    }
  }

  private setupPurchaseHandlers(): void {
    if (!window.store) {
      return;
    }

    Object.values(APPLE_PRODUCT_IDS).forEach((productId) => {
      const productHandler = window.store?.when(productId);
      if (productHandler) {
        productHandler
          .approved((product: any) => {
            product.finish();
          })
          .verified((product: any) => {
            this.handleVerifiedPurchase(product);
          });
      }
    });
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

      this.notifyPurchaseComplete(productId);
    } catch (error) {
      console.error('Failed to update backend after purchase:', error);
    }
  }

  async purchaseCredits(creditAmount: 1 | 5): Promise<boolean> {
    if (!shouldUseApplePayments() || !this.isInitialized || !window.store) {
      return false;
    }

    try {
      const productId = creditAmount === 1 ? APPLE_PRODUCT_IDS.SINGLE_CREDIT : APPLE_PRODUCT_IDS.CREDIT_PACK;
      const product = window.store.get(productId);

      if (!product) {
        throw new Error('Product not found');
      }

      if (!product.canPurchase) {
        throw new Error('Product cannot be purchased at this time');
      }

      this.setupSinglePurchaseHandler(productId);
      window.store.order(productId);

      return true;
    } catch (error) {
      console.error('Failed to purchase credits:', error);
      return false;
    }
  }

  async purchaseSubscription(type: 'monthly' | 'annual'): Promise<boolean> {
    if (!shouldUseApplePayments() || !this.isInitialized || !window.store) {
      return false;
    }

    try {
      const productId = type === 'monthly' ? APPLE_PRODUCT_IDS.PREMIUM_MONTHLY : APPLE_PRODUCT_IDS.PREMIUM_ANNUAL;
      window.store.order(productId);
      return true;
    } catch (error) {
      console.error('Failed to purchase subscription:', error);
      return false;
    }
  }

  private setupSinglePurchaseHandler(productId: string): void {
    const productHandler = window.store?.when(productId);
    if (productHandler) {
      productHandler
        .approved(async (product: any) => {
          await this.handleVerifiedPurchase(product);
          product.finish();
        })
        .verified((product: any) => {
          this.handleVerifiedPurchase(product);
        });
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
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

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
    } catch (error) {
      console.error('Error updating backend credits:', error);
      throw error;
    }
  }

  private async updateBackendSubscription(type: 'monthly' | 'annual'): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      const now = new Date();
      const expiryDate = new Date(now);
      if (type === 'monthly') {
        expiryDate.setMonth(expiryDate.getMonth() + 1);
      } else {
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
      }

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
    } catch (error) {
      console.error('Error updating backend subscription:', error);
      throw error;
    }
  }
}

export const appleIAP = AppleIAPService.getInstance();
