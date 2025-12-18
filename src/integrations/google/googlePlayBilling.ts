import { shouldUseGooglePayments } from '../../utils/platformUtils';
import { supabase } from '../supabase/client';

// TypeScript declarations for cordova-plugin-purchase (Google Play)
declare global {
  interface Window {
    store?: {
      CONSUMABLE: string;
      PAID_SUBSCRIPTION: string;
      GOOGLE_PLAY: string;
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
      initialize: () => void;
    };
    CdvPurchase?: any;
  }
}

// Google Play Product IDs (matching iOS structure with different prefix)
export const GOOGLE_PLAY_PRODUCT_IDS = {
  SINGLE_CREDIT: 'com.tossortaste.app.single_credit',
  CREDIT_PACK: 'com.tossortaste.app.credit_pack',
  PREMIUM_MONTHLY: 'com.tossortaste.app.premium_monthly',
  PREMIUM_ANNUAL: 'com.tossortaste.app.premium_annual',
} as const;

export class GooglePlayBillingService {
  private static instance: GooglePlayBillingService;
  private isInitialized = false;
  private purchaseCompleteCallbacks: Array<(productId: string) => void> = [];

  static getInstance(): GooglePlayBillingService {
    if (!GooglePlayBillingService.instance) {
      GooglePlayBillingService.instance = new GooglePlayBillingService();
    }
    return GooglePlayBillingService.instance;
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
          console.warn('Google Play Billing: CdvPurchase timeout - proceeding anyway');
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
      console.error('Google Play Billing: Error initializing CdvPurchase:', error);
    }
  }

  async initialize(userId: string): Promise<void> {
    if (!shouldUseGooglePayments()) {
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

      // Register all products for Google Play
      window.store.register({
        id: GOOGLE_PLAY_PRODUCT_IDS.SINGLE_CREDIT,
        type: window.store.CONSUMABLE,
        platform: window.store.GOOGLE_PLAY,
      });

      window.store.register({
        id: GOOGLE_PLAY_PRODUCT_IDS.CREDIT_PACK,
        type: window.store.CONSUMABLE,
        platform: window.store.GOOGLE_PLAY,
      });

      window.store.register({
        id: GOOGLE_PLAY_PRODUCT_IDS.PREMIUM_MONTHLY,
        type: window.store.PAID_SUBSCRIPTION,
        platform: window.store.GOOGLE_PLAY,
      });

      window.store.register({
        id: GOOGLE_PLAY_PRODUCT_IDS.PREMIUM_ANNUAL,
        type: window.store.PAID_SUBSCRIPTION,
        platform: window.store.GOOGLE_PLAY,
      });

      // Set up global error handler
      window.store.error((error: any) => {
        console.error('Google Play Billing error:', error);
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
      console.error('Failed to initialize Google Play Billing:', error);
      throw error;
    }
  }

  private setupPurchaseHandlers(): void {
    if (!window.store) {
      return;
    }

    Object.values(GOOGLE_PLAY_PRODUCT_IDS).forEach((productId) => {
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
      if (productId === GOOGLE_PLAY_PRODUCT_IDS.SINGLE_CREDIT) {
        await this.updateBackendCredits(1, product);
      } else if (productId === GOOGLE_PLAY_PRODUCT_IDS.CREDIT_PACK) {
        await this.updateBackendCredits(5, product);
      } else if (productId === GOOGLE_PLAY_PRODUCT_IDS.PREMIUM_MONTHLY) {
        await this.updateBackendSubscription('monthly', product);
      } else if (productId === GOOGLE_PLAY_PRODUCT_IDS.PREMIUM_ANNUAL) {
        await this.updateBackendSubscription('annual', product);
      }

      this.notifyPurchaseComplete(productId);
    } catch (error) {
      console.error('Failed to update backend after purchase:', error);
    }
  }

  async purchaseCredits(creditAmount: 1 | 5): Promise<boolean> {
    if (!shouldUseGooglePayments() || !this.isInitialized || !window.store) {
      return false;
    }

    try {
      const productId = creditAmount === 1
        ? GOOGLE_PLAY_PRODUCT_IDS.SINGLE_CREDIT
        : GOOGLE_PLAY_PRODUCT_IDS.CREDIT_PACK;
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
    if (!shouldUseGooglePayments() || !this.isInitialized || !window.store) {
      return false;
    }

    try {
      const productId = type === 'monthly'
        ? GOOGLE_PLAY_PRODUCT_IDS.PREMIUM_MONTHLY
        : GOOGLE_PLAY_PRODUCT_IDS.PREMIUM_ANNUAL;
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
    if (!shouldUseGooglePayments() || !this.isInitialized || !window.store) {
      return null;
    }

    return window.store.get(productId);
  }

  private async updateBackendCredits(creditAmount: number, product?: any): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      // Extract purchase token from the Google Play product object
      if (!product || !product.transaction) {
        console.error('No product or transaction data available');
        throw new Error('Missing transaction data for purchase validation');
      }

      // Google Play uses purchase tokens instead of receipts
      const purchaseToken = product.transaction.purchaseToken || product.transaction.token;
      const orderId = product.transaction.orderId || product.transaction.id;

      if (!purchaseToken || !orderId) {
        console.error('Missing purchase token or order ID', { product });
        throw new Error('Missing purchase data for validation');
      }

      // Determine product ID
      const productId = creditAmount === 1
        ? GOOGLE_PLAY_PRODUCT_IDS.SINGLE_CREDIT
        : GOOGLE_PLAY_PRODUCT_IDS.CREDIT_PACK;

      console.log('Validating credit purchase with backend', {
        productId,
        orderId,
        hasPurchaseToken: !!purchaseToken
      });

      // Call the Google Play validation edge function
      const { data, error } = await supabase.functions.invoke('google-iap-process-credits', {
        body: {
          purchaseToken,
          productId,
          orderId
        }
      });

      if (error) {
        console.error('Purchase validation failed:', error);
        throw new Error(`Purchase validation failed: ${error.message}`);
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to validate purchase');
      }

      console.log('Credits purchase validated successfully', data);
    } catch (error) {
      console.error('Error updating backend credits:', error);
      throw error;
    }
  }

  private async updateBackendSubscription(type: 'monthly' | 'annual', product?: any): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      if (!product || !product.transaction) {
        console.error('No product or transaction data available');
        throw new Error('Missing transaction data for purchase validation');
      }

      // Google Play uses purchase tokens instead of receipts
      const purchaseToken = product.transaction.purchaseToken || product.transaction.token;
      const orderId = product.transaction.orderId || product.transaction.id;

      if (!purchaseToken || !orderId) {
        console.error('Missing purchase token or order ID', { product });
        throw new Error('Missing purchase data for validation');
      }

      const productId = type === 'monthly'
        ? GOOGLE_PLAY_PRODUCT_IDS.PREMIUM_MONTHLY
        : GOOGLE_PLAY_PRODUCT_IDS.PREMIUM_ANNUAL;

      console.log('Validating subscription purchase with backend', {
        productId,
        orderId,
        hasPurchaseToken: !!purchaseToken
      });

      const { data, error } = await supabase.functions.invoke('google-iap-process-subscription', {
        body: {
          purchaseToken,
          productId,
          orderId
        }
      });

      if (error) {
        console.error('Purchase validation failed:', error);
        throw new Error(`Purchase validation failed: ${error.message}`);
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to validate purchase');
      }

      console.log('Subscription purchase validated successfully', data);
    } catch (error) {
      console.error('Error updating backend subscription:', error);
      throw error;
    }
  }
}

export const googlePlayBilling = GooglePlayBillingService.getInstance();
