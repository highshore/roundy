import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type User } from "npm:@supabase/supabase-js@2";

class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "bad-request") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PAYPLE_CST_ID = Deno.env.get("PAYPLE_CST_ID") ?? "";
const PAYPLE_CUST_KEY = Deno.env.get("PAYPLE_CUST_KEY") ?? "";
const PAYPLE_CLIENT_KEY = Deno.env.get("PAYPLE_CLIENT_KEY") ?? "";
const PAYPLE_REFUND_KEY = Deno.env.get("PAYPLE_REFUND_KEY") ?? "";
const PAYPLE_HOST = (Deno.env.get("PAYPLE_HOST") || "https://cpay.payple.kr").replace(/\/+$/, "");
const PAYPLE_AUTH_URL = Deno.env.get("PAYPLE_AUTH_URL") || PAYPLE_HOST + "/php/auth.php";
const PAYPLE_HOSTNAME = (Deno.env.get("PAYPLE_HOSTNAME") || "https://roundy.team").replace(/\/+$/, "");
const PAYPLE_FRONTEND_URL = (Deno.env.get("PAYPLE_FRONTEND_URL") || PAYPLE_HOSTNAME).replace(/\/+$/, "");

const corsHeaders = {
  "Access-Control-Allow-Origin": PAYPLE_FRONTEND_URL,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function assertConfigured() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new ApiError("Roundy payment storage is not configured.", 503, "supabase-not-configured");
  }
  if (!PAYPLE_CST_ID || !PAYPLE_CUST_KEY || !PAYPLE_CLIENT_KEY || !PAYPLE_REFUND_KEY) {
    throw new ApiError("Roundy payments are not configured.", 503, "payple-not-configured");
  }
}

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function userClient(req: Request) {
  const authorization = req.headers.get("Authorization") ?? "";
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function caller(req: Request): Promise<User> {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) throw new ApiError("Sign in required", 401, "auth-required");
  const token = header.slice("Bearer ".length);
  const client = userClient(req);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new ApiError("Sign in required", 401, "auth-required");
  return data.user;
}

function normalizeCode(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24);
}

function newOrderNumber(prefix: "A" | "P") {
  const now = new Date();
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
    String(now.getUTCSeconds()).padStart(2, "0"),
  ].join("");
  return "RNDY-" + prefix + "-" + stamp + "-" + crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
}

async function numericPayerNo(source: string, length = 12) {
  const bytes = new TextEncoder().encode(source);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  let digits = "";
  for (const byte of digest) {
    digits += String(byte % 10);
    if (digits.length >= length) break;
  }
  return digits;
}

async function paypleAuth(isCancel = false) {
  const response = await fetch(PAYPLE_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", referer: PAYPLE_HOSTNAME },
    body: JSON.stringify({
      cst_id: PAYPLE_CST_ID,
      custKey: PAYPLE_CUST_KEY,
      PCD_PAY_TYPE: "card",
      PCD_SIMPLE_FLAG: "Y",
      PCD_PAY_WORK: "CERT",
      PCD_PAYCANCEL_FLAG: isCancel ? "Y" : "N",
    }),
  });
  const data = await response.json();
  if (data?.result !== "success") {
    throw new ApiError(data?.result_msg || "Payple authentication failed.", 502, "payple-auth-failed");
  }
  return data;
}

function paymentUrl(auth: Record<string, unknown>) {
  if (auth.PCD_PAY_HOST && auth.PCD_PAY_URL) return String(auth.PCD_PAY_HOST) + String(auth.PCD_PAY_URL);
  return PAYPLE_HOST + "/php/SimplePayCardAct.php?ACT_=PAYM";
}

function friendlyCodeError(quote: Record<string, unknown>) {
  const reason = String(quote.code_reason || "invalid");
  if (reason === "self") return "You cannot use your own referral code.";
  if (reason === "already_redeemed") return "This discount code has already been used on your account.";
  if (reason === "exhausted") return "This promo code has reached its redemption limit.";
  return "Invalid or inactive referral / promo code.";
}

