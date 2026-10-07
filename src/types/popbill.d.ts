declare module 'popbill' {
 type Service = Record<string, (...args: unknown[]) => void>;
 const popbill: { config(value: Record<string, unknown>): void; EasyFinBankService(): Service; CashbillService(): Service };
 export default popbill;
}
