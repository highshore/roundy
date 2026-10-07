import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { receiptIdentity } from './bank-transfer';

export function bankSettings() {
 const account = (process.env.KB_ACCOUNT_NUMBER ?? '').replaceAll('-', '').trim();
 const holder = process.env.KB_ACCOUNT_HOLDER?.trim() ?? '';
 const tax = process.env.BANK_RECEIPT_TAX_MODE ?? '';
 const configured = /^\d{10,16}$/.test(account) && Boolean(holder) && ['taxable','taxfree'].includes(tax)
  && /^[0-9a-f]{64}$/i.test(process.env.BANK_RECEIPT_ENCRYPTION_KEY ?? '')
  && /^\d{10}$/.test(process.env.POPBILL_CORP_NUM ?? '')
  && Boolean(process.env.POPBILL_LINK_ID && process.env.POPBILL_SECRET_KEY && process.env.POPBILL_USER_ID);
 return { account, holder, tax, configured, enabled: configured && process.env.VERCEL_ENV !== 'preview' && process.env.BANK_TRANSFER_ENABLED === 'true' && process.env.POPBILL_IS_TEST === 'false' };
}
function encryptionKey() {
 const hex = process.env.BANK_RECEIPT_ENCRYPTION_KEY ?? '';
 if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('Receipt encryption key missing');
 return Buffer.from(hex, 'hex');
}
export function encryptIdentity(value: string, order: string) {
 const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
 cipher.setAAD(Buffer.from(order));
 const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
 return ['v1', iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(':');
}
export function decryptIdentity(value: string, order: string) {
 const [version, iv, tag, data] = value.split(':');
 if (version !== 'v1') throw new Error('Unknown receipt encryption version');
 const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'hex'));
 cipher.setAAD(Buffer.from(order)); cipher.setAuthTag(Buffer.from(tag, 'hex'));
 return Buffer.concat([cipher.update(Buffer.from(data, 'hex')), cipher.final()]).toString('utf8');
}
export async function bankOrder(user: string, orderNumber: string) {
 const db = createServiceRoleClient();
 const {data: order,error} = await db.from('event_payment_orders').select('order_number,event_id,amount,status,created_at').eq('order_number',orderNumber).eq('user_id',user).eq('provider','kb_transfer').maybeSingle();
 if (error) throw error;
 if (!order) throw new Error('Bank transfer order not found');
 const [request, receipt] = await Promise.all([
  db.from('bank_transfer_requests').select('match_code,account_number,account_holder,expires_at,receipt_kind,identity_hint').eq('order_number',orderNumber).single(),
  db.from('bank_cash_receipts').select('status,confirm_num,trade_date').eq('order_number',orderNumber).maybeSingle(),
 ]);
 if (request.error || receipt.error) throw request.error || receipt.error;
 return { provider:'kb_transfer', orderNumber, eventId:order.event_id, amount:order.amount, status:order.status,
  completed:order.status==='completed', bankName:'KB국민은행', ...request.data, receipt:receipt.data };
}
export async function createBankOrder(client: SupabaseClient, user: string, body: Record<string, unknown>) {
 const settings = bankSettings();
 if (!settings.enabled) throw new Error('Bank transfer is not enabled yet');
 const event = String(body.eventId ?? '');
 const code = String(body.code ?? '').trim().toUpperCase();
 if (!/^[a-f0-9-]{36}$/i.test(event) || (code && !/^[A-Z0-9_-]{4,24}$/.test(code)) || body.termsAccepted !== true) throw new Error('Confirm the terms before payment');
 const db = createServiceRoleClient();
 const {data:active,error:activeError} = await db.from('event_payment_orders').select('order_number,provider').eq('event_id',event).eq('user_id',user).in('status',['pending_auth','charging','refunding']).maybeSingle();
 if (activeError) throw activeError;
 if (active) {
  if (active.provider !== 'kb_transfer') throw new Error('Another payment is in progress');
  return bankOrder(user,active.order_number);
 }
 const {data:quote,error} = await client.rpc('event_checkout_quote',{p_event:event,p_code:code||null});
 if (error) throw error;
 if (!quote || (code && quote.code_valid !== true)) throw new Error('Invalid checkout or discount code');
 const kind = quote.final_amount === 0 ? 'self' : body.receiptKind;
 const identity = receiptIdentity(kind,body.receiptIdentity);
 const order = `RNDY-B-${randomUUID()}`;
 const hint = kind === 'self' ? '자진발급' : '*'.repeat(identity.length-4)+identity.slice(-4);
 const {data:created,error:createError} = await db.rpc('bank_transfer_create',{
  p_user:user,p_event:event,p_order:order,p_code:code||null,p_quote:quote,
  p_match_code:'R'+randomBytes(4).toString('hex').slice(0,7).toUpperCase(),
  p_account:settings.account,p_holder:settings.holder,p_kind:kind,p_cipher:encryptIdentity(identity,order),p_hint:hint,p_tax:settings.tax,
 });
 if (createError) throw createError;
 return bankOrder(user,String(created));
}
