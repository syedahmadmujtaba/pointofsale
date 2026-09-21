"use client";
import { MinusIcon, PlusIcon } from "lucide-react";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { use } from 'react';
import dynamic from 'next/dynamic';
const Select = dynamic(() => import('react-select'), { ssr: false });
interface Brand {
  id: number;
  name: string;
}
interface Product {
  id: number;
  name: string;
  sku: string;
  sale_price: number;
  brand_id: number;
  stock: number;
  quantity: number;
}

interface Customer {
  id: number;
  name: string;
}

interface SaleItem {
  id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface SaleData {
  id: number;
  invoice_number: string;
  customer_id: number;
  subtotal: number;
  discount: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  sale_date: string;
  items: SaleItem[];
}

const EditSale = ({ params }: { params: Promise<{ id: string }> }) => {
  const router = useRouter();
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allbrands, setAllbrands] = useState<Brand[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orderDiscount, setOrderDiscount] = useState<number>(0);
  const [orderDiscountType, setOrderDiscountType] = useState<'%' | 'PKR'>('PKR');
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [selectedProductOption, setSelectedProductOption] = useState <any> (null);
  const [tempQuantity, setTempQuantity] = useState<number>(1);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [error, setError] = useState('');
  const { id } = use(params);

  // Fetch sale data, customers and products on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch sale data
        const saleRes = await fetch(`/api/sale/${id}`);
        if (!saleRes.ok) throw new Error('Failed to fetch sale data');
        const saleData: { sale: SaleData; items: SaleItem[] } = await saleRes.json();

        // Fetch customers
        const customersRes = await fetch('/api/customer');
        const customersData = await customersRes.json();
        setCustomers(Array.isArray(customersData) ? customersData : customersData.customers || []);

        // Fetch products
        const productsRes = await fetch('/api/product');
        const productsData = await productsRes.json();
        const allProductsData = Array.isArray(productsData) ? productsData : productsData.products || [];

        // Fetch brands
        const brandsRes = await fetch('/api/brand');
        const brandsData = await brandsRes.json();
        const allBrandsData = Array.isArray(brandsData) ? brandsData : brandsData.brands || [];
        setAllbrands(allBrandsData);
        
        // Set form data
        setInvoiceNumber(saleData.sale.invoice_number);
        setDate(new Date(saleData.sale.sale_date).toISOString().slice(0, 10));
        
        // Find and set customer
        const foundCustomer = customersData.find((c: Customer) => c.id === saleData.sale.customer_id);
        if (foundCustomer) setCustomer(foundCustomer);
        
        // Set discount
        setOrderDiscount(Number(saleData.sale.discount));
        
        // Map sale items to products
        const saleProducts = saleData.items.map(item => {
          const product = allProductsData.find((p: Product) => p.id === item.product_id);
          return {
            id: item.product_id,
            name: product?.name || '',
            sku: product?.sku || '',
            sale_price: item.unit_price,
            stock: product?.stock || 0,
            quantity: item.quantity,
            brand_id: product?.brand_id || 0,
          };
        });
        
