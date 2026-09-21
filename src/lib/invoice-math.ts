import { AccountingValidationError, decimal, toMinorUnits } from './accounting.ts';

export function calculateInvoice(items: {quantity:number; price:unknown}[], discount: unknown = 0, tax: unknown = 0) {
  if (!Array.isArray(items) || !items.length) throw new AccountingValidationError('At least one item is required');
  const lines = items.map(item => {
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) throw new AccountingValidationError('Quantity must be a positive integer');
    const amount = toMinorUnits(item.price) * item.quantity;
    if (!Number.isSafeInteger(amount)) throw new AccountingValidationError('Line amount is too large');
    return amount;
  });
  const subtotal = lines.reduce((a,b) => a+b,0);
  const reduction = toMinorUnits(discount);
  const taxAmount = toMinorUnits(tax);
  if (reduction > subtotal) throw new AccountingValidationError('Discount exceeds subtotal');
  const total = subtotal-reduction+taxAmount;
  toMinorUnits(decimal(total));
  if (!total) throw new AccountingValidationError('Invoice total must be positive');
  // Allocate discount deterministically; remaining cents go to the last line.
  let allocated = 0;
  const netLines = lines.map((amount,index) => {
    const part = index===lines.length-1 ? reduction-allocated : Number(BigInt(amount)*BigInt(reduction)/BigInt(subtotal));
    allocated += part;
    return amount-part;
  });
  return { subtotal, discount: reduction, tax: taxAmount, total, lines, netLines };
}
