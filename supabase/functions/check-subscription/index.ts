import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    logStep("Authenticating user with token");
    
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // First check if user has an active Apple IAP subscription
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("subscription_type, subscription_status, subscription_expires_at")
      .eq("id", user.id)
      .single();

    // If user has an active Apple IAP subscription, return that instead of checking Stripe
    if (profile && profile.subscription_status === 'active' && profile.subscription_expires_at) {
      const expiresAt = new Date(profile.subscription_expires_at);
      if (expiresAt > new Date()) {
        logStep("User has active Apple IAP subscription", {
          subscriptionType: profile.subscription_type,
          expiresAt: profile.subscription_expires_at
        });
        return new Response(JSON.stringify({
          subscribed: true,
          subscription_type: profile.subscription_type,
          subscription_status: 'active',
          subscription_expires_at: profile.subscription_expires_at
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length === 0) {
      logStep("No Stripe customer found and no active Apple IAP subscription");
      // Only update if there's no active Apple subscription
      if (profile?.subscription_status !== 'active') {
        await supabaseClient.from("profiles").update({
          stripe_customer_id: null,
          subscription_status: 'inactive',
          subscription_type: 'none',
          subscription_expires_at: null,
          updated_at: new Date().toISOString(),
        }).eq('id', user.id);
      }

      return new Response(JSON.stringify({
        subscribed: false,
        subscription_type: 'none',
        subscription_status: 'inactive'
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });
    const hasActiveSub = subscriptions.data.length > 0;
    let subscriptionType = 'none';
    let subscriptionEnd = null;

    if (hasActiveSub) {
      const subscription = subscriptions.data[0];
      subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
      logStep("Active subscription found", { subscriptionId: subscription.id, endDate: subscriptionEnd });
      
      const priceId = subscription.items.data[0].price.id;
      logStep("Price ID found", { priceId });
      
      // Determine subscription type from price ID
      if (priceId === "price_1SDX5iRdA5Qg3GBA9Ho0SuS9") {
        subscriptionType = "monthly";
      } else if (priceId === "price_1SDX6iRdA5Qg3GBARzuWkZ3z") {
        subscriptionType = "yearly";
      }
      
      logStep("Determined subscription type", { priceId, subscriptionType });
    } else {
      logStep("No active subscription found");
    }

    await supabaseClient.from("profiles").update({
      stripe_customer_id: customerId,
      subscription_status: hasActiveSub ? 'active' : 'inactive',
      subscription_type: subscriptionType,
      subscription_expires_at: subscriptionEnd,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);

    logStep("Updated database with subscription info", { 
      subscribed: hasActiveSub, 
      subscriptionType,
      subscriptionStatus: hasActiveSub ? 'active' : 'inactive'
    });
    
    return new Response(JSON.stringify({
      subscribed: hasActiveSub,
      subscription_type: subscriptionType,
      subscription_status: hasActiveSub ? 'active' : 'inactive',
      subscription_expires_at: subscriptionEnd
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in check-subscription", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});