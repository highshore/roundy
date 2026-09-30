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

// These values belong only in Supabase Edge Function secrets. They are never
// returned to the browser or included in a PayApp redirect.
const PAYAPP_USER_ID = Deno.env.get("PAYAPP_USER_ID") ?? "";
const PAYAPP_LINK_KEY = Deno.env.get("PAYAPP_LINK_KEY") ?? "";
const PAYAPP_LINK_VALUE = Deno.env.get("PAYAPP_LINK_VALUE") ?? "";
const PAYAPP_TAX_MODE = (Deno.env.get("PAYAPP_TAX_MODE") ?? "").toLowerCase();
const PAYAPP_OPEN_PAY_TYPE = Deno.env.get("PAYAPP_OPEN_PAY_TYPE") ?? "";
const PAYAPP_APP_URL = (Deno.env.get("PAYAPP_APP_URL") ?? "").trim();
const PAYAPP_SHOP_NAME = (Deno.env.get("PAYAPP_SHOP_NAME") ?? "Roundy").trim().slice(0, 60) || "Roundy";
const PAYAPP_API_URL = (Deno.env.get("PAYAPP_API_URL") ?? "https://api.payapp.kr/oapi/apiLoad.html").trim();
const PAYAPP_FRONTEND_URL = (Deno.env.get("PAYAPP_FRONTEND_URL") ?? "https://roundy.team").replace(/\/+$/, "");

const ORDER_NUMBER = /^RNDY-A-\d{14}-[A-F0-9]{10}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAYAPP_METHODS = new Set([
  "card", "phone", "kakaopay", "naverpay", "smilepay", "rbank", "vbank",
  "applepay", "payco", "wechat", "myaccount", "tosspay", "dvpay",
]);

const corsHeaders = {
  "Access-Control-Allow-Origin": PAYAPP_FRONTEND_URL,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function plainText(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function assertConfigured() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new ApiError("Roundy payment storage is not configured.", 503, "supabase-not-configured");
  }
  if (!PAYAPP_USER_ID || !PAYAPP_LINK_KEY || !PAYAPP_LINK_VALUE) {
    throw new ApiError("Roundy payments are not configured.", 503, "payapp-not-configured");
  }
  if (PAYAPP_TAX_MODE !== "taxable" && PAYAPP_TAX_MODE !== "taxfree") {
    throw new ApiError("Roundy payment tax settings are not configured.", 503, "payapp-tax-not-configured");
  }
  let api: URL;
  try {
    api = new URL(PAYAPP_API_URL);
  } catch {
    throw new ApiError("Roundy payment settings are invalid.", 503, "payapp-api-invalid");
  }
  if (api.protocol !== "https:") {
    throw new ApiError("Roundy payment settings are invalid.", 503, "payapp-api-invalid");
  }
  try {
    const frontend = new URL(PAYAPP_FRONTEND_URL);
    if (frontend.protocol !== "https:") throw new Error("https required");
  } catch {
    throw new ApiError("Roundy payment settings are invalid.", 503, "payapp-return-url-invalid");
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

function newOrderNumber() {
  const now = new Date();
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
    String(now.getUTCSeconds()).padStart(2, "0"),
  ].join("");
  return "RNDY-A-" + stamp + "-" + crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
}

function safeText(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function positiveInteger(value: unknown, max = 100_000_000) {
  const text = safeText(value, 16);
  if (!/^\d+$/.test(text)) return null;
  const result = Number(text);
  return Number.isSafeInteger(result) && result >= 0 && result <= max ? result : null;
}

function friendlyCodeError(quote: Record<string, unknown>) {
  const reason = String(quote.code_reason || "invalid");
  if (reason === "self") return "You cannot use your own referral code.";
  if (reason === "already_redeemed") return "This discount code has already been used on your account.";
  if (reason === "exhausted") return "This promo code has reached its redemption limit.";
  return "Invalid or inactive referral / promo code.";
}

function openPayTypes() {
  const values = PAYAPP_OPEN_PAY_TYPE.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (values.some((value) => !PAYAPP_METHODS.has(value))) {
    throw new ApiError("Roundy payment method settings are invalid.", 503, "payapp-methods-invalid");
  }
  return [...new Set(values)].join(",");
}

function taxFields(amount: number) {
  if (PAYAPP_TAX_MODE === "taxfree") {
    return { amount_taxable: "0", amount_taxfree: String(amount), amount_vat: "0" };
  }
  const taxable = Math.floor(amount / 1.1);
  return { amount_taxable: String(taxable), amount_taxfree: "0", amount_vat: String(amount - taxable) };
}

function appUrlField() {
  if (!PAYAPP_APP_URL) return {};
  try {
    const url = new URL(PAYAPP_APP_URL);
    if (["javascript:", "data:", "file:"].includes(url.protocol)) throw new Error("unsafe scheme");
  } catch {
    throw new ApiError("Roundy App-to-App settings are invalid.", 503, "payapp-app-url-invalid");
  }
  return { appurl: PAYAPP_APP_URL };
}

function paymentReturnUrl(orderNumber: string) {
  const url = new URL("/payment/return", PAYAPP_FRONTEND_URL);
  url.searchParams.set("order", orderNumber);
  return url.toString();
}

function feedbackUrl() {
  return SUPABASE_URL.replace(/\/+$/, "") + "/functions/v1/roundy-checkout/payapp/feedback";
}

function trustedPayAppUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError("PayApp did not return a valid payment URL.", 502, "payapp-invalid-payurl");
  }
  const host = url.hostname.toLowerCase();
  if (host !== "payapp.kr" && !host.endsWith(".payapp.kr")) {
    throw new ApiError("PayApp did not return a trusted payment URL.", 502, "payapp-invalid-payurl");
  }
  if (url.protocol === "http:") url.protocol = "https:";
  if (url.protocol !== "https:") throw new ApiError("PayApp did not return a secure payment URL.", 502, "payapp-invalid-payurl");
  return url.toString();
}

