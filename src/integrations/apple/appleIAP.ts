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
        if (window.CdvPurchase && window.CdvPurchase.store) {
          console.log('Apple IAP: CdvPurchase found');
          resolve();
          return;
        }

        if (attempts >= maxAttempts) {
          console.error('Apple IAP: CdvPurchase timeout - plugin not available');
          resolve();
        } else {
          setTimeout(checkCdvPurchase, 100);
        }
      };

      // Start checking immediately
      checkCdvPurchase();
    });
  }

  async initialize(_userId: string): Promise<void> {
    if (!shouldUseApplePayments()) {
      return;
    }

    if (this.isInitialized) {
      return;
    }

    try {
      // Wait for CdvPurchase to be available
      await this.waitForCdvPurchase();

      if (!window.CdvPurchase || !window.CdvPurchase.store) {
        throw new Error('CdvPurchase plugin not available');
      }

      const { store, ProductType, Platform } = window.CdvPurchase;

      console.log('Apple IAP: Registering products');

      // Register all products using v13 API
      store.register([
        {
          id: APPLE_PRODUCT_IDS.SINGLE_CREDIT,
          type: ProductType.CONSUMABLE,
          platform: Platform.APPLE_APPSTORE,
        },
        {
          id: APPLE_PRODUCT_IDS.CREDIT_PACK,
          type: ProductType.CONSUMABLE,
          platform: Platform.APPLE_APPSTORE,
        },
        {
          id: APPLE_PRODUCT_IDS.PREMIUM_MONTHLY,
          type: ProductType.PAID_SUBSCRIPTION,
          platform: Platform.APPLE_APPSTORE,
        },
        {
          id: APPLE_PRODUCT_IDS.PREMIUM_ANNUAL,
          type: ProductType.PAID_SUBSCRIPTION,
          platform: Platform.APPLE_APPSTORE,
        },
      ]);

      console.log('Apple IAP: Setting up event handlers');

      // Set up purchase handlers using v13 API
      try {
        // Set up global transaction handlers
        store.when().approved((transaction: any) => {
          console.log('Apple IAP: Transaction approved', transaction);
          return transaction.verify();
        });

        store.when().verified((receipt: any) => {
          console.log('Apple IAP: Receipt verified', receipt);
          this.handleVerifiedPurchase(receipt).then(() => {
            receipt.finish();
          }).catch((error: any) => {
            console.error('Apple IAP: Error handling verified purchase:', error);
            receipt.finish(); // Still finish even if backend fails
          });
        });

        store.when().finished((transaction: any) => {
          console.log('Apple IAP: Transaction finished', transaction);
        });

        store.error((error: any) => {
          console.error('Apple IAP: Store error', error);
        });

        console.log('Apple IAP: Event handlers set up successfully');
      } catch (e) {
        console.error('Apple IAP: Failed to set up event handlers:', e, JSON.stringify(e));
        throw e;
      }

      console.log('Apple IAP: Initializing store with platform:', Platform.APPLE_APPSTORE);

      // Initialize the store with platform configuration
      try {
        // Start initialization (this returns immediately, doesn't wait for products)
        store.initialize([Platform.APPLE_APPSTORE]);
        console.log('Apple IAP: Store initialize() called');

        // Wait for products to be loaded
        await new Promise<void>((resolve) => {
          let attempts = 0;
          const maxAttempts = 50; // 50 attempts * 200ms = 10 seconds

          const checkProducts = () => {
            attempts++;

            // Check if all products are loaded
            const allProductsLoaded = Object.values(APPLE_PRODUCT_IDS).every(id => {
              const product = store.get(id);
              return product !== null && product !== undefined;
            });

            if (allProductsLoaded) {
              console.log('Apple IAP: All products loaded from App Store');
              resolve();
              return;
            }

            if (attempts >= maxAttempts) {
              console.warn('Apple IAP: Timeout waiting for products, proceeding anyway');

              // Safely log registered products
              if (store.registeredProducts && Array.isArray(store.registeredProducts)) {
                console.log('Apple IAP: Registered products:', store.registeredProducts.map((p: any) => ({ id: p.id, state: p.state })));
              } else {
                console.log('Apple IAP: Registered products:', store.registeredProducts);
              }

              // Safely log available products
              if (store.products && Array.isArray(store.products)) {
                console.log('Apple IAP: Available products:', store.products.map((p: any) => ({ id: p.id, valid: p.valid, canPurchase: p.canPurchase })));
              } else {
                console.log('Apple IAP: Available products:', store.products);
              }

              // Log individual product status
              Object.values(APPLE_PRODUCT_IDS).forEach(id => {
                const product = store.get(id);
                console.log(`Product ${id}:`, product ? { valid: product.valid, state: product.state, canPurchase: product.canPurchase } : 'NOT FOUND');
              });

              resolve();
            } else {
              setTimeout(checkProducts, 200);
            }
          };

          checkProducts();
        });

        console.log('Apple IAP: Store initialized successfully');
      } catch (e) {
        console.error('Apple IAP: Failed to initialize store:', e);
        throw e;
      }

      this.isInitialized = true;
      console.log('Apple IAP: Initialization complete');
    } catch (error) {
      console.error('Failed to initialize Apple IAP:', error);
      throw error;
    }
  }

  private async handleVerifiedPurchase(receipt: any): Promise<void> {
    // In v13 API, the receipt contains products array
    const products = receipt.products || [];

    if (products.length === 0) {
      console.warn('Apple IAP: No products in receipt');
      return;
    }

    // Process the first product in the receipt
    const product = products[0];
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
    if (!shouldUseApplePayments() || !this.isInitialized) {
      console.error('Apple IAP not available or not initialized');
      return false;
    }

    if (!window.CdvPurchase || !window.CdvPurchase.store) {
      console.error('CdvPurchase not available');
      return false;
    }

    try {
      const { store } = window.CdvPurchase;
      const productId = creditAmount === 1 ? APPLE_PRODUCT_IDS.SINGLE_CREDIT : APPLE_PRODUCT_IDS.CREDIT_PACK;
      const product = store.get(productId);

      if (!product) {
        console.error('Product not found:', productId);
        throw new Error('Product not found');
      }

      console.log('Initiating purchase for product:', productId, product);

      // Order initiates the purchase flow - this will show the Apple purchase dialog
      const offer = store.get(productId)?.getOffer();
      if (offer) {
        offer.order();
        return true;
      } else {
        throw new Error('No offer available for product');
      }
    } catch (error) {
      console.error('Failed to initiate credit purchase:', error);
      return false;
    }
  }

  async purchaseSubscription(type: 'monthly' | 'annual'): Promise<boolean> {
    if (!shouldUseApplePayments() || !this.isInitialized) {
      console.error('Apple IAP not available or not initialized');
      return false;
    }

    if (!window.CdvPurchase || !window.CdvPurchase.store) {
      console.error('CdvPurchase not available');
      return false;
    }

    try {
      const { store } = window.CdvPurchase;
      const productId = type === 'monthly' ? APPLE_PRODUCT_IDS.PREMIUM_MONTHLY : APPLE_PRODUCT_IDS.PREMIUM_ANNUAL;
      const product = store.get(productId);

      if (!product) {
        console.error('Subscription product not found:', productId);
        throw new Error('Subscription product not found');
      }

      console.log('Initiating subscription purchase for product:', productId, product);

      // Order initiates the purchase flow - this will show the Apple purchase dialog
      const offer = store.get(productId)?.getOffer();
      if (offer) {
        offer.order();
        return true;
      } else {
        throw new Error('No offer available for subscription');
      }
    } catch (error) {
      console.error('Failed to initiate subscription purchase:', error);
      return false;
    }
  }

  async getProductInfo(productId: string): Promise<any> {
    if (!shouldUseApplePayments() || !this.isInitialized) {
      return null;
    }

    if (!window.CdvPurchase || !window.CdvPurchase.store) {
      return null;
    }

    return window.CdvPurchase.store.get(productId);
  }

  private async updateBackendCredits(creditAmount: number, receipt?: any): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      // In v13 API, receipt contains transaction and nativePurchase
      if (!receipt || !receipt.nativePurchase) {
        console.error('No receipt or native purchase data available', receipt);
        throw new Error('Missing receipt data for validation');
      }

      // Extract transaction ID and receipt data from v13 structure
      const transactionId = receipt.nativePurchase.transactionId || receipt.nativePurchase.transactionIdentifier;
      const receiptData = receipt.nativePurchase.appStoreReceipt || receipt.nativePurchase.receipt;

      if (!receiptData || !transactionId) {
        console.error('Missing receipt or transaction ID', { receipt });
        throw new Error('Missing receipt data for validation');
      }

      // Determine product ID from receipt products
      const products = receipt.products || [];
      const productId = products.length > 0 ? products[0].id : (
        creditAmount === 1 ? APPLE_PRODUCT_IDS.SINGLE_CREDIT : APPLE_PRODUCT_IDS.CREDIT_PACK
      );

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

  private async updateBackendSubscription(type: 'monthly' | 'annual', receipt?: any): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      // In v13 API, receipt contains transaction and nativePurchase
      if (!receipt || !receipt.nativePurchase) {
        console.error('No receipt or native purchase data available', receipt);
        throw new Error('Missing receipt data for validation');
      }

      // Extract transaction ID and receipt data from v13 structure
      const transactionId = receipt.nativePurchase.transactionId || receipt.nativePurchase.transactionIdentifier;
      const receiptData = receipt.nativePurchase.appStoreReceipt || receipt.nativePurchase.receipt;

      if (!receiptData || !transactionId) {
        console.error('Missing receipt or transaction ID', { receipt });
        throw new Error('Missing receipt data for validation');
      }

      // Determine product ID from receipt products
      const products = receipt.products || [];
      const productId = products.length > 0 ? products[0].id : (
        type === 'monthly' ? APPLE_PRODUCT_IDS.PREMIUM_MONTHLY : APPLE_PRODUCT_IDS.PREMIUM_ANNUAL
      );

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
