'use client';

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Brand, Product } from '@/types/types';

const Select = dynamic(() => import('react-select'), { ssr: false });

type MovementType = 'purchase' | 'sale' | 'sale_return' | 'purchase_return';

interface ReportRow {
  id: number;
  type: MovementType;
  product_id: number;
  product_name: string;
  sku: string;
  invoice_number: string;
  price: number;
  date: string;
  qty: number;
  current_stock: number;
  balance: number;
}

const STOCK_IN: MovementType[] = ['purchase', 'sale_return'];

const TYPE_META: Record<MovementType, { label: string; badge: string; href: (id: number) => string }> = {
  purchase: { label: 'Purchase', badge: 'bg-blue-100 text-blue-700', href: (id) => `/purchase/${id}/edit` },
  sale: { label: 'Sale', badge: 'bg-emerald-100 text-emerald-700', href: (id) => `/sale/${id}/edit` },
  sale_return: { label: 'Sale Return', badge: 'bg-amber-100 text-amber-700', href: () => '/sale/return' },
  purchase_return: { label: 'Purchase Return', badge: 'bg-rose-100 text-rose-700', href: () => '/purchase/return' },
};

const ProductReportPage = () => {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [selectedBrandId, setSelectedBrandId] = useState<number | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);

  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  const [transactionType, setTransactionType] = useState<'all' | 'sale' | 'purchase'>('all');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [reportMeta, setReportMeta] = useState<{ scope: string; period: string } | null>(null);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        const value = Number(r.qty) || 0;
        if (STOCK_IN.includes(r.type)) acc.in += value;
        else acc.out += value;
        return acc;
      },
      { in: 0, out: 0 }
    );
  }, [rows]);

  const currentStock = useMemo(() => {
    const seen = new Set<number>();
    let sum = 0;
    for (const row of rows) {
      if (!seen.has(row.product_id)) {
        seen.add(row.product_id);
        sum += Number(row.current_stock) || 0;
      }
    }
    return sum;
  }, [rows]);

  // Fetch brands and products
  useEffect(() => {
    const load = async () => {
      try {
        const [bRes, pRes] = await Promise.all([
          fetch('/api/brand'),
          fetch('/api/product'),
        ]);
        const [bJson, pJson] = await Promise.all([bRes.json(), pRes.json()]);
        const brandsArray = Array.isArray(bJson) ? bJson : bJson.brands || [];
        const productsArray = Array.isArray(pJson) ? pJson : pJson.products || [];
        setBrands(brandsArray);
        setProducts(productsArray);
      } catch (e: any) {
        setError(e?.message || 'Failed to load brands/products');
      }
    };
    load();
  }, []);

  // Filter products by brand
  const filteredProducts = useMemo(() => {
    if (!selectedBrandId) return products;
    return products.filter(p => p.brand_id === selectedBrandId);
  }, [products, selectedBrandId]);

  // When brand changes, reset product selection if it no longer matches
  useEffect(() => {
    if (selectedProductId && !filteredProducts.some(p => p.id === selectedProductId)) {
      setSelectedProductId(null);
    }
  }, [filteredProducts, selectedProductId]);

  const generatePDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Product Report', 14, 16);
    doc.setFontSize(10);
    doc.text(
      [reportMeta?.scope, reportMeta ? `Period: ${reportMeta.period}` : null].filter(Boolean).join('   |   '),
      14,
      23
    );

    autoTable(doc, {
      startY: 28,
      head: [['Type', 'Product', 'SKU', 'Invoice #', 'In', 'Out', 'Balance', 'Price', 'Date']],
      body: rows.map((row) => [
        TYPE_META[row.type].label,
        row.product_name,
        row.sku,
        row.invoice_number,
        STOCK_IN.includes(row.type) ? Number(row.qty).toLocaleString() : '',
        STOCK_IN.includes(row.type) ? '' : Number(row.qty).toLocaleString(),
        Number(row.balance).toLocaleString(),
        Number(row.price).toLocaleString(),
        new Date(`${row.date}T00:00:00`).toDateString(),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [79, 70, 229] },
    });

    doc.save(`product-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setRows([]);
    try {
      const params = new URLSearchParams();
      if (selectedBrandId) params.set('brandId', String(selectedBrandId));
      if (selectedProductId) params.set('productId', String(selectedProductId));
      if (transactionType !== 'all') params.set('transactionType', transactionType);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);

      const res = await fetch(`/api/productreport?${params.toString()}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to fetch report');
      }
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);

      const brandName = brands.find((brand) => brand.id === selectedBrandId)?.name;
      const productName = products.find((product) => product.id === selectedProductId)?.name;
      setReportMeta({
        scope: productName ? `Product: ${productName}` : brandName ? `Brand: ${brandName}` : 'All products',
        period: fromDate || toDate ? `${fromDate || '—'} to ${toDate || '—'}` : 'All dates',
      });
    } catch (e: any) {
      setError(e?.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-100 p-4 md:p-8 w-full max-w-screen-2xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-indigo-700 tracking-tight">Product Report</h1>
          {reportMeta && (
            <p className="mt-1 text-sm text-gray-600">
              {reportMeta.scope} <span className="mx-2 text-gray-300">|</span> Period: {reportMeta.period}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={generatePDF}
          disabled={rows.length === 0}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-2xl font-semibold shadow transition"
        >
          Download PDF
        </button>
      </div>

      {/* Filters Card */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-lg p-4 md:p-6 mb-6">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          {/* Brand */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
            <Select
              options={brands.map(b => ({ value: b.id, label: b.name }))}
              value={selectedBrandId ? { value: selectedBrandId, label: brands.find(b => b.id === selectedBrandId)?.name || '' } : null}
              onChange={(opt: any) => setSelectedBrandId(opt ? Number(opt.value) : null)}
              placeholder="Select brand"
              isClearable
              className="text-sm"
              menuPortalTarget={typeof window !== 'undefined' ? document.body : undefined}
              menuPosition="fixed"
              styles={{
                menuPortal: (base: any) => ({ ...base, zIndex: 9999 }),
                menu: (base: any) => ({ ...base, zIndex: 9999 })
              }}
            />
          </div>

          {/* Product */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
            <Select
              options={filteredProducts.map(p => ({ value: p.id, label: `${p.name} (${p.sku})` }))}
              value={selectedProductId ? { value: selectedProductId, label: `${products.find(p => p.id === selectedProductId)?.name || ''} (${products.find(p => p.id === selectedProductId)?.sku || ''})` } : null}
              onChange={(opt: any) => setSelectedProductId(opt ? Number(opt.value) : null)}
              placeholder="Select product"
              isClearable
              className="text-sm"
              menuPortalTarget={typeof window !== 'undefined' ? document.body : undefined}
              menuPosition="fixed"
              styles={{
                menuPortal: (base: any) => ({ ...base, zIndex: 9999 }),
                menu: (base: any) => ({ ...base, zIndex: 9999 })
              }}
            />
          </div>

          {/* Transaction Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Type</label>
              <select name="transaction_type" id="transaction_type" className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200" onChange={(e) => setTransactionType(e.target.value as 'all' | 'sale' | 'purchase')}>
                <option value="all">All</option>
                <option value="sale">Sale</option>
                <option value="purchase">Purchase</option>
              </select>
          </div>

          {/* From Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          {/* To Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          {/* Submit */}
          <div>
            <button
              type="submit"
              className={`w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-2xl font-semibold shadow transition flex items-center justify-center ${submitting ? 'opacity-70 cursor-not-allowed' : ''}`}
              disabled={submitting}
            >
              {submitting ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-4 text-sm text-red-600">{error}</div>
        )}
      </div>

      {/* Totals Summary (Quantities) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-2xl shadow p-4">
          <div className="text-sm text-gray-500">Total In Qty (Purchases + Sale Returns)</div>
          <div className="text-2xl font-bold text-blue-600">{totals.in.toLocaleString()}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl shadow p-4">
          <div className="text-sm text-gray-500">Total Out Qty (Sales + Purchase Returns)</div>
          <div className="text-2xl font-bold text-emerald-600">{totals.out.toLocaleString()}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl shadow p-4">
          <div className="text-sm text-gray-500">Net Qty (In - Out)</div>
          <div className={`text-2xl font-bold ${totals.in - totals.out >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{(totals.in - totals.out).toLocaleString()}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl shadow p-4">
          <div className="text-sm text-gray-500">Current Stock (All Products in Report)</div>
          <div className="text-2xl font-bold text-indigo-600">{currentStock.toLocaleString()}</div>
        </div>
      </div>

      {/* Results Table */}
      <div className="overflow-x-auto bg-white border border-gray-200 rounded-2xl shadow-lg max-h-[calc(100vh-350px)] overflow-y-auto relative">
        <table className="min-w-full text-base">
          <thead className="bg-gradient-to-r from-indigo-50 to-blue-50 text-gray-600 font-semibold sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Product</th>
              <th className="px-4 py-3 text-left">SKU</th>
              <th className="px-4 py-3 text-left">Invoice #</th>
              <th className="px-4 py-3 text-left">In</th>
              <th className="px-4 py-3 text-left">Out</th>
              <th className="px-4 py-3 text-left">Balance</th>
              <th className="px-4 py-3 text-left">Price</th>
              <th className="px-4 py-3 text-left">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {submitting ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">No data</td>
              </tr>
            ) : (
              rows.map((r, idx) => (
                <tr key={idx} className="hover:bg-gray-50 cursor-pointer" onClick={() => window.open(TYPE_META[r.type].href(r.id), '_blank')}>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${TYPE_META[r.type].badge}`}>
                      {TYPE_META[r.type].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold">{r.product_name}</td>
                  <td className="px-4 py-3">{r.sku}</td>
                  <td className="px-4 py-3">{r.invoice_number}</td>
                  <td className="px-4 py-3 text-blue-700 font-medium">{STOCK_IN.includes(r.type) ? Number(r.qty).toLocaleString() : ''}</td>
                  <td className="px-4 py-3 text-emerald-700 font-medium">{STOCK_IN.includes(r.type) ? '' : Number(r.qty).toLocaleString()}</td>
                  <td className={`px-4 py-3 font-medium ${Number(r.balance) < 0 ? 'text-red-600' : 'text-gray-800'}`}>{Number(r.balance).toLocaleString()}</td>
                  <td className="px-4 py-3">{Number(r.price).toLocaleString()}</td>
                  <td className="px-4 py-3">{new Date(`${r.date}T00:00:00`).toDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProductReportPage;