async function createWindow(req: Request, user: User, body: Record<string, unknown>) {
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  const code = normalizeCode(body.code);
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) throw new ApiError("Invalid event ID.");
  if (body.termsAccepted !== true) throw new ApiError("Confirm the cancellation and refund rules before paying.");

  const client = userClient(req);
  const { data: quoteData, error: quoteError } = await client.rpc("event_checkout_quote", {
    p_event: eventId,
    p_code: code || null,
  });
  if (quoteError) throw new ApiError(quoteError.message);
  const quote = (quoteData ?? {}) as Record<string, unknown>;
  if (code && quote.code_valid !== true) throw new ApiError(friendlyCodeError(quote));

  const a = admin();
  const { data: profileRow, error: profileError } = await a
    .from("profiles")
    .select("profile")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError) throw new ApiError(profileError.message, 500, "profile-query-failed");

  const { data: eventRow, error: eventError } = await a
    .from("events")
    .select("id,title,starts_at")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError || !eventRow) throw new ApiError("Event unavailable.", 404, "event-not-found");

  const profile = (profileRow?.profile ?? {}) as Record<string, unknown>;
  const payerName = String(profile.full_name || user.user_metadata?.name || "Roundy member").slice(0, 30);
  const payerPhone = String(profile.phone || "").replace(/\D/g, "");
  if (!/^010\d{8}$/.test(payerPhone)) throw new ApiError("Add a valid Korean phone number to your profile before payment.");

  const { data: activeOrder } = await a
    .from("event_payment_orders")
    .select("order_number,status")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .in("status", ["pending_auth", "charging", "refunding"])
    .maybeSingle();

  if (activeOrder?.status === "charging" || activeOrder?.status === "refunding") {
    throw new ApiError("A payment or refund is already processing for this event.", 409, "payment-in-progress");
  }
  if (activeOrder?.status === "pending_auth") {
    await a.from("event_payment_orders").update({
      status: "failed",
      error_code: "superseded",
      error_message: "Replaced by a newer checkout attempt.",
      updated_at: new Date().toISOString(),
    }).eq("order_number", activeOrder.order_number);
  }

  const orderNumber = newOrderNumber("A");
  const chargeOrderNumber = newOrderNumber("P");
  const baseAmount = Number(quote.base_amount || 0);
  const codeDiscount = Number(quote.code_discount_amount || 0);
  const genderDiscount = Number(quote.gender_balance_discount_amount || 0);
  const timeDiscount = Number(quote.time_discount_amount || 0);
  const boomerangDiscount = Number(quote.boomerang_discount_amount || 0);
  const discountAmount = Number(quote.discount_amount || 0);
  const finalAmount = Number(quote.final_amount || 0);

  if (finalAmount <= 0 || baseAmount <= 0) throw new ApiError("Invalid checkout amount.", 400, "invalid-amount");

  const { error: insertError } = await a.from("event_payment_orders").insert({
    order_number: orderNumber,
    charge_order_number: chargeOrderNumber,
    event_id: eventId,
    user_id: user.id,
    status: "pending_auth",
    gender: String(quote.gender),
    base_amount: baseAmount,
    code_kind: quote.code_kind || null,
    discount_code: code || null,
    code_discount_amount: codeDiscount,
    gender_balance_discount_amount: genderDiscount,
    time_discount_amount: timeDiscount,
    time_discount_kind: quote.time_discount_kind || null,
    boomerang_discount_amount: boomerangDiscount,
    discount_amount: discountAmount,
    amount: finalAmount,
    pricing_snapshot: quote,
    terms_accepted_at: new Date().toISOString(),
  });
  if (insertError) throw new ApiError(insertError.message, 409, "order-create-failed");

  const now = new Date();
  const paymentParams = {
    clientKey: PAYPLE_CLIENT_KEY,
    PCD_PAY_TYPE: "card",
    PCD_PAY_WORK: "CERT",
    PCD_CARD_VER: "01",
    PCD_PAY_GOODS: String(eventRow.title).slice(0, 60) + " - Roundy",
    PCD_PAY_TOTAL: finalAmount,
    PCD_REGULER_FLAG: "N",
    PCD_SIMPLE_FLAG: "Y",
    PCD_PAY_OID: orderNumber,
    PCD_PAY_YEAR: String(now.getFullYear()),
    PCD_PAY_MONTH: String(now.getMonth() + 1).padStart(2, "0"),
    PCD_PAYER_NO: await numericPayerNo(user.id),
    PCD_PAYER_NAME: payerName,
    PCD_PAYER_EMAIL: user.email || "",
    PCD_PAYER_HP: payerPhone,
    PCD_RST_URL: SUPABASE_URL + "/functions/v1/roundy-checkout/callback",
    PCD_PAYER_AUTHTYPE: "sms",
    PCD_USER_DEFINE1: user.id,
    PCD_USER_DEFINE2: JSON.stringify({ event_id: eventId, order_number: orderNumber }),
    PCD_SIMPLE_FNAME: "roundy-payment-result",
  };

  return { success: true, orderNumber, eventId, amount: finalAmount, quote, paymentParams };
}

