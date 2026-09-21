# Testing and operations

## Automated verification

Run `npm run test:accounting`. The suite currently covers:

- Exact decimal parsing and invalid precision.
- Balanced/split journal validation.
- Account mapping type validation.
- Shared expense categorization/posting.
- Full fresh migration sequence.
- Migration read-only status, atomic rollback, rerun and checksum failure.
- Credit purchase and sale lifecycle.
- Partial payment, reversal and exact idempotent retry.
- Changed-payload idempotency rejection.
- Customer advances and later allocation.
- Discount/tax rounding and exact inventory value.
- Sale/purchase return and return voiding.
- Overselling rollback and journal balance.
- Accounting and legacy report execution.
- Journal/ledger immutability.
- Period close enforcement.
- Manual-journal maker/checker controls.
- Warehouse transfer stock guard.
- Bank reconciliation balance/duplicate guards.
- Session signature, expiry, role, origin and logout behavior.

Tests use an isolated PGlite database. They do not connect to Neon and do not prove hosted-network, pooling or production concurrency behavior.

## Build verification

Run `npx tsc --noEmit` and `npm run build`. The current production build succeeds. Existing React Hook dependency warnings should be cleaned up but are not build failures.

## Manual acceptance checklist

On a Neon branch, verify:

1. Anonymous API access is rejected and admin login/logout works.
2. Create a stock item and a service item.
3. Post a credit purchase, partial supplier payment and partial vendor return/refund.
4. Post a credit sale, partial customer receipt and partial sale return/refund.
5. Confirm invoice outstanding amounts and party statements after every step.
6. Confirm product stock and inventory value after purchase/sale/returns.
7. Confirm every new journal balances and trial-balance total is zero.
8. Reverse payments/returns and confirm original history remains.
9. Create/transfer/adjust warehouse stock and test insufficient stock rejection.
10. Close a test period and confirm backdated writes/reversals are rejected.
11. Reconcile a cash/bank statement and confirm rows cannot be cleared twice.
12. Verify invoices/reports display PKR consistently and print correctly.

## Operational controls

Run reconciliation diagnostics after migration, after correction journals and at each period close. Monitor application 4xx/5xx rates, database connection exhaustion, transaction/deadlock errors, failed logins and migration output. Back up/branch before releases and before historical correction batches.

Audit events provide application-level actor/change history, while immutable journals provide accounting history. Audit rows currently lack database immutability protection, so database-administrator access remains a trusted boundary.

## Core reconciliation equations

- Every journal: `sum(debits) = sum(credits)`.
- Whole ledger: `sum(debits - credits) = 0`.
- Invoice outstanding: `total - credited - paid`.
- Payment available: `payment amount - active allocations`.
- Product stock: opening quantity plus stock movements (subject to legacy opening/migration history).
- Inventory control account should reconcile to total `products.inventory_value` after approved legacy/opening corrections.

Investigate differences; never force balance by editing journal or ledger rows.
