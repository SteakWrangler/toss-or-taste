import { shouldUseApplePayments } from '../../utils/platformUtils';
import { supabase } from '../supabase/client';

// TypeScript declarations for cordova-plugin-purchase v13
declare global {
  interface Window {
    CdvPurchase?: {
      store: any;
      ProductType: {
        CONSUMABLE: string;
        PAID_SUBSCRIPTION: string;
      };
      Platform: {
        APPLE_APPSTORE: string;
      };
    };
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

      // Refresh to trigger product loading
      window.store.refresh();
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
        await this.updateBackendCredits(1, product);
      } else if (productId === APPLE_PRODUCT_IDS.CREDIT_PACK) {
        await this.updateBackendCredits(5, product);
      } else if (productId === APPLE_PRODUCT_IDS.PREMIUM_MONTHLY) {
        await this.updateBackendSubscription('monthly', product);
      } else if (productId === APPLE_PRODUCT_IDS.PREMIUM_ANNUAL) {
        await this.updateBackendSubscription('annual', product);
      }

      this.notifyPurchaseComplete(productId);
    } catch (error) {
      console.error('Failed to update backend after purchase:', error);
    }
  }

  async purchaseCredits(creditAmount: 1 | 5): Promise<boolean> {
    if (!shouldUseApplePayments() || !this.isInitialized || !window.store) {
      console.error('Apple IAP not available or not initialized');
      return false;
    }

    try {
      const productId = creditAmount === 1 ? APPLE_PRODUCT_IDS.SINGLE_CREDIT : APPLE_PRODUCT_IDS.CREDIT_PACK;
      const product = window.store.get(productId);

      if (!product) {
        console.error('Product not found:', productId);
        throw new Error('Product not found');
      }

      if (!product.canPurchase) {
        console.error('Product cannot be purchased:', productId, product);
        throw new Error('Product cannot be purchased at this time');
      }

      console.log('Initiating purchase for product:', productId);

      // Order initiates the purchase flow - this will show the Apple purchase dialog
      window.store.order(productId);

      // Return true to indicate purchase was initiated (not completed)
      // The actual completion is handled by the purchase handlers
      return true;
    } catch (error) {
      console.error('Failed to initiate credit purchase:', error);
      return false;
    }
  }

  async purchaseSubscription(type: 'monthly' | 'annual'): Promise<boolean> {
    if (!shouldUseApplePayments() || !this.isInitialized || !window.store) {
      console.error('Apple IAP not available or not initialized');
      return false;
    }

    try {
      const productId = type === 'monthly' ? APPLE_PRODUCT_IDS.PREMIUM_MONTHLY : APPLE_PRODUCT_IDS.PREMIUM_ANNUAL;
      const product = window.store.get(productId);

      if (!product) {
        console.error('Subscription product not found:', productId);
        throw new Error('Subscription product not found');
      }

      if (!product.canPurchase) {
        console.error('Subscription cannot be purchased:', productId, product);
        throw new Error('Subscription cannot be purchased at this time');
      }

      console.log('Initiating subscription purchase for product:', productId);

      // Order initiates the purchase flow - this will show the Apple purchase dialog
      window.store.order(productId);

      // Return true to indicate purchase was initiated (not completed)
      // The actual completion is handled by the purchase handlers
      return true;
    } catch (error) {
      console.error('Failed to initiate subscription purchase:', error);
      return false;
    }
  }

  async getProductInfo(productId: string): Promise<any> {
    if (!shouldUseApplePayments() || !this.isInitialized || !window.store) {
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

      // Extract receipt data from the product object
      if (!product || !product.transaction) {
        console.error('No product or transaction data available');
        throw new Error('Missing transaction data for receipt validation');
      }

      const transactionId = product.transaction.transactionIdentifier || product.transaction.id;
      const receiptData = product.transaction.appStoreReceipt || product.transaction.receipt;

      if (!receiptData || !transactionId) {
        console.error('Missing receipt or transaction ID', { product });
        throw new Error('Missing receipt data for validation');
      }

      // Determine product ID
      const productId = creditAmount === 1
        ? APPLE_PRODUCT_IDS.SINGLE_CREDIT
        : APPLE_PRODUCT_IDS.CREDIT_PACK;

      console.log('Validating credit purchase with backend', {
        productId,
        transactionId,
        hasReceipt: !!receiptData
      });

      // Call the validation edge function
      const { data, error } = await supabase.functions.invoke('apple-iap-process-credits', {
        body: {
          receiptData,
          productId,
          transactionId
        }
      });

      if (error) {
        console.error('Receipt validation failed:', error);
        throw new Error(`Receipt validation failed: ${error.message}`);
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
        throw new Error('Missing transaction data for receipt validation');
      }

      const transactionId = product.transaction.transactionIdentifier || product.transaction.id;
      const receiptData = product.transaction.appStoreReceipt || product.transaction.receipt;

      if (!receiptData || !transactionId) {
        console.error('Missing receipt or transaction ID', { product });
        throw new Error('Missing receipt data for validation');
      }

      const productId = type === 'monthly'
        ? APPLE_PRODUCT_IDS.PREMIUM_MONTHLY
        : APPLE_PRODUCT_IDS.PREMIUM_ANNUAL;

      console.log('Validating subscription purchase with backend', {
        productId,
        transactionId,
        hasReceipt: !!receiptData
      });

      const { data, error } = await supabase.functions.invoke('apple-iap-process-subscription', {
        body: {
          receiptData,
          productId,
          transactionId
        }
      });

      if (error) {
        console.error('Receipt validation failed:', error);
        throw new Error(`Receipt validation failed: ${error.message}`);
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

export const appleIAP = AppleIAPService.getInstance();
