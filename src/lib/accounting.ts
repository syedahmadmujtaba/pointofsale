import type { PoolClient } from 'pg';

export class AccountingValidationError extends Error {}

// Decimal strings avoid silently rounding client input or accumulating float errors.
export function toMinorUnits(value: unknown): number {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new AccountingValidationError('Amount must be a decimal number');
  }
  const text = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new AccountingValidationError('Amount must be non-negative with at most two decimal places');
  }
  const [whole, fraction = ''] = text.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  // Existing NUMERIC(15,2) ledger columns.
  if (!Number.isSafeInteger(minor) || minor > 999_999_999_999_999) {
    throw new AccountingValidationError('Amount is too large');
  }
  return minor;
}

export function decimal(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new AccountingValidationError('Invalid minor-unit amount');
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;
}

export interface JournalLine {
  accountId: number;
  debit?: string | number;
  credit?: string | number;
  description?: string;
}

export function validateJournal(lines: JournalLine[]) {
  if (lines.length < 2) throw new AccountingValidationError('A journal needs at least two lines');
  let debits = BigInt(0);
  let credits = BigInt(0);
  const normalized = lines.map((line) => {
    const debit = toMinorUnits(line.debit ?? 0);
    const credit = toMinorUnits(line.credit ?? 0);
    if (!Number.isSafeInteger(line.accountId) || line.accountId <= 0 ||
        (debit === 0) === (credit === 0)) {
      throw new AccountingValidationError('Each line needs a valid account and exactly one positive debit or credit');
    }
    debits += BigInt(debit);
    credits += BigInt(credit);
    return { ...line, debit: decimal(debit), credit: decimal(credit) };
  });
  if (debits !== credits) throw new AccountingValidationError('Journal debits and credits must balance');
  return normalized;
}

export const accountDefaults = {
  cash: ['1000', 'ASSET'],
  bank: ['1010', 'ASSET'],
  receivable: ['1020', 'ASSET'],
  inventory: ['1030', 'ASSET'],
  taxRecoverable: ['1040', 'ASSET'],
  payable: ['2000', 'LIABILITY'],
  taxPayable: ['2100', 'LIABILITY'],
  equity: ['3000', 'EQUITY'],
  revenue: ['4000', 'REVENUE'],
  cogs: ['5000', 'EXPENSE'],
  stockAdjustment: ['5700', 'EXPENSE'],
  operatingExpense: ['5100', 'EXPENSE'],
  rentExpense: ['5200', 'EXPENSE'],
  utilitiesExpense: ['5300', 'EXPENSE'],
  salariesExpense: ['5400', 'EXPENSE'],
  maintenanceExpense: ['5500', 'EXPENSE'],
} as const;

export type AccountRole = keyof typeof accountDefaults;

export function expenseRole(category: unknown): AccountRole {
  switch (typeof category === 'string' ? category.trim().toLowerCase() : '') {
    case 'rent': return 'rentExpense';
    case 'utilities': case 'electricity': case 'water': case 'internet': return 'utilitiesExpense';
    case 'salaries': case 'wages': return 'salariesExpense';
    case 'maintenance': return 'maintenanceExpense';
    default: return 'operatingExpense';
  }
}

export async function resolveAccount(client: PoolClient, role: AccountRole): Promise<number> {
  const [defaultCode, expectedType] = accountDefaults[role];
  // Backward compatible until the mapping migration is applied.
  const table = await client.query("SELECT to_regclass('public.accounting_account_mappings') AS name");
  let code: string = defaultCode;
  if (table.rows[0].name) {
    const mapping = await client.query(
      'SELECT account_code FROM public.accounting_account_mappings WHERE role = $1', [role]
    );
    code = mapping.rows[0]?.account_code ?? code;
  }
  const result = await client.query(
    'SELECT account_id, account_type, is_active FROM public.chart_of_accounts WHERE account_code = $1 FOR SHARE',
    [code]
  );
  if (result.rows.length !== 1 || result.rows[0].account_type !== expectedType || !result.rows[0].is_active) {
    throw new AccountingValidationError(`Configure one active ${expectedType} account for ${role} (code ${code})`);
  }
  return result.rows[0].account_id;
}

