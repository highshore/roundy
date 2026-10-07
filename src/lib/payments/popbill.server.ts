import 'server-only';
import popbill from 'popbill';

export class ProviderError extends Error {
 constructor(readonly code: string) { super(`Popbill ${code}`); }
}
let initialized = false;
export function popbillService(kind: 'bank' | 'receipt') {
 if (!initialized) {
  if (!process.env.POPBILL_LINK_ID || !process.env.POPBILL_SECRET_KEY || !['true','false'].includes(process.env.POPBILL_IS_TEST ?? '')) throw new Error('Popbill configuration required');
  popbill.config({ LinkID: process.env.POPBILL_LINK_ID, SecretKey: process.env.POPBILL_SECRET_KEY,
   IsTest: process.env.POPBILL_IS_TEST === 'true', IPRestrictOnOff: true, UseStaticIP: false, UseLocalTimeYN: true });
  initialized = true;
 }
 return kind === 'bank' ? popbill.EasyFinBankService() : popbill.CashbillService();
}
// Do not log SDK messages: they may contain receipt identity or account data.
export function providerCall<T>(kind: 'bank' | 'receipt', method: string, args: unknown[]): Promise<T> {
 return new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new ProviderError('timeout')), 12_000);
  const success = (value: T) => { clearTimeout(timer); resolve(value); };
  const failure = (error: { code?: number }) => { clearTimeout(timer); reject(new ProviderError(String(error?.code ?? 'unavailable'))); };
  try { const service = popbillService(kind); service[method](...args, success, failure); }
  catch { clearTimeout(timer); reject(new ProviderError('configuration_or_transport')); }
 });
}
