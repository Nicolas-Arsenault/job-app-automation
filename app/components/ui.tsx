import type { ReactNode } from "react";
import { CATEGORY_LABELS, type JobCategory } from "@/lib/discovery/categories";
import {
  canonicalJudgeProvider,
  judgeProviderLabel,
} from "@/lib/judge/provider";

export const cls = {
  card:
    "rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.045)] dark:border-slate-800 dark:bg-slate-900",
  cardTight:
    "rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900",
  btnPrimary:
    "rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-emerald-950 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-emerald-400 hover:shadow-md disabled:opacity-50",
  btn:
    "rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
  btnDanger:
    "rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:bg-gray-800 dark:hover:bg-red-950",
  btnGreen:
    "rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-emerald-950 transition-all hover:bg-emerald-400 disabled:opacity-50",
  input:
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:ring-emerald-900/40",
  label: "block text-sm font-medium text-gray-700 dark:text-gray-300",
  chip:
    "inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  muted: "text-gray-500 dark:text-gray-400",
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  drafted: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  pending_approval: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  submitted: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  skipped: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? STATUS_COLORS.new;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70
      ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
      : score >= 40
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  return (
    <span className={`inline-block w-9 rounded-md text-center text-xs font-semibold ${color} py-1`}>
      {score}
    </span>
  );
}

// Resume-fit badge from the post-scrape judge.
export function FitBadge({
  score,
  provider,
}: {
  score: number | null | undefined;
  provider?: string | null;
}) {
  if (score == null) return null;
  const color =
    score >= 70
      ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
      : score >= 40
        ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300"
        : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400";
  const canonical = canonicalJudgeProvider(provider);
  const label = canonical ? judgeProviderLabel(canonical) : "Baseline";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold ${color}`}
      title={`${label} Judge score`}
    >
      fit {score}
      <span className="rounded bg-white/60 px-1 text-[10px] font-medium uppercase tracking-wide dark:bg-black/30">
        {label}
      </span>
    </span>
  );
}

// User pipeline status for a discovered job (none | saved | applied | ...).
const APPLIED_COLORS: Record<string, string> = {
  none: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  saved: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  applied: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  interviewing: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  offer: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  dismissed: "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500",
};

export function AppliedBadge({ status }: { status: string }) {
  if (!status || status === "none") return null;
  const color = APPLIED_COLORS[status] ?? APPLIED_COLORS.none;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}

// Company-category chip (Big Tech / Mid Tech / AI Lab / Quant / Defense / Startup / Other).
// Each bucket gets a distinct hue so a card's kind is legible at a glance;
// colors are contrast-checked for both themes.
const CATEGORY_COLORS: Record<JobCategory, string> = {
  bigtech: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  midtech: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  ai: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  quant: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  defense: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
  startup: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  other: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export function CategoryBadge({ category }: { category: JobCategory | null | undefined }) {
  if (!category) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${CATEGORY_COLORS[category]}`}
    >
      {CATEGORY_LABELS[category]}
    </span>
  );
}

// Visa-sponsorship badge derived from enrichment. Always renders so every card
// states a sponsorship status; anything we couldn't determine (or a legacy row
// with no value) falls back to a muted "unknown" tag rather than showing nothing.
const SPONSOR_LABEL: Record<string, { text: string; color: string }> = {
  offers: {
    text: "sponsors visa",
    color: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  },
  none: {
    text: "no sponsorship",
    color: "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300",
  },
  citizenship: {
    text: "citizenship req.",
    color: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  unknown: {
    text: "sponsorship unknown",
    color: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  },
};

export function SponsorshipBadge({ value }: { value: string | null | undefined }) {
  const key = value && SPONSOR_LABEL[value] ? value : "unknown";
  const { text, color } = SPONSOR_LABEL[key];
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${color}`}
      title={
        key === "unknown"
          ? "Visa sponsorship not stated in this posting"
          : `Visa sponsorship: ${text}`
      }
    >
      {text}
    </span>
  );
}

// Country flag chip (🇺🇸 / 🇨🇦) — a quick geography anchor on each card. Rendered
// as an emoji so it stays crisp at any size and matches the app's emoji accents;
// non-US/CA (or missing) countries render nothing.
const COUNTRY_FLAG: Record<string, { flag: string; label: string }> = {
  US: { flag: "🇺🇸", label: "United States" },
  CA: { flag: "🇨🇦", label: "Canada" },
};

export function CountryFlag({ country }: { country: string | null | undefined }) {
  const entry = country ? COUNTRY_FLAG[country.toUpperCase()] : undefined;
  if (!entry) return null;
  return (
    <span
      role="img"
      aria-label={entry.label}
      title={entry.label}
      className="text-sm leading-none"
    >
      {entry.flag}
    </span>
  );
}

function fmtK(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

// Compact salary display: "$120k–150k" from normalized min/max, else the raw
// string the source provided.
export function SalaryText({
  min,
  max,
  currency,
  raw,
  fallback,
}: {
  min: number | null | undefined;
  max: number | null | undefined;
  currency?: string | null;
  raw?: string | null;
  /** Rendered as a muted tag when no salary is known, so a row of tags still aligns. */
  fallback?: string;
}) {
  const sym = currency === "CAD" ? "C$" : "$";
  let text: string | null = null;
  if (min && max) text = `${sym}${fmtK(min)}–${fmtK(max)}`;
  else if (min) text = `${sym}${fmtK(min)}+`;
  else if (raw) text = raw.length > 24 ? `${raw.slice(0, 24)}…` : raw;
  if (!text)
    return fallback ? (
      <span className="inline-block px-1.5 py-0.5 text-xs text-gray-400 dark:text-gray-500">
        {fallback}
      </span>
    ) : null;
  return (
    <span className="inline-block rounded px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
      {text}
    </span>
  );
}

export function SkillChips({ skills, limit = 8 }: { skills: string[]; limit?: number }) {
  if (!skills?.length) return null;
  const shown = skills.slice(0, limit);
  const extra = skills.length - shown.length;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {shown.map((s) => (
        <span key={s} className={cls.chip}>
          {s}
        </span>
      ))}
      {extra > 0 && <span className={cls.chip}>+{extra}</span>}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="max-w-3xl">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400"><span className="h-px w-5 bg-emerald-400" /> Your workspace</div>
        <h1 className="text-3xl font-black tracking-[-0.04em] text-slate-950 sm:text-4xl dark:text-white">{title}</h1>
        {subtitle && <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
