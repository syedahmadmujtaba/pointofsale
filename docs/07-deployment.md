# Deployment and migration runbook

## Deployment assumptions

The application uses normal `next build` and `next start`. It does not contain Docker packaging or `output: standalone`. Migrations never run automatically during build/start and must be an explicit release step.

## Safe Neon rollout

1. Commit/review application changes.
2. Create a Neon branch or verified backup from production.
3. Configure the branch connection in a secure deployment environment.
4. Install exact dependencies with `npm ci`.
5. Run automated tests and production build.
6. Inspect migrations without mutation: `npm run migrate -- --status`.
7. Apply migrations to the Neon branch: `npm run migrate`.
8. Create the single admin with `npm run user:create` and remove its plaintext creation password from the environment.
9. Log in and configure business/account mappings.
10. Run reconciliation diagnostics and execute the manual acceptance checklist.
11. Review/approve historical correction journals separately.
12. Repeat the status/apply procedure against production during a controlled release.
13. Smoke-test login, sale, payment, return, purchase and reporting after release.

## Commands

```bash
npm ci
npm run test:accounting
npx tsc --noEmit
npm run build
npm run migrate -- --status
npm run migrate
npm run user:create
npm start
```

## Migration guarantees and limits

Pending files are applied atomically under an advisory lock. A failure rolls back the whole pending batch. A checksum mismatch stops execution. This protects schema deployment; it is not a production rollback system. Once application users create engine-version-2 transactions, reverting the app/schema requires a planned forward migration or a coordinated database restore.

## Historical data gate

The earlier database inspection found legacy classification problems, including sale credits posted to retained earnings rather than sales revenue. Do not automatically rewrite those rows. Export reconciliation results, agree correction dates/amounts with the business owner/accountant, post reviewed correcting entries and retain the originals.

At minimum reconcile:

- Cash and bank against statements/cash count.
- Customer receivables against invoice-level balances.
- Vendor payables against bills/statements.
- Physical stock against quantity and `inventory_value`.
- Sales revenue, tax, COGS and expenses for legacy periods.
- Owner equity/retained earnings after corrections.

## Failure handling

If migration application fails, capture the redacted error, leave the application on the prior release, and diagnose on a branch. Do not edit a migration that has already been successfully applied; add a new numbered migration. Do not delete or update posted journals to force reconciliation.

## Secrets

Use the hosting provider's secret store. Neon URLs and passwords must never be printed or committed. Rotate any exposed database password/session secret. `SESSION_SECRET` rotation logs out all users, which is acceptable but should be scheduled.
