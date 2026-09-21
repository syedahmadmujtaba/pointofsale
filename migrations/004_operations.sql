CREATE TABLE journal_proposals (
 id serial PRIMARY KEY, description text NOT NULL, entry_date date NOT NULL, lines jsonb NOT NULL,
 created_by integer NOT NULL REFERENCES app_users(id), approved_by integer REFERENCES app_users(id),
 journal_id integer REFERENCES journal_entries(journal_id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE bank_reconciliations (
 id serial PRIMARY KEY, account_id integer NOT NULL REFERENCES chart_of_accounts(account_id),
 statement_date date NOT NULL, statement_balance numeric(15,2) NOT NULL,
 reconciled_by integer NOT NULL REFERENCES app_users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(account_id,statement_date)
);
CREATE TABLE bank_reconciliation_lines (
 ledger_id integer PRIMARY KEY REFERENCES general_ledger(ledger_id),
 reconciliation_id integer NOT NULL REFERENCES bank_reconciliations(id)
);
CREATE TABLE warehouses(id serial PRIMARY KEY,name text NOT NULL UNIQUE);
INSERT INTO warehouses(name) VALUES('Main');
CREATE TABLE warehouse_stock (
 warehouse_id integer NOT NULL REFERENCES warehouses(id),product_id integer NOT NULL REFERENCES products(id),
 quantity integer NOT NULL CHECK(quantity>=0),PRIMARY KEY(warehouse_id,product_id)
);
INSERT INTO warehouse_stock SELECT 1,id,stock FROM products WHERE item_type='stock';
-- Existing POS invoices operate from Main. Other warehouse stock is transferred
-- to Main before sale. Products.stock remains the all-warehouse aggregate.
CREATE FUNCTION sync_main_stock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE delta integer;
BEGIN
 IF NEW.item_type='service' THEN RETURN NEW; END IF;
 delta:=NEW.stock-CASE WHEN TG_OP='INSERT' THEN 0 ELSE OLD.stock END;
 INSERT INTO warehouse_stock(warehouse_id,product_id,quantity) VALUES(1,NEW.id,GREATEST(delta,0))
 ON CONFLICT(warehouse_id,product_id) DO UPDATE SET quantity=warehouse_stock.quantity+delta;
 IF delta<0 AND NOT FOUND THEN RAISE EXCEPTION 'Insufficient Main warehouse stock'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER product_main_stock AFTER INSERT OR UPDATE OF stock ON products FOR EACH ROW EXECUTE FUNCTION sync_main_stock();
CREATE TABLE warehouse_transfers (
 id serial PRIMARY KEY, product_id integer NOT NULL REFERENCES products(id),
 from_warehouse integer NOT NULL REFERENCES warehouses(id),to_warehouse integer NOT NULL REFERENCES warehouses(id),
 quantity integer NOT NULL CHECK(quantity>0),transfer_date date NOT NULL,CHECK(from_warehouse<>to_warehouse)
);
