-- Business-specific mapping overrides. Account resolution validates code uniqueness,
-- account type and active status against the existing chart before posting.
-- No existing accounts or historical financial entries are changed.
CREATE TABLE public.accounting_account_mappings (
    role text PRIMARY KEY CHECK (role IN (
      'cash', 'operatingExpense', 'rentExpense', 'utilitiesExpense',
      'salariesExpense', 'maintenanceExpense'
    )),
    account_code varchar(20) NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.accounting_account_mappings IS
  'Optional account-code overrides; absent roles use application defaults. Manage through trusted administration until authenticated settings are implemented.';
