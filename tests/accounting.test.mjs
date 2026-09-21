import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toMinorUnits, validateJournal, expenseRole, resolveAccount, postJournal } from '../src/lib/accounting.ts';

test('money retains exact decimal amounts and rejects invalid precision', () => {
  assert.equal(toMinorUnits('0.29'), 29);
  assert.equal(toMinorUnits('1234.50'), 123450);
  for (const amount of [-1, NaN, Infinity, '1.001', '', null, '10000000000000']) {
    assert.throws(() => toMinorUnits(amount));
  }
});

test('journals balance exactly across split lines', () => {
  const result = validateJournal([
    { accountId: 1, debit: '0.30' },
    { accountId: 2, credit: '0.10' },
    { accountId: 3, credit: '0.20' },
  ]);
  assert.equal(result[0].debit, '0.30');
  assert.throws(() => validateJournal([{ accountId: 1, debit: 900 }, { accountId: 2, credit: 1000 }]));
  assert.throws(() => validateJournal([{ accountId: 1, debit: 1, credit: 1 }, { accountId: 2, debit: 0 }]));
});

test('expense categories are shared by creation and editing', () => {
  assert.equal(expenseRole(' Rent '), 'rentExpense');
  assert.equal(expenseRole('water'), 'utilitiesExpense');
  assert.equal(expenseRole(undefined), 'operatingExpense');
});

test('business mapping resolves code to arbitrary ID and rejects wrong account types', async () => {
  const client = { query: async (sql, params) => {
    if (sql.includes('to_regclass')) return { rows: [{ name: 'accounting_account_mappings' }] };
    if (sql.includes('SELECT account_code')) return { rows: [{ account_code: 'CUSTOM' }] };
    assert.equal(params[0], 'CUSTOM');
    return { rows: [{ account_id: 523, account_type: 'EXPENSE', is_active: true }] };
  }};
  assert.equal(await resolveAccount(client, 'rentExpense'), 523);
  await assert.rejects(() => resolveAccount(client, 'cash'));
});

test('unbalanced posting performs no writes', async () => {
  const client = { query: async () => { assert.fail('Database must not be touched'); } };
  await assert.rejects(() => postJournal(client, {
    date: '2026-09-21', description: 'Invalid discount', referenceType: 'TEST', referenceId: 1,
    lines: [{ accountId: 1, debit: 900 }, { accountId: 2, credit: 1000 }],
  }));
});

test('journal and ledger receive matching normalized amounts', async () => {
  const writes = [];
  const client = { query: async (sql, params) => {
    if (sql.includes('SELECT closed_through')) return { rows: [{ closed_through: null }] };
    if (sql.startsWith('SELECT account_id')) return { rows: [{ account_id: 101 }, { account_id: 102 }] };
    writes.push({ sql, params });
    return { rows: [{ journal_id: 42 }] };
  }};
  assert.equal(await postJournal(client, {
    date: '2026-09-21', description: 'Expense', referenceType: 'EXPENSE', referenceId: 7,
    lines: [{ accountId: 101, debit: '12.30' }, { accountId: 102, credit: '12.30' }],
  }), 42);
  assert.equal(writes.length, 5);
  assert.deepEqual(writes[1].params.slice(1,4), writes[2].params.slice(1,4));
  assert.deepEqual(writes[3].params.slice(1,4), writes[4].params.slice(1,4));
});
