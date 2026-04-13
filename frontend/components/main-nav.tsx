"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/upload", label: "Upload" },
  { href: "/detections", label: "Detections" }
];

function itemClassName(isActive: boolean) {
  if (isActive) {
    return "rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white";
  }

  return "rounded-full px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100";
}

export function MainNav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-4 sm:px-10">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Solution Challenge 2026</p>
          <p className="text-base font-bold text-slate-900">Digital Asset Protection</p>
        </div>
        <nav className="flex items-center gap-2" aria-label="Main navigation">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} className={itemClassName(isActive)}>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}