import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[APPLE-SERVER-NOTIFICATIONS] ${step}${detailsStr}`);
};

serve(async (req) => {
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Received Apple server notification");

    const payload = await req.json();
    logStep("Notification payload", { notificationType: payload.notification_type });

    const notificationType = payload.notification_type;
    const data = payload.data || payload.unified_receipt?.latest_receipt_info?.[0];

    if (!data) {
      logStep("No data in notification");
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    const originalTransactionId = data.original_transaction_id;
    const productId = data.product_id;
    const expiresDateMs = data.expires_date_ms;
    const transactionId = data.transaction_id;

    logStep("Processing notification", {
      notificationType,
      originalTransactionId,
      productId,
      transactionId
    });

    const { data: transaction } = await supabaseClient
      .from("apple_iap_transactions")
      .select("user_id")
      .eq("original_transaction_id", originalTransactionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!transaction) {
      logStep("No user found for transaction", { originalTransactionId });
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    const userId = transaction.user_id;

    switch (notificationType) {
      case "DID_RENEW":
      case "RENEWAL": {
        logStep("Processing renewal", { userId, productId });
        const expiresDate = new Date(parseInt(expiresDateMs));
        const subscriptionType = productId.includes('monthly') ? 'monthly' : 'annual';

        await supabaseClient.from("profiles").update({
          subscription_type: subscriptionType,
          subscription_status: 'active',
          subscription_expires_at: expiresDate.toISOString(),
          updated_at: new Date().toISOString()
        }).eq("id", userId);

        await supabaseClient.from("apple_iap_transactions").insert({
          user_id: userId,
          transaction_id: transactionId,
          original_transaction_id: originalTransactionId,
          product_id: productId,
          product_type: 'subscription',
          purchase_date: new Date().toISOString(),
          subscription_expires_at: expiresDate.toISOString(),
          subscription_auto_renew_status: true,
          environment: payload.environment || 'Production',
          validation_status: 'valid',
          processed: true,
          processed_at: new Date().toISOString()
        });

        logStep("Renewal processed successfully", { userId, expiresAt: expiresDate.toISOString() });
        break;
      }

      case "DID_CHANGE_RENEWAL_STATUS":
      case "CANCEL": {
        logStep("Processing cancellation", { userId });
        const renewalInfo = payload.unified_receipt?.pending_renewal_info?.[0];
        const autoRenewStatus = renewalInfo?.auto_renew_status === "1";

        if (!autoRenewStatus) {
          await supabaseClient.from("profiles").update({
            subscription_status: 'cancelled',
            updated_at: new Date().toISOString()
          }).eq("id", userId);

          logStep("Subscription cancelled", { userId });
        }
        break;
      }

      case "DID_FAIL_TO_RENEW": {
        logStep("Processing failed renewal", { userId });
        await supabaseClient.from("profiles").update({
          subscription_status: 'payment_failed',
          updated_at: new Date().toISOString()
        }).eq("id", userId);

        logStep("Subscription marked as payment failed", { userId });
        break;
      }

      case "REFUND": {
        logStep("Processing refund", { userId, transactionId });
        await supabaseClient.from("apple_iap_transactions").update({
          validation_status: 'refunded',
          updated_at: new Date().toISOString()
        }).eq("transaction_id", transactionId);

        await supabaseClient.from("profiles").update({
          subscription_status: 'refunded',
          subscription_expires_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq("id", userId);

        logStep("Refund processed", { userId, transactionId });
        break;
      }

      case "REVOKE": {
        logStep("Processing revoke", { userId });
        await supabaseClient.from("profiles").update({
          subscription_status: 'revoked',
          subscription_expires_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq("id", userId);

        logStep("Subscription revoked", { userId });
        break;
      }

      case "DID_RECOVER": {
        logStep("Processing recovery", { userId });
        const expiresDate = new Date(parseInt(expiresDateMs));

        await supabaseClient.from("profiles").update({
          subscription_status: 'active',
          subscription_expires_at: expiresDate.toISOString(),
          updated_at: new Date().toISOString()
        }).eq("id", userId);

        logStep("Subscription recovered", { userId });
        break;
      }

      default:
        logStep("Unhandled notification type", { notificationType });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR processing notification", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { "Content-Type": "application/json" },
      status: 500
    });
  }
});