async function verifyPayment(user: User, body: Record<string, unknown>) {
  const orderNumber = typeof body.orderNumber === "string" ? body.orderNumber : "";
  const paymentResponse = body.paymentResponse && typeof body.paymentResponse === "object"
    ? body.paymentResponse as Record<string, unknown>
    : {};
  if (!orderNumber) throw new ApiError("Missing payment order.");

  const a = admin();
  const { data: order, error: orderError } = await a
    .from("event_payment_orders")
    .select("*")
    .eq("order_number", orderNumber)
    .eq("user_id", user.id)
    .maybeSingle();
  if (orderError || !order) throw new ApiError("Payment order not found.", 404, "order-not-found");

  if (order.status === "completed") {
    const { data: booking } = await a.from("bookings").select("id,event_id").eq("payment_order_number", orderNumber).maybeSingle();
    return { success: true, bookingId: booking?.id ?? null, eventId: booking?.event_id ?? order.event_id, alreadyCompleted: true };
  }

  if (order.status === "charging" && order.payment_result?.PCD_PAY_RST === "success") {
    const { data: bookingId, error: completeError } = await a.rpc("complete_event_payment_order", {
      p_order: orderNumber,
      p_user: user.id,
      p_billing_key: String(order.billing_key_used || ""),
      p_authorization: order.authorization_response || paymentResponse,
      p_payment_result: order.payment_result,
    });
    if (completeError) throw new ApiError("Payment succeeded but booking settlement is pending. Contact Roundy support.", 500, "settlement-pending");
    return { success: true, bookingId, eventId: order.event_id, recovered: true };
  }

  if (String(paymentResponse.PCD_PAY_OID || "") !== orderNumber) {
    throw new ApiError("Payment order mismatch.", 400, "order-mismatch");
  }

  if (paymentResponse.PCD_PAY_RST !== "success") {
    await a.rpc("fail_event_payment_order", {
      p_order: orderNumber,
      p_user: user.id,
      p_error_code: String(paymentResponse.PCD_PAY_CODE || "authorization-failed"),
      p_error_message: String(paymentResponse.PCD_PAY_MSG || "Payment authorization failed"),
      p_authorization: paymentResponse,
      p_payment_result: null,
    });
    throw new ApiError(String(paymentResponse.PCD_PAY_MSG || "Payment authorization failed."), 400, "authorization-failed");
  }

  const billingKey = String(paymentResponse.PCD_PAYER_ID || paymentResponse.PCD_CARD_BILLKEY || "");
  if (!billingKey) throw new ApiError("Could not confirm the Payple billing key.", 500, "missing-billing-key");

  const { data: claim, error: claimError } = await a.rpc("claim_event_payment_order", {
    p_order: orderNumber,
    p_user: user.id,
  });
  if (claimError) {
    await a.rpc("fail_event_payment_order", {
      p_order: orderNumber,
      p_user: user.id,
      p_error_code: "seat-claim-failed",
      p_error_message: claimError.message,
      p_authorization: paymentResponse,
      p_payment_result: null,
    });
    throw new ApiError(claimError.message, 409, "seat-claim-failed");
  }

  const auth = await paypleAuth(false);
  const amount = Number(claim?.amount ?? order.amount);
  const chargeOrderNumber = String(claim?.charge_order_number || order.charge_order_number);
  const now = new Date();
  const chargeRequest = {
    PCD_CST_ID: auth.cst_id,
    PCD_CUST_KEY: auth.custKey,
    PCD_AUTH_KEY: auth.AuthKey,
    PCD_PAY_TYPE: "card",
    PCD_PAYER_ID: billingKey,
    PCD_PAY_GOODS: "Roundy 1:1 Mingle",
    PCD_SIMPLE_FLAG: "Y",
    PCD_PAY_TOTAL: amount,
    PCD_PAY_OID: chargeOrderNumber,
    PCD_PAYER_NO: await numericPayerNo(user.id),
    PCD_PAY_YEAR: String(now.getFullYear()),
    PCD_PAY_MONTH: String(now.getMonth() + 1).padStart(2, "0"),
    PCD_PAY_ISTAX: "Y",
    PCD_PAY_TAXTOTAL: String(Math.floor(amount / 11)),
  };

  const chargeResponse = await fetch(paymentUrl(auth), {
    method: "POST",
    headers: { "Content-Type": "application/json", referer: PAYPLE_HOSTNAME },
    body: JSON.stringify(chargeRequest),
  });
  const payData = await chargeResponse.json();

  if (payData?.PCD_PAY_RST !== "success") {
    await a.rpc("fail_event_payment_order", {
      p_order: orderNumber,
      p_user: user.id,
      p_error_code: String(payData?.PCD_PAY_CODE || "charge-failed"),
      p_error_message: String(payData?.PCD_PAY_MSG || "Payment failed"),
      p_authorization: paymentResponse,
      p_payment_result: payData,
    });
    throw new ApiError(payData?.PCD_PAY_MSG || "Payment failed.", 400, "charge-failed");
  }

  await a.from("event_payment_orders").update({
    billing_key_used: billingKey,
    authorization_response: paymentResponse,
    payment_result: payData,
    updated_at: new Date().toISOString(),
  }).eq("order_number", orderNumber).eq("user_id", user.id);

  const { data: bookingId, error: completeError } = await a.rpc("complete_event_payment_order", {
    p_order: orderNumber,
    p_user: user.id,
    p_billing_key: billingKey,
    p_authorization: paymentResponse,
    p_payment_result: payData,
  });
  if (completeError) {
    throw new ApiError("Payment succeeded but booking settlement is pending. Do not pay again; contact Roundy support.", 500, "settlement-pending");
  }

  return { success: true, bookingId, eventId: order.event_id, amount };
}