        setProducts(saleProducts);
        setAllProducts(allProductsData);
        setLoading(false);
      } catch (err) {
        setError('Failed to load data');
        setLoading(false);
        console.error(err);
      }
    };

    fetchData();
  }, [params]);

  const handleAddProduct = (productId: number) => {
    const prod = allProducts.find((p: Product) => p.id === productId);
    if (!prod) return;
    
    // Check if product already exists in cart
    const existingProduct = products.find((p: Product) => p.id === productId);
    if (existingProduct) {
      // Update quantity if product already exists
      setProducts(products.map((p: Product) => 
        p.id === productId 
          ? { ...p, quantity: p.quantity + tempQuantity }
          : p
      ));
    } else {
      // Add new product
      const newProduct: Product = {
        id: prod.id,
        name: prod.name,
        sku: prod.sku || '',
        sale_price: prod.sale_price || 0,
        stock: prod.stock || 0,
        quantity: tempQuantity,
        brand_id: prod.brand_id || 0,
      };
      setProducts([...products, newProduct]);
    }
    
    // Reset search and quantity
    setSearchTerm("");
    setSelectedProductId(null);
    setTempQuantity(1);
  };

  const updateProduct = (id: number, field: keyof Product, value: number) => {
    setProducts(products.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const removeProduct = (id: number) => {
    setProducts(products.filter((p: Product) => p.id !== id));
  };

  const subtotal = products.reduce((acc, p) =>
    acc + (p.sale_price * p.quantity), 0);
  const NumberSubtotal = Number(subtotal).toFixed(2);

  const calcOrderDiscount = () => {
    return orderDiscountType === "%"
      ? Number(NumberSubtotal) * (orderDiscount / 100)
      : Number(orderDiscount);
  };

  const tax = Number(NumberSubtotal) * 0.00; // 0% tax
  const grandTotal = Number(NumberSubtotal) - Number(calcOrderDiscount()) + Number(tax);

  const handleUpdateSale = async () => {
    try {
      if (!customer) {
        alert('Please select a customer');
        return;
      }
      if (products.length === 0) {
        alert('Please add at least one product');
        return;
      }

      // Validate that all products have valid quantities and prices
      for (const product of products) {
        if (!product.quantity || product.quantity <= 0) {
          alert(`Please enter a valid quantity for ${product.name}`);
          return;
        }
        if (!product.sale_price || product.sale_price <= 0) {
          alert(`Please enter a valid unit price for ${product.name}`);
          return;
        }
      }
      
      setEditLoading(true);
      
      const payload = {
        invoice_number: invoiceNumber,
        customer_id: customer.id,
        discount: calcOrderDiscount(),
        subtotal: subtotal,
        tax_amount: tax,
        total_amount: grandTotal,
        // Settled invoices must have payments reversed before an edit is allowed.
        // Editing must never silently turn an unpaid credit invoice into cash.
        amount_paid: 0,
        payment_terms: 'credit',
        sale_date: date,
        items: products.map(p => ({
          id: p.id,
          quantity: p.quantity,
          sale_price: p.sale_price,
          line_total: p.sale_price * p.quantity
        }))
      };
      
      const res = await fetch(`/api/sale/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update sale');
      }
      
      alert('Sale updated successfully');
      router.push('/sale');
    } catch (err: unknown) {
      alert((err as Error).message || 'Failed to update sale');
      console.error(err);
    } finally {
      setEditLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-100 p-4 md:p-8 w-full max-w-screen-2xl mx-auto flex items-center justify-center">
        <div className="text-xl font-semibold text-indigo-700">Loading sale data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-100 p-4 md:p-8 w-full max-w-screen-2xl mx-auto flex items-center justify-center">
        <div className="text-xl font-semibold text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Edit Sale</h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
              <span>Invoice: <span className="font-medium text-gray-800">#{invoiceNumber}</span></span>
              <span>Date: <span className="font-medium text-gray-800"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></span></span>
              <span>Customer: <span className="font-medium text-gray-800">{customer?.name || 'Not selected'}</span></span>
            </div>
          </div>
          <button
            onClick={() => router.push('/sale')}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            ← Back to Sales
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Product Management */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Selection */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex">Customer Selection</h2>
            <div className="flex justify-between mb-4">
            <div className="relative w-2/3">
              <input
                type="text"
                placeholder="Search customers..."
                value={customerSearchTerm}
                onChange={(e) => setCustomerSearchTerm(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {customerSearchTerm && (
                <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-lg mt-1 max-h-48 overflow-y-auto z-10">
                  {customers
                    .filter(c => c.name.toLowerCase().includes(customerSearchTerm.toLowerCase()))
                    .map(c => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setCustomer(c);
                          setCustomerSearchTerm("");
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                      >
                        {c.name}
                      </button>
                    ))
                  }
                </div>
              )}
            </div>
            {customer && (
              <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                <span className="text-sm text-blue-700">Selected: <strong>{customer.name}</strong></span>
              </div>
            )}
            </div>
          </div>

          {/* Product Search & Add */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Add Products</h2>
            <div className="flex gap-3 mb-4">
              <div className="flex-1 relative">
                <Select
                    options={allProducts.map(product => ({
                      value: product.id,
                      label: `${product.name} (SKU: ${product.sku}, PKR ${product.sale_price}, Brand: ${allbrands.find(b => b.id === product.brand_id)?.name})`,
                      ...product
                    }))}
                    value={selectedProductOption}
                    onChange={(option: any) => {
                      if (!option) return;
                      setSelectedProductOption(option);
                      setSelectedProductId(option.value);
                    }}
                    placeholder="Search or select a product..."
                    isSearchable
                    classNamePrefix="react-select"
                  />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTempQuantity(Math.max(1, tempQuantity - 1))}
                  className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  disabled={tempQuantity <= 1}
                >
                  <MinusIcon className="w-4 h-4" />
                </button>
                <input
                  type="number"
                  min="1"
                  value={tempQuantity}
                  onChange={(e) => setTempQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 px-2 py-2 text-center border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => setTempQuantity(tempQuantity + 1)}
                  className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <PlusIcon className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={() => selectedProductId && handleAddProduct(selectedProductId)}
                disabled={!selectedProductId}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Product List */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800">Products in Sale</h2>
            </div>
            <div className="p-6">
              {products.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No products added yet
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-700">Product</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">SKU</th>
                        <th className="text-center py-3 px-4 font-medium text-gray-700">Quantity</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-700">Price</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-700">Total</th>
                        <th className="text-center py-3 px-4 font-medium text-gray-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product) => (
                        <tr key={product.id} className="border-b border-gray-100">
                          <td className="py-4 px-4">
                            <div className="font-medium text-gray-900">{product.name}</div>
                            <div className="text-sm text-gray-500">Brand: {allbrands.find(b => b.id === product.brand_id)?.name}</div>
                          </td>
                          <td className="py-4 px-4 text-gray-600">{product.sku}</td>
                          <td className="py-4 px-4">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => updateProduct(product.id, 'quantity', Math.max(1, product.quantity - 1))}
                                className="p-1 border border-gray-300 rounded hover:bg-gray-50"
                                disabled={product.quantity <= 1}
                              >
                                <MinusIcon className="w-4 h-4" />
                              </button>
                              <input
                                type="number"
                                min="1"
                                max={product.stock + product.quantity}
                                value={product.quantity}
                                onChange={(e) => updateProduct(product.id, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-16 px-2 py-1 text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                              <button
                                onClick={() => updateProduct(product.id, 'quantity', product.quantity + 1)}
                                className="p-1 border border-gray-300 rounded hover:bg-gray-50"
                                disabled={product.quantity >= product.stock + product.quantity}
                              >
                                <PlusIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-right">
                            <input
                              type="number"
                              value={product.sale_price}
                              onChange={(e) => updateProduct(product.id, 'sale_price', Number(e.target.value) || 0)}
                              className="w-24 px-2 py-1 text-right border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              step="1"
                              min="0"
                            />
                          </td>
                          <td className="py-4 px-4 text-right font-semibold">PKR {(product.sale_price * product.quantity).toFixed(2)}</td>
                          <td className="py-4 px-4 text-center">
                            <button
                              onClick={() => removeProduct(product.id)}
                              className="text-red-600 hover:text-red-800 p-1"
                              title="Remove item"
                            >
                              🗑️
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
        </div>

        {/* Right Column - Order Summary */}
        <div className="space-y-4">
          {/* Order Summary Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Order Summary</h2>
            
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
                <span className="font-medium">PKR {NumberSubtotal}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Tax:</span>
                <span className="font-medium">PKR {tax}</span>
              </div>
              {orderDiscount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Discount:</span>
                  <span className="font-medium">-PKR {calcOrderDiscount()}</span>
                </div>
              )}
              <div className="flex justify-between text-xl font-bold text-gray-900 border-t border-gray-200 pt-3">
                <span>Total:</span>
                <span className="text-green-600">PKR {grandTotal}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="space-y-3">
              <button
                onClick={handleUpdateSale}
                className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-4 rounded-lg font-semibold text-lg transition-colors"
                disabled={editLoading}
              >
                {editLoading ? "Updating..." : "Update Sale"}
              </button>
              <button
                onClick={() => router.push('/sale')}
                className="w-full flex items-center justify-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-6 py-4 rounded-lg font-semibold text-lg transition-colors"
                disabled={editLoading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditSale;
