import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Crown, CreditCard, Loader2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { shouldUseApplePayments, shouldUseStripe, getPlatformName } from '@/utils/platformUtils';
import { paymentService } from '@/services/paymentService';
import { appleIAP } from '@/integrations/apple/appleIAP';

interface SubscriptionInfo {
  subscribed: boolean;
  subscription_type: string;
  subscription_status: string;
  subscription_expires_at?: string;
}

interface SubscriptionManagerProps {
  onPurchaseComplete?: () => void;
}

const SubscriptionManager: React.FC<SubscriptionManagerProps> = ({ onPurchaseComplete }) => {
  const { user, profile, refreshProfile, setProfile } = useAuth();
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);
  const [loadingStates, setLoadingStates] = useState<{[key: string]: boolean}>({});
  const [refreshing, setRefreshing] = useState(true); // Start with true for initial load
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  const checkSubscription = useCallback(async () => {
    if (!user) return;

    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-subscription');

      if (error) {
        console.error('Error checking subscription:', error);
        toast.error('Failed to check subscription status');
      } else {
        setSubscriptionInfo(data);
      }
    } catch (error) {
      console.error('Exception during subscription check:', error);
      toast.error('Failed to check subscription status');
    } finally {
      setRefreshing(false);
      setInitialLoadComplete(true);
    }
  }, [user]);


  useEffect(() => {
    if (user) {
      checkSubscription();

      paymentService.initializePayments(user.id).catch((error) => {
        console.error('Payment service initialization failed:', error);
      });

      if (shouldUseApplePayments()) {
        const handlePurchaseComplete = async (event: any) => {
          await refreshProfile(user.id);
        };

        window.addEventListener('iap-purchase-complete', handlePurchaseComplete);

        appleIAP.onPurchaseComplete(async (productId: string) => {
          await refreshProfile(user.id);
        });

        return () => {
          window.removeEventListener('iap-purchase-complete', handlePurchaseComplete);
        };
      }
    }
  }, [user, checkSubscription, refreshProfile]);

  const handleSubscribe = async (priceId: string, type: string) => {
    if (!user) {
      toast.error('Please log in to subscribe');
      return;
    }

    const buttonKey = `subscribe-${type}`;
    setLoadingStates(prev => ({ ...prev, [buttonKey]: true }));

    try {
      const success = await paymentService.purchaseSubscription(
        type === 'monthly' ? 'monthly' : 'yearly',
        priceId
      );

      if (success) {
        if (shouldUseApplePayments()) {
          toast.success('Subscription activated successfully!');
          onPurchaseComplete?.();
        }
      } else {
        toast.error('Failed to complete subscription purchase');
      }
    } catch (error) {
      console.error('Exception during subscription:', error);
      toast.error('Failed to start subscription');
    } finally {
      if (shouldUseApplePayments()) {
        setLoadingStates(prev => ({ ...prev, [buttonKey]: false }));
      }
    }
  };

  const handleManageSubscription = async () => {
    if (!user) return;

    // Only show manage subscription for Stripe users (web/Android)
    if (!shouldUseStripe()) {
      toast.error('Subscription management not available on this platform');
      return;
    }

    const buttonKey = 'manage-subscription';
    setLoadingStates(prev => ({ ...prev, [buttonKey]: true }));
    
    try {
      await paymentService.manageSubscription?.();
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to access customer portal');
    } finally {
      setLoadingStates(prev => ({ ...prev, [buttonKey]: false }));
    }
  };

  const buyCredits = async (priceId: string, credits: number) => {
    if (!user) {
      toast.error('Please log in to purchase credits');
      return;
    }

    const buttonKey = `credits-${credits}`;
    setLoadingStates(prev => ({ ...prev, [buttonKey]: true }));

    try {
      const creditAmount = credits as 1 | 5;
      const success = await paymentService.purchaseCredits(creditAmount, priceId);

      if (success) {
        if (shouldUseApplePayments()) {
          // Optimistically update the profile credits in the UI
          if (profile) {
            const currentCredits = profile.room_credits || 0;
            const newCredits = currentCredits + credits;

            setProfile({
              ...profile,
              room_credits: newCredits
            });
          }

          toast.success(`Successfully purchased ${credits} credits!`);
          onPurchaseComplete?.();
        }
      } else {
        toast.error('Failed to complete credit purchase');
      }
    } catch (error) {
      console.error('Exception during credits purchase:', error);
      toast.error('Failed to purchase credits');
    } finally {
      if (shouldUseApplePayments()) {
        setLoadingStates(prev => ({ ...prev, [buttonKey]: false }));
      }
    }
  };

  if (!user) {
    return null;
  }

  // Show loading state while initial load is happening
  if (!initialLoadComplete && refreshing) {
    return (
      <div className="w-full max-w-4xl mx-auto space-y-6">
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading subscription details...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isSubscribed = subscriptionInfo?.subscribed || false;
  const subscriptionType = subscriptionInfo?.subscription_type || 'none';

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Subscription Status */}
      <Card className="border-primary">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-primary" />
            <CardTitle>Subscription Status</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <Badge variant={isSubscribed ? "default" : "secondary"}>
              {isSubscribed ? `${subscriptionType} Subscriber` : 'Free Plan'}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Room Credits: {profile?.room_credits || 0}
            </span>
          </div>
          
          {isSubscribed && (
            <div className="mb-4">
              <p className="text-sm text-green-600">
                ✓ Unlimited room creation
              </p>
              {subscriptionInfo?.subscription_expires_at && (
                <p className="text-sm text-muted-foreground">
                  Renews: {new Date(subscriptionInfo.subscription_expires_at).toLocaleDateString()}
                </p>
              )}
            </div>
          )}

          {isSubscribed && shouldUseStripe() && (
            <Button onClick={handleManageSubscription} disabled={loadingStates['manage-subscription']}>
              {loadingStates['manage-subscription'] ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Manage Subscription
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Subscription Plans */}
      {!isSubscribed && (
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="border-primary">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Monthly Plan</CardTitle>
                  <CardDescription>Perfect for regular users</CardDescription>
                </div>
                <div className="w-16"></div> {/* Placeholder for badge alignment */}
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold mb-2">$5.00<span className="text-lg font-normal">/month</span></div>
              <div className="text-sm mb-4 invisible">Placeholder for alignment</div>
              <ul className="space-y-2 mb-4">
                <li className="text-sm">✓ Unlimited room creation</li>
                <li className="text-sm">✓ Advanced filtering</li>
                <li className="text-sm invisible">Placeholder for alignment</li>
              </ul>
              <Button 
                className="w-full" 
                onClick={() => handleSubscribe('price_1SDX5iRdA5Qg3GBA9Ho0SuS9', 'monthly')}
                disabled={loadingStates['subscribe-monthly']}
              >
                {loadingStates['subscribe-monthly'] ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Subscribe Monthly
              </Button>
            </CardContent>
          </Card>

          <Card className="border-primary">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Yearly Plan</CardTitle>
                  <CardDescription>Best value - save $10!</CardDescription>
                </div>
                <Badge>Popular</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold mb-2">$50.00<span className="text-lg font-normal">/year</span></div>
              <p className="text-sm text-green-600 mb-4">Save $10 compared to monthly</p>
              <ul className="space-y-2 mb-4">
                <li className="text-sm">✓ Unlimited room creation</li>
                <li className="text-sm">✓ Advanced filtering</li>
                <li className="text-sm">✓ 2 months free</li>
              </ul>
              <Button 
                className="w-full" 
                onClick={() => handleSubscribe('price_1SDX6iRdA5Qg3GBARzuWkZ3z', 'yearly')}
                disabled={loadingStates['subscribe-yearly']}
              >
                {loadingStates['subscribe-yearly'] ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Subscribe Yearly
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Credit Purchase */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <CardTitle>Room Credits</CardTitle>
          </div>
          <CardDescription>
            Want to make a one-time room or want to use without subscribing?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-4">
            <Card className="p-4 border-primary">
              <div className="text-center">
                <div className="text-2xl font-bold mb-2">1 Credit</div>
                <div className="text-lg mb-1">$1.00</div>
                <div className="text-sm mb-1 invisible">Placeholder for alignment</div>
                <div className="text-sm text-muted-foreground mb-2">Create one room with real restaurant data</div>
                <Button 
                  className="w-full"
                  onClick={() => buyCredits('price_1SDX7uRdA5Qg3GBAL4zTzdR1', 1)}
                  disabled={loadingStates['credits-1']}
                >
                  {loadingStates['credits-1'] ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Buy 1 Credit
                </Button>
              </div>
            </Card>

            <Card className="p-4 border-primary">
              <div className="text-center">
                <div className="text-2xl font-bold mb-2">5 Credits</div>
                <div className="text-lg mb-1">$4.00</div>
                <div className="text-sm text-green-600 mb-1">Save $1.00!</div>
                <div className="text-sm text-muted-foreground mb-2">Create five rooms with real restaurant data</div>
                <Button 
                  className="w-full"
                  onClick={() => buyCredits('price_1SDX7uRdA5Qg3GBA5VBiI2aE', 5)}
                  disabled={loadingStates['credits-5']}
                >
                  {loadingStates['credits-5'] ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Buy 5 Credits
                </Button>
              </div>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SubscriptionManager;