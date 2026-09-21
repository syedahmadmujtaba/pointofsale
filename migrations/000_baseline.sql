--
-- PostgreSQL database dump
--

-- Dumped from database version 17.10
-- Dumped by pg_dump version 17.5 (Ubuntu 17.5-1.pgdg24.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: account_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.account_type_enum AS ENUM (
    'ASSET',
    'LIABILITY',
    'EQUITY',
    'REVENUE',
    'EXPENSE'
);


--
-- Name: status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.status_enum AS ENUM (
    'PENDING',
    'COMPLETED',
    'CANCELLED'
);


--
-- Name: after_expense_insert_func(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.after_expense_insert_func() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_journal_id INT;
BEGIN
    
    -- Create journal entry for expense
    INSERT INTO journal_entries (entry_date, description, reference_type, reference_id)
    VALUES (NEW.expense_date, 'Expense: ' || NEW.description, 'EXPENSE', NEW.id)
    RETURNING journal_id INTO v_journal_id;
    
    -- Debit: Operating Expense (increase expense)
    INSERT INTO journal_entry_lines (journal_id, account_id, debit_amount, description)
    VALUES (v_journal_id, 9, NEW.amount, 'Expense: ' || NEW.description);
    
    -- Credit: Cash (decrease)
    INSERT INTO journal_entry_lines (journal_id, account_id, credit_amount, description)
    VALUES (v_journal_id, 1, NEW.amount, 'Cash paid for expense: ' || NEW.description);
    
    -- Post to General Ledger
    INSERT INTO general_ledger (transaction_date, account_id, debit_amount, description, reference_type, reference_id, journal_entry_id)
    VALUES (NEW.expense_date, 9, NEW.amount, 'Expense: ' || NEW.description, 'EXPENSE', NEW.id, v_journal_id);
    
    INSERT INTO general_ledger (transaction_date, account_id, credit_amount, description, reference_type, reference_id, journal_entry_id)
    VALUES (NEW.expense_date, 1, NEW.amount, 'Cash paid for expense: ' || NEW.description, 'EXPENSE', NEW.id, v_journal_id);

    RETURN NEW;
END;
$$;


--
-- Name: after_purchase_insert_func(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.after_purchase_insert_func() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_journal_id INT;
BEGIN
    
    -- Create journal entry for cash purchase
    INSERT INTO journal_entries (entry_date, description, reference_type, reference_id)
    VALUES (NEW.purchase_date::date, 'Cash Purchase #' || NEW.invoice_number, 'PURCHASE', NEW.id)
    RETURNING journal_id INTO v_journal_id;
    
    -- Debit: Inventory (increase)
    INSERT INTO journal_entry_lines (journal_id, account_id, debit_amount, description)
    VALUES (v_journal_id, 2, NEW.subtotal, 'Inventory purchase #' || NEW.invoice_number);
    
    -- Debit: Tax Asset (if recoverable)
    IF NEW.tax_amount > 0 THEN
        INSERT INTO journal_entry_lines (journal_id, account_id, debit_amount, description)
        VALUES (v_journal_id, 4, NEW.tax_amount, 'Tax paid on purchase #' || NEW.invoice_number);
    END IF;
    
    -- Credit: Cash (decrease)
    INSERT INTO journal_entry_lines (journal_id, account_id, credit_amount, description)
    VALUES (v_journal_id, 1, NEW.total_amount, 'Cash paid for purchase #' || NEW.invoice_number);
    
    -- Post to General Ledger
    INSERT INTO general_ledger (transaction_date, account_id, debit_amount, description, reference_type, reference_id, journal_entry_id)
    SELECT NEW.purchase_date::date, account_id, debit_amount, description, 'PURCHASE', NEW.id, v_journal_id
    FROM journal_entry_lines WHERE journal_id = v_journal_id AND debit_amount > 0;
    
    INSERT INTO general_ledger (transaction_date, account_id, credit_amount, description, reference_type, reference_id, journal_entry_id)
    SELECT NEW.purchase_date::date, account_id, credit_amount, description, 'PURCHASE', NEW.id, v_journal_id
    FROM journal_entry_lines WHERE journal_id = v_journal_id AND credit_amount > 0;
    
    RETURN NEW;
END;
$$;


--
-- Name: after_sale_insert_func(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.after_sale_insert_func() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_journal_id INT;
BEGIN
    
    -- Create journal entry for cash sale
    INSERT INTO journal_entries (entry_date, description, reference_type, reference_id)
    VALUES (NEW.sale_date::date, 'Cash Sale #' || NEW.invoice_number, 'SALE', NEW.id)
    RETURNING journal_id INTO v_journal_id;
    
    -- Debit: Cash (increase)
    INSERT INTO journal_entry_lines (journal_id, account_id, debit_amount, description)
    VALUES (v_journal_id, 1, NEW.total_amount, 'Cash received from sale #' || NEW.invoice_number);
    
    -- Credit: Sales Revenue (increase)
    INSERT INTO journal_entry_lines (journal_id, account_id, credit_amount, description)
    VALUES (v_journal_id, 7, NEW.subtotal, 'Sales revenue from sale #' || NEW.invoice_number);
    
    -- Credit: Tax Payable (if applicable)
    IF NEW.tax_amount > 0 THEN
        INSERT INTO journal_entry_lines (journal_id, account_id, credit_amount, description)
        VALUES (v_journal_id, 4, NEW.tax_amount, 'Tax collected from sale #' || NEW.invoice_number);
    END IF;
    
    -- Debit: Cost of Goods Sold (expense)
    -- Credit: Inventory (decrease)
    INSERT INTO journal_entry_lines (journal_id, account_id, debit_amount, description)
    SELECT v_journal_id, 8, SUM(si.quantity * p.cost_price), 'COGS for sale #' || NEW.invoice_number
    FROM sales_items si
    JOIN products p ON si.product_id = p.id
    WHERE si.sale_id = NEW.id;
    
    INSERT INTO journal_entry_lines (journal_id, account_id, credit_amount, description)
    SELECT v_journal_id, 2, SUM(si.quantity * p.cost_price), 'Inventory reduction for sale #' || NEW.invoice_number
    FROM sales_items si
    JOIN products p ON si.product_id = p.id
    WHERE si.sale_id = NEW.id;
    
    -- Post to General Ledger
    INSERT INTO general_ledger (transaction_date, account_id, debit_amount, description, reference_type, reference_id, journal_entry_id)
    SELECT NEW.sale_date::date, account_id, debit_amount, description, 'SALE', NEW.id, v_journal_id
    FROM journal_entry_lines WHERE journal_id = v_journal_id AND debit_amount > 0;
    
    INSERT INTO general_ledger (transaction_date, account_id, credit_amount, description, reference_type, reference_id, journal_entry_id)
    SELECT NEW.sale_date::date, account_id, credit_amount, description, 'SALE', NEW.id, v_journal_id
    FROM journal_entry_lines WHERE journal_id = v_journal_id AND credit_amount > 0;
    
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: chart_of_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chart_of_accounts (
    account_id integer NOT NULL,
    account_code character varying(20) NOT NULL,
    account_name character varying(100) NOT NULL,
    account_type public.account_type_enum NOT NULL,
    sub_type character varying(50),
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: general_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.general_ledger (
    ledger_id integer NOT NULL,
    transaction_date date NOT NULL,
    account_id integer NOT NULL,
    debit_amount numeric(15,2) DEFAULT 0.00,
    credit_amount numeric(15,2) DEFAULT 0.00,
    description text,
    reference_type character varying(50),
    reference_id integer,
    journal_entry_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: account_balances; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.account_balances AS
 SELECT coa.account_id,
    coa.account_code,
    coa.account_name,
    coa.account_type,
    (COALESCE(sum(gl.debit_amount), (0)::numeric) - COALESCE(sum(gl.credit_amount), (0)::numeric)) AS balance
   FROM (public.chart_of_accounts coa
     LEFT JOIN public.general_ledger gl ON ((coa.account_id = gl.account_id)))
  WHERE (coa.is_active = true)
  GROUP BY coa.account_id, coa.account_code, coa.account_name, coa.account_type;


--
-- Name: brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brands (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: brands_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.brands_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: brands_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.brands_id_seq OWNED BY public.brands.id;


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.categories_id_seq OWNED BY public.categories.id;


--
-- Name: chart_of_accounts_account_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chart_of_accounts_account_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chart_of_accounts_account_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chart_of_accounts_account_id_seq OWNED BY public.chart_of_accounts.account_id;


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    phone character varying(255),
    email character varying(255),
    address text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: customers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customers_id_seq OWNED BY public.customers.id;


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id integer NOT NULL,
    description character varying(255) NOT NULL,
    amount numeric(10,2) NOT NULL,
    expense_date date DEFAULT CURRENT_DATE NOT NULL,
    category character varying(100),
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: expenses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.expenses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: expenses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.expenses_id_seq OWNED BY public.expenses.id;


--
-- Name: general_ledger_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.general_ledger_ledger_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: general_ledger_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.general_ledger_ledger_id_seq OWNED BY public.general_ledger.ledger_id;


--
-- Name: journal_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_entries (
    journal_id integer NOT NULL,
    entry_date date NOT NULL,
    description text NOT NULL,
    reference_type character varying(50),
    reference_id integer,
    is_posted boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: journal_entries_journal_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.journal_entries_journal_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: journal_entries_journal_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.journal_entries_journal_id_seq OWNED BY public.journal_entries.journal_id;


--
-- Name: journal_entry_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_entry_lines (
    line_id integer NOT NULL,
    journal_id integer NOT NULL,
    account_id integer NOT NULL,
    debit_amount numeric(15,2) DEFAULT 0.00,
    credit_amount numeric(15,2) DEFAULT 0.00,
    description text
);


--
-- Name: journal_entry_lines_line_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.journal_entry_lines_line_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: journal_entry_lines_line_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.journal_entry_lines_line_id_seq OWNED BY public.journal_entry_lines.line_id;


--
-- Name: monthly_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.monthly_summary AS
 SELECT to_char((gl.transaction_date)::timestamp with time zone, 'YYYY-MM'::text) AS month,
    sum(
        CASE
            WHEN (coa.account_type = 'REVENUE'::public.account_type_enum) THEN gl.credit_amount
            ELSE (0)::numeric
        END) AS total_revenue,
    sum(
        CASE
            WHEN (coa.account_type = 'EXPENSE'::public.account_type_enum) THEN gl.debit_amount
            ELSE (0)::numeric
        END) AS total_expenses,
    (sum(
        CASE
            WHEN (coa.account_type = 'REVENUE'::public.account_type_enum) THEN gl.credit_amount
            ELSE (0)::numeric
        END) - sum(
        CASE
            WHEN (coa.account_type = 'EXPENSE'::public.account_type_enum) THEN gl.debit_amount
            ELSE (0)::numeric
        END)) AS net_profit
   FROM (public.general_ledger gl
     JOIN public.chart_of_accounts coa ON ((gl.account_id = coa.account_id)))
  WHERE (coa.account_type = ANY (ARRAY['REVENUE'::public.account_type_enum, 'EXPENSE'::public.account_type_enum]))
  GROUP BY (to_char((gl.transaction_date)::timestamp with time zone, 'YYYY-MM'::text))
  ORDER BY (to_char((gl.transaction_date)::timestamp with time zone, 'YYYY-MM'::text)) DESC;


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id integer NOT NULL,
    sku character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    cost_price numeric(10,2) NOT NULL,
    sale_price numeric(10,2) NOT NULL,
    stock integer DEFAULT 0 NOT NULL,
    min_stock_level integer DEFAULT 0,
    brand_id integer,
    category_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.products_id_seq OWNED BY public.products.id;


--
-- Name: purchase_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_items (
    id integer NOT NULL,
    product_id integer NOT NULL,
    purchase_id integer NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    line_total numeric(10,2) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: purchase_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_items_id_seq OWNED BY public.purchase_items.id;


--
-- Name: purchase_return_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_return_items (
    id integer NOT NULL,
    purchase_return_id integer NOT NULL,
    product_id integer NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    line_total numeric(10,2) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: purchase_return_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_return_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_return_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_return_items_id_seq OWNED BY public.purchase_return_items.id;


--
-- Name: purchase_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_returns (
    id integer NOT NULL,
    return_number character varying(255) NOT NULL,
    original_purchase_id integer NOT NULL,
    vendor_id integer NOT NULL,
    subtotal numeric(10,2) NOT NULL,
    tax_amount numeric(10,2) DEFAULT 0,
    total_amount numeric(10,2) NOT NULL,
    refund_received numeric(10,2) NOT NULL,
    return_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    reason text,
    status public.status_enum DEFAULT 'PENDING'::public.status_enum,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: purchase_returns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_returns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_returns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_returns_id_seq OWNED BY public.purchase_returns.id;


--
-- Name: purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchases (
    id integer NOT NULL,
    vendor_id integer NOT NULL,
    invoice_number character varying(255) NOT NULL,
    subtotal numeric(10,2) NOT NULL,
    discount numeric(10,2) DEFAULT 0,
    tax_amount numeric(10,2) DEFAULT 0,
    total_amount numeric(10,2) NOT NULL,
    amount_paid numeric(10,2) NOT NULL,
    purchase_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: purchases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchases_id_seq OWNED BY public.purchases.id;


--
-- Name: sale_return_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_return_items (
    id integer NOT NULL,
    sale_return_id integer NOT NULL,
    product_id integer NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    line_total numeric(10,2) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: sale_return_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sale_return_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sale_return_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sale_return_items_id_seq OWNED BY public.sale_return_items.id;


--
-- Name: sale_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_returns (
    id integer NOT NULL,
    return_number character varying(255) NOT NULL,
    original_sale_id integer NOT NULL,
    customer_id integer,
    subtotal numeric(10,2) NOT NULL,
    tax_amount numeric(10,2) DEFAULT 0,
    total_amount numeric(10,2) NOT NULL,
    refund_amount numeric(10,2) NOT NULL,
    return_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    reason text,
    status public.status_enum DEFAULT 'PENDING'::public.status_enum,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: sale_returns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sale_returns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sale_returns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sale_returns_id_seq OWNED BY public.sale_returns.id;


--
-- Name: sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales (
    id integer NOT NULL,
    invoice_number character varying(255) NOT NULL,
    customer_id integer,
    subtotal numeric(10,2) NOT NULL,
    discount numeric(10,2) DEFAULT 0,
    tax_amount numeric(10,2) DEFAULT 0,
    total_amount numeric(10,2) NOT NULL,
    amount_paid numeric(10,2) NOT NULL,
    sale_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: sales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sales_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sales_id_seq OWNED BY public.sales.id;


--
-- Name: sales_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_items (
    id integer NOT NULL,
    product_id integer NOT NULL,
    sale_id integer NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    line_total numeric(10,2) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    cost_price numeric(10,2)
);


--
-- Name: sales_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sales_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sales_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sales_items_id_seq OWNED BY public.sales_items.id;


--
-- Name: vendors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendors (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    phone character varying(255),
    email character varying(255),
    address text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: vendors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendors_id_seq OWNED BY public.vendors.id;


--
-- Name: brands id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands ALTER COLUMN id SET DEFAULT nextval('public.brands_id_seq'::regclass);


--
-- Name: categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories ALTER COLUMN id SET DEFAULT nextval('public.categories_id_seq'::regclass);


--
-- Name: chart_of_accounts account_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chart_of_accounts ALTER COLUMN account_id SET DEFAULT nextval('public.chart_of_accounts_account_id_seq'::regclass);


--
-- Name: customers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers ALTER COLUMN id SET DEFAULT nextval('public.customers_id_seq'::regclass);


--
-- Name: expenses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses ALTER COLUMN id SET DEFAULT nextval('public.expenses_id_seq'::regclass);


--
-- Name: general_ledger ledger_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.general_ledger ALTER COLUMN ledger_id SET DEFAULT nextval('public.general_ledger_ledger_id_seq'::regclass);


--
-- Name: journal_entries journal_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries ALTER COLUMN journal_id SET DEFAULT nextval('public.journal_entries_journal_id_seq'::regclass);


--
-- Name: journal_entry_lines line_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entry_lines ALTER COLUMN line_id SET DEFAULT nextval('public.journal_entry_lines_line_id_seq'::regclass);


--
-- Name: products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq'::regclass);


--
-- Name: purchase_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items ALTER COLUMN id SET DEFAULT nextval('public.purchase_items_id_seq'::regclass);


--
-- Name: purchase_return_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_items ALTER COLUMN id SET DEFAULT nextval('public.purchase_return_items_id_seq'::regclass);


--
-- Name: purchase_returns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns ALTER COLUMN id SET DEFAULT nextval('public.purchase_returns_id_seq'::regclass);


--
-- Name: purchases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases ALTER COLUMN id SET DEFAULT nextval('public.purchases_id_seq'::regclass);


--
-- Name: sale_return_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_return_items ALTER COLUMN id SET DEFAULT nextval('public.sale_return_items_id_seq'::regclass);


--
-- Name: sale_returns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_returns ALTER COLUMN id SET DEFAULT nextval('public.sale_returns_id_seq'::regclass);


--
-- Name: sales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales ALTER COLUMN id SET DEFAULT nextval('public.sales_id_seq'::regclass);


--
-- Name: sales_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_items ALTER COLUMN id SET DEFAULT nextval('public.sales_items_id_seq'::regclass);


--
-- Name: vendors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors ALTER COLUMN id SET DEFAULT nextval('public.vendors_id_seq'::regclass);


--
-- Name: brands brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (journal_id);


--
-- Name: journal_entry_lines journal_entry_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entry_lines
    ADD CONSTRAINT journal_entry_lines_pkey PRIMARY KEY (line_id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_sku_key UNIQUE (sku);


--
-- Name: purchase_items purchase_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_return_items purchase_return_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_items
    ADD CONSTRAINT purchase_return_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_returns purchase_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_pkey PRIMARY KEY (id);


--
-- Name: purchase_returns purchase_returns_return_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_return_number_key UNIQUE (return_number);


--
-- Name: purchases purchases_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_invoice_number_key UNIQUE (invoice_number);


--
-- Name: purchases purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_pkey PRIMARY KEY (id);


--
-- Name: sale_return_items sale_return_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_return_items
    ADD CONSTRAINT sale_return_items_pkey PRIMARY KEY (id);


--
-- Name: sale_returns sale_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT sale_returns_pkey PRIMARY KEY (id);


--
-- Name: sale_returns sale_returns_return_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT sale_returns_return_number_key UNIQUE (return_number);


--
-- Name: sales sales_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_invoice_number_key UNIQUE (invoice_number);


--
-- Name: sales_items sales_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_items
    ADD CONSTRAINT sales_items_pkey PRIMARY KEY (id);


--
-- Name: sales sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_pkey PRIMARY KEY (id);


--
-- Name: vendors vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);


--
-- Name: journal_entry_lines journal_entry_lines_journal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entry_lines
    ADD CONSTRAINT journal_entry_lines_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journal_entries(journal_id) ON DELETE CASCADE;


--
-- Name: products products_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id);


--
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: purchase_items purchase_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: purchase_items purchase_items_purchase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE CASCADE;


--
-- Name: purchase_return_items purchase_return_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_items
    ADD CONSTRAINT purchase_return_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: purchase_return_items purchase_return_items_purchase_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_items
    ADD CONSTRAINT purchase_return_items_purchase_return_id_fkey FOREIGN KEY (purchase_return_id) REFERENCES public.purchase_returns(id) ON DELETE CASCADE;


--
-- Name: purchase_returns purchase_returns_original_purchase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_original_purchase_id_fkey FOREIGN KEY (original_purchase_id) REFERENCES public.purchases(id);


--
-- Name: purchase_returns purchase_returns_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);


--
-- Name: purchases purchases_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);


--
-- Name: sale_return_items sale_return_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_return_items
    ADD CONSTRAINT sale_return_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: sale_return_items sale_return_items_sale_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_return_items
    ADD CONSTRAINT sale_return_items_sale_return_id_fkey FOREIGN KEY (sale_return_id) REFERENCES public.sale_returns(id) ON DELETE CASCADE;


--
-- Name: sale_returns sale_returns_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT sale_returns_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: sale_returns sale_returns_original_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT sale_returns_original_sale_id_fkey FOREIGN KEY (original_sale_id) REFERENCES public.sales(id);


--
-- Name: sales sales_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: sales_items sales_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_items
    ADD CONSTRAINT sales_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: sales_items sales_items_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_items
    ADD CONSTRAINT sales_items_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