async function payAppRequest(values: Record<string, string>) {
  const response = await fetch(PAYAPP_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Accept: "text/plain" },
    body: new URLSearchParams(values).toString(),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.text();
  const result = Object.fromEntries(new URLSearchParams(body));
  if (!response.ok) throw new ApiError("PayApp is temporarily unavailable. Please try again.", 502, "payapp-unavailable");
  return result;
}

function providerResult(data: Record<string, string>) {
  return {
    state: safeText(data.state, 16),
    errno: safeText(data.errno, 32),
    errorMessage: safeText(data.errorMessage, 240),
    mul_no: safeText(data.mul_no, 32),
    price: safeText(data.price, 16),
    csturl: safeText(data.CSTURL || data.csturl, 500),
  };
}

async function failPaymentOrder(orderNumber: string, userId: string, code: string, message: string, result: Record<string, string> | null = null) {
  const { error } = await admin().rpc("fail_event_payment_order", {
    p_order: orderNumber,
    p_user: userId,
    p_error_code: code,
    p_error_message: message.slice(0, 500),
    p_authorization: null,
    p_payment_result: result ? providerResult(result) : null,
  });
  if (error) console.error("roundy-checkout", "payment-failure-write-failed");
}

async function createPaymentRequest(req: Request, user: User, body: Record<string, unknown>) {
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  const code = normalizeCode(body.code);
  if (!UUID.test(eventId)) throw new ApiError("Invalid event ID.");

  const a = admin();
  const { data: activeOrder, error: activeOrderError } = await a
    .from("event_payment_orders")
    .select("order_number,status,provider,provider_payment_url,event_id,amount")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .in("status", ["pending_auth", "charging", "refunding"])
    .maybeSingle();
  if (activeOrderError) throw new ApiError("Could not check your payment status.", 500, "active-order-query-failed");

  if (activeOrder?.status === "charging" && activeOrder.provider === "payapp" && activeOrder.provider_payment_url) {
    return {
      success: true,
      resumed: true,
      orderNumber: activeOrder.order_number,
      eventId,
      amount: Number(activeOrder.amount || 0),
      paymentUrl: trustedPayAppUrl(String(activeOrder.provider_payment_url)),
    };
  }
  if (activeOrder?.status === "pending_auth") {
    await failPaymentOrder(String(activeOrder.order_number), user.id, "abandoned-before-request", "A newer checkout attempt replaced this unfinished request.");
  } else if (activeOrder) {
    throw new ApiError("A payment or refund is already being processed for this event.", 409, "payment-in-progress");
  }

  if (body.termsAccepted !== true) throw new ApiError("Confirm the cancellation and refund rules before paying.");

  const client = userClient(req);
  const { data: quoteData, error: quoteError } = await client.rpc("event_checkout_quote", {
    p_event: eventId,
    p_code: code || null,
  });
  if (quoteError) throw new ApiError(quoteError.message);
  const quote = (quoteData ?? {}) as Record<string, unknown>;
  if (code && quote.code_valid !== true) throw new ApiError(friendlyCodeError(quote));

  const baseAmount = Number(quote.base_amount || 0);
  const codeDiscount = Number(quote.code_discount_amount || 0);
  const genderDiscount = Number(quote.gender_balance_discount_amount || 0);
  const timeDiscount = Number(quote.time_discount_amount || 0);
  const boomerangDiscount = Number(quote.boomerang_discount_amount || 0);
  const discountAmount = Number(quote.discount_amount || 0);
  const finalAmount = Number(quote.final_amount || 0);
  if (!Number.isSafeInteger(baseAmount) || !Number.isSafeInteger(finalAmount) || baseAmount <= 0 || finalAmount < 1_000) {
    throw new ApiError("The final payment amount must be at least ₩1,000.", 400, "invalid-amount");
  }

  const [{ data: profileRow, error: profileError }, { data: eventRow, error: eventError }] = await Promise.all([
    a.from("profiles").select("profile").eq("user_id", user.id).maybeSingle(),
    a.from("events").select("id,title").eq("id", eventId).maybeSingle(),
  ]);
  if (profileError) throw new ApiError("Could not load your payment profile.", 500, "profile-query-failed");
  if (eventError || !eventRow) throw new ApiError("Event unavailable.", 404, "event-not-found");

  const profile = (profileRow?.profile ?? {}) as Record<string, unknown>;
  const payerPhone = String(profile.phone || "").replace(/\D/g, "");
  if (!/^010\d{8}$/.test(payerPhone)) throw new ApiError("Add a valid Korean phone number to your profile before payment.");

  const orderNumber = newOrderNumber();
  const { error: insertError } = await a.from("event_payment_orders").insert({
    order_number: orderNumber,
    charge_order_number: orderNumber,
    provider: "payapp",
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
  if (insertError) throw new ApiError("Could not create this payment order.", 409, "order-create-failed");

  const { error: claimError } = await a.rpc("claim_event_payment_order", { p_order: orderNumber, p_user: user.id });
  if (claimError) {
    await failPaymentOrder(orderNumber, user.id, "seat-claim-failed", claimError.message);
    throw new ApiError(claimError.message, 409, "seat-claim-failed");
  }

  let response: Record<string, string>;
  try {
    response = await payAppRequest({
      cmd: "payrequest",
      userid: PAYAPP_USER_ID,
      shopname: PAYAPP_SHOP_NAME,
      goodname: (String(eventRow.title).trim().slice(0, 80) || "Roundy event") + " - Roundy",
      price: String(finalAmount),
      recvphone: payerPhone,
      memo: "Roundy event reservation",
      reqaddr: "0",
      feedbackurl: feedbackUrl(),
      returnurl: paymentReturnUrl(orderNumber),
      var1: orderNumber,
      var2: eventId,
      smsuse: "n",
      charset: "auto",
      openpaytype: openPayTypes(),
      checkretry: "y",
      skip_cstpage: "y",
      ...taxFields(finalAmount),
      ...appUrlField(),
    });
  } catch (error) {
    await failPaymentOrder(orderNumber, user.id, "payapp-request-failed", "PayApp could not create the payment request.");
    throw error;
  }

  const mulNo = safeText(response.mul_no, 32);
  if (response.state !== "1" || !/^\d{1,24}$/.test(mulNo) || !response.payurl) {
    await failPaymentOrder(orderNumber, user.id, "payapp-request-failed", "PayApp could not create the payment request.", response);
    throw new ApiError(safeText(response.errorMessage, 240) || "PayApp could not create the payment request.", 502, "payapp-request-failed");
  }

  let paymentUrl: string;
  try {
    paymentUrl = trustedPayAppUrl(response.payurl);
  } catch (error) {
    await failPaymentOrder(orderNumber, user.id, "payapp-invalid-payurl", "PayApp returned an invalid payment URL.", response);
    throw error;
  }

  const { error: providerWriteError } = await a.from("event_payment_orders").update({
    provider_payment_id: mulNo,
    provider_payment_url: paymentUrl,
    provider_requested_at: new Date().toISOString(),
    authorization_response: providerResult(response),
    updated_at: new Date().toISOString(),
  }).eq("order_number", orderNumber).eq("user_id", user.id);
  // PayApp can send the first callback before this write completes. The callback
  // path can safely fill in mul_no, so preserve a real payment URL for the user.
  if (providerWriteError) console.error("roundy-checkout", "provider-request-write-failed");

  return { success: true, orderNumber, eventId, amount: finalAmount, quote, paymentUrl };
}

async function abandonPendingPayment(user: User, body: Record<string, unknown>) {
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  if (!UUID.test(eventId)) throw new ApiError("Invalid event ID.");

  const a = admin();
  const { data: order, error } = await a
    .from("event_payment_orders")
    .select("order_number,status,provider,provider_payment_id")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .in("status", ["pending_auth", "charging"])
    .maybeSingle();
  if (error) throw new ApiError("Could not check your payment status.", 500, "active-order-query-failed");
  if (!order) return { success: true, abandoned: false };

  const orderNumber = String(order.order_number);
  if (order.status === "pending_auth") {
    await failPaymentOrder(orderNumber, user.id, "user-cancelled-payment-request", "The user cancelled this unfinished payment request.");
    return { success: true, abandoned: true, orderNumber };
  }

  if (order.provider !== "payapp") throw new ApiError("This payment request cannot be cancelled here.", 409, "provider-cancel-unsupported");
  const mulNo = String(order.provider_payment_id || "");
  if (!/^\d{1,24}$/.test(mulNo)) throw new ApiError("PayApp has not finished creating this payment request yet. Please try again.", 409, "provider-request-pending");

  let response: Record<string, string>;
  try {
    response = await payAppRequest({
      cmd: "paycancel",
      userid: PAYAPP_USER_ID,
      linkkey: PAYAPP_LINK_KEY,
      mul_no: mulNo,
      cancelmemo: "Roundy checkout cancelled by user",
      cancelmode: "ready",
      partcancel: "0",
    });
  } catch (error) {
    throw error;
  }

  if (response.state !== "1") {
    throw new ApiError(safeText(response.errorMessage, 240) || "PayApp could not cancel this unpaid payment request.", 409, "payapp-request-cancel-failed");
  }

  await failPaymentOrder(orderNumber, user.id, "user-cancelled-payment-request", "The user cancelled this unpaid PayApp request.", response);
  return { success: true, abandoned: true, orderNumber };
}

async function paymentStatus(user: User, body: Record<string, unknown>) {
  const orderNumber = safeText(body.orderNumber, 64);
  if (!ORDER_NUMBER.test(orderNumber)) throw new ApiError("Invalid payment order.");
  const { data: order, error } = await admin()
    .from("event_payment_orders")
    .select("order_number,event_id,amount,status,error_code,error_message")
    .eq("order_number", orderNumber)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !order) throw new ApiError("Payment order not found.", 404, "order-not-found");
  const status = String(order.status);
  return {
    success: true,
    orderNumber: order.order_number,
    eventId: order.event_id,
    amount: Number(order.amount || 0),
    status,
    completed: status === "completed",
    pending: status === "pending_auth" || status === "charging",
    failed: status === "failed",
    error: status === "failed" ? safeText(order.error_message, 240) : undefined,
  };
}

async function cancelPaidBooking(user: User, body: Record<string, unknown>) {
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  if (!UUID.test(eventId)) throw new ApiError("Invalid event ID.");
  const a = admin();
  const { data: booking, error: bookingError } = await a
    .from("bookings")
    .select("id,payment_order_number")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (bookingError) throw new ApiError("Could not find the booking.", 500, "booking-query-failed");
  if (!booking?.payment_order_number) return { success: true, paid: false };

  const orderNumber = String(booking.payment_order_number);
  const { data: refund, error: prepareError } = await a.rpc("prepare_event_refund", { p_order: orderNumber, p_user: user.id });
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

  const { data: order, error: orderError } = await a
    .from("event_payment_orders")
    .select("provider,provider_payment_id")
    .eq("order_number", orderNumber)
    .eq("user_id", user.id)
    .maybeSingle();
  if (orderError || !order || order.provider !== "payapp" || !/^\d{1,24}$/.test(String(order.provider_payment_id || ""))) {
    await a.rpc("fail_event_refund", {
      p_order: orderNumber,
      p_user: user.id,
      p_error_code: "provider-reconcile-required",
      p_error_message: "This historical payment needs manual refund reconciliation.",
      p_refund_response: {},
    });
    throw new ApiError("This payment needs manual refund reconciliation. Please contact Roundy support.", 409, "provider-reconcile-required");
  }

  let response: Record<string, string>;
  try {
    response = await payAppRequest({
      cmd: "paycancel",
      userid: PAYAPP_USER_ID,
      linkkey: PAYAPP_LINK_KEY,
      mul_no: String(order.provider_payment_id),
      cancelmemo: "Roundy event cancellation",
      partcancel: "0",
    });
  } catch (error) {
    await a.rpc("fail_event_refund", {
      p_order: orderNumber,
      p_user: user.id,
      p_error_code: "payapp-refund-unavailable",
      p_error_message: "PayApp could not process the cancellation.",
      p_refund_response: {},
    });
    throw error;
  }

  if (response.state !== "1") {
    await a.rpc("fail_event_refund", {
      p_order: orderNumber,
      p_user: user.id,
      p_error_code: "payapp-refund-failed",
      p_error_message: safeText(response.errorMessage, 240) || "PayApp could not process the cancellation.",
      p_refund_response: providerResult(response),
    });
    throw new ApiError(safeText(response.errorMessage, 240) || "PayApp could not process the cancellation.", 400, "payapp-refund-failed");
  }

  const refundResponse = providerResult(response);
  const { error: completeError } = await a.rpc("complete_event_refund", {
    p_order: orderNumber,
    p_user: user.id,
    p_refund_response: refundResponse,
  });
  if (completeError) {
    await a.rpc("mark_event_refund_reconcile", {
      p_order: orderNumber,
      p_user: user.id,
      p_refund_response: refundResponse,
      p_error_message: completeError.message,
    });
    throw new ApiError("The refund succeeded, but booking reconciliation is pending. Please contact Roundy support.", 500, "refund-reconcile-pending");
  }
  return { success: true, paid: true, refundAmount: Number(refund?.amount || 0) };
}

async function payAppFeedback(req: Request) {
  if (req.method !== "POST") throw new ApiError("Method not allowed", 405, "method-not-allowed");
  const length = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(length) && length > 32_768) throw new ApiError("Feedback body is too large.", 413, "feedback-too-large");
  const form = await req.formData();
  const value = (key: string, max = 512) => safeText(form.get(key), max);

  const userid = value("userid", 120);
  const linkkey = value("linkkey", 240);
  const linkval = value("linkval", 240);
  const orderNumber = value("var1", 64);
  const eventId = value("var2", 64);
  const mulNo = value("mul_no", 32);
  const amount = positiveInteger(value("price", 16));
  const payState = positiveInteger(value("pay_state", 8), 999);

  if (userid !== PAYAPP_USER_ID || linkkey !== PAYAPP_LINK_KEY || linkval !== PAYAPP_LINK_VALUE) {
    throw new ApiError("Unverified PayApp feedback.", 403, "feedback-unverified");
  }
  if (!ORDER_NUMBER.test(orderNumber) || !UUID.test(eventId) || !/^\d{1,24}$/.test(mulNo) || amount === null || payState === null) {
    throw new ApiError("Invalid PayApp feedback.", 400, "feedback-invalid");
  }

  // Deliberately omit linkkey, linkval, recvphone, vbank account data and any
  // unrecognised provider fields. The order already contains all needed identity.
  const feedback = {
    event_id: eventId,
    pay_state: payState,
    mul_no: mulNo,
    price: amount,
    goodname: value("goodname", 160),
    pay_date: value("pay_date", 64),
    pay_type: value("pay_type", 24),
    paymethod_group: value("paymethod_group", 24),
    payauthcode: value("payauthcode", 64),
    card_name: value("card_name", 100),
    card_quota: value("card_quota", 24),
    csturl: value("csturl", 500),
    vbank: value("vbank", 100),
    depositor: value("depositor", 100),
    orig_mul_no: value("orig_mul_no", 32),
    orig_price: value("orig_price", 16),
    received_at: new Date().toISOString(),
  };
  const { error } = await admin().rpc("record_payapp_feedback", {
    p_order: orderNumber,
    p_mul_no: mulNo,
    p_pay_state: payState,
    p_amount: amount,
    p_feedback: feedback,
  });
  if (error) throw new ApiError("Could not record PayApp feedback.", 500, "feedback-storage-failed");
  return plainText("SUCCESS");
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  if (url.pathname.endsWith("/payapp/feedback")) {
    try {
      assertConfigured();
      return await payAppFeedback(req);
    } catch (error) {
      const err = error instanceof ApiError ? error : new ApiError("PayApp feedback error", 500, "feedback-internal");
      console.error("roundy-checkout", err.code);
      return plainText("FAIL", err.status >= 500 ? 500 : err.status);
    }
  }
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    assertConfigured();
    if (req.method !== "POST") throw new ApiError("Method not allowed", 405, "method-not-allowed");
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || "");
    const user = await caller(req);

    if (action === "create") return json(await createPaymentRequest(req, user, body));
    if (action === "status") return json(await paymentStatus(user, body));
    if (action === "abandon") return json(await abandonPendingPayment(user, body));
    if (action === "cancel") return json(await cancelPaidBooking(user, body));
    throw new ApiError("Unknown payment action.", 400, "unknown-action");
  } catch (error) {
    const err = error instanceof ApiError
      ? error
      : new ApiError(error instanceof Error ? error.message : "Payment error", 500, "internal");
    console.error("roundy-checkout", err.code);
    return json({ success: false, error: err.message, errorCode: err.code }, err.status);
  }
});
