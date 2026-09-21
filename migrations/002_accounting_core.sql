-- Additive upgrade. Existing account IDs, balances and source documents survive.
SET LOCAL search_path = public;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='chart_of_accounts'::regclass AND contype='p') THEN
    ALTER TABLE chart_of_accounts ADD PRIMARY KEY (account_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='chart_of_accounts'::regclass AND contype='u') THEN
    ALTER TABLE chart_of_accounts ADD UNIQUE (account_code);
  END IF;
END $$;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='general_ledger'::regclass AND contype='p') THEN
   ALTER TABLE general_ledger ADD PRIMARY KEY (ledger_id);
 END IF;
END $$;
SELECT setval('chart_of_accounts_account_id_seq', GREATEST(COALESCE((SELECT max(account_id) FROM chart_of_accounts),0)+1,1),false);
INSERT INTO chart_of_accounts (account_code,account_name,account_type,sub_type) VALUES
 ('1000','Cash','ASSET','CASH'), ('1010','Bank Account','ASSET','BANK'),
 ('1020','Accounts Receivable','ASSET','RECEIVABLE'), ('1030','Inventory','ASSET','INVENTORY'),
 ('1040','Tax Recoverable','ASSET','TAX'), ('2000','Accounts Payable','LIABILITY','PAYABLE'),
 ('2100','Tax Payable','LIABILITY','TAX'), ('3000','Owner Equity','EQUITY','EQUITY'),
 ('3100','Retained Earnings','EQUITY','PROFIT'), ('4000','Sales Revenue','REVENUE','SALES'),
 ('5000','Cost of Goods Sold','EXPENSE','COGS'), ('5100','Operating Expenses','EXPENSE','OPERATING'),
 ('5200','Rent Expense','EXPENSE','OPERATING'), ('5300','Utilities Expense','EXPENSE','OPERATING'),
 ('5400','Salaries Expense','EXPENSE','OPERATING'), ('5500','Maintenance Expense','EXPENSE','OPERATING'),
 ('5700','Inventory Adjustments','EXPENSE','ADJUSTMENT')
ON CONFLICT (account_code) DO NOTHING;

ALTER TABLE accounting_account_mappings DROP CONSTRAINT accounting_account_mappings_role_check;
ALTER TABLE accounting_account_mappings ADD CHECK (role IN
 ('cash','bank','receivable','payable','inventory','taxRecoverable','taxPayable','equity',
 'revenue','cogs','stockAdjustment','operatingExpense','rentExpense','utilitiesExpense','salariesExpense','maintenanceExpense'));
ALTER TABLE accounting_account_mappings ADD FOREIGN KEY (account_code) REFERENCES chart_of_accounts(account_code);

CREATE TABLE business_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK (id), name text NOT NULL DEFAULT 'My Business',
 currency varchar(3) NOT NULL DEFAULT 'PKR', fiscal_year_start integer NOT NULL DEFAULT 1 CHECK (fiscal_year_start BETWEEN 1 AND 12),
 closed_through date, default_tax_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (default_tax_rate BETWEEN 0 AND 100),
 invoice_prefix text NOT NULL DEFAULT 'INV', purchase_prefix text NOT NULL DEFAULT 'PUR',
 costing_method text NOT NULL DEFAULT 'weighted_average' CHECK (costing_method='weighted_average')
);
INSERT INTO business_settings DEFAULT VALUES;
CREATE SEQUENCE business_document_number;

