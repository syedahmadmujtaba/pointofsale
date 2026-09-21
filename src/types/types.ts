export interface Customer{
  id:number;
  name:string;
  phone:string;
  email:string;
  address:string;
}

export interface Vendor {
  id: number;
  name: string;
  phone: string;
  email:string;
  address:string;
}

export interface Brand {
  id: number;
  name: string;
}

export interface Category {
  id: number;
  name: string;
}

export interface Product {
  item_type?: 'stock' | 'service';
  id: number;
  sku: string;
  name: string;
  description: string;
  cost_price: number;
  sale_price: number;
  brand_id: number;
  category_id: number;
  stock: number;
  min_stock_level: number;
}

export interface Sale {
id: number;
invoice_number: string;
customer_id: number;
total_amount: number;
sale_date: string;
}

export interface SaleRecord {
  id: number;
  invoice_number: string;
  customer_id: number;
  discount: number;
  total_amount: number;
  sale_date: string;
}

export interface SaleItem {
id: number;
product_id: number;
quantity: number;
unit_price: number;
line_total: number;
product_name: string;
product_sku: string;
}

export interface SaleReturn {
  id: number;
  return_number: string;
  original_sale_id: number;
  customer_id: number;
  total_amount: number;
  refund_amount: number;
  return_date: string;
  reason: string;
  status: string;
  notes: string;
}

export interface SaleReturnItem {
  id: number;
  sale_return_id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  line_total: number;
  product_name: string;
  product_sku: string;
}

export interface Expense {
  id: number;
  description: string;
  amount: number;
  category: string;
  notes: string;
  expense_date: string;
}

export interface Purchase {
  id: number;
  invoice_number: string;
  vendor_id: number;
  total_amount: number;
  purchase_date: string;
}

export interface PurchaseRecord {
  id: number;
  invoice_number: string;
  vendor_id: number;
  discount: number;
  total_amount: number;
  purchase_date: string;
}

export interface PurchaseItem {
  id: number;
  purchase_id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  line_total: number;
  product_name: string;
  product_sku: string;
}

export interface SalesSummary {
total_transactions: number;
total_sales: number;
total_tax: number;
total_revenue: number;
total_discounts: number;
average_transaction_value: number;
}

export interface PurchaseSummary {
total_transactions: number;
total_purchases: number;
total_tax: number;
total_spent: number;
total_discounts: number;
average_transaction_value: number;
}

export interface ExpenseSummary {
total_expenses: number;
total_expense_amount: number;
average_expense: number;
expense_categories: string;
}

export interface ProfitLoss {
total_revenue: number;
total_expenses: number;
net_profit: number;
profit_margin: string;
}

export interface InventoryItem {
id: number;
sku: string;
name: string;
stock: number;
cost_price: number;
sale_price: number;
min_stock_level: number;
stock_value: number;
potential_revenue: number;
stock_status: string;
}

export interface AccountBalance {
account_id: number;
account_code: string;
account_name: string;
account_type: string;
sub_type: string;
current_balance: number;
}

export interface DailySummary {
date: string;
sales_count: number;
sales_total: number;
purchases_count: number;
purchases_total: number;
expenses_count: number;
expenses_total: number;
net_cash_flow: number;
}

export interface ProductPerformance {
id: number;
sku: string;
name: string;
total_sold: number;
total_revenue: number;
total_cost: number;
gross_profit: number;
profit_margin: number;
}

export interface CustomerSummary {
id: number;
name: string;
phone: string;
total_transactions: number;
total_spent: number;
average_transaction: number;
last_purchase_date: string;
}

export interface VendorSummary {
id: number;
name: string;
phone: string;
total_purchases: number;
total_spent: number;
average_purchase: number;
last_purchase_date: string;
}

export interface DateRange {
startDate: string ;
endDate: string ;
}
