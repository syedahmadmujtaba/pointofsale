# Cloud POS and accounting

Single-business installation with its own PostgreSQL/Neon database. No Docker or standalone build is required.

## Setup and deployment

Use Node.js 22.15 or newer. Install dependencies with npm ci.
Configure DATABASE_URL and SESSION_SECRET (a securely generated secret of at least 32 characters) in the hosting environment. DATABASE_URL_UNPOOLED is optional and preferred for migrations. Never commit credentials.

Run these commands against a disposable/staging database first:

```bash
npm run migrate -- --status
npm run migrate
npm run user:create
npm run build
npm start
```

Before user:create, supply POS_USERNAME, POS_PASSWORD (at least 12 characters), and optionally POS_ROLE through your secure environment. Roles are admin, accountant, clerk, and viewer. Create a second administrator for maker/checker journal approvals. No default login or password is seeded.

Migrations do NOT run automatically during build or application startup. Add npm run migrate as an explicit release/deployment step before exposing the new application. Back up or branch Neon before migration. The runner applies pending migrations in one transaction, serializes migration runs, records checksums, and validates expected baseline tables/columns before adopting an existing database. --status is read-only. Schema validation is not an accounting reconciliation.

## Implemented workflows

- Balanced double-entry journals with matching ledger entries, account-code mappings, immutable posted entries, reversal history and closed-period checks.
- Separate invoice recognition and settlement; credit sales/purchases, partial receipts, supplier payments, advances, allocations, due dates and customer credit limits.
- Discount/tax allocation, cumulative returns, original sale cost restoration, weighted-average stock valuation, service items, adjustments and warehouse transfers.
- Trial balance, account ledgers, current outstanding/aging, net profit and balance-sheet reports, reconciliation diagnostics and audit history.
- Configurable account creation/mappings and business settings; reviewed manual journals, opening customer/vendor balances and bank reconciliation.
- Signed session authentication, same-origin write checks and role restrictions.

The Accounting screen contains these operational forms. Sales and purchase entry include cash/credit options. Product entry offers stock or service items.

## Verification

```bash
npm run test:accounting
npx tsc --noEmit
npm run build
```

The accounting suite uses an isolated PostgreSQL-compatible PGlite database, not Neon. It exercises migrations/rollback/checksums, journals, credit/payment lifecycles, rounding, returns, warehouse guards, approvals, reconciliation, authentication and permissions. A Neon staging smoke test and browser workflow acceptance are still required before production.

## Current boundaries and rollout gates

- Historical postings are preserved, not repaired. Legacy invoices are blocked from new editing/payment/return workflows until reconciled. Review the reconciliation report and approve correcting journals; do not assume balanced historical journals are correctly classified.
- Money currently uses two decimal places and one currency per installation. Legacy POS screens still contain PKR labels; full propagation of currency, default tax, business branding and numbering to all existing screens remains unfinished. Do not deploy a non-PKR installation yet.
- Aging/statements use current settlement state, not historical as-of reconstruction. The ledger supports historical dates. Advances are shown separately.
- Invoices operate from Main warehouse. Transfer other-location stock to Main before sale; valuation remains pooled across warehouses.
- Posted stock purchases are corrected with returns, not edits. Reverse associated payments/returns before editing sales. Editing an unpaid sale does not automatically collect money.
- Account mapping changes after transactions require accounting review; historical postings are not automatically reclassified. Do not change COGS mappings on a live ledger without a reviewed reporting/reclassification plan.
- Sessions expire after one hour. User/role changes do not revoke existing signed sessions immediately. User administration currently uses the command-line creation script.
- Country-specific tax compliance, multi-currency, fractional stock quantities, payroll, manufacturing and comprehensive fixed-asset accounting are not implemented.

See IMPLEMENTATION_PLAN.md for remaining work. This code is not a claim of suitability for every industry or statutory reporting requirement.
