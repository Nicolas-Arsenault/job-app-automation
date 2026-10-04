"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useChromeExtensionStatus } from "./extension/useChromeExtensionStatus";

type NavItem = { href: string; label: string; icon: ReactNode };

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0">
      {children}
    </svg>
  );
}

const primaryLinks: NavItem[] = [
  { href: "/", label: "Overview", icon: <Icon><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></Icon> },
  { href: "/jobs", label: "Jobs", icon: <Icon><rect x="3" y="7" width="18" height="13" rx="3" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></Icon> },
  { href: "/applications", label: "Applications", icon: <Icon><path d="M7 3h10a2 2 0 0 1 2 2v16l-7-4-7 4V5a2 2 0 0 1 2-2Z" /><path d="m9 10 2 2 4-4" /></Icon> },
  { href: "/companies", label: "Companies", icon: <Icon><path d="M4 21V7l8-4v18M12 9h8v12M8 8v1M8 12v1M8 16v1M16 13v1M16 17v1M2 21h20" /></Icon> },
  { href: "/judge", label: "Judge", icon: <Icon><path d="M12 3v18M6 6h12M5 6l-3 6h6L5 6ZM19 6l-3 6h6l-3-6ZM8 21h8" /></Icon> },
];

const tierLinks = [
  { href: "/tiers", label: "Company tiers" },
  { href: "/location-tiers", label: "Location tiers" },
];

const extensionSetupLink = { href: "/extension", label: "Extension" };

const utilityLinks: NavItem[] = [
  { href: "/profile", label: "Profile", icon: <Icon><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Icon> },
  { href: "/settings", label: "Settings", icon: <Icon><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></Icon> },
];

function linkClass(active: boolean, indented = false) {
  return (
    "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 " +
    (indented ? "ml-7 py-2 text-[13px] " : "") +
    (active
      ? "bg-emerald-100 text-emerald-950 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.12)] dark:bg-emerald-400/15 dark:text-emerald-200"
      : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-white")
  );
}

export function Nav() {
  const path = usePathname();
  const { status: extensionStatus } = useChromeExtensionStatus();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const tiersActive = tierLinks.some((link) => isActive(link.href));
  const [tiersOpen, setTiersOpen] = useState(tiersActive);
  const [wasActive, setWasActive] = useState(tiersActive);

  if (tiersActive !== wasActive) {
    setWasActive(tiersActive);
    if (tiersActive) setTiersOpen(true);
  }

  const extensionIndicator = {
    checking: { label: "Offline", dot: "bg-slate-400 animate-pulse" },
    connected: { label: "Online", dot: "bg-emerald-500" },
    off: { label: "Offline", dot: "bg-rose-500" },
    unavailable: { label: "Offline", dot: "bg-rose-500" },
    unsupported: { label: "Offline", dot: "bg-slate-400" },
  }[extensionStatus.state];
  const extensionGlow = extensionStatus.state === "connected"
    ? " border border-green-400/70 shadow-[0_0_12px_rgba(34,197,94,0.35)] dark:border-green-500/70"
    : " border border-transparent";

  return (
    <nav className="flex flex-1 flex-col gap-1" aria-label="Main navigation">
      <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-600">Workspace</p>
      {primaryLinks.map((link) => (
        <Link key={link.href} href={link.href} aria-current={isActive(link.href) ? "page" : undefined} className={linkClass(isActive(link.href))}>
          <span className={isActive(link.href) ? "text-emerald-700 dark:text-emerald-300" : "text-slate-400 group-hover:text-slate-700 dark:text-slate-500 dark:group-hover:text-slate-200"}>{link.icon}</span>
          {link.label}
          {isActive(link.href) && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-500" />}
        </Link>
      ))}

      <div>
        <button type="button" onClick={() => setTiersOpen((open) => !open)} aria-expanded={tiersOpen} aria-controls="nav-tier-lists" data-testid="nav-tier-lists-toggle" className={linkClass(tiersActive && !tiersOpen) + " w-full"}>
          <span className="text-slate-400"><Icon><path d="M4 6h16M7 12h10M10 18h4" /></Icon></span>
          <span>Tier lists</span>
          <svg aria-hidden="true" viewBox="0 0 16 16" className={`ml-auto h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${tiersOpen ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.75"><path d="m6 4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        {tiersOpen && (
          <div id="nav-tier-lists" className="mt-1 flex flex-col gap-1">
            {tierLinks.map((link) => <Link key={link.href} href={link.href} aria-current={isActive(link.href) ? "page" : undefined} className={linkClass(isActive(link.href), true)}>{link.label}</Link>)}
          </div>
        )}
      </div>

      <div className="mt-auto space-y-1 pt-6">
        <div className="mb-3 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50 p-3.5 dark:border-emerald-900/60 dark:from-emerald-950/50 dark:to-teal-950/40">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-950 dark:text-emerald-100"><span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-400 text-sm">✦</span> Search companion</div>
          <p className="mt-2 text-[11px] leading-4 text-emerald-800/75 dark:text-emerald-300/70">Your shortlist, fit signals, and application tools in one calm place.</p>
        </div>
        <Link href={extensionSetupLink.href} aria-current={isActive(extensionSetupLink.href) ? "page" : undefined} className={linkClass(isActive(extensionSetupLink.href)) + extensionGlow} title={`Chrome autofill extension: ${extensionIndicator.label}`}>
          <span className="text-slate-400"><Icon><path d="M8 3h8v4H8zM5 7h14v14H5zM9 11h6M9 15h4" /></Icon></span>
          <span>{extensionSetupLink.label}</span>
          <span aria-hidden="true" className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-400"><span className={`h-2 w-2 rounded-full ${extensionIndicator.dot}`} />{extensionIndicator.label}</span>
          <span className="sr-only">Status: {extensionIndicator.label}</span>
        </Link>
        {utilityLinks.map((link) => (
          <Link key={link.href} href={link.href} aria-current={isActive(link.href) ? "page" : undefined} className={linkClass(isActive(link.href))}>
            <span className="text-slate-400">{link.icon}</span>{link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
