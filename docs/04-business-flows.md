# Business workflows

## Credit sale and partial customer payment

```mermaid
sequenceDiagram
  participant A as Admin
  participant API as Sale API
  participant DB as Database
  A->>API: Credit sale for PKR 10,000
  API->>DB: Save invoice/items and reduce stock
  API->>DB: Dr AR / Cr revenue and tax; post COGS
  A->>API: Receipt PKR 4,000 allocated to invoice
  API->>DB: Dr cash or bank / Cr AR
  API->>DB: Set amount_paid to 4,000
  Note over DB: Outstanding = 6,000
```

A customer receipt can allocate to one or more invoices at API level. The current Accounting UI provides one invoice allocation per submission. A payment larger than allocations retains an unallocated advance, which can be allocated later. Allocations cannot exceed an invoice's current outstanding balance.

## Credit purchase and partial supplier payment

A credit purchase recognizes Inventory/Expense and Accounts Payable. Later supplier payments can be partial. For a PKR 20,000 purchase and PKR 8,000 payment, payable remains PKR 12,000. Unallocated supplier payments are treated as advances.

## Partial customer return

1. Lock the original sale and verify it is active and engine version 2.
2. Check requested quantities against original quantity less all previous completed returns.
3. Calculate return net value and proportional tax.
4. Split settlement into credit against outstanding and refund against previously paid value.
5. Restore stock and original book cost for stock items.
6. Post the return journal and update `credited_amount`/`amount_paid`.

A return cannot refund more than the customer has paid. A non-refunded portion cannot exceed outstanding receivable. This supports partial quantity return, partial cash refund and partial credit reduction in one transaction.

## Partial return to vendor

The workflow mirrors a customer return. Returned quantities cannot exceed the original purchase less prior completed returns, and stock must be available. The unpaid part reduces Accounts Payable; the already-paid part can be recorded as a cash/bank refund from the vendor. Inventory is removed at original net purchase value.

## Payment reversal

Reversal locks the payment and allocated documents, posts a reversing journal, subtracts its allocations from `amount_paid`, and marks the payment voided. It does not delete the original. Refund-dependent inconsistencies are rejected and must be reversed in a safe order.

## Invoice edit/void rules

- Legacy invoices cannot be edited or voided using the new engine.
- Opening documents cannot be edited like invoices.
- Associated active payments and completed returns must be reversed first.
- The original and replacement dates must be in open periods.
- A document revision snapshot and journal reversal preserve history.
- Stock purchase invoices are corrected through purchase returns, not direct edit/void.
- Supported sale void restores inventory/book cost and reverses journals.
- Editing an unpaid sale keeps it unpaid rather than creating an accidental cash receipt.

## Inventory flows

Stock products affect quantity and value; services do not. Purchases add stock. Sales consume Main warehouse stock. Warehouse transfers require sufficient source quantity and have no GL effect. Count adjustments require a reason and post the value difference. All quantities are whole integers.

## Period close

The administrator sets `closed_through`. New documents, journals, adjustments and reversals dated on or before that date are rejected. Closing may move forward but cannot be reopened through the normal settings API. Reopening requires an explicit controlled migration/review.

## Bank reconciliation

Select uncleared Cash/Bank ledger entries up to a statement date. The submitted balance must equal the previous reconciled statement balance plus signed selected debits less credits. Selected ledger rows become uniquely associated with the reconciliation and cannot be cleared twice.

## Idempotency and retries

Payment creation requires a unique request key. Concurrent retries serialize on that key. An exact retry returns the existing payment; a changed amount, date, party, method, reference or allocation list using the same key is rejected. The Accounting UI retains the key after a failed network attempt for the same form payload.
