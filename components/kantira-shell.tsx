"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LogOut,
  ShieldCheck,
  LayoutDashboard,
  Package,
  Users,
  Truck,
  BookOpenText,
  Boxes,
  ShoppingCart,
  Receipt,
  Store,
  PackageSearch,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/stores", label: "Stores", icon: Store },
  { href: "/items", label: "Items", icon: Package },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/suppliers", label: "Suppliers", icon: Truck },
  { href: "/purchases", label: "Purchases", icon: ShoppingCart },
  { href: "/sales", label: "Sales", icon: Receipt },
  { href: "/orders", label: "Online orders", icon: PackageSearch },
  { href: "/accounts", label: "Accounts", icon: BookOpenText },
  { href: "/stock", label: "Stock", icon: Boxes },
];

export function KantiraShell({
  orgName,
  role,
  signOutAction,
  children,
}: {
  orgName: string;
  role: string;
  signOutAction: () => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-brand-gray">
      <header className="border-b border-kantira-navy-100 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <img
              src="/brand/logos/kantira_mark.svg"
              alt=""
              aria-hidden="true"
              className="h-9 w-9"
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-royal">
                KANTIRA Business OS
              </p>
              <h1 className="text-lg font-bold text-kantira-navy-900">
                {orgName}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-navy/5 px-3 py-1 text-xs font-semibold text-brand-navy">
              <ShieldCheck size={14} className="text-brand-royal" />
              {role}
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-kantira-navy-600 hover:bg-kantira-navy-50"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </form>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-6">
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "border-brand-royal text-brand-royal"
                    : "border-transparent text-kantira-navy-500 hover:text-kantira-navy-800"
                }`}
              >
                <Icon size={15} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </div>
  );
}
