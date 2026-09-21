'use client';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import React, { useMemo, useState, useEffect } from 'react';
import {
  LogOut, Package, Plus, RotateCcw, ShoppingCart, User,
  ClipboardList, Menu, X, ChevronDown, ChevronRight, LayoutDashboard,
  Receipt, Calculator, FileText, ScrollText
} from 'lucide-react';

interface NavItem {
  name: string;
  path: string;
  icon?: any;
  subItems?: {
    text: string;
    href: string;
    icon: any;
  }[];
}

const NAV_CONFIG: NavItem[] = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  {
    name: 'Products',
    path: '/product',
    icon: Package,
    subItems: [
      { href: "/product", icon: Package, text: "Products" },
      { href: "/product/categories", icon: Plus, text: "Category & Brand" },
      { href: "/product/demand", icon: RotateCcw, text: "Product Demand" },
      { href: "/product/report", icon: ClipboardList, text: "Product Report" },
      { href: "/product/stockreport", icon: ClipboardList, text: "Stock Report" },
    ]
  },
  {
    name: 'Sales',
    path: '/sale',
    icon: ShoppingCart,
    subItems: [
      { href: "/sale", icon: ShoppingCart, text: "Sales" },
      { href: "/sale/newsale", icon: Plus, text: "New Sale" },
      { href: "/sale/quotation", icon: FileText, text: "Sale Quotation" },
      { href: "/sale/return", icon: RotateCcw, text: "Return Sale" }
    ]
  },
  {
    name: 'Customers',
    path: '/customer',
    icon: User,
    subItems: [
      { href: "/customer", icon: User, text: "Customers" },
      { href: "/vendor", icon: User, text: "Vendor" }
    ]
  },
  {
    name: 'Purchases',
    path: '/purchase',
    icon: Package,
    subItems: [
      { href: "/purchase", icon: Package, text: "Purchase" },
      { href: "/purchase/newpurchase", icon: Plus, text: "New Purchase" },
      { href: "/purchase/quotation", icon: FileText, text: "Purchase Quotation" },
      { href: "/purchase/return", icon: RotateCcw, text: "Return Purchase" },
      { href: "/purchase/purchaselist", icon: ScrollText, text: "Purchase List" }
    ]
  },
  { name: 'Expenses', path: '/expenses', icon: Receipt },
  { name: 'Reports', path: '/report', icon: FileText },
  { name: 'Accounting', path: '/accounting', icon: Calculator },
  // { name: 'Accounts', path: '/account', icon: Calculator },
];

export default function Sidebar({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Derive sidebar items for Desktop view based on current path
  const currentSidebarItems = useMemo(() => {
    const activeItem = NAV_CONFIG.find(item =>
      pathname.startsWith(item.path) && item.name !== 'Dashboard' // Exclude dashboard from having sidebar if not needed, or keep consistent
    );
    return activeItem?.subItems || [];
  }, [pathname]);

  const toggleSubMenu = (name: string) => {
    setExpandedMenus(prev => ({
      ...prev,
      [name]: !prev[name]
    }));
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Top Navbar */}
      <nav className="flex items-center justify-between bg-gray-900 text-white p-4 shadow sticky top-0 z-50">
        <div className="flex items-center">
          <button
            className="lg:hidden mr-4 p-1 hover:bg-gray-800 rounded"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>

          <div className="hidden lg:flex space-x-6">
            {NAV_CONFIG.map((item) => (
              <Link key={item.name} href={item.path}>
                <span
                  className={`cursor-pointer hover:underline ${pathname.startsWith(item.path) && item.path !== '/dashboard' || pathname === item.path ? 'font-bold text-yellow-400' : ''
                    }`}
                >
                  {item.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded flex items-center space-x-2"
            onClick={async () => { await fetch('/api/auth/logout', {method:'POST'}); router.push('/login'); router.refresh(); }}>
            <LogOut />
            <span>Logout</span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        {currentSidebarItems.length > 0 && (
          <aside className="hidden lg:block w-64 bg-gray-100 p-4 border-r overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4">Options</h2>
            <ul className="space-y-2">
              {currentSidebarItems.map((item) => {
                const Icon = item.icon;
                return (
                  <li
                    key={item.href}
                    className="p-2 rounded hover:bg-gray-200 cursor-pointer text-gray-800"
                  >
                    <Link href={item.href}>
                      <span className="flex items-center space-x-2">
                        <Icon size={20} />
                        <span>{item.text}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </aside>
        )}

        {/* Mobile Sidebar / Drawer */}
        {isMobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black bg-opacity-50"
              onClick={() => setIsMobileMenuOpen(false)}
            ></div>

            {/* Drawer Content */}
            <aside className="relative w-72 bg-white h-full shadow-lg overflow-y-auto px-4 pb-4 pt-20 flex flex-col">

              <div className="mb-6 flex-1">
                <h3 className="text-gray-500 uppercase text-xs font-bold tracking-wider mb-4">Menu</h3>
                <nav className="flex flex-col space-y-2">
                  {NAV_CONFIG.map((item) => {
                    const hasSubItems = item.subItems && item.subItems.length > 0;
                    const isExpanded = expandedMenus[item.name];
                    const Icon = item.icon;

                    return (
                      <div key={item.name} className="flex flex-col">
                        <div
                          className={`flex items-center justify-between p-2 rounded hover:bg-gray-100 cursor-pointer ${pathname.startsWith(item.path) ? 'bg-gray-50 text-blue-600' : 'text-gray-700'
                            }`}
                          onClick={() => {
                            if (hasSubItems) {
                              toggleSubMenu(item.name);
                            } else {
                              router.push(item.path);
                              setIsMobileMenuOpen(false);
                            }
                          }}
                        >
                          <div className="flex items-center space-x-3">
                            {Icon && <Icon size={20} />}
                            <span className="font-medium">{item.name}</span>
                          </div>
                          {hasSubItems && (
                            <button className="p-1 hover:bg-gray-200 rounded">
                              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                          )}
                        </div>

                        {/* Dropdown Items */}
                        {hasSubItems && isExpanded && (
                          <div className="ml-9 mt-1 space-y-1 border-l-2 border-gray-100 pl-2">
                            {item.subItems!.map((subItem) => {
                              const SubIcon = subItem.icon;
                              return (
                                <Link
                                  key={subItem.href}
                                  href={subItem.href}
                                  onClick={() => setIsMobileMenuOpen(false)}
                                >
                                  <span className={`flex items-center space-x-2 p-2 rounded text-sm hover:bg-gray-50 ${pathname === subItem.href ? 'text-blue-600 font-medium' : 'text-gray-600'
                                    }`}>
                                    {SubIcon && <SubIcon size={16} />}
                                    <span>{subItem.text}</span>
                                  </span>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </nav>
              </div>
            </aside>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-y-auto bg-white">{children}</main>
      </div>
    </div>
  );
}
