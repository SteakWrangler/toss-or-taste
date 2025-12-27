import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[APPLE-IAP-PROCESS-CREDITS] ${step}${detailsStr}`);
};

const PRODUCTION_URL = "https://buy.itunes.apple.com/verifyReceipt";
const SANDBOX_URL = "https://sandbox.itunes.apple.com/verifyReceipt";

interface AppleReceiptResponse {
  status: number;
  receipt?: any;
  latest_receipt_info?: any[];
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
    logStep("Apple IAP credits processing started");

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

    logStep("Processing Apple IAP credits", { userId: user.id, productId, transactionId });

    const { data: existingTransaction } = await supabaseClient
      .from("apple_iap_transactions")
      .select("id, validation_status")
      .eq("transaction_id", transactionId)
      .single();

    if (existingTransaction) {
      logStep("Transaction already processed", { transactionId });
      if (existingTransaction.validation_status === 'valid') {
        const { data: profile } = await supabaseClient
          .from("profiles")
          .select("room_credits")
          .eq("id", user.id)
          .single();
        return new Response(JSON.stringify({
          success: true,
          message: "Transaction already processed",
          newTotal: profile?.room_credits || 0
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
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
        product_type: 'consumable',
        purchase_date: new Date().toISOString(),
        receipt_data: receiptData,
        environment: validationResult.environment,
        validation_status: 'invalid',
        processed: false
      });
      throw new Error(`Apple receipt validation failed with status: ${validationResult.status}`);
    }

    const receipt = validationResult.receipt;

    // For sandbox receipts, transactions can be in receipt.in_app
    // Try to find the transaction in receipt.in_app
    const inAppPurchases = receipt.in_app || [];
    let purchase = inAppPurchases.find((p: any) => p.transaction_id === transactionId);

    // If not found, try latest_receipt_info (sometimes used for subscriptions/renewals)
    if (!purchase && validationResult.latest_receipt_info) {
      purchase = validationResult.latest_receipt_info.find((p: any) => p.transaction_id === transactionId);
    }

    // Log receipt structure for debugging if transaction not found
    if (!purchase) {
      logStep("Transaction not found - receipt structure", {
        transactionId,
        hasInApp: !!receipt.in_app,
        inAppCount: inAppPurchases.length,
        inAppTransactionIds: inAppPurchases.map((p: any) => p.transaction_id),
        hasLatestReceiptInfo: !!validationResult.latest_receipt_info,
        latestReceiptInfoCount: validationResult.latest_receipt_info?.length || 0,
        latestReceiptInfoIds: validationResult.latest_receipt_info?.map((p: any) => p.transaction_id) || []
      });
      throw new Error("Transaction not found in receipt");
    }
    if (purchase.product_id !== productId) {
      throw new Error(`Product ID mismatch: expected ${productId}, got ${purchase.product_id}`);
    }

    let creditAmount = 0;
    if (productId.includes('single_credit')) {
      creditAmount = 1;
    } else if (productId.includes('credit_pack')) {
      creditAmount = 5;
    } else {
      throw new Error(`Unknown credit product: ${productId}`);
    }

    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("room_credits")
      .eq("id", user.id)
      .single();

    if (profileError) throw new Error(`Failed to get user profile: ${profileError.message}`);

    const currentCredits = profile?.room_credits || 0;
    const newCredits = currentCredits + creditAmount;

    const { error: updateError } = await supabaseClient
      .from("profiles")
      .update({
        room_credits: newCredits,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) throw new Error(`Failed to update credits: ${updateError.message}`);

    await supabaseClient.from("apple_iap_transactions").insert({
      user_id: user.id,
      transaction_id: transactionId,
      product_id: productId,
      product_type: 'consumable',
      purchase_date: purchase.purchase_date_ms
        ? new Date(parseInt(purchase.purchase_date_ms)).toISOString()
        : new Date().toISOString(),
      quantity: parseInt(purchase.quantity) || 1,
      receipt_data: receiptData,
      environment: validationResult.environment || 'Production',
      validation_status: 'valid',
      processed: true,
      processed_at: new Date().toISOString()
    });

    logStep("Apple IAP credits added successfully", {
      userId: user.id,
      previousCredits: currentCredits,
      creditsAdded: creditAmount,
      newTotal: newCredits,
      transactionId
    });

    return new Response(JSON.stringify({
      success: true,
      creditsAdded: creditAmount,
      newTotal: newCredits
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in apple-iap-process-credits", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
