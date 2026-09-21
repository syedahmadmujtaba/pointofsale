import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

function buildConditions(baseIndex: number, filters: { brandId?: number; productId?: number; from?: string; to?: string }, dateColumn: string) {
  const clauses: string[] = [];
  const params: any[] = [];
  let i = baseIndex;

  if (filters.brandId) {
    clauses.push(`p.brand_id = $${i++}`);
    params.push(filters.brandId);
  }
  if (filters.productId) {
    clauses.push(`p.id = $${i++}`);
    params.push(filters.productId);
  }
  if (filters.from) {
    clauses.push(`${dateColumn} >= $${i++}`);
    params.push(filters.from);
  }
  if (filters.to) {
    clauses.push(`${dateColumn} <= $${i++}`);
    params.push(filters.to);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return { where, params, nextIndex: i };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get("brandId") ? Number(searchParams.get("brandId")) : undefined;
    const productId = searchParams.get("productId") ? Number(searchParams.get("productId")) : undefined;
    const rawType = searchParams.get("transactionType");
    const transactionType: 'all' | 'sale' | 'purchase' = rawType === 'sale' || rawType === 'purchase' ? rawType : 'all';
    const from = searchParams.get("from") || undefined; // ISO string/date
    const to = searchParams.get("to") || undefined; // ISO string/date

    const baseFilters = { brandId, productId, from, to };

    let paramIndex = 1;
    const parts: string[] = [];
    const allParams: any[] = [];

    // Include purchases and purchase returns unless filtered to the sales side.
    if (transactionType !== 'sale') {
      const purchaseCond = buildConditions(paramIndex, baseFilters, "pu.purchase_date");
      paramIndex = purchaseCond.nextIndex;
      parts.push(`
      SELECT 'purchase' AS type,
             p.id AS product_id,
             p.name AS product_name,
             p.sku,
             p.stock AS current_stock,
             pu.id AS id,
             pu.invoice_number,
             pi.unit_price AS price,
             pi.quantity AS qty,
             to_char(pu.purchase_date, 'YYYY-MM-DD') AS date
      FROM purchase_items pi
      JOIN purchases pu ON pi.purchase_id = pu.id
      JOIN products p ON pi.product_id = p.id
      ${purchaseCond.where}
      `);
      allParams.push(...purchaseCond.params);

      const purchaseReturnCond = buildConditions(paramIndex, baseFilters, "pr.return_date");
      paramIndex = purchaseReturnCond.nextIndex;
      parts.push(`
      SELECT 'purchase_return' AS type,
             p.id AS product_id,
             p.name AS product_name,
             p.sku,
             p.stock AS current_stock,
             pr.id AS id,
             pr.return_number AS invoice_number,
             pri.unit_price AS price,
             pri.quantity AS qty,
             to_char(pr.return_date, 'YYYY-MM-DD') AS date
      FROM purchase_return_items pri
      JOIN purchase_returns pr ON pri.purchase_return_id = pr.id
      JOIN products p ON pri.product_id = p.id
      ${purchaseReturnCond.where}
      `);
      allParams.push(...purchaseReturnCond.params);
    }

    // Include sales and sale returns unless filtered to the purchase side.
    if (transactionType !== 'purchase') {
      const saleCond = buildConditions(paramIndex, baseFilters, "s.sale_date");
      paramIndex = saleCond.nextIndex;
      parts.push(`
      SELECT 'sale' AS type,
             p.id AS product_id,
             p.name AS product_name,
             p.sku,
             p.stock AS current_stock,
             s.id AS id,
             s.invoice_number,
             si.unit_price AS price,
             si.quantity AS qty,
             to_char(s.sale_date, 'YYYY-MM-DD') AS date
      FROM sales_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      ${saleCond.where}
      `);
      allParams.push(...saleCond.params);

      const saleReturnCond = buildConditions(paramIndex, baseFilters, "sr.return_date");
      paramIndex = saleReturnCond.nextIndex;
      parts.push(`
      SELECT 'sale_return' AS type,
             p.id AS product_id,
             p.name AS product_name,
             p.sku,
             p.stock AS current_stock,
             sr.id AS id,
             sr.return_number AS invoice_number,
             sri.unit_price AS price,
             sri.quantity AS qty,
             to_char(sr.return_date, 'YYYY-MM-DD') AS date
      FROM sale_return_items sri
      JOIN sale_returns sr ON sri.sale_return_id = sr.id
      JOIN products p ON sri.product_id = p.id
      ${saleReturnCond.where}
      `);
      allParams.push(...saleReturnCond.params);
    }

    // If nothing selected (shouldn't happen), return empty array
    if (parts.length === 0) {
      return NextResponse.json([]);
    }

    const sql = `
      SELECT t.*,
        SUM(CASE WHEN t.type IN ('purchase', 'sale_return') THEN t.qty ELSE -t.qty END)
          OVER (PARTITION BY t.product_id ORDER BY t.date, t.id) AS balance
      FROM (
        ${parts.join(" UNION ALL ")}
      ) AS t
      ORDER BY t.date DESC, t.id DESC
    `;

    const result = await pool.query(sql, allParams);
    return NextResponse.json(result.rows);
  } catch (error: any) {
    console.error("/api/productreport error:", error);
    return NextResponse.json({ error: "Error generating product report" }, { status: 500 });
  }
}