ALTER TABLE journal_entries ADD COLUMN reversal_of integer UNIQUE REFERENCES journal_entries(journal_id);
ALTER TABLE journal_entries ADD COLUMN engine_version integer;
CREATE TABLE audit_events (
 id bigserial PRIMARY KEY, occurred_at timestamptz NOT NULL DEFAULT now(),
 actor text NOT NULL, action text NOT NULL, entity_type text NOT NULL, entity_id text,
 before_data jsonb, after_data jsonb
);
CREATE TABLE document_revisions (
 id bigserial PRIMARY KEY, document_type text NOT NULL, document_id integer NOT NULL,
 document jsonb NOT NULL, items jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE customers ADD COLUMN credit_limit numeric(15,2) CHECK (credit_limit >= 0);
ALTER TABLE sales ADD COLUMN due_date date;
ALTER TABLE sales ADD COLUMN voided_at timestamptz;
ALTER TABLE sales ADD COLUMN engine_version integer;
ALTER TABLE purchases ADD COLUMN due_date date;
ALTER TABLE purchases ADD COLUMN voided_at timestamptz;
ALTER TABLE purchases ADD COLUMN engine_version integer;
ALTER TABLE sales ADD COLUMN credited_amount numeric(15,2) NOT NULL DEFAULT 0;
ALTER TABLE purchases ADD COLUMN credited_amount numeric(15,2) NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN document_kind text NOT NULL DEFAULT 'invoice' CHECK(document_kind IN ('invoice','opening'));
ALTER TABLE purchases ADD COLUMN document_kind text NOT NULL DEFAULT 'invoice' CHECK(document_kind IN ('invoice','opening'));
ALTER TABLE sales_items ADD COLUMN net_total numeric(15,2);
ALTER TABLE purchase_items ADD COLUMN net_total numeric(15,2);
ALTER TABLE expenses ADD COLUMN voided_at timestamptz;
ALTER TABLE sale_returns ADD COLUMN engine_version integer;
ALTER TABLE purchase_returns ADD COLUMN engine_version integer;
ALTER TABLE sale_return_items ADD COLUMN cost_price numeric(10,2);
ALTER TABLE purchase_return_items ADD COLUMN cost_price numeric(10,2);
ALTER TABLE products ADD COLUMN item_type text NOT NULL DEFAULT 'stock' CHECK (item_type IN ('stock','service'));
ALTER TABLE products ADD COLUMN inventory_value numeric(15,2) NOT NULL DEFAULT 0 CHECK(inventory_value>=0);
UPDATE products SET inventory_value=stock*cost_price WHERE stock>=0;
ALTER TABLE sales_items ADD COLUMN cost_total numeric(15,2);
ALTER TABLE sale_return_items ADD COLUMN cost_total numeric(15,2);
ALTER TABLE purchase_return_items ADD COLUMN cost_total numeric(15,2);

CREATE TABLE payments (
 id bigserial PRIMARY KEY, kind text NOT NULL CHECK (kind IN ('receipt','supplier_payment')),
 customer_id integer REFERENCES customers(id), vendor_id integer REFERENCES vendors(id),
 amount numeric(15,2) NOT NULL CHECK (amount>0), payment_date date NOT NULL,
 account_id integer NOT NULL REFERENCES chart_of_accounts(account_id),
 reference text NOT NULL DEFAULT '', idempotency_key text NOT NULL UNIQUE,
 journal_id integer NOT NULL REFERENCES journal_entries(journal_id), voided_at timestamptz,
 CHECK ((kind='receipt' AND customer_id IS NOT NULL AND vendor_id IS NULL) OR
        (kind='supplier_payment' AND vendor_id IS NOT NULL AND customer_id IS NULL))
);
CREATE TABLE payment_allocations (
 id bigserial PRIMARY KEY, payment_id bigint NOT NULL REFERENCES payments(id),
 sale_id integer REFERENCES sales(id), purchase_id integer REFERENCES purchases(id),
 amount numeric(15,2) NOT NULL CHECK (amount>0),
 CHECK ((sale_id IS NULL) <> (purchase_id IS NULL))
);
CREATE INDEX payment_allocations_sale ON payment_allocations(sale_id);
CREATE INDEX payment_allocations_purchase ON payment_allocations(purchase_id);
CREATE TABLE stock_movements (
 id bigserial PRIMARY KEY, product_id integer NOT NULL REFERENCES products(id),
 quantity integer NOT NULL CHECK (quantity<>0), unit_cost numeric(10,2) NOT NULL CHECK (unit_cost>=0),
 movement_date date NOT NULL, reference_type text NOT NULL, reference_id integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_product ON stock_movements(product_id,movement_date,id);

-- API owns postings. Legacy insert triggers would double-post them.
DROP TRIGGER IF EXISTS after_sale_insert ON sales;
DROP TRIGGER IF EXISTS after_purchase_insert ON purchases;
DROP TRIGGER IF EXISTS after_expense_insert ON expenses;

CREATE FUNCTION protect_posted_accounting() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_version integer;
BEGIN
 IF TG_TABLE_NAME='journal_entries' THEN v_version := OLD.engine_version;
 ELSE SELECT engine_version INTO v_version FROM journal_entries
      WHERE journal_id = CASE WHEN TG_TABLE_NAME='general_ledger' THEN (to_jsonb(OLD)->>'journal_entry_id')::int ELSE (to_jsonb(OLD)->>'journal_id')::int END;
 END IF;
 IF v_version=2 THEN RAISE EXCEPTION 'Posted accounting is immutable; create a reversal'; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER immutable_journals BEFORE UPDATE OR DELETE ON journal_entries FOR EACH ROW EXECUTE FUNCTION protect_posted_accounting();
CREATE TRIGGER immutable_lines BEFORE UPDATE OR DELETE ON journal_entry_lines FOR EACH ROW EXECUTE FUNCTION protect_posted_accounting();
CREATE TRIGGER immutable_ledger BEFORE UPDATE OR DELETE ON general_ledger FOR EACH ROW EXECUTE FUNCTION protect_posted_accounting();

CREATE FUNCTION validate_posted_journal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.engine_version=2 THEN
   IF (SELECT count(*) FROM journal_entry_lines WHERE journal_id=NEW.journal_id)<2 OR
      (SELECT COALESCE(sum(debit_amount-credit_amount),0) FROM journal_entry_lines WHERE journal_id=NEW.journal_id)<>0 THEN
     RAISE EXCEPTION 'Journal is not balanced';
   END IF;
   IF EXISTS (
     (SELECT account_id,debit_amount,credit_amount FROM journal_entry_lines WHERE journal_id=NEW.journal_id
      EXCEPT ALL SELECT account_id,debit_amount,credit_amount FROM general_ledger WHERE journal_entry_id=NEW.journal_id)
     UNION ALL
     (SELECT account_id,debit_amount,credit_amount FROM general_ledger WHERE journal_entry_id=NEW.journal_id
      EXCEPT ALL SELECT account_id,debit_amount,credit_amount FROM journal_entry_lines WHERE journal_id=NEW.journal_id)
   ) THEN RAISE EXCEPTION 'Journal and ledger differ'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER balanced_journal AFTER INSERT ON journal_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_posted_journal();

CREATE FUNCTION guard_accounting_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_version integer; v_xid bigint;
BEGIN
 SELECT engine_version,xmin::text::bigint INTO v_version,v_xid FROM journal_entries
 WHERE journal_id=CASE WHEN TG_TABLE_NAME='general_ledger' THEN (to_jsonb(NEW)->>'journal_entry_id')::int ELSE (to_jsonb(NEW)->>'journal_id')::int END;
 IF v_version=2 THEN
  IF v_xid<>(txid_current()%4294967296) THEN RAISE EXCEPTION 'Cannot append to a committed journal'; END IF;
  IF NEW.debit_amount IS NULL OR NEW.credit_amount IS NULL OR NEW.debit_amount<0 OR NEW.credit_amount<0 OR
     (NEW.debit_amount=0)=(NEW.credit_amount=0) THEN RAISE EXCEPTION 'Invalid debit/credit line'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_new_lines BEFORE INSERT ON journal_entry_lines FOR EACH ROW EXECUTE FUNCTION guard_accounting_insert();
CREATE TRIGGER guard_new_ledger BEFORE INSERT ON general_ledger FOR EACH ROW EXECUTE FUNCTION guard_accounting_insert();