/** Must run inside the caller's transaction, alongside the source document write. */
export async function postJournal(client: PoolClient, entry: {
  date: string;
  description: string;
  referenceType: string;
  referenceId: number;
  lines: JournalLine[];
  reversalOf?: number;
}): Promise<number> {
  const lines = validateJournal(entry.lines);
  await assertOpenPeriod(client, entry.date);
  const ids = [...new Set(lines.map((line) => line.accountId))];
  const accounts = await client.query(
    'SELECT account_id FROM public.chart_of_accounts WHERE account_id = ANY($1::int[]) AND is_active = true FOR SHARE',
    [ids]
  );
  if (accounts.rows.length !== ids.length) throw new AccountingValidationError('Journal contains missing, duplicate or inactive accounts');
  const header = await client.query(
    `INSERT INTO journal_entries (entry_date, description, reference_type, reference_id, is_posted, engine_version, reversal_of)
     VALUES ($1, $2, $3, $4, true, 2, $5) RETURNING journal_id`,
    [entry.date, entry.description, entry.referenceType, entry.referenceId, entry.reversalOf ?? null]
  );
  const id = header.rows[0].journal_id;
  for (const line of lines) {
    const description = line.description ?? entry.description;
    await client.query(
      `INSERT INTO journal_entry_lines (journal_id, account_id, debit_amount, credit_amount, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, line.accountId, line.debit, line.credit, description]
    );
    await client.query(
      `INSERT INTO general_ledger (transaction_date, account_id, debit_amount, credit_amount,
       description, reference_type, reference_id, journal_entry_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [entry.date, line.accountId, line.debit, line.credit, description, entry.referenceType, entry.referenceId, id]
    );
  }
  return id;
}

export function validDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) {
    throw new AccountingValidationError('A valid YYYY-MM-DD date is required');
  }
  return value;
}

export async function assertOpenPeriod(client: PoolClient, date: string) {
  validDate(date);
  const settings = await client.query('SELECT closed_through::text FROM business_settings WHERE id=true FOR SHARE');
  if (settings.rows[0]?.closed_through && date <= settings.rows[0].closed_through) {
    throw new AccountingValidationError('This accounting period is closed');
  }
}

export async function reverseJournal(client: PoolClient, journalId: number, date: string) {
  const header = await client.query('SELECT * FROM journal_entries WHERE journal_id=$1 FOR UPDATE', [journalId]);
  if (!header.rows.length) throw new AccountingValidationError('Journal not found');
  if (validDate(date)<new Date(header.rows[0].entry_date).toISOString().slice(0,10)) throw new AccountingValidationError('Reversal cannot precede original entry');
  if (header.rows[0].reversal_of) throw new AccountingValidationError('Cannot reverse a reversal');
  const prior = await client.query('SELECT journal_id FROM journal_entries WHERE reversal_of=$1', [journalId]);
  if (prior.rows.length) return prior.rows[0].journal_id;
  const lines = await client.query('SELECT account_id, debit_amount, credit_amount FROM journal_entry_lines WHERE journal_id=$1', [journalId]);
  return postJournal(client, {
    date, description: `Reversal: ${header.rows[0].description}`, referenceType: 'REVERSAL',
    referenceId: journalId, reversalOf: journalId,
    lines: lines.rows.filter(l => Number(l.debit_amount) || Number(l.credit_amount)).map(l => ({
      accountId: l.account_id, debit: l.credit_amount, credit: l.debit_amount,
    })),
  });
}

export async function reverseDocument(client: PoolClient, type: string, id: number, date: string) {
  const entries = await client.query(`SELECT j.journal_id FROM journal_entries j
    WHERE reference_type=$1 AND reference_id=$2 AND reversal_of IS NULL
    AND NOT EXISTS (SELECT 1 FROM journal_entries r WHERE r.reversal_of=j.journal_id)
    ORDER BY journal_id FOR UPDATE`, [type,id]);
  for (const row of entries.rows) await reverseJournal(client, row.journal_id, date);
}

export async function postExpense(client: PoolClient, expense: {
  id: number; amount: string | number; expense_date: string; description: string; category?: string;
}) {
  const expenseAccount = await resolveAccount(client, expenseRole(expense.category));
  const cashAccount = await resolveAccount(client, 'cash');
  return postJournal(client, {
    date: expense.expense_date, description: `Expense: ${expense.description}`,
    referenceType: 'EXPENSE', referenceId: expense.id,
    lines: [{ accountId: expenseAccount, debit: expense.amount }, { accountId: cashAccount, credit: expense.amount }],
  });
}
