export type ReceiptKind = 'personal' | 'business' | 'self';
export function receiptIdentity(kind: unknown, value: unknown) {
 if (!['personal', 'business', 'self'].includes(String(kind))) throw new Error('Choose a cash receipt type.');
 const identity = typeof value === 'string' ? value.replace(/[\s-]/g, '') : '';
 if (kind === 'self') return '0100001234';
 if (kind === 'personal' && !/^01[016789]\d{7,8}$/.test(identity)) throw new Error('Enter a Korean mobile number for your cash receipt.');
 if (kind === 'business' && !/^\d{10}$/.test(identity)) throw new Error('Enter a 10-digit business registration number.');
 return identity;
}
export function taxAmounts(total: number, mode: string) {
 if (!Number.isSafeInteger(total) || total <= 0 || total > 999_999_999) throw new Error('Invalid receipt amount');
 if (!['taxable', 'taxfree'].includes(mode)) throw new Error('Tax mode must be explicitly configured');
 const supply = mode === 'taxfree' ? total : Math.round(total * 10 / 11);
 return { totalAmount: String(total), supplyCost: String(supply), tax: String(total - supply), serviceFee: '0', taxationType: mode === 'taxfree' ? '비과세' : '과세' };
}
export function koreaDate(value: Date) {
 return new Date(value.getTime() + 9 * 3600_000).toISOString().slice(0, 10).replaceAll('-', '');
}
export function bankTimestamp(value: string) {
 if (!/^\d{14}$/.test(value)) throw new Error('Invalid bank timestamp');
 const iso = `${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T${value.slice(8,10)}:${value.slice(10,12)}:${value.slice(12,14)}+09:00`;
 const date = new Date(iso);
 if (!Number.isFinite(date.getTime()) || koreaDate(date) !== value.slice(0,8)) throw new Error('Invalid bank timestamp');
 return date.toISOString();
}
export function bankAmount(value: string) {
 if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 2_147_483_647) throw new Error('Invalid bank amount');
 return Number(value);
}
export function receiptState(state: number) {
 return state === 304 ? 'reported' : state === 300 ? 'issued' : 'review';
}
