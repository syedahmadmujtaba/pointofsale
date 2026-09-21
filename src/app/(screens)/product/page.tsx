'use client';
import { Plus, Search, Pencil, Trash, ChevronUp, ChevronDown } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Product, Brand, Category } from '@/types/types';
import dynamic from "next/dynamic";

const Select = dynamic(() => import('react-select'), { ssr: false });

const Products = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  // Sorting state
  const [sortKey, setSortKey] = useState<'sku' | 'name' | 'brand' | 'category' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [newProduct, setNewProduct] = useState({
    item_type: 'stock',
    name: '',
    sku: '',
    description: '',
    cost_price: '',
    sale_price: '',
    brand_id: '',
    category_id: '',
    min_stock_level: '2',
  });
  const [loading, setLoading] = useState(false);

  // --- Edit Mode State ---
  const [isEditMode, setIsEditMode] = useState(false); // New state for mode
  const [editingProductId, setEditingProductId] = useState<number | null>(null); // ID of the product being edited
  const [editLoading, setEditLoading] = useState(false); // Use one loading state or separate if needed


  // Handle column sort
  const handleSort = (key: 'sku' | 'name' | 'brand' | 'category') => {
    if (sortKey === key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };



  // --- Unified handleEditClick ---
  const handleEditClick = (product: Product) => {
    // Populate the form fields with the selected product's data
    setNewProduct({
      item_type: product.item_type || 'stock',
      name: product.name,
      sku: product.sku || '',
      description: product.description || '', // Ensure description is handled
      cost_price: product.cost_price.toString(),
      sale_price: product.sale_price.toString(),
      brand_id: product.brand_id.toString(),
      category_id: product.category_id.toString(),
      min_stock_level: product.min_stock_level.toString(),
    });
    setIsEditMode(true); // Set mode to edit
    setEditingProductId(product.id); // Store the ID of the product being edited
    setShowAddModal(true); // Open the modal
  };

  // --- Unified handleAddProduct (handles Add & Edit) ---
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    // Use appropriate loading state
    if (isEditMode) {
      setEditLoading(true);
    } else {
      setLoading(true);
    }

    try {
      let res;
      if (isEditMode && editingProductId !== null) {
        // --- Edit Logic ---
        res = await fetch(`/api/product/${editingProductId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item_type: newProduct.item_type,
            name: newProduct.name,
            sku: newProduct.sku,
            // description is omitted for edit
            cost_price: Number(newProduct.cost_price),
            sale_price: Number(newProduct.sale_price),
            brand_id: Number(newProduct.brand_id),
            category_id: Number(newProduct.category_id),
            min_stock_level: Number(newProduct.min_stock_level),
            // stock is not sent, so it won't be changed
          }),
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to update product');
        }
      } else {
        // --- Add Logic ---
        res = await fetch('/api/product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item_type: newProduct.item_type,
            name: newProduct.name,
            sku: newProduct.sku,
            description: newProduct.description, // Include description for add
            cost_price: Number(newProduct.cost_price),
            sale_price: Number(newProduct.sale_price),
            brand_id: Number(newProduct.brand_id),
            category_id: Number(newProduct.category_id),
            min_stock_level: Number(newProduct.min_stock_level),
          }),
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to add product');
        }
      }

      // Close modal and reset states regardless of add/edit
      handleCancelModal(); // Use the cancel function to reset everything

      // Refresh products list
      const refreshed = await fetch('/api/product').then(r => r.json());
      const productsArray = Array.isArray(refreshed) ? refreshed : refreshed.products || [];
      setProducts(productsArray);

    } catch (err: unknown) {
      alert((err as Error).message);
    } finally {
      // Reset appropriate loading state
      if (isEditMode) {
        setEditLoading(false);
      } else {
        setLoading(false);
      }
    }
  };

  // --- Unified Cancel/Discard Modal ---
  const handleCancelModal = () => {
    setShowAddModal(false);
    setIsEditMode(false);
    setEditingProductId(null);
    // Reset form data to initial empty state
    setNewProduct({
      item_type: 'stock',
      name: '',
      sku: '',
      description: '',
      cost_price: '',
      sale_price: '',
      brand_id: '',
      category_id: '',
      min_stock_level: '2',
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewProduct({ ...newProduct, [e.target.name]: e.target.value });
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    setEditLoading(true); // Use editLoading for delete too, or add another state
    try {
      const res = await fetch(`/api/product/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete product');
      }
      // Refresh products
      const refreshed = await fetch('/api/product').then(r => r.json());
      const productsArray = Array.isArray(refreshed) ? refreshed : refreshed.products || [];
      setProducts(productsArray);
    } catch (err: unknown) {
      alert((err as Error).message);
    } finally {
      setEditLoading(false);
    }
  };

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/product');
        const data = await res.json();
        const productsArray = Array.isArray(data) ? data : data.products || [];
        const formatted = productsArray.map((product: Product) => ({
          id: product.id,
          name: product.name,
          sku: product.sku,
          cost_price: product.cost_price,
          sale_price: product.sale_price,
          brand_id: product.brand_id,
          category_id: product.category_id,
          min_stock_level: product.min_stock_level,
          stock: product.stock,
          description: product.description
        }));
        const brandres = await fetch('/api/brand');
        const branddata = await brandres.json();
        const brandsArray = Array.isArray(branddata) ? branddata : branddata.brands || [];
        const categoryres = await fetch('/api/category');
        const categorydata = await categoryres.json();
        const categoriesArray = Array.isArray(categorydata) ? categorydata : categorydata.categories || [];
        setBrands(brandsArray);
        setCategories(categoriesArray);
        setProducts(formatted);
      } catch (err: unknown) {
        alert("Error fetching products: " + (err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
    brands.find((b: Brand) => b.id === product.brand_id)?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    categories.find((c: Category) => c.id === product.category_id)?.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Apply sorting on filtered products
  const sortedFilteredProducts = React.useMemo(() => {
    const arr = [...filteredProducts];
    if (!sortKey) return arr;

    const getBrandName = (p: Product) =>
      (brands.find(b => b.id === p.brand_id)?.name || '').toLowerCase();
    const getCategoryName = (p: Product) =>
      (categories.find(c => c.id === p.category_id)?.name || '').toLowerCase();

    arr.sort((a, b) => {
      let va = '';
      let vb = '';
      switch (sortKey) {
        case 'sku':
          va = (a.sku || '').toLowerCase();
          vb = (b.sku || '').toLowerCase();
          break;
        case 'name':
          va = (a.name || '').toLowerCase();
          vb = (b.name || '').toLowerCase();
          break;
        case 'brand':
          va = getBrandName(a);
          vb = getBrandName(b);
          break;
        case 'category':
          va = getCategoryName(a);
          vb = getCategoryName(b);
          break;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filteredProducts, sortKey, sortDir, brands, categories]);

  return (
    <div className="max-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-100 p-4 md:p-8 w-full max-w-screen-2xl mx-auto">
      {/* Add/Edit Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md relative">
            <button
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 text-xl"
              onClick={handleCancelModal} // Use cancel handler
              aria-label="Close"
            >
              &times;
            </button>
            {/* Conditional Title */}
            <h2 className="text-2xl font-bold mb-6 text-indigo-700">
              {isEditMode ? 'Edit Product' : 'Add New Product'}
            </h2>
            <form onSubmit={handleAddProduct} className="space-y-4">
              <label htmlFor="item_type">Item type</label>
              <select id="item_type" className="w-full border rounded p-2" value={newProduct.item_type} onChange={e=>setNewProduct({...newProduct,item_type:e.target.value})}>
                <option value="stock">Stock item</option>
                <option value="service">Service (no inventory)</option>
              </select>
              {/* Brand Select */}
              <label htmlFor="brand_id">Brand</label>
              <Select
                options={brands.map((brand: Brand) => ({ value: brand.id, label: brand.name }))}
                placeholder="Select Brand"
                required
                // Ensure value is correctly set based on newProduct state
                value={brands.find(b => b.id.toString() === newProduct.brand_id) ? { value: parseInt(newProduct.brand_id), label: brands.find(b => b.id.toString() === newProduct.brand_id)?.name } : null}
                onChange={(selectedOption: any) => setNewProduct({ ...newProduct, brand_id: selectedOption?.value?.toString() || '' })}
                className="w-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                isDisabled={isEditMode && editLoading} // Disable during edit loading
              />

              {/* Category Select */}
              <label htmlFor="category_id">Category</label>
              <Select
                options={categories.map((category: Category) => ({ value: category.id, label: category.name }))}
                placeholder="Select Category"
                required
                // Ensure value is correctly set based on newProduct state
                value={categories.find(c => c.id.toString() === newProduct.category_id) ? { value: parseInt(newProduct.category_id), label: categories.find(c => c.id.toString() === newProduct.category_id)?.name } : null}
                onChange={(selectedOption: any) => setNewProduct({ ...newProduct, category_id: selectedOption?.value?.toString() || '' })}
                className="w-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                isDisabled={isEditMode && editLoading} // Disable during edit loading
              />

              {/* Product Name */}
              <label htmlFor="name">Product Name</label>
              <input
                type="text"
                name="name"
                placeholder="Product Name"
                value={newProduct.name}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                disabled={isEditMode && editLoading} // Disable during edit loading
              />

              {/* Description
              <label htmlFor="description">Product Description</label>
              <input
                  type="text"
                  name="description"
                  placeholder="Product Description"
                  value={newProduct.description}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  disabled={isEditMode && editLoading} // Shouldn't be needed, but good practice
                /> */}

              {/* SKU */}
              <label htmlFor="sku">SKU</label>
              <input
                type="text"
                name="sku"
                placeholder="SKU (Barcode)"
                value={newProduct.sku}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                disabled={isEditMode && editLoading} // Disable during edit loading or if SKU shouldn't be editable
              />

              {/* Cost Price */}
              <label htmlFor="cost_price">Cost Price</label>
              <input
                type="number"
                name="cost_price"
                placeholder="Cost Price"
                value={newProduct.cost_price}
                onChange={handleInputChange}
                required
                min="0"
                step="0.01" // Allow decimal prices
                className="w-full px-4 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                disabled={isEditMode && editLoading} // Disable during edit loading
              />

              {/* Sale Price */}
              <label htmlFor="sale_price">Sale Price</label>
              <input
                type="number"
                name="sale_price"
                placeholder="Sale Price"
                value={newProduct.sale_price}
                onChange={handleInputChange}
                required
                min="0"
                step="0.01" // Allow decimal prices
                className="w-full px-4 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                disabled={isEditMode && editLoading} // Disable during edit loading
              />

              {/* Min Stock Level */}
              <label htmlFor="min_stock_level">Min Stock Level</label>
              <input
                type="number"
                name="min_stock_level"
                placeholder="Min Stock Level"
                value={newProduct.min_stock_level}
                onChange={handleInputChange}
                required
                min="0"
                className="w-full px-4 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                disabled={isEditMode && editLoading} // Disable during edit loading
              />

              {/* Conditional Submit Button */}
              <button
                type="submit"
                className={`w-full ${isEditMode ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-blue-600 hover:bg-blue-700'} text-white py-2 rounded-xl font-semibold transition flex items-center justify-center`}
                disabled={loading || editLoading} // Disable based on loading state
              >
                {isEditMode
                  ? (editLoading ? 'Saving...' : 'Save Changes')
                  : (loading ? 'Adding...' : 'Add Product')}
              </button>
            </form>
          </div>
        </div>
      )}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
        <h1 className="text-3xl font-extrabold text-indigo-700 tracking-tight">Products</h1>
        <button
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl text-base font-semibold shadow-lg transition"
          onClick={() => {
            handleCancelModal(); // Reset state before opening for Add
            setShowAddModal(true);
          }}
        >
          <Plus size={16} />
          <span>Add Product</span>
        </button>
      </div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search products..."
            className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 text-base"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="overflow-x-auto bg-white border border-gray-200 rounded-2xl shadow-lg max-h-[calc(100vh-350px)] overflow-y-auto relative">
        <table className="min-w-full text-base">
          <thead className="bg-gradient-to-r from-indigo-50 to-blue-50 text-gray-600 font-semibold sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left">ID</th>
              <th
                className="px-4 py-3 text-left cursor-pointer select-none"
                onClick={() => handleSort('sku')}
              >
                <div className="inline-flex items-center gap-1">
                  SKU
                  <ChevronUp size={16} className={`${sortKey === 'sku' && sortDir === 'asc' ? 'text-indigo-600' : 'text-gray-400'}`} />
                  <ChevronDown size={16} className={`${sortKey === 'sku' && sortDir === 'desc' ? 'text-indigo-600' : 'text-gray-400'}`} />
                </div>
              </th>
              <th
                className="px-4 py-3 text-left cursor-pointer select-none"
                onClick={() => handleSort('name')}
              >
                <div className="inline-flex items-center gap-1">
                  Product
                  <ChevronUp size={16} className={`${sortKey === 'name' && sortDir === 'asc' ? 'text-indigo-600' : 'text-gray-400'}`} />
                  <ChevronDown size={16} className={`${sortKey === 'name' && sortDir === 'desc' ? 'text-indigo-600' : 'text-gray-400'}`} />
                </div>
              </th>
              <th className="px-4 py-3 text-left">Stock</th>
              <th
                className="px-4 py-3 text-left cursor-pointer select-none"
                onClick={() => handleSort('brand')}
              >
                <div className="inline-flex items-center gap-1">
                  Brand
                  <ChevronUp size={16} className={`${sortKey === 'brand' && sortDir === 'asc' ? 'text-indigo-600' : 'text-gray-400'}`} />
                  <ChevronDown size={16} className={`${sortKey === 'brand' && sortDir === 'desc' ? 'text-indigo-600' : 'text-gray-400'}`} />
                </div>
              </th>
              <th
                className="px-4 py-3 text-left cursor-pointer select-none"
                onClick={() => handleSort('category')}
              >
                <div className="inline-flex items-center gap-1">
                  Category
                  <ChevronUp size={16} className={`${sortKey === 'category' && sortDir === 'asc' ? 'text-indigo-600' : 'text-gray-400'}`} />
                  <ChevronDown size={16} className={`${sortKey === 'category' && sortDir === 'desc' ? 'text-indigo-600' : 'text-gray-400'}`} />
                </div>
              </th>
              <th className="px-4 py-3 text-left">Cost Price (PKR)</th>
              <th className="px-4 py-3 text-left">Selling Price (PKR)</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && !isEditMode && !editLoading ? ( // Show loading only for initial load/fetch, not edit/add
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                  </div>
                </td>
              </tr>
            ) : filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                  No products found
                </td>
              </tr>
            ) : (
              sortedFilteredProducts.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold">{product.id}</td>
                  <td className="px-4 py-3 font-semibold">{product.sku}</td>
                  <td className="px-4 py-3 font-semibold">{product.name}</td>
                  <td className="px-4 py-3 font-semibold">{product.stock}</td>
                  <td className="px-4 py-3 font-semibold">{brands.find((b: Brand) => b.id === product.brand_id)?.name}</td>
                  <td className="px-4 py-3 font-semibold">{categories.find((c: Category) => c.id === product.category_id)?.name}</td>
                  <td className="px-4 py-3 font-semibold">{product.cost_price.toLocaleString()}</td>
                  <td className="px-4 py-3 font-semibold">{product.sale_price.toLocaleString()}</td>
                  <td className="px-4 py-3 flex gap-2">
                    {/* Edit Button */}
                    <button
                      className={`p-2 rounded ${isEditMode || editLoading || loading // Disable if any operation is active
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-yellow-500 hover:bg-yellow-600 text-white'
                        }`}
                      onClick={() => handleEditClick(product)}
                      disabled={isEditMode || editLoading || loading} // Disable based on state
                      aria-label="Edit"
                    >
                      <Pencil size={16} />
                    </button>

                    {/* Delete Button */}
                    <button
                      className={`p-2 rounded ${isEditMode || editLoading || loading // Disable if any operation is active
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-red-600 hover:bg-red-700 text-white'
                        }`}
                      onClick={() => handleDelete(product.id)}
                      disabled={isEditMode || editLoading || loading} // Disable based on state
                      aria-label="Delete"
                    >
                      <Trash size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Products;
