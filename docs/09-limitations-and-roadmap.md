# Limitations and roadmap

## Deployment blockers or decisions

1. **Neon is not migrated.** Validate status and migrate a Neon branch before production.
2. **Historical accounting is not corrected.** Review source documents and approve correction journals/opening balances.
3. **Single-admin manual journals conflict with maker/checker.** Decide on direct admin posting, an explicit owner confirmation step or a second approver. Current one-admin use cannot approve its own proposal.
4. **Browser acceptance is incomplete.** Complete the end-to-end checklist on hosted Neon.

## Functional gaps

- Business name, invoice prefixes, default tax and formatting are not propagated through every legacy screen/printout.
- Several legacy screens hardcode PKR. This matches current Pakistan scope but should use one shared formatter.
- Historical as-of customer/vendor statement reconstruction is not implemented.
- Legacy product movement/report views require reconciliation with `stock_movements` and `inventory_value`.
- Account editing/deactivation workflows are limited.
- Current account mappings affect report classification logic in places; historical classification should be independent of future mapping changes.
- The Accounting UI only provides one invoice allocation per payment submission, although the backend accepts multiple.
- User administration, password change/reset and immediate session revocation are not implemented.
- Role-specific navigation is incomplete; current deployment only needs admin.
- Audit events are not immutable at database level.

## Explicit scope boundaries

The system is single-currency PKR and uses two decimal places. It uses integer stock quantities. It does not currently provide foreign currency, batch/serial tracking, expiry tracking, manufacturing/BOM, payroll, fixed-asset depreciation, project accounting, consolidated entities or statutory electronic tax submission.

Pakistan operation does not automatically mean Pakistan tax compliance. FBR/PRA/SRB or industry-specific invoice requirements, tax registration details, withholding, tax-return exports and legal document sequencing need a separate compliance specification and professional review.

## Recommended implementation order

1. Simplify authentication/approval for the agreed single-admin operating model.
2. Centralize PKR formatting, business branding, invoice numbering and tax defaults.
3. Complete legacy report/stock-ledger alignment.
4. Add historical statements and stable historical account classification.
5. Run hosted Neon concurrency and browser acceptance tests.
6. Reconcile/approve historical balances and corrections.
7. Perform controlled production migration and post-release reconciliation.

## Definition of production-ready for this installation

Production-ready means migrations succeed on a Neon branch; the sole admin can complete every required workflow; PKR invoices/reports are consistent; opening and historical balances are approved; cash, receivables, payables and inventory reconcile; automated/build/manual checks pass; backups and recovery are verified; and known out-of-scope requirements are accepted by the business owner.
