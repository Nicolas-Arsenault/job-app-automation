"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/jobs", label: "Jobs", icon: "▣" },
  { href: "/applications", label: "Tracker", icon: "✓" },
  { href: "/profile", label: "Profile", icon: "○" },
];

export function MobileNav() {
  const path = usePathname();
  const isActive = (href: string) => href === "/" ? path === "/" : path.startsWith(href);

  return (
    <nav aria-label="Mobile navigation" className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-4 rounded-2xl border border-slate-200/80 bg-white/95 p-1.5 shadow-[0_16px_50px_rgba(15,23,42,0.16)] backdrop-blur-xl md:hidden dark:border-slate-700 dark:bg-slate-900/95">
      {links.map((link) => (
        <Link key={link.href} href={link.href} aria-current={isActive(link.href) ? "page" : undefined} className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[10px] font-bold transition-colors ${isActive(link.href) ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-200" : "text-slate-400 dark:text-slate-500"}`}>
          <span aria-hidden="true" className="text-base leading-none">{link.icon}</span>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
