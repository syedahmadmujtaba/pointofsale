# Authentication and configuration

## Login model

Users live in `app_users`. Passwords are stored as per-user salted scrypt hashes, not plaintext. Login normalizes the username, checks the active flag and uses timing-safe hash comparison. `login_attempts` limits a username to 10 attempts in a 15-minute window.

A successful login issues `pos_session`, an HMAC-SHA-256 signed payload containing user ID, username, role and expiry. It is HTTP-only, `SameSite=Strict`, Secure in production and expires after one hour. There is no server-side session table, so disabling a user does not revoke a previously issued cookie immediately.

## Access enforcement

All screens/APIs except login require a valid session. Browser pages redirect to login; APIs return 401. API writes require an exact same-origin `Origin` header. Middleware discards spoofed identity headers and injects the verified user ID/role.

The code supports `admin`, `accountant`, `clerk` and `viewer`. Viewer writes are blocked; clerk access to accounting/payments/inventory and DELETE operations is blocked; settings writes require admin. The current business intends to create only one admin, which receives normal full route access.

Current exception: manual journal approval requires another administrator, so a single admin can propose but cannot approve their own journal. This must be simplified or given an explicit owner override before that feature is usable in single-admin operation.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Runtime PostgreSQL/Neon connection. |
| `DATABASE_URL_UNPOOLED` | Recommended for migration | Direct database connection used preferentially by the migration runner. |
| `SESSION_SECRET` | Yes | At least 32 random characters for cookie signatures. |
| `POS_USERNAME` | User creation only | Username for `npm run user:create`. |
| `POS_PASSWORD` | User creation only | Initial password, 12–1024 characters. Remove after creation. |
| `POS_ROLE` | Optional | Initial role; defaults to `admin`. |

Never commit `.env` files. They are ignored by Git. Do not copy credentials into documentation, tickets or logs.

## Business settings

The singleton `business_settings` row stores business name, currency, fiscal-year start month, closed-through date, default tax rate, sale/purchase prefixes and weighted-average costing. Currency cannot be changed after journals exist. Closing cannot move backward through the normal API.

For the current Pakistan-only deployment, currency should remain `PKR`. Multi-currency conversion does not exist. Older UI labels are already PKR, but all screens still need consistent formatting and settings propagation.

## Creating the single administrator

Apply migrations first, then set the temporary `POS_*` values and run:

```bash
npm run user:create
```

The command inserts the hashed account into the configured database. Environment variables alone do not create a database user. Remove `POS_PASSWORD` afterward. There is currently no in-app password-change/reset or user-management screen.
