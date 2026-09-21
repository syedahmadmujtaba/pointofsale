# Project documentation

This directory is the technical and operational reference for the cloud POS. It describes the code as it currently exists, including known gaps. The intended deployment is one Pakistani business per installation, one PostgreSQL/Neon database, one full-access administrator, and PKR accounting.

## Document map

1. [System architecture](./01-architecture.md) — stack, layers, source layout, transaction boundaries and request lifecycle.
2. [Database and migrations](./02-database.md) — tables, relationships, migration behavior, invariants and data ownership.
3. [Accounting model](./03-accounting.md) — chart of accounts, journal rules and debit/credit logic for every workflow.
4. [Business workflows](./04-business-flows.md) — sales, purchases, credit, partial payments, returns, inventory and closing.
5. [HTTP API and screens](./05-api-and-ui.md) — route catalogue, methods, screen catalogue and response behavior.
6. [Authentication and configuration](./06-auth-and-configuration.md) — login, session security, roles, environment and single-admin operation.
7. [Deployment and migrations](./07-deployment.md) — Neon deployment, migration sequence, admin creation, rollback posture and release checklist.
8. [Testing and operations](./08-testing-and-operations.md) — automated coverage, manual acceptance, monitoring and reconciliation.
9. [Limitations and roadmap](./09-limitations-and-roadmap.md) — incomplete areas, risk boundaries and recommended order of work.

## Important status

The local code compiles and its automated suite passes. The new migrations have **not** been applied to the real Neon database by the implementation work documented here. Historical entries have not been corrected. Always run migration status and use a Neon branch/backup before changing production.

When code and documentation disagree, code is the runtime authority. Update these documents in the same change whenever an accounting rule, schema, route, permission or deployment process changes.
