import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  try {
      console.log("Fetching products...");
      const res = await pool.query("SELECT * FROM products ORDER BY id ASC");
      return NextResponse.json(res.rows);
  } catch (error) {
    return NextResponse.json({ error: "Error fetching products" + error }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || !body.name || typeof body.name !== "string" || !body.brand_id || typeof body.brand_id !== "number" || !body.category_id || typeof body.category_id !== "number") {
      return NextResponse.json({ error: "Invalid product details" }, { status: 400 });
    }

    const productname = body.name.trim().replace(/\s/g, "").toLowerCase();

    // Check if product already exists
    const existingProduct = await pool.query(
      "SELECT * FROM products WHERE brand_id = $1 and category_id = $2",
      [body.brand_id, body.category_id]
    );
    
    const existingProductRow = existingProduct.rows.find(
      (p: any) => p.name.trim().replace(/\s/g, "").toLowerCase() === productname
    );
    
    if (existingProductRow) {
      return NextResponse.json({ error: "Product already exists" }, { status: 400 });
    }
    

    let sku = body.sku && body.sku.trim() !== "" ? body.sku.trim() : null;
    if (!sku) {
      const lastSKURes = await pool.query(`
        SELECT sku 
        FROM products 
        WHERE sku ~ '^[0-9]+$'  -- only numeric SKUs
        ORDER BY sku::int DESC 
        LIMIT 1
      `);
      let nextNumber = 1;
      if (lastSKURes.rows.length > 0) {
        nextNumber = parseInt(lastSKURes.rows[0].sku, 10) + 1;
      }
      sku = String(nextNumber).padStart(5, "0"); // format like 00001
    }
    let cost_price = body.cost_price;
    let sale_price = body.sale_price;
    if (!cost_price || typeof cost_price !== "number") {
      cost_price = 0;
    }
    if (!sale_price || typeof sale_price !== "number") {
      sale_price = 0;
    }

    const res = await pool.query("INSERT INTO products (name, sku, description, cost_price, sale_price, brand_id, category_id, min_stock_level, item_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *", [body.name.trim(), sku, body.description, body.cost_price, body.sale_price, body.brand_id, body.category_id, body.min_stock_level, body.item_type || "stock"]);

    return NextResponse.json({ message: "Product added successfully", product: res.rows[0] });
  } catch (error) {
    return NextResponse.json({ error: "Error adding product" + error }, { status: 500 });
  }
}
