import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[APPLE-IAP-PROCESS-SUBSCRIPTION] ${step}${detailsStr}`);
};

const PRODUCTION_URL = "https://buy.itunes.apple.com/verifyReceipt";
const SANDBOX_URL = "https://sandbox.itunes.apple.com/verifyReceipt";

interface AppleReceiptResponse {
  status: number;
  receipt?: any;
  latest_receipt_info?: any[];
  pending_renewal_info?: any[];
  environment?: string;
}

async function validateReceipt(receiptData: string, useSandbox = false): Promise<AppleReceiptResponse> {
  const url = useSandbox ? SANDBOX_URL : PRODUCTION_URL;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      'receipt-data': receiptData,
      'password': Deno.env.get("APPLE_SHARED_SECRET") || "",
      'exclude-old-transactions': true
    })
  });

  if (!response.ok) {
    throw new Error(`Apple validation request failed: ${response.statusText}`);
  }

  return await response.json();
}

async function validateWithApple(receiptData: string): Promise<AppleReceiptResponse> {
  logStep("Validating receipt with Apple (production first)");
  let result = await validateReceipt(receiptData, false);
  if (result.status === 21007) {
    logStep("Sandbox receipt detected, retrying with sandbox environment");
    result = await validateReceipt(receiptData, true);
  }
  return result;
}

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
    logStep("Apple IAP subscription processing started");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    const { receiptData, productId, transactionId } = await req.json();

    if (!receiptData) throw new Error("receiptData is required");
    if (!productId) throw new Error("productId is required");
    if (!transactionId) throw new Error("transactionId is required");

    logStep("Processing Apple IAP subscription", { userId: user.id, productId, transactionId });

    const { data: existingTransaction } = await supabaseClient
      .from("apple_iap_transactions")
      .select("id, validation_status, subscription_expires_at, product_id")
      .eq("transaction_id", transactionId)
      .single();

    if (existingTransaction) {
      logStep("Transaction already processed", { transactionId });
      if (existingTransaction.validation_status === 'valid') {
        const { data: profile } = await supabaseClient
          .from("profiles")
          .select("subscription_type, subscription_status, subscription_expires_at")
          .eq("id", user.id)
          .single();

        // Check if the subscription is actually active
        // If not, we need to re-activate it (zombie transaction fix)
        if (profile?.subscription_status === 'active' && profile?.subscription_expires_at) {
          logStep("Subscription already active", {
            subscriptionType: profile.subscription_type,
            expiresAt: profile.subscription_expires_at
          });
          return new Response(JSON.stringify({
            success: true,
            message: "Transaction already processed",
            subscription: profile
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        } else {
          // Transaction exists but subscription was never activated
          // We need to validate the receipt again to ensure we have current subscription data
          logStep("Transaction exists but subscription not active - validating current state", {
            transactionId,
            currentStatus: profile?.subscription_status,
            productId: existingTransaction.product_id
          });

          // Don't reuse old transaction - fall through to validate with Apple again
          // This ensures we get the current expiration date, not stale data
          logStep("Re-validating receipt with Apple to get current subscription state");
        }
      } else {
        throw new Error("Transaction was previously rejected");
      }
    }

    logStep("Validating receipt with Apple");
    const validationResult = await validateWithApple(receiptData);
    logStep("Apple validation result", { status: validationResult.status });

    if (validationResult.status !== 0) {
      await supabaseClient.from("apple_iap_transactions").insert({
        user_id: user.id,
        transaction_id: transactionId,
        product_id: productId,
        product_type: 'subscription',
        purchase_date: new Date().toISOString(),
        receipt_data: receiptData,
        environment: validationResult.environment,
        validation_status: 'invalid',
        processed: false
      });
      throw new Error(`Apple receipt validation failed with status: ${validationResult.status}`);
    }

    // For subscriptions, try latest_receipt_info first (most common location)
    const latestReceiptInfo = validationResult.latest_receipt_info || [];

    // For subscriptions, match by transaction_id OR original_transaction_id
    // This is important because renewals create new transaction IDs but keep the same original_transaction_id
    let purchase = latestReceiptInfo.find((p: any) =>
      p.transaction_id === transactionId ||
      p.original_transaction_id === transactionId ||
      p.transaction_id === p.original_transaction_id // Get the latest active subscription
    );

    // Fallback to receipt.in_app for sandbox or non-auto-renewable subscriptions
    if (!purchase && validationResult.receipt?.in_app) {
      const inAppPurchases = validationResult.receipt.in_app;
      purchase = inAppPurchases.find((p: any) =>
        p.transaction_id === transactionId ||
        p.original_transaction_id === transactionId
      );
    }

    // If still not found, just take the most recent subscription from latest_receipt_info
    // This handles cases where the transaction ID doesn't match due to renewals
    if (!purchase && latestReceiptInfo.length > 0) {
      // Get the most recent one (they should be sorted by date, but let's be sure)
      purchase = latestReceiptInfo[latestReceiptInfo.length - 1];
      logStep("Using most recent subscription from receipt", {
        foundTransactionId: purchase.transaction_id,
        requestedTransactionId: transactionId
      });
    }

    // Log receipt structure for debugging if transaction not found
    if (!purchase) {
      logStep("Transaction not found - receipt structure", {
        transactionId,
        hasLatestReceiptInfo: !!validationResult.latest_receipt_info,
        latestReceiptInfoCount: latestReceiptInfo.length,
        latestReceiptInfoIds: latestReceiptInfo.map((p: any) => ({
          transaction_id: p.transaction_id,
          original_transaction_id: p.original_transaction_id
        })),
        hasInApp: !!validationResult.receipt?.in_app,
        inAppCount: validationResult.receipt?.in_app?.length || 0,
        inAppTransactionIds: validationResult.receipt?.in_app?.map((p: any) => ({
          transaction_id: p.transaction_id,
          original_transaction_id: p.original_transaction_id
        })) || []
      });
      throw new Error("Transaction not found in receipt");
    }
    if (purchase.product_id !== productId) {
      throw new Error(`Product ID mismatch: expected ${productId}, got ${purchase.product_id}`);
    }

    const subscriptionType = productId.includes('monthly') ? 'monthly' : 'annual';
    const expiresDate = purchase.expires_date_ms
      ? new Date(parseInt(purchase.expires_date_ms))
      : null;
    const originalTransactionId = purchase.original_transaction_id || transactionId;
    const autoRenewStatus = validationResult.pending_renewal_info?.[0]?.auto_renew_status === "1";

    if (!expiresDate) throw new Error("No expiration date in receipt");

    const { error: updateError } = await supabaseClient
      .from("profiles")
      .update({
        subscription_type: subscriptionType,
        subscription_status: 'active',
        subscription_expires_at: expiresDate.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) throw new Error(`Failed to update subscription: ${updateError.message}`);

    // Use upsert to handle both new transactions and zombie transactions
    // This will insert if transaction doesn't exist, or update if it does
    await supabaseClient.from("apple_iap_transactions").upsert({
      user_id: user.id,
      transaction_id: transactionId,
      original_transaction_id: originalTransactionId,
      product_id: productId,
      product_type: 'subscription',
      purchase_date: purchase.purchase_date_ms
        ? new Date(parseInt(purchase.purchase_date_ms)).toISOString()
        : new Date().toISOString(),
      subscription_expires_at: expiresDate.toISOString(),
      subscription_auto_renew_status: autoRenewStatus,
      receipt_data: receiptData,
      environment: validationResult.environment || 'Production',
      validation_status: 'valid',
      processed: true,
      processed_at: new Date().toISOString()
    }, {
      onConflict: 'transaction_id'
    });

    logStep("Apple IAP subscription activated successfully", {
      userId: user.id,
      subscriptionType,
      expiresAt: expiresDate.toISOString(),
      transactionId
    });

    return new Response(JSON.stringify({
      success: true,
      subscriptionType,
      subscriptionStatus: 'active',
      expiresAt: expiresDate.toISOString()
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in apple-iap-process-subscription", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
