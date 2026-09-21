# Accounting model

## Money and journal rules

Application money input accepts a nonnegative decimal with at most two fractional digits. It is converted to integer paisa/minor units for calculations and converted back to fixed two-decimal strings for PostgreSQL `numeric` columns. JavaScript floating-point totals are not trusted for journal balance.

Every journal:

- Has at least two lines.
- Has exactly equal total debits and credits.
- Uses active accounts of the expected account type.
- Has one positive debit or one positive credit per line, never both.
- Is created in the same transaction as its source document.
- Cannot be posted in or before `closed_through`.
- Is corrected by a dated reversal, not mutation/deletion.

## Default chart of accounts

| Code | Account | Type | Posting role |
|---|---|---|---|
| 1000 | Cash | Asset | `cash` |
| 1010 | Bank Account | Asset | `bank` |
| 1020 | Accounts Receivable | Asset | `receivable` |
| 1030 | Inventory | Asset | `inventory` |
| 1040 | Tax Recoverable | Asset | `taxRecoverable` |
| 2000 | Accounts Payable | Liability | `payable` |
| 2100 | Tax Payable | Liability | `taxPayable` |
| 3000 | Owner Equity | Equity | `equity` |
| 3100 | Retained Earnings | Equity | reporting/legacy |
| 4000 | Sales Revenue | Revenue | `revenue` |
| 5000 | Cost of Goods Sold | Expense | `cogs` |
| 5100 | Operating Expenses | Expense | `operatingExpense` |
| 5200 | Rent Expense | Expense | `rentExpense` |
| 5300 | Utilities Expense | Expense | `utilitiesExpense` |
| 5400 | Salaries Expense | Expense | `salariesExpense` |
| 5500 | Maintenance Expense | Expense | `maintenanceExpense` |
| 5700 | Inventory Adjustments | Expense | `stockAdjustment` |

Mappings can point a role to another unique active account code, but its account type must match the role. Changing a mapping affects future postings; it does not reclassify history.

## Posting logic

### Sale invoice

A sale is always recognized through receivables first. A cash sale then creates a separate receipt and allocation in the same transaction.

| Debit | Credit |
|---|---|
| Accounts Receivable — gross invoice | Sales Revenue — subtotal less discount |
| Cost of Goods Sold — stock book cost | Tax Payable — invoice tax |
| | Inventory — stock book cost |

Service items create revenue but no inventory/COGS lines. A cash receipt debits Cash/Bank and credits Accounts Receivable.

### Purchase invoice

| Debit | Credit |
|---|---|
| Inventory — discounted net value of stock items | Accounts Payable — gross invoice |
| Operating Expense — discounted net service value | |
| Tax Recoverable — invoice tax | |

A cash supplier payment debits Accounts Payable and credits Cash/Bank.

### Customer receipt and supplier payment

Customer receipt: debit Cash/Bank, credit Accounts Receivable. Supplier payment: debit Accounts Payable, credit Cash/Bank. A payment may be partly/fully allocated or left as an advance. Allocation changes document settlement state but does not create another journal because the payment journal already recognized the control-account movement.

### Sale return

The return debits Sales Revenue and Tax Payable. The unpaid portion credits Accounts Receivable; an immediate refund credits Cash/Bank. For stock, Inventory is debited and COGS credited at original saved cost.

### Purchase return

The unpaid portion debits Accounts Payable; an immediate vendor refund debits Cash/Bank. Inventory, service expense and recoverable tax are credited for returned value. Stock returns use the original invoice net value.

### Expense

Debit the category-mapped expense and credit Cash. Categories map rent, utilities/electricity/water/internet, salaries/wages and maintenance to their specialized accounts; all other categories use Operating Expenses.

### Inventory adjustment

An increase debits Inventory and credits Inventory Adjustments. A decrease debits Inventory Adjustments and credits Inventory. Transfers between warehouses do not change total inventory value and therefore have no general-ledger journal.

### Opening balance

Customer opening balance debits Accounts Receivable and credits Owner Equity. Vendor opening balance debits Owner Equity and credits Accounts Payable. These use itemless opening documents so later payments can be allocated normally.

### Manual journal

User-supplied lines must balance and use valid active accounts. Current code creates a proposal and requires a different administrator to approve/post it. This conflicts with the intended one-admin deployment and is a documented remaining change.

## Invoice calculation

`subtotal = sum(quantity × unit price)`. The order discount is allocated proportionally across line totals in minor units, with the last line receiving any rounding residual. `total = subtotal - discount + tax`. The server ignores client-provided subtotal/total values and recalculates them.

## Inventory costing

The configured method is weighted average. Purchases add discounted stock-line value to `inventory_value`; average unit cost is recalculated. Sales remove a proportional portion of exact inventory value and save the exact line cost. Returns use cumulative proportional allocation so multiple partial returns collectively equal the original line value despite rounding.

## Reporting balances

Trial balance reports debits, credits and debit-minus-credit balance by account. Profit/loss presents revenue as credits minus debits and expenses as debits minus credits. Current outstanding reports use `total - credited - paid`. Historical as-of aging is not implemented; use the ledger for historical activity.
