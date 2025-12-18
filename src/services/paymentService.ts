import { shouldUseApplePayments, shouldUseGooglePayments, shouldUseStripe } from '@/utils/platformUtils';
import { appleIAP } from '@/integrations/apple/appleIAP';
import { googlePlayBilling } from '@/integrations/google/googlePlayBilling';

export interface PaymentService {
  initializePayments(userId: string): Promise<void>;
  purchaseSubscription(type: 'monthly' | 'yearly', priceId?: string): Promise<boolean>;
  purchaseCredits(amount: 1 | 5, priceId?: string): Promise<boolean>;
  manageSubscription?(): Promise<void>;
}

class ApplePaymentService implements PaymentService {
  async initializePayments(userId: string): Promise<void> {
    await appleIAP.initialize(userId);
  }

  async purchaseSubscription(type: 'monthly' | 'yearly'): Promise<boolean> {
    const subscriptionType = type === 'monthly' ? 'monthly' : 'annual';
    return await appleIAP.purchaseSubscription(subscriptionType);
  }

  async purchaseCredits(amount: 1 | 5): Promise<boolean> {
    return await appleIAP.purchaseCredits(amount);
  }
}

class GooglePlayPaymentService implements PaymentService {
  async initializePayments(userId: string): Promise<void> {
    await googlePlayBilling.initialize(userId);
  }

  async purchaseSubscription(type: 'monthly' | 'yearly'): Promise<boolean> {
    const subscriptionType = type === 'monthly' ? 'monthly' : 'annual';
    return await googlePlayBilling.purchaseSubscription(subscriptionType);
  }

  async purchaseCredits(amount: 1 | 5): Promise<boolean> {
    return await googlePlayBilling.purchaseCredits(amount);
  }
}

class StripePaymentService implements PaymentService {
  private async getSupabase() {
    // Dynamically import supabase only when needed (not in iOS builds)
    const { supabase } = await import('@/integrations/supabase/client');
    return supabase;
  }

  async initializePayments(): Promise<void> {
    // No initialization needed for Stripe
  }

  async purchaseSubscription(type: 'monthly' | 'yearly', priceId: string): Promise<boolean> {
    try {
      const supabase = await this.getSupabase();
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { priceId, type }
      });

      if (error) {
        console.error('❌ Checkout error:', error);
        return false;
      } else if (data?.url) {
        setTimeout(() => {
          window.location.href = data.url;
        }, 100);
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Exception during subscription:', error);
      return false;
    }
  }

  async purchaseCredits(amount: 1 | 5, priceId: string): Promise<boolean> {
    try {
      const supabase = await this.getSupabase();
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { priceId, type: 'credits' }
      });

      if (error) {
        console.error('❌ Credits checkout error:', error);
        return false;
      } else if (data?.url) {
        setTimeout(() => {
          window.location.href = data.url;
        }, 100);
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Exception during credits purchase:', error);
      return false;
    }
  }

  async manageSubscription(): Promise<void> {
    try {
      const supabase = await this.getSupabase();
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) {
        throw new Error('Failed to access customer portal');
      } else if (data?.url) {
        setTimeout(() => {
          window.location.href = data.url;
        }, 100);
      }
    } catch (error) {
      console.error('Error:', error);
      throw error;
    }
  }
}

// Platform-specific payment service factory
export const getPaymentService = (): PaymentService => {
  if (shouldUseApplePayments()) {
    return new ApplePaymentService();
  } else if (shouldUseGooglePayments()) {
    return new GooglePlayPaymentService();
  } else if (shouldUseStripe()) {
    return new StripePaymentService();
  } else {
    throw new Error('No payment service available for this platform');
  }
};

export const paymentService = getPaymentService();