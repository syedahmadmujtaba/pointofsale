# HTTP API and screens

## API conventions

Routes use JSON request/response bodies. Protected writes must be same-origin and authenticated. Validation failures normally return `{ "error": "..." }` with HTTP 400; unauthenticated requests return 401 and denied permissions return 403. Financial operations are transactional.

## Core resource routes

| Route | Methods | Responsibility |
|---|---|---|
| `/api/customer`, `/api/customer/[id]` | GET, POST, PUT, DELETE | Customer records. |
| `/api/vendor`, `/api/vendor/[id]` | GET, POST, PUT, DELETE | Vendor records. |
| `/api/brand`, `/api/brand/[id]` | GET, POST, PUT, DELETE | Product brands. |
| `/api/category`, `/api/category/[id]` | GET, POST, PUT, DELETE | Product categories. |
| `/api/product`, `/api/product/[id]` | GET, POST, PUT, DELETE | Stock/service product catalogue. |
| `/api/product/demand` | GET | Product demand data. |
| `/api/productreport` | GET | Legacy product report endpoint. |
| `/api/sale`, `/api/sale/[id]` | GET, POST, PUT, DELETE | Sales list/create/detail/replace/void. |
| `/api/purchase`, `/api/purchase/[id]` | GET, POST, PUT, DELETE | Purchases list/create/detail/replace/void rules. |
| `/api/sale_item/[id]`, `/api/purchase_item/[id]` | GET | Legacy item lookups. |
| `/api/expense`, `/api/expense/[id]` | GET, POST, PUT, DELETE | Expense creation, replacement and reversal/void. |
| `/api/sales-returns`, `/api/sales-returns/[id]` | GET, POST, PUT, DELETE | Sale returns; posted PUT is rejected, DELETE reverses. |
| `/api/purchase-returns`, `/api/purchase-returns/[id]` | GET, POST, PUT, DELETE | Purchase returns; posted PUT is rejected, DELETE reverses. |

## Payment and accounting routes

| Route | Methods | Responsibility |
|---|---|---|
| `/api/payments` | GET, POST | List payments; record receipt/supplier payment with allocations. |
| `/api/payments/[id]` | PUT, DELETE | Allocate an existing advance; reverse payment. |
| `/api/accounting/settings` | GET, PUT, POST | Read settings/accounts/mappings; update settings/mappings; add an account. |
| `/api/accounting/credit-limits` | PUT | Set or clear a customer's credit limit. |
| `/api/accounting/openings` | POST | Create customer/vendor opening balance. |
| `/api/accounting/journals` | GET, POST | List/propose manual journals and approve pending proposals. |
| `/api/accounting/reconcile` | GET, POST | List uncleared account rows and complete reconciliation. |
| `/api/accounting/reports` | GET | Trial balance, ledger, P&L, aging/statement, audit and diagnostics. |
| `/api/inventory` | GET, POST | Warehouses, stock, movements, create warehouse, transfer or adjustment. |
| `/api/reports` | GET | Legacy sales, P&L, balance sheet, customer and vendor reports. |

Accounting report query `type` values are `trial-balance`, `ledger`, `profit-loss`, `aging`, `statement`, `audit` and `reconciliation`. Aging/statement is current-state only and rejects historical as-of requests.

## Authentication routes

- `POST /api/auth/login` validates username/password, throttles failures and sets the session cookie.
- `POST /api/auth/logout` clears the session cookie.

## Screen catalogue

| Area | Screens |
|---|---|
| Access | Login and logout action. |
| Overview | Dashboard. |
| Parties | Customer and vendor maintenance. |
| Products | Product maintenance, categories, demand, product report and stock report. |
| Sales | List, new sale, detail, edit, quotation and return. |
| Purchases | List, new purchase, detail, edit, quotation and return. |
| Expenses | Expense list and maintenance. |
| Reports | Legacy operational/financial report screen. |
| Accounting | Payments, reports, settings, inventory, journals, opening balances and bank reconciliation tabs. |

## UI caveats

The Accounting screen exposes most new controls but is deliberately functional rather than a finalized accounting UX. Several legacy screens still hardcode PKR labels, locally generate identifiers or do not consume all business settings. Some old report/product views are not fully reconciled with the new stock ledger. Server rules remain authoritative even when an older UI does not expose every field.
