import { chromium, type Browser, type Page } from "playwright";
import { classifyCountry, isSoftwareRole, type Country } from "./entryLevel";
import {
  BROWSER_COMPANIES,
  SCRAPABLE_BROWSER_SYSTEMS,
  type BrowserCompany,
  type BrowserSystem,
} from "./companies";
import type { DiscoveryPosting } from "./adapters";

// Playwright-based scraper for the client-rendered / bot-gated career sites that
// have no usable public JSON API (see BROWSER_COMPANIES). It is intentionally
// best-effort and kept OUT of the default test/CI path — it needs a real
// browser and live network. Each search URL in the catalog is already scoped to
// one country, so we tag every posting harvested from a page with that page's
// country instead of trying to parse geography per card.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

// A single harvested posting before country is applied.
interface RawCard {
  title: string;
  href: string;
  externalId: string;
  postedAt: string | null;
  description?: string;
  location?: string;
  country?: Country;
}

interface SiteRule {
  // The origin used to absolutize relative hrefs.
  origin: string;
  // Runs in the page and returns raw posting cards.
  extract: (page: Page) => Promise<RawCard[]>;
  // How many times to click "next" / scroll to load more (best effort).
  pages?: number;
  // Advance to the next page of results; return false when there is no more.
  next?: (page: Page, n: number) => Promise<boolean>;
  // Some sites expose all relevant geographies on one page rather than honoring
  // separate country URLs.
  singlePage?: boolean;
  // Load the full posting after cards are collected so the YoE gate can inspect
  // real qualifications instead of accepting a title-only result.
  hydrate?: (page: Page, card: RawCard) => Promise<RawCard>;
  shouldHydrate?: (card: RawCard) => boolean;
}

interface ScrapeUrlResult {
  postings: DiscoveryPosting[];
  warning?: string;
}

// Generic DOM harvester: collect anchors whose href matches `pattern`, using the
// anchor's text as the title and (optionally) a sibling for a posted date.
function anchorHarvest(pattern: RegExp) {
  return (page: Page) =>
    page.evaluate((src) => {
      const re = new RegExp(src, "i");
      const seen = new Set<string>();
      const cards: { title: string; href: string; externalId: string; postedAt: string | null }[] = [];
      for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
        const href = a.getAttribute("href") || "";
        if (!re.test(href) || seen.has(href)) continue;
        const title = (a.textContent || "").replace(/\s+/g, " ").trim();
        if (title.length < 4 || /see (full )?role|apply|learn more|view/i.test(title)) continue;
        seen.add(href);
        const container = a.closest("li,article,div");
        const ctx = (container?.textContent || "").replace(/\s+/g, " ").trim();
        const dm = ctx.match(/[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}/); // "Jul 21, 2026"
        cards.push({ title, href, externalId: href, postedAt: dm ? dm[0] : null });
      }
      return cards;
    }, pattern.source);
}

