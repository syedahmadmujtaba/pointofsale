# Single-business POS and accounting implementation

Each installation owns one database. Preserve existing account IDs/history. Migrations are explicit deployment operations, not startup side effects.

## Implemented in code

- [x] Exact two-decimal money validation and balanced journal posting.
- [x] Account-code resolution, business mappings and account creation.
- [x] Sales, purchases, returns and expenses use the shared posting engine.
- [x] Immutable journals, reversal/replacement history and period locks.
- [x] Fresh schema account seeds; atomic migrations, checksums and existing baseline validation.
- [x] Separate invoice recognition and payments; partial settlement, advances and allocations.
- [x] Due dates, customer credit limits and opening customer/vendor balances.
- [x] Current outstanding/aging reports with separate advances.
- [x] Weighted-average inventory value, saved transaction costs and cumulative return limits.
- [x] Service items, stock movements, adjustments and warehouse transfers.
- [x] Trial balance, ledgers, profit/loss fixes and bank reconciliation.
- [x] Authentication, role checks, maker/checker manual journals and audit events.
- [x] Business settings and accounting operations UI.
- [x] Automated isolated database tests covering financial invariants and operations.

## Remaining implementation and acceptance

- [ ] Propagate business currency, tax defaults, branding and numbering through every legacy POS screen/printout. Non-PKR rollout is not ready.
- [ ] Complete historical customer/vendor statement reconstruction and opening/closing balances by date.
- [ ] Review legacy product movement/report screens against the new stock ledger.
- [ ] Add controlled account editing/deactivation and historical reporting classification independent of current posting mappings.
- [ ] Add user management/session revocation and improve role-specific UI navigation.
- [ ] Browser-based acceptance of complete clerk/accountant/admin workflows.
- [ ] Neon staging migration and concurrency testing (local tests are PostgreSQL-compatible, not hosted Neon).
- [ ] Audit actual historical journals against source documents; approve correction amounts and reconcile legacy outstanding balances without rewriting history.
- [ ] Apply approved production migrations, create users, configure secret/settings and reconcile opening balances before production release.

No real Neon migration or historical correction was performed during this implementation. Country-specific tax/accounting requirements and advanced industry modules need a separately agreed scope.
