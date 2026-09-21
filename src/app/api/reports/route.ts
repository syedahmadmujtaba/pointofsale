import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

// Helper function to validate and format dates
function formatDate(dateString: string | null): string | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
}

// GET - Simplified reports endpoint
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const reportType = searchParams.get('type');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const customerId = searchParams.get('customerId');
  const vendorId = searchParams.get('vendorId');
  
  const client = await pool.connect();
  
  try {
    switch (reportType) {
      case 'profit-loss':
        return await getProfitLossReport(client, startDate, endDate);
      case 'balance-sheet':
        return await getBalanceSheetReport(client);
      case 'customer-report':
        if (!customerId) {
          return NextResponse.json(
            { error: 'Customer ID is required for customer report' },
            { status: 400 }
          );
        }
        return await getCustomerReport(client, customerId, startDate, endDate);
      case 'vendor-report':
        if (!vendorId) {
          return NextResponse.json(
            { error: 'Vendor ID is required for vendor report' },
            { status: 400 }
          );
        }
        return await getVendorReport(client, vendorId, startDate, endDate);
      case 'sales':
        return await getSalesReport(client, startDate, endDate);
      default:
        return NextResponse.json({
          success: true,
          availableReports: [
            'profit-loss',
            'balance-sheet',
            'customer-report',
            'vendor-report',
            'sales'
          ]
        });
    }
  } catch (error) {
    console.error('Error generating reports:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

// Profit & Loss Report
async function getProfitLossReport(client: any, startDate: string | null, endDate: string | null) {
  const formattedStartDate = formatDate(startDate);
  const formattedEndDate = formatDate(endDate);
  
  let dateFilter = '';
  const queryParams: any[] = [];
  
  if (formattedStartDate && formattedEndDate) {
    dateFilter = 'AND DATE(transaction_date) BETWEEN $1 AND $2';
    queryParams.push(formattedStartDate, formattedEndDate);
  } else if (formattedStartDate) {
    dateFilter = 'AND DATE(transaction_date) >= $1';
    queryParams.push(formattedStartDate);
  } else if (formattedEndDate) {
    dateFilter = 'AND DATE(transaction_date) <= $1';
    queryParams.push(formattedEndDate);
  }
  
  // Get revenue (Sales Revenue account)
  const revenueQuery = `
    SELECT COALESCE(SUM(credit_amount-debit_amount), 0) as total_revenue
    FROM general_ledger gl
    JOIN chart_of_accounts coa ON gl.account_id = coa.account_id
    WHERE coa.account_type = 'REVENUE'
    ${dateFilter}
  `;
  
  // Get COGS (Cost of Goods Sold)
  const cogsQuery = `
    SELECT COALESCE(SUM(debit_amount-credit_amount), 0) as total_cogs
    FROM general_ledger gl
    JOIN chart_of_accounts coa ON gl.account_id = coa.account_id
    WHERE coa.account_code = COALESCE((SELECT account_code FROM accounting_account_mappings WHERE role='cogs'),'5000')
    ${dateFilter}
  `;
  
  // Get operating expenses
  const expenseQuery = `
    SELECT COALESCE(SUM(debit_amount-credit_amount), 0) as total_expenses
    FROM general_ledger gl
    JOIN chart_of_accounts coa ON gl.account_id = coa.account_id
    WHERE coa.account_type = 'EXPENSE' 
    AND coa.account_code != COALESCE((SELECT account_code FROM accounting_account_mappings WHERE role='cogs'),'5000')
    ${dateFilter}
  `;
  
  const revenueResult = await client.query(revenueQuery, queryParams);
  const cogsResult = await client.query(cogsQuery, queryParams);
  const expenseResult = await client.query(expenseQuery, queryParams);
  
  const totalRevenue = parseFloat(revenueResult.rows[0].total_revenue);
  const totalCOGS = parseFloat(cogsResult.rows[0].total_cogs);
  const totalExpenses = parseFloat(expenseResult.rows[0].total_expenses);
  const grossProfit = totalRevenue - totalCOGS;
  const netProfit = grossProfit - totalExpenses;
  
  return NextResponse.json({
    success: true,
    reportType: 'profit-loss',
    data: {
      revenue: totalRevenue,
      cost_of_goods_sold: totalCOGS,
      gross_profit: grossProfit,
      operating_expenses: totalExpenses,
      net_profit: netProfit,
      gross_profit_margin: totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(2) : '0.00',
      net_profit_margin: totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(2) : '0.00'
    },
    dateRange: {
      startDate: formattedStartDate,
      endDate: formattedEndDate
    }
  });
}

// Balance Sheet Report
async function getBalanceSheetReport(client: any) {
  // Get all account balances
  const accountQuery = `
    SELECT 
      coa.account_id,
      coa.account_code,
      coa.account_name,
      coa.account_type,
      coa.sub_type,
      COALESCE(SUM(gl.debit_amount), 0) - COALESCE(SUM(gl.credit_amount), 0) as balance
    FROM chart_of_accounts coa
    LEFT JOIN general_ledger gl ON coa.account_id = gl.account_id
    WHERE coa.is_active = TRUE
    GROUP BY coa.account_id, coa.account_code, coa.account_name, coa.account_type, coa.sub_type
    ORDER BY coa.account_type, coa.account_code
  `;
  
  const accountResult = await client.query(accountQuery);
  const accounts = accountResult.rows;
  
  // Calculate totals
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;
  
  accounts.forEach((account: any) => {
    const balance = parseFloat(account.balance);
    switch (account.account_type) {
      case 'ASSET':
        totalAssets += balance;
        break;
      case 'LIABILITY':
        totalLiabilities -= balance;
        break;
      case 'EQUITY':
        totalEquity -= balance;
        break;
    }
  });
  
  // Equity also includes retained earnings (net profit)
  // For simplicity, we'll calculate current period net profit
  const profitQuery = `
    SELECT 
      COALESCE(SUM(CASE WHEN coa.account_type = 'REVENUE' THEN gl.credit_amount-gl.debit_amount ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN coa.account_type = 'EXPENSE' THEN gl.debit_amount-gl.credit_amount ELSE 0 END), 0) as net_profit
    FROM general_ledger gl
    JOIN chart_of_accounts coa ON gl.account_id = coa.account_id
    WHERE coa.account_type IN ('REVENUE', 'EXPENSE')
  `;
  
  const profitResult = await client.query(profitQuery);
  const retainedEarnings = parseFloat(profitResult.rows[0].net_profit);
  totalEquity += retainedEarnings;
  
  return NextResponse.json({
    success: true,
    reportType: 'balance-sheet',
    data: {
      assets: accounts.filter((a: any) => a.account_type === 'ASSET'),
      liabilities: accounts.filter((a: any) => a.account_type === 'LIABILITY'),
      equity: accounts.filter((a: any) => a.account_type === 'EQUITY'),
      totals: {
        assets: totalAssets,
        liabilities: totalLiabilities,
        equity: totalEquity,
        retained_earnings: retainedEarnings,
        liabilities_plus_equity: totalLiabilities + totalEquity
      }
    }
  });
}

// Customer Report
async function getCustomerReport(client: any, customerId: string, startDate: string | null, endDate: string | null) {
  const formattedStartDate = formatDate(startDate);
  const formattedEndDate = formatDate(endDate);
  
  let dateFilter = '';
  const queryParams: any[] = [customerId];
  
  if (formattedStartDate && formattedEndDate) {
    dateFilter = 'AND DATE(s.sale_date) BETWEEN $2 AND $3';
    queryParams.push(formattedStartDate, formattedEndDate);
  } else if (formattedStartDate) {
    dateFilter = 'AND DATE(s.sale_date) >= $2';
    queryParams.push(formattedStartDate);
  } else if (formattedEndDate) {
    dateFilter = 'AND DATE(s.sale_date) <= $2';
    queryParams.push(formattedEndDate);
  }
  
  // Get customer info
  const customerQuery = `
    SELECT id, name, phone, email, address
    FROM customers
    WHERE id = $1
  `;
  
  // Get customer sales
  const salesQuery = `
    SELECT 
      s.id,
      s.invoice_number,
      s.sale_date,
      s.total_amount,
      s.amount_paid,
      (s.total_amount - s.credited_amount - s.amount_paid) as balance_due
    FROM sales s
    WHERE s.voided_at IS NULL AND s.customer_id = $1 ${dateFilter}
    ORDER BY s.sale_date DESC
  `;
  
  // Get customer summary
  const summaryQuery = `
    SELECT 
      COUNT(s.id) as total_transactions,
      COALESCE(SUM(s.total_amount), 0) as total_purchases,
      COALESCE(SUM(s.amount_paid), 0) as total_paid,
      COALESCE(SUM(s.total_amount - s.credited_amount - s.amount_paid), 0) as total_balance
    FROM sales s
    WHERE s.voided_at IS NULL AND s.customer_id = $1 ${dateFilter}
  `;
  
  const customerResult = await client.query(customerQuery, [customerId]);
  const salesResult = await client.query(salesQuery, queryParams);
  const summaryResult = await client.query(summaryQuery, queryParams);
  
  if (customerResult.rows.length === 0) {
    return NextResponse.json(
      { error: 'Customer not found' },
      { status: 404 }
    );
  }
  
  return NextResponse.json({
    success: true,
    reportType: 'customer-report',
    customer: customerResult.rows[0],
    summary: summaryResult.rows[0],
    transactions: salesResult.rows,
    dateRange: {
      startDate: formattedStartDate,
      endDate: formattedEndDate
    }
  });
}

// Vendor Report
async function getVendorReport(client: any, vendorId: string, startDate: string | null, endDate: string | null) {
  const formattedStartDate = formatDate(startDate);
  const formattedEndDate = formatDate(endDate);
  
  let dateFilter = '';
  const queryParams: any[] = [vendorId];
  
  if (formattedStartDate && formattedEndDate) {
    dateFilter = 'AND DATE(p.purchase_date) BETWEEN $2 AND $3';
    queryParams.push(formattedStartDate, formattedEndDate);
  } else if (formattedStartDate) {
    dateFilter = 'AND DATE(p.purchase_date) >= $2';
    queryParams.push(formattedStartDate);
  } else if (formattedEndDate) {
    dateFilter = 'AND DATE(p.purchase_date) <= $2';
    queryParams.push(formattedEndDate);
  }
  
  // Get vendor info
  const vendorQuery = `
    SELECT id, name, phone, email, address
    FROM vendors
    WHERE id = $1
  `;
  
  // Get vendor purchases
  const purchasesQuery = `
    SELECT 
      p.id,
      p.invoice_number,
      p.purchase_date,
      p.total_amount,
      p.amount_paid,
      (p.total_amount - p.credited_amount - p.amount_paid) as balance_due
    FROM purchases p
    WHERE p.voided_at IS NULL AND p.vendor_id = $1 ${dateFilter}
    ORDER BY p.purchase_date DESC
  `;
  
  // Get vendor summary
  const summaryQuery = `
    SELECT 
      COUNT(p.id) as total_transactions,
      COALESCE(SUM(p.total_amount), 0) as total_purchases,
      COALESCE(SUM(p.amount_paid), 0) as total_paid,
      COALESCE(SUM(p.total_amount - p.credited_amount - p.amount_paid), 0) as total_balance
    FROM purchases p
    WHERE p.voided_at IS NULL AND p.vendor_id = $1 ${dateFilter}
  `;
  
  const vendorResult = await client.query(vendorQuery, [vendorId]);
  const purchasesResult = await client.query(purchasesQuery, queryParams);
  const summaryResult = await client.query(summaryQuery, queryParams);
  
  if (vendorResult.rows.length === 0) {
    return NextResponse.json(
      { error: 'Vendor not found' },
      { status: 404 }
    );
  }
  
  return NextResponse.json({
    success: true,
    reportType: 'vendor-report',
    vendor: vendorResult.rows[0],
    summary: summaryResult.rows[0],
    transactions: purchasesResult.rows,
    dateRange: {
      startDate: formattedStartDate,
      endDate: formattedEndDate
    }
  });
}

// Sales Report
async function getSalesReport(client: any, startDate: string | null, endDate: string | null) {
 const from=formatDate(startDate),to=formatDate(endDate);
 // Report posted revenue and COGS, including reversals and returns, by posting date.
 const result=await client.query(`
  SELECT j.journal_id,j.reference_type AS type,j.description AS invoice,g.transaction_date AS date,
   COALESCE(sum(CASE WHEN a.account_type='REVENUE' THEN g.credit_amount-g.debit_amount ELSE 0 END),0) AS price,
   COALESCE(sum(CASE WHEN a.account_code=COALESCE((SELECT account_code FROM accounting_account_mappings WHERE role='cogs'),'5000') THEN g.debit_amount-g.credit_amount ELSE 0 END),0) AS cogs
  FROM general_ledger g JOIN journal_entries j ON j.journal_id=g.journal_entry_id
  JOIN chart_of_accounts a USING(account_id)
  WHERE (a.account_type='REVENUE' OR a.account_code=COALESCE((SELECT account_code FROM accounting_account_mappings WHERE role='cogs'),'5000'))
   AND ($1::date IS NULL OR g.transaction_date >=$1) AND ($2::date IS NULL OR g.transaction_date <=$2)
  GROUP BY j.journal_id,j.reference_type,j.description,g.transaction_date ORDER BY g.transaction_date DESC,j.journal_id DESC
 `,[from,to]);
 const total_sale=result.rows.reduce((s:number,r:any)=>s+Number(r.price),0);
 const total_cogs=result.rows.reduce((s:number,r:any)=>s+Number(r.cogs),0);
 return NextResponse.json({success:true,reportType:'sales',summary:{total_sale,total_cogs,gross_profit:total_sale-total_cogs},transactions:result.rows,dateRange:{startDate:from,endDate:to}});
}