function yyyyMMdd(date: Date) {
  return String(date.getFullYear()) + String(date.getMonth() + 1).padStart(2, "0") + String(date.getDate()).padStart(2, "0");
}

async function cancelPaidBooking(user: User, body: Record<string, unknown>) {
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) throw new ApiError("Invalid event ID.");
  const a = admin();

  const { data: booking, error: bookingError } = await a
    .from("bookings")
    .select("id,payment_order_number")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (bookingError) throw new ApiError(bookingError.message, 500, "booking-query-failed");
  if (!booking?.payment_order_number) return { success: true, paid: false };

  const orderNumber = String(booking.payment_order_number);
  const { data: refund, error: prepareError } = await a.rpc("prepare_event_refund", {
    p_order: orderNumber,
    p_user: user.id,
  });
  if (prepareError) throw new ApiError(prepareError.message, 400, "refund-not-allowed");

  if (refund?.already_refunded) return { success: true, paid: true, alreadyRefunded: true, refundAmount: Number(refund.amount || 0) };

  if (refund?.needs_reconcile) {
    const { error: reconcileError } = await a.rpc("complete_event_refund", {
      p_order: orderNumber,
      p_user: user.id,
      p_refund_response: refund.refund_response || {},
    });
    if (reconcileError) throw new ApiError("Your refund was processed, but booking reconciliation still needs support.", 500, "refund-reconcile-pending");
    return { success: true, paid: true, reconciled: true, refundAmount: Number(refund.amount || 0) };
  }

  const amount = Number(refund?.amount || 0);
  const chargeOrderNumber = String(refund?.charge_order_number || "");
  const result = (refund?.payment_result ?? {}) as Record<string, unknown>;
  if (!amount || !chargeOrderNumber) throw new ApiError("Refund information is incomplete.", 500, "refund-data-missing");

  const paidTime = String(result.PCD_PAY_TIME || "");
  const paidAt = refund?.paid_at ? new Date(String(refund.paid_at)) : new Date();
  const paidDate = paidTime.length >= 8 ? paidTime.slice(0, 8) : yyyyMMdd(paidAt);
  const auth = await paypleAuth(true);
  const response = await fetch(PAYPLE_HOST + "/php/account/api/cPayCAct.php", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", referer: PAYPLE_HOSTNAME },
    body: JSON.stringify({
      PCD_CST_ID: auth.cst_id,
      PCD_CUST_KEY: auth.custKey,
      PCD_AUTH_KEY: auth.AuthKey,
      PCD_REFUND_KEY: PAYPLE_REFUND_KEY,
      PCD_PAYCANCEL_FLAG: "Y",
      PCD_PAY_OID: chargeOrderNumber,
      PCD_PAY_DATE: paidDate,
      PCD_REFUND_TOTAL: String(amount),
    }),
  });
  const refundData = await response.json();

  if (refundData?.PCD_PAY_RST !== "success") {
    await a.rpc("fail_event_refund", {
      p_order: orderNumber,
      p_user: user.id,
      p_error_code: String(refundData?.PCD_PAY_CODE || "refund-failed"),
      p_error_message: String(refundData?.PCD_PAY_MSG || "Refund failed"),
      p_refund_response: refundData,
    });
    throw new ApiError(refundData?.PCD_PAY_MSG || "Refund failed.", 400, "refund-failed");
  }

  const { error: completeError } = await a.rpc("complete_event_refund", {
    p_order: orderNumber,
    p_user: user.id,
    p_refund_response: refundData,
  });
  if (completeError) {
    await a.rpc("mark_event_refund_reconcile", {
      p_order: orderNumber,
      p_user: user.id,
      p_refund_response: refundData,
      p_error_message: completeError.message,
    });
    throw new ApiError("The card refund succeeded, but booking reconciliation is pending. Contact Roundy support.", 500, "refund-reconcile-pending");
  }

  return { success: true, paid: true, refundAmount: amount };
}