// Per-site rules. Only sites with a verified, clean extractor are listed here;
// everything else is reported as unsupported rather than harvesting noise (many
// of these SPAs wrap an entire card in one anchor, or their location filter is
// ignored, which would yield polluted titles / wrong countries). Apple renders
// real postings server-side with a stable /details/<id> URL and a country-scoped
// search. Shopify's Engineering & Data page exposes clean craft panels and full
// detail pages after client rendering.
const RULES: Partial<Record<BrowserSystem, SiteRule>> = {
  apple: {
    origin: "https://jobs.apple.com",
    extract: anchorHarvest(/\/details\/\d/),
    pages: 3,
    next: async (page, n) => {
      // Apple paginates with a numbered pager; click the page-(n+1) control.
      const link = page.locator(`nav[aria-label*="agination" i] a`, { hasText: String(n + 1) }).first();
      if ((await link.count()) === 0) return false;
      await link.click();
      await page.waitForTimeout(2500);
      return true;
    },
  },
  uber: {
    origin: "https://jobs.uber.com",
    singlePage: true,
    pages: 3,
    extract: async (page) => {
      // The privacy dialog can cover pagination controls. Essential-only keeps
      // the session minimal while allowing the official result page to work.
      const essentialOnly = page.getByRole("button", {
        name: "Essential Only",
        exact: true,
      });
      if ((await essentialOnly.count()) > 0 && await essentialOnly.isVisible()) {
        await essentialOnly.click();
      }
      return page
        .locator('#js-job-search-results [data-slot="card"]')
        .evaluateAll((cards) =>
          cards.flatMap((card) => {
            const anchor = card.querySelector<HTMLAnchorElement>(
              'a.js-view-job[href*="/en/jobs/"]',
            );
            const title = (anchor?.textContent ?? "").replace(/\s+/g, " ").trim();
            const href = anchor?.getAttribute("href") ?? "";
            const externalId = card.getAttribute("data-id") ??
              href.match(/\/jobs\/(\d+)/)?.[1] ?? "";
            const badges = Array.from(
              card.querySelectorAll<HTMLElement>(
                '[data-slot="card-description"] .rounded-full',
              ),
            ).map((element) =>
              (element.textContent ?? "").replace(/\s+/g, " ").trim(),
            );
            const location = badges[0] ?? "";
            return title && href && externalId
              ? [{ title, href, externalId, postedAt: null, location }]
              : [];
          }),
        )
        .then((cards) =>
          cards.map((card) => ({
            ...card,
            country: classifyCountry(card.location),
          })),
        );
    },
    next: async (page, n) => {
      const total = Number(
        await page
          .locator("#js-job-search-results")
          .getAttribute("data-results"),
      );
      if (!Number.isFinite(total) || n * 10 >= total) return false;

      // Move through result pages one at a time with a human-scale pause. This
      // replaces the blocked direct API and never fans requests out in parallel.
      await page.waitForTimeout(4_000 + Math.floor(Math.random() * 2_001));
      const nextUrl = new URL(page.url());
      nextUrl.searchParams.set("page", String(n + 1));
      await page.goto(nextUrl.toString(), {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
      await page.waitForTimeout(2_000);
      return true;
    },
    shouldHydrate: ({ title }) =>
      isSoftwareRole(title) && /\b(?:intern(?:ship)?|co-?op)\b/i.test(title),
    hydrate: async (page, card) => {
      // Only likely software internships receive a detail request. Requests are
      // sequential and spaced out so one opening adds at most one gentle fetch.
      await page.waitForTimeout(3_000 + Math.floor(Math.random() * 2_001));
      await page.goto(card.href, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
      await page.waitForTimeout(2_000);
      const detail = await page.evaluate(() => {
        const candidates = Array.from(
          document.querySelectorAll<HTMLScriptElement>(
            'script[type="application/ld+json"]',
          ),
        );
        for (const script of candidates) {
          try {
            const parsed = JSON.parse(script.textContent ?? "null") as unknown;
            const values = Array.isArray(parsed) ? parsed : [parsed];
            const posting = values.find((value) => {
              if (!value || typeof value !== "object") return false;
              const type = (value as { "@type"?: unknown })["@type"];
              return type === "JobPosting" ||
                (Array.isArray(type) && type.includes("JobPosting"));
            }) as {
              description?: string;
              datePosted?: string;
            } | undefined;
            if (posting) {
              const holder = document.createElement("div");
              holder.innerHTML = posting.description ?? "";
              return {
                description: (holder.textContent ?? "").replace(/\s+/g, " ").trim(),
                postedAt: posting.datePosted ?? null,
              };
            }
          } catch {
            // Ignore unrelated or malformed structured-data blocks.
          }
        }
        return {
          description: document.body.innerText.replace(/\s+/g, " ").trim(),
          postedAt: null,
        };
      });
      return {
        ...card,
        description: detail.description.slice(0, 8_000),
        postedAt: detail.postedAt,
      };
    },
  },
  shopify: {
    origin: "https://www.shopify.com",
    singlePage: true,
    extract: async (page) => {
      const cards: RawCard[] = [];
      const toggles = page.locator('button[aria-controls^="subdiscipline-"]');
      const count = await toggles.count();
      for (let index = 0; index < count; index++) {
        const toggle = toggles.nth(index);
        const panelId = await toggle.getAttribute("aria-controls");
        if (!panelId) continue;
        await toggle.click({ force: true });
        const rows = await page.locator(`#${panelId} a[href*="/careers/"]`).evaluateAll((anchors) =>
          anchors.map((anchor) => {
            const href = (anchor as HTMLAnchorElement).href;
            return {
              title: (anchor.querySelector("h4")?.textContent ?? "")
                .replace(/\s+/g, " ")
                .trim(),
              location: (anchor.querySelector(".location")?.textContent ?? "")
                .replace(/\s+/g, " ")
                .trim(),
              href,
              externalId: href.match(/_([0-9a-f-]{36})$/i)?.[1] ?? href,
              postedAt: null,
            };
          }),
        );
        cards.push(...rows);
      }
      return cards
        .filter((card) => card.title && /^[0-9a-f-]{36}$/i.test(card.externalId))
        .map((card) => ({
          ...card,
          // "Remote - Americas" includes Canada. Store one canonical card in the
          // Canadian list rather than duplicating the same requisition in both.
          country: /\b(americas|global|canada)\b/i.test(card.location ?? "") ? "CA" : "OTHER",
        }));
    },
    shouldHydrate: ({ title }) =>
      isSoftwareRole(title) && /\b(?:intern(?:ship)?|co-?op)\b/i.test(title),
    hydrate: async (page, card) => {
      await page.goto(card.href, { waitUntil: "domcontentloaded", timeout: 45000 });
      const posting = page
        .locator('[itemtype="https://schema.org/JobPosting"]')
        .first();
      await posting.waitFor({ timeout: 30000 });
      const description = await posting.innerText();
      return { ...card, description };
    },
  },
};

function toDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function scrapeUrl(
  page: Page,
  company: BrowserCompany,
  url: string,
  country: Country,
  rule: SiteRule,
): Promise<ScrapeUrlResult> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(6000);

  const all: RawCard[] = [];
  let warning: string | undefined;
  const maxPages = rule.pages ?? 1;
  for (let n = 1; ; n++) {
    all.push(...(await rule.extract(page)));
    if (n >= maxPages || !rule.next) break;
    let advanced: boolean;
    try {
      advanced = await rule.next(page, n);
    } catch (error) {
      warning = `pagination stopped after page ${n}: ${
        error instanceof Error ? error.message : String(error)
      }`;
      break;
    }
    if (!advanced) break;
  }

  if (rule.hydrate) {
    for (let index = 0; index < all.length; index++) {
      if (rule.shouldHydrate && !rule.shouldHydrate(all[index])) continue;
      all[index] = await rule.hydrate(page, all[index]);
    }
  }

  const seen = new Set<string>();
  const out: DiscoveryPosting[] = [];
  for (const c of all) {
    // Real titles are short; anything long is concatenated card noise — drop it.
    if (c.title.length > 90) continue;
    const applyUrl = c.href.startsWith("http") ? c.href : rule.origin + c.href;
    if (seen.has(applyUrl)) continue;
    seen.add(applyUrl);
    out.push({
      company: company.name,
      title: c.title,
      location: c.location ?? (country === "CA" ? "Canada" : "United States"),
      country: c.country ?? country,
      applyUrl,
      externalId: c.externalId,
      description: c.description ?? "",
      postedAt: toDate(c.postedAt),
      system: company.system,
    });
  }
  return { postings: out, ...(warning ? { warning } : {}) };
}

export interface BrowserScrapeResult {
  company: string;
  system: BrowserSystem;
  usFound: number;
  caFound: number;
  postings: DiscoveryPosting[];
  supported: boolean;
  partial?: boolean;
  warning?: string;
  error?: string;
}

export async function scrapeBrowserCompany(
  company: BrowserCompany,
  browser: Browser,
): Promise<BrowserScrapeResult> {
  const res: BrowserScrapeResult = {
    company: company.name,
    system: company.system,
    usFound: 0,
    caFound: 0,
    postings: [],
    supported: SCRAPABLE_BROWSER_SYSTEMS.includes(company.system),
  };

  // No verified extractor: skip rather than harvest unreliable data.
  const rule = RULES[company.system];
  if (!rule) {
    res.error = "no reliable extractor yet (client-rendered / bot-gated)";
    return res;
  }

  const ctx = await browser.newContext({ userAgent: UA, locale: "en-US" });
  try {
    const page = await ctx.newPage();
    // Block heavy assets to speed things up.
    await page.route("**/*", (route) => {
      const t = route.request().resourceType();
      if (t === "image" || t === "media" || t === "font") return route.abort();
      return route.continue();
    });
    if (rule.singlePage) {
      const result = await scrapeUrl(
        page,
        company,
        company.searchUrlCA,
        "CA",
        rule,
      );
      const postings = result.postings;
      res.usFound = postings.filter((posting) => posting.country === "US").length;
      res.caFound = postings.filter((posting) => posting.country === "CA").length;
      res.postings = postings;
      if (result.warning) {
        res.partial = true;
        res.warning = result.warning;
      }
    } else {
      const warnings: string[] = [];
      let failedCountries = 0;
      const attempt = async (label: string, url: string, country: Country) => {
        try {
          const result = await scrapeUrl(page, company, url, country, rule);
          if (result.warning) warnings.push(`${label}: ${result.warning}`);
          return result.postings;
        } catch (error) {
          failedCountries++;
          warnings.push(
            `${label}: ${error instanceof Error ? error.message : String(error)}`,
          );
          return [];
        }
      };
      const us = await attempt("US", company.searchUrlUS, "US");
      const ca = await attempt("CA", company.searchUrlCA, "CA");
      if (failedCountries === 2) {
        res.error = warnings.join("; ");
      } else {
        res.usFound = us.length;
        res.caFound = ca.length;
        res.postings = [...us, ...ca];
        if (warnings.length > 0) {
          res.partial = true;
          res.warning = warnings.join("; ");
        }
      }
    }
  } catch (e) {
    res.error = e instanceof Error ? e.message : String(e);
  } finally {
    await ctx.close();
  }
  return res;
}

// Scrape every browser company (or a named subset). Returns raw postings; the
// caller ingests them (classify + persist) via ingestPostings in run.ts.
export async function scrapeBrowserCompanies(opts?: {
  companies?: string[];
  onResult?: (r: BrowserScrapeResult) => void;
}): Promise<BrowserScrapeResult[]> {
  const wanted = opts?.companies?.map((s) => s.toLowerCase());
  const targets = wanted
    ? BROWSER_COMPANIES.filter((c) => wanted.includes(c.name.toLowerCase()))
    : BROWSER_COMPANIES;

  const browser = await chromium.launch({ headless: true });
  const results: BrowserScrapeResult[] = [];
  try {
    for (const c of targets) {
      const r = await scrapeBrowserCompany(c, browser);
      results.push(r);
      opts?.onResult?.(r);
    }
  } finally {
    await browser.close();
  }
  return results;
}
