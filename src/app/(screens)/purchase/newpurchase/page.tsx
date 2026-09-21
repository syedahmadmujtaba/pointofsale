"use client";
import { MinusIcon, PlusIcon, Edit, Trash, User } from "lucide-react";
import React, { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import dynamic from "next/dynamic";
import { Product, Vendor ,Brand} from '@/types/types';

// Dynamically import react-select to avoid SSR issues
const Select = dynamic(() => import('react-select'), { ssr: false });

const NewPurchase = () => {
  const [amountPaid, setAmountPaid] = useState('0');
  const [dueDate, setDueDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [taxRate, setTaxRate] = useState(0);
  const [purchaseType, setPurchaseType] = useState<"Cash" | "Credit">("Cash");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  useEffect(() => {
    setInvoiceNumber(`PUR-${uuidv4().slice(0, 8)}`);
  }, []);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [allbrands, setAllbrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orderDiscount, setOrderDiscount] = useState<number>(0);
  const [orderDiscountType, setOrderDiscountType] = useState<"%" | "PKR">("PKR");
  
  // State for react-select
  const [selectedVendorOption, setSelectedVendorOption] = useState<any>(null);
  const [selectedProductOption, setSelectedProductOption] = useState<any>(null);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);

  // Temp state for new/edited product
  const [tempQuantity, setTempQuantity] = useState<number>(1);
  const [tempCostPrice, setTempCostPrice] = useState<number>(0);
  const [tempTotal, setTempTotal] = useState<number>(0);

  const [loading, setLoading] = useState(false);

  // Calculate tempTotal when rate or quantity changes
  useEffect(() => {
    setTempTotal(tempCostPrice * tempQuantity);
  }, [tempCostPrice, tempQuantity]);

  // Fetch vendors and products on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/vendor').then(res => res.json()),
      fetch('/api/product').then(res => res.json()),
      fetch('/api/brand').then(res => res.json())
    ])
    .then(([vendorData, productData, brandData]) => {
      const vendorList = Array.isArray(vendorData) ? vendorData : vendorData.vendors || [];
      const productList = Array.isArray(productData) ? productData : productData.products || [];
      const brandList = Array.isArray(brandData) ? brandData : brandData.brands || [];
      
      setVendors(vendorList);
      setAllProducts(productList);
      setAllbrands(brandList);

      // Set default vendor to "Walk In" (ID: 1)
      const walkInVendor = vendorList.find((v: Vendor) => v.id === 1);
      if (walkInVendor) {
        setVendor(walkInVendor);
        setSelectedVendorOption({
          value: walkInVendor.id,
          label: walkInVendor.name,
          ...walkInVendor
        });
      }
    })
    .catch(err => {
      console.error("Failed to fetch initial data:", err);
    });
  }, []);

  const handleAddProduct = (productId: number) => {
    const prod = allProducts.find((p: Product) => p.id === productId);
    if (!prod) return;

    if (editingProductId) {
      // Update existing product in cart
      setProducts(products.map((p: Product) =>
        p.id === editingProductId
          ? { ...p, stock: tempQuantity, cost_price: tempCostPrice }
          : p
      ));
      setEditingProductId(null);
    } else {
      // Check if product already exists in cart
      const existingProduct = products.find((p: Product) => p.id === productId);
      if (existingProduct) {
        // Update quantity if product already exists
        setProducts(products.map((p: Product) =>
          p.id === productId
            ? { ...p, stock: p.stock + tempQuantity, cost_price: tempCostPrice }
            : p
        ));
      } else {
        // Add new product
        const newProduct: Product = {
          id: prod.id,
          name: prod.name,
          sku: prod.sku || '',
          cost_price: tempCostPrice || prod.cost_price || 0,
          stock: tempQuantity,
          sale_price: prod.sale_price || 0,
          description: prod.description || '',
          min_stock_level: prod.min_stock_level || 0,
          brand_id: prod.brand_id || 0,
          category_id: prod.category_id || 0,
        };
        setProducts([...products, newProduct]);
      }
    }

    // Reset search and values
    setSelectedProductOption(null);
    setTempQuantity(1);
    setTempCostPrice(0);
    setTempTotal(0);
  };

  const updateProduct = (id: number, field: keyof Product, value: number) => {
    setProducts(products.map((p: Product) => p.id === id ? { ...p, [field]: value } : p));
  };

  const removeProduct = (id: number) => {
    setProducts(products.filter((p: Product) => p.id !== id));
  };

  const subtotal = products.reduce((acc, p) =>
    acc + (p.cost_price * p.stock), 0);

  const calcOrderDiscount = () => {
    return orderDiscountType === "%"
      ? subtotal * (orderDiscount / 100)
      : orderDiscount;
  };

  const tax = Math.round((subtotal - calcOrderDiscount()) * taxRate) / 100;
  const grandTotal = subtotal - calcOrderDiscount() + tax;

  const handlePurchase = async () => {
    setLoading(true);
    try {
      if (!vendor) {
        alert('Please select a vendor');
        return;
      }
      if (products.length === 0) {
        alert('Please add at least one product');
        return;
      }
      const payload = {
        vendor_id: vendor.id,
        invoice_number: invoiceNumber,
        total_amount: Number(grandTotal.toFixed(2)),
        amount_paid: purchaseType === 'Cash' ? Number(grandTotal.toFixed(2)) : Number(amountPaid),
        payment_terms: purchaseType.toLowerCase(),
        payment_method: paymentMethod,
        due_date: dueDate || date,
        discount: Number(calcOrderDiscount().toFixed(2)),
        tax_amount: tax,
        subtotal: subtotal,
        purchase_date: date,
        items: products.map((product: Product) => ({
          product_id: product.id,
          quantity: product.stock,
          cost_price: product.cost_price,
        })),
      };
      const res = await fetch('/api/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to add purchase');
      }
      alert('Purchase added successfully');
      // Reset form
      setProducts([]);
      setOrderDiscount(0);
      setOrderDiscountType('PKR');
      setInvoiceNumber(`PUR-${uuidv4().slice(0, 8)}`);
      // Reset vendor selection
      const walkInVendor = vendors.find((v: Vendor) => v.id === 1);
      if (walkInVendor) {
        setVendor(walkInVendor);
        setSelectedVendorOption({
          value: walkInVendor.id,
          label: walkInVendor.name,
          ...walkInVendor
        });
      } else {
        setVendor(null);
        setSelectedVendorOption(null);
      }
    } catch (err: unknown) {
      console.error('Error adding purchase:', err);
      alert((err as Error).message || 'An error occurred while adding the purchase');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-800">Purchase Order</h1>
            <div className="flex items-center gap-4">
              <div className="bg-gray-100 px-4 py-2 rounded-lg">
                <div className="text-sm text-gray-600">Order Summary</div>
                <div className="text-sm font-semibold">{products.length} items</div>
              </div>
              <button
                onClick={() => {
                  setProducts([]);
                  setOrderDiscount(0);
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:text-red-800 border border-red-200 rounded-lg"
              >
                <span>✕</span>
                Clear (C)
              </button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Product Entry and List */}
          <div className="lg:col-span-2 space-y-4">
            {/* Purchase Type and Invoice Info */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex lg:flex-row justify-between">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Type</label>
                  <select
                    value={purchaseType}
                    onChange={(e) => setPurchaseType(e.target.value as "Cash" | "Credit")}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Credit">Credit</option>
                  </select>
                </div>
                <div>
                  <label className="block text-semibold font-medium text-gray-700 mb-1">Vendor Selection</label>
                  <Select
                    options={vendors.map(vendor => ({
                      value: vendor.id,
                      label: vendor.name,
                      ...vendor
                    }))}
                    value={selectedVendorOption}
                    onChange={(option: any) => {
                      if (!option) return;
                      setSelectedVendorOption(option);
                      setVendor(option);
                    }}
                    placeholder="Search or select a vendor..."
                    isSearchable
                    classNamePrefix="react-select"
                  />
                </div>
                <div>
                  <label className="block text-semibold font-medium text-gray-700 mb-1">Invoice #</label>
                  <p>{invoiceNumber}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Product Search and Add */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Product Name / SKU / Barcode
                  </label>
                  <Select
                    options={allProducts.map(product => ({
                      value: product.id,
                      label: `${product.name} (Brand: ${allbrands.find(b => b.id === product.brand_id)?.name}, SKU: ${product.sku}, Cost: PKR ${product.cost_price})`,
                      ...product
                    }))}
                    value={selectedProductOption}
                    onChange={(option: any) => {
                      if (!option) return;
                      setSelectedProductOption(option);
                      // Pre-fill cost price from selected product
                      const costPrice = option.cost_price || 0;
                      setTempCostPrice(costPrice);
                      setTempQuantity(1);
                      setTempTotal(costPrice);
                    }}
                    placeholder="Search or select a product..."
                    isSearchable
                    classNamePrefix="react-select"
                  />
                </div>
                <div className="w-20">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Rate</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={tempCostPrice}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value) || 0;
                      setTempCostPrice(value);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
                  />
                </div>
                <div className="w-20">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Qty</label>
                  <input
                    type="number"
                    min="1"
                    value={tempQuantity}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 1;
                      setTempQuantity(value);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
                  />
                </div>
                <div className="w-20">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Total</label>
                  <input
                    type="number"
                    min="0"
                    value={tempTotal}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
                  />
                </div>
                <button
                  onClick={() => selectedProductOption && handleAddProduct(selectedProductOption.value)}
                  disabled={!selectedProductOption}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
                >
                  {editingProductId ? "Update" : "Add"}
                </button>
              </div>
            </div>

            {/* Product List */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              {products.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <div className="text-4xl mb-4">📦</div>
                  <div className="text-lg font-medium mb-2">No items in purchase order</div>
                  <div className="text-sm">Start by searching and adding products above</div>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[calc(100vh-520px)] overflow-y-auto relative">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Product Name / SKU / Barcode</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Qty</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Cost Price</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Total</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {products.map((product) => (
                        <tr key={product.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">{product.name}</div>
                            <div className="text-sm text-gray-500">Brand: {allbrands.find(b => b.id === product.brand_id)?.name}</div>
                            <div className="text-sm text-gray-500">SKU: {product.sku}</div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => updateProduct(product.id, 'stock', Math.max(1, product.stock - 1))}
                                className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600"
                              >
                                <MinusIcon className="w-4 h-4" />
                              </button>
                              <input
                                type="number"
                                min="1"
                                value={product.stock}
                                onChange={(e) => updateProduct(product.id, 'stock', parseInt(e.target.value) || 1)}
                                className="w-16 px-2 py-1 text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                              <button
                                onClick={() => updateProduct(product.id, 'stock', product.stock + 1)}
                                className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600"
                              >
                                <PlusIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={product.cost_price}
                              onChange={(e) => updateProduct(product.id, 'cost_price', parseFloat(e.target.value) || 0)}
                              className="w-20 px-2 py-1 text-right border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">PKR {(product.cost_price * product.stock).toFixed(2)}</td>
                          <td className="px-4 py-3 text-center flex justify-center">
                            <button
                              onClick={() => {
                                setEditingProductId(product.id);
                                setSelectedProductOption({
                                  value: product.id,
                                  label: `${product.name} (Brand: ${allbrands.find(b => b.id === product.brand_id)?.name}, SKU: ${product.sku}, Cost: PKR ${product.cost_price})`,
                                  ...product
                                });
                                setTempCostPrice(product.cost_price);
                                setTempQuantity(product.stock);
                                setTempTotal(product.cost_price * product.stock);
                              }}
                              className="text-blue-600 hover:text-blue-800 p-1 mr-2"
                              title="Edit item"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => removeProduct(product.id)}
                              className="text-red-600 hover:text-red-800 p-1"
                              title="Remove item"
                            >
                              <Trash size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Order Summary */}
          <div className="space-y-4">
            {/* Order Summary Card */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Purchase Summary</h2>
              <div className="space-y-3 mb-4">
                <label className="block">Payment terms<select value={purchaseType} onChange={e=>setPurchaseType(e.target.value as 'Cash'|'Credit')} className="w-full border p-2"><option>Cash</option><option>Credit</option></select></label>
                {purchaseType==='Credit' && <><label className="block">Amount paid now<input type="number" min="0" step="0.01" value={amountPaid} onChange={e=>setAmountPaid(e.target.value)} className="w-full border p-2"/></label><label className="block">Due date<input type="date" min={date} value={dueDate} onChange={e=>setDueDate(e.target.value)} className="w-full border p-2"/></label></>}
                <label className="block">Payment account<select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)} className="w-full border p-2"><option value="cash">Cash</option><option value="bank">Bank</option></select></label>
                <label className="block">Tax rate (%)<input type="number" min="0" max="100" step="0.01" value={taxRate} onChange={e=>setTaxRate(Number(e.target.value))} className="w-full border p-2"/></label>
              </div>
              {/* Order Discount */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Order Discount</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={orderDiscount}
                    onChange={(e) => setOrderDiscount(Number(e.target.value) || 0)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                  <select
                    value={orderDiscountType}
                    onChange={(e) => setOrderDiscountType(e.target.value as "%" | "PKR")}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="PKR">PKR</option>
                    <option value="%">%</option>
                  </select>
                </div>
              </div>
              {/* Summary Details */}
              <div className="space-y-3 border-t border-gray-200 pt-4">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal:</span>
                  <span className="font-medium">PKR {subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Tax:</span>
                  <span className="font-medium">PKR {tax.toFixed(2)}</span>
                </div>
                {orderDiscount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Discount:</span>
                    <span className="font-medium">-PKR {calcOrderDiscount().toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xl font-bold text-gray-900 border-t border-gray-200 pt-3">
                  <span>Total:</span>
                  <span className="text-green-600">PKR {grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
            {/* Action Buttons */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="space-y-3">
                <button
                  onClick={handlePurchase}
                  className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-4 rounded-lg font-semibold text-lg transition-colors"
                  disabled={loading}
                >
                  {loading ? "Processing..." : "Complete Purchase"}
                </button>
                <button
                  onClick={() => {
                    setProducts([]);
                    setOrderDiscount(0);
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-lg font-semibold text-lg transition-colors"
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewPurchase;