const CALLBACK_FIELDS = new Set([
  "PCD_PAY_RST","PCD_PAY_CODE","PCD_PAY_MSG","PCD_PAY_OID","PCD_PAY_TYPE","PCD_PAY_WORK",
  "PCD_PAY_GOODS","PCD_PAY_TOTAL","PCD_PAY_TIME","PCD_PAY_YEAR","PCD_PAY_MONTH","PCD_PAY_CARDNAME",
  "PCD_PAYER_ID","PCD_PAYER_NO","PCD_PAYER_NAME","PCD_PAYER_EMAIL","PCD_CARD_VER","PCD_CARD_BILLKEY",
  "PCD_REGULER_FLAG","PCD_USER_DEFINE1"
]);

function collectCallback(target: Record<string, string>, key: string, value: unknown) {
  if (!CALLBACK_FIELDS.has(key)) return;
  if (typeof value !== "string" && typeof value !== "number") return;
  const textValue = String(value);
  if (textValue.length <= 512) target[key] = textValue;
}

async function callback(req: Request) {
  const data: Record<string, string> = {};
  if (req.method === "POST") {
    const type = req.headers.get("content-type") || "";
    if (type.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      if (body && typeof body === "object" && !Array.isArray(body)) {
        for (const [key, value] of Object.entries(body)) collectCallback(data, key, value);
      }
    } else {
      const form = await req.formData();
      for (const [key, value] of form.entries()) collectCallback(data, key, String(value));
    }
  } else {
    const url = new URL(req.url);
    for (const [key, value] of url.searchParams.entries()) collectCallback(data, key, value);
  }
  if (!Object.keys(data).length) return new Response("No payment data received", { status: 400 });
  const params = new URLSearchParams(data);
  return new Response(null, {
    status: 303,
    headers: { Location: PAYPLE_FRONTEND_URL + "/payment/result?" + params.toString() },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  if (url.pathname.endsWith("/callback")) return callback(req);

  try {
    assertConfigured();
    if (req.method !== "POST") throw new ApiError("Method not allowed", 405, "method-not-allowed");
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || "");
    const user = await caller(req);

    if (action === "window") return json(await createWindow(req, user, body));
    if (action === "verify") return json(await verifyPayment(user, body));
    if (action === "cancel") return json(await cancelPaidBooking(user, body));
    throw new ApiError("Unknown payment action.", 400, "unknown-action");
  } catch (error) {
    const err = error instanceof ApiError
      ? error
      : new ApiError(error instanceof Error ? error.message : "Payment error", 500, "internal");
    console.error("roundy-checkout", err.code, err.message);
    return json({ success: false, error: err.message, errorCode: err.code }, err.status);
  }
});
