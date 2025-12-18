import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[GOOGLE-IAP-PROCESS-CREDITS] ${step}${detailsStr}`);
};

interface GooglePlayProductResponse {
  kind: string;
  purchaseTimeMillis: string;
  purchaseState: number;
  consumptionState: number;
  orderId: string;
  purchaseType?: number;
  acknowledgementState?: number;
  quantity?: number;
}

async function validatePurchaseToken(
  packageName: string,
  productId: string,
  purchaseToken: string
): Promise<GooglePlayProductResponse> {
  // Get Google service account credentials from environment
  const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!serviceAccountJson) {
    throw new Error("Google service account credentials not configured");
  }

  const serviceAccount = JSON.parse(serviceAccountJson);

  // Get OAuth2 access token
  const jwtHeader = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const jwtClaimSet = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const jwtClaimSetEncoded = btoa(JSON.stringify(jwtClaimSet));
  const signatureInput = `${jwtHeader}.${jwtClaimSetEncoded}`;

  // Import the private key
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    new TextEncoder().encode(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  // Sign the JWT
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signatureInput)
  );

  const jwt = `${signatureInput}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResponse.ok) {
    throw new Error(`Failed to get access token: ${tokenResponse.statusText}`);
  }

  const { access_token } = await tokenResponse.json();

  // Validate the purchase with Google Play API (for products, not subscriptions)
  const apiUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/products/${productId}/tokens/${purchaseToken}`;

  const response = await fetch(apiUrl, {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!response.ok) {
    throw new Error(`Google Play API validation failed: ${response.statusText}`);
  }

  return await response.json();
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
    logStep("Google Play IAP credits processing started");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    const { purchaseToken, productId, orderId } = await req.json();

    if (!purchaseToken) throw new Error("purchaseToken is required");
    if (!productId) throw new Error("productId is required");
    if (!orderId) throw new Error("orderId is required");

    logStep("Processing Google Play IAP credits", { userId: user.id, productId, orderId });

    // Check if transaction already processed
    const { data: existingTransaction } = await supabaseClient
      .from("google_play_transactions")
      .select("id, validation_status")
      .eq("order_id", orderId)
      .single();

    if (existingTransaction) {
      logStep("Transaction already processed", { orderId });
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

    logStep("Validating purchase with Google Play");
    const packageName = "com.tossortaste.app"; // Your Android package name
    const validationResult = await validatePurchaseToken(packageName, productId, purchaseToken);
    logStep("Google Play validation result", { orderId: validationResult.orderId });

    // Check if purchase is valid (purchaseState = 0 means purchased)
    if (validationResult.purchaseState !== 0) {
      await supabaseClient.from("google_play_transactions").insert({
        user_id: user.id,
        order_id: orderId,
        purchase_token: purchaseToken,
        product_id: productId,
        product_type: 'consumable',
        purchase_date: new Date(parseInt(validationResult.purchaseTimeMillis)).toISOString(),
        validation_status: 'invalid',
        processed: false
      });
      throw new Error(`Purchase not valid. Purchase state: ${validationResult.purchaseState}`);
    }

    // Determine credit amount from product ID
    let creditAmount = 0;
    if (productId.includes('single_credit')) {
      creditAmount = 1;
    } else if (productId.includes('credit_pack')) {
      creditAmount = 5;
    } else {
      throw new Error(`Unknown credit product: ${productId}`);
    }

    // Get current credits
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("room_credits")
      .eq("id", user.id)
      .single();

    if (profileError) throw new Error(`Failed to get user profile: ${profileError.message}`);

    const currentCredits = profile?.room_credits || 0;
    const newCredits = currentCredits + creditAmount;

    // Update user credits
    const { error: updateError } = await supabaseClient
      .from("profiles")
      .update({
        room_credits: newCredits,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) throw new Error(`Failed to update credits: ${updateError.message}`);

    // Record transaction
    await supabaseClient.from("google_play_transactions").insert({
      user_id: user.id,
      order_id: orderId,
      purchase_token: purchaseToken,
      product_id: productId,
      product_type: 'consumable',
      purchase_date: new Date(parseInt(validationResult.purchaseTimeMillis)).toISOString(),
      quantity: validationResult.quantity || 1,
      acknowledgement_state: validationResult.acknowledgementState || 0,
      validation_status: 'valid',
      processed: true,
      processed_at: new Date().toISOString()
    });

    logStep("Google Play IAP credits added successfully", {
      userId: user.id,
      previousCredits: currentCredits,
      creditsAdded: creditAmount,
      newTotal: newCredits,
      orderId
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
    logStep("ERROR in google-iap-process-credits", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
