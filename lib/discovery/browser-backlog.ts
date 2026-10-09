import { chromium, type Page } from "playwright";
import { prisma } from "../db";
import { classifyCountry, isSoftwareRole } from "./entryLevel";
import type { DiscoveryPosting } from "./adapters";
import type { BrowserCompany } from "./companies";
import type { BrowserScrapeResult } from "./browser";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0 Safari/537.36";

interface BrowserBacklogTarget {
  companyKey: string;
  company: BrowserCompany;
  evidenceUrl: string;
  family:
    | "icims"
    | "rippling"
    | "paylocity"
    | "jobvite"
    | "jazzhr"
    | "bamboohr"
    | "breezy"
    | "successfactors"
    | "taleo"
    | "avature"
    | "eightfold"
    | "pinpoint"
    | "gusto"
    | "dover"
    | "gem"
    | "yello"
    | "jibe";
}

function targetFor(row: {
  companyKey: string;
  company: string;
  detectedPlatform: string;
  applicationHost: string | null;
  exampleApplyUrl: string;
}): BrowserBacklogTarget | null {
  const host = row.applicationHost?.toLowerCase() ?? "";
  let family: BrowserBacklogTarget["family"];
  let boardUrl: string;
  const url = new URL(row.exampleApplyUrl);
  const parts = url.pathname.split("/").filter(Boolean);
  const hostedIcims = row.detectedPlatform === "icims" && host.endsWith(".icims.com");
  const brandedIcims =
    url.searchParams.get("icims") === "1" && /\/jobs\/\d+/i.test(url.pathname);
  if (hostedIcims || brandedIcims) {
    family = "icims";
    boardUrl = hostedIcims
      ? `https://${host}/jobs/search?ss=1&searchKeyword=intern`
      : `${url.origin}/jobs`;
  } else if (host === "ats.rippling.com" && parts.includes("jobs")) {
    const jobsIndex = parts.indexOf("jobs");
    const slug = parts[jobsIndex - 1];
    if (!slug) return null;
    family = "rippling";
    boardUrl = `https://${host}/${slug}/jobs`;
  } else if (host === "jobs.jobvite.com" && parts[1] === "job") {
    family = "jobvite";
    boardUrl = `https://${host}/${parts[0]}/jobs`;
  } else if (host === "recruiting.paylocity.com") {
    family = "paylocity";
    boardUrl = row.exampleApplyUrl;
  } else if (host.endsWith(".applytojob.com")) {
    family = "jazzhr";
    boardUrl = `https://${host}/apply`;
  } else if (host.endsWith(".bamboohr.com")) {
    family = "bamboohr";
    boardUrl = `https://${host}/careers`;
  } else if (host.endsWith(".breezy.hr")) {
    family = "breezy";
    boardUrl = `https://${host}/`;
  } else if (
    url.searchParams.get("ats")?.toLowerCase() === "successfactors" ||
    host.endsWith(".successfactors.com") ||
    host.endsWith(".sapsf.com")
  ) {
    family = "successfactors";
    if (/^career(?:s)?$/i.test(parts[0] ?? "")) {
      const search = new URL(url.origin + url.pathname);
      const company = url.searchParams.get("company");
      if (company) search.searchParams.set("company", company);
      search.searchParams.set("career_ns", "job_listing_summary");
      boardUrl = search.toString();
    } else {
      boardUrl = `${url.origin}/search/?q=intern`;
    }
  } else if (host.endsWith(".taleo.net")) {
    const sectionIndex = parts.findIndex((part) => part.toLowerCase() === "careersection");
    const section = parts[sectionIndex + 1];
    if (sectionIndex < 0 || !section) return null;
    family = "taleo";
    boardUrl = `${url.origin}/careersection/${section}/jobsearch.ftl?lang=en`;
  } else if (host.endsWith(".avature.net")) {
    const jobsIndex = parts.findIndex((part) => part.toLowerCase() === "jobs");
    const detailIndex = parts.findIndex((part) => part.toLowerCase() === "jobdetail");
    const prefixEnd = jobsIndex >= 0 ? jobsIndex + 1 : detailIndex;
    if (prefixEnd < 0) return null;
    family = "avature";
    boardUrl = `${url.origin}/${parts.slice(0, prefixEnd).join("/")}/SearchJobs`;
  } else if (host.endsWith(".eightfold.ai") && parts.includes("careers")) {
    family = "eightfold";
    boardUrl = `${url.origin}/careers`;
  } else if (host.endsWith(".pinpointhq.com") && parts.includes("postings")) {
    const postingsIndex = parts.indexOf("postings");
    family = "pinpoint";
    boardUrl = `${url.origin}/${parts.slice(0, postingsIndex + 1).join("/")}`;
  } else if (host === "jobs.gusto.com" && parts[0] === "postings") {
    family = "gusto";
    boardUrl = url.origin;
  } else if (host === "app.dover.com" && parts[0] === "apply" && parts[1]) {
    family = "dover";
    boardUrl = `${url.origin}/jobs/${parts[1]}`;
  } else if (host === "jobs.gem.com" && parts[0]) {
    family = "gem";
    boardUrl = `${url.origin}/${parts[0]}`;
  } else if (host.endsWith(".yello.co") && url.searchParams.get("job_board_id")) {
    family = "yello";
    boardUrl = `${url.origin}/job_boards/${url.searchParams.get("job_board_id")}`;
  } else if (host.endsWith(".jibeapply.com") && parts[0] === "jobs") {
    family = "jibe";
    boardUrl = `${url.origin}/jobs`;
  } else {
    return null;
  }
  return {
    companyKey: row.companyKey,
    evidenceUrl: row.exampleApplyUrl,
    family,
    company: {
      name: row.company,
      method: "browser",
      system: "browserats",
      searchUrlUS: boardUrl,
      searchUrlCA: boardUrl,
      reason: `${family} public board requires rendered-browser extraction`,
    },
  };
}

export async function browserBacklogTargets(
  statuses = ["needs_adapter", "browser_ready"],
): Promise<BrowserBacklogTarget[]> {
  const rows = await prisma.communityEmployerCandidate.findMany({
    where: { status: { in: statuses } },
    orderBy: [{ observations: "desc" }, { company: "asc" }],
    select: {
      companyKey: true,
      company: true,
      detectedPlatform: true,
      applicationHost: true,
      exampleApplyUrl: true,
    },
  });
  return rows.flatMap((row) => {
    try {
      const target = targetFor(row);
      return target ? [target] : [];
    } catch {
      return [];
    }
  });
}

function date(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function boardLinks(page: Page, target: BrowserBacklogTarget) {
  const response = await page.goto(target.company.searchUrlUS, {
    // Legacy Taleo pages can keep the DOMContentLoaded lifecycle pending while
    // their search shell is already usable. Waiting for the first response is
    // enough; the bounded pause below still gives the markup time to render.
    waitUntil: target.family === "taleo" ? "commit" : "domcontentloaded",
    timeout: 30_000,
  });
  if (!response) throw new Error("Browser board returned no response");
  if (response.status() >= 400) {
    throw new Error(`Browser board returned HTTP ${response.status()}`);
  }
  await page.waitForTimeout(target.family === "taleo" ? 2_500 : 1_200);
  if (target.family === "paylocity") {
    const allJobs = page.locator('a[href*="/Recruiting/Jobs/All/"]').last();
    if (await allJobs.count()) {
      await allJobs.click();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(800);
    }
  }
  const pattern = {
    icims: /\/jobs\/\d+\/[^/]+\/job/i,
    rippling: /\/[^/]+\/jobs\/[0-9a-f-]{20,}/i,
    paylocity: /\/Recruiting\/Jobs\/Details\/\d+/i,
    jobvite: /\/[^/]+\/job\/[a-z0-9]+/i,
    jazzhr: /\/apply\/[a-z0-9]+\//i,
    bamboohr: /\/careers\/\d+/i,
    breezy: /\/p\/[a-z0-9-]+/i,
    successfactors: /\/job\//i,
    taleo: /jobdetail\.ftl/i,
    avature: /\/JobDetail\//i,
    eightfold: /\/careers\/job\//i,
    pinpoint: /\/postings\/[0-9a-f-]{20,}/i,
    gusto: /\/postings\//i,
    dover: /\/(?:apply|jobs)\/[^/]+\/[0-9a-f-]{20,}/i,
    gem: /\/[^/]+\/(?:am9|job)/i,
    yello: /\/jobs\//i,
    jibe: /\/jobs\/\d+/i,
  }[target.family];
  const links = new Map<string, string>();
  for (const frame of page.frames()) {
    const found = await frame.locator("a[href]").evaluateAll((anchors) =>
      anchors.map((anchor) => {
        let container: Element | null = anchor;
        for (let depth = 0; depth < 4 && container?.parentElement; depth++) {
          container = container.parentElement;
          if ((container.textContent ?? "").trim().length > (anchor.textContent ?? "").trim().length + 5) {
            break;
          }
        }
        return {
          href: (anchor as HTMLAnchorElement).href,
          title: (anchor.textContent ?? "").replace(/\s+/g, " ").trim(),
          context: (container?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 500),
        };
      }),
    ).catch(() => [] as { href: string; title: string; context: string }[]);
    for (const link of found) {
      if (
        pattern.test(link.href) &&
        link.title.length >= 4 &&
        !/^(apply|view job|learn more)$/i.test(link.title)
      ) {
        links.set(link.href, `${link.title}\u0000${link.context ?? ""}`);
      }
    }
  }
  return [...links].map(([href, value]) => {
    const [title, context = ""] = value.split("\u0000");
    return { href, title, context };
  });
}

async function hydrate(
  page: Page,
  company: string,
  link: { href: string; title: string; context: string },
): Promise<DiscoveryPosting> {
  const response = await page.goto(link.href, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  if (!response) throw new Error("Browser job detail returned no response");
  if (response.status() >= 400) {
    throw new Error(`Browser job detail returned HTTP ${response.status()}`);
  }
  await page.waitForTimeout(500);
  const detail = await page.evaluate(() => {
    for (const script of document.querySelectorAll<HTMLScriptElement>(
      'script[type="application/ld+json"]',
    )) {
      try {
        const value = JSON.parse(script.textContent ?? "null") as Record<string, unknown>;
        const values: Record<string, unknown>[] = Array.isArray(value)
          ? value as Record<string, unknown>[]
          : [value];
        const job = values.find((item) => item?.["@type"] === "JobPosting");
        if (!job) continue;
        const locations = Array.isArray(job.jobLocation) ? job.jobLocation : [job.jobLocation];
        const location = locations.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const address = (item as { address?: Record<string, unknown> }).address;
          return address
            ? [[address.addressLocality, address.addressRegion, address.addressCountry]
                .filter(Boolean).join(", ")]
            : [];
        }).filter(Boolean).join(" | ");
        return {
          title: String(job.title ?? ""),
          description: String(job.description ?? "").replace(/<[^>]+>/g, " "),
          postedAt: job.datePosted,
          location,
        };
      } catch {
        // Try the next structured-data block.
      }
    }
    return {
      title: document.querySelector("h1")?.textContent?.trim() ?? "",
      description: document.body.innerText.slice(0, 8_000),
      postedAt: null,
      location: "",
    };
  });
  const id = link.href.match(/(?:\/jobs?\/|\/Details\/|\/apply\/)([a-z0-9-]+)/i)?.[1] ?? link.href;
  return {
    company,
    title: link.title || detail.title,
    location: detail.location || link.context,
    country: classifyCountry(detail.location || link.context),
    applyUrl: link.href,
    externalId: id,
    description: detail.description.replace(/\s+/g, " ").trim().slice(0, 8_000),
    postedAt: date(detail.postedAt),
    system: "browserats",
  };
}

export async function scrapeBrowserBacklogCompanies(
  targets: BrowserBacklogTarget[],
  onResult?: (result: BrowserScrapeResult) => void,
): Promise<BrowserScrapeResult[]> {
  if (!targets.length) return [];
  const browser = await chromium.launch({ headless: true });
  const results: BrowserScrapeResult[] = [];
  try {
    for (const target of targets) {
      const context = await browser.newContext({ userAgent: UA, locale: "en-US" });
      const page = await context.newPage();
      await page.route("**/*", (route) =>
        ["image", "media", "font"].includes(route.request().resourceType())
          ? route.abort()
          : route.continue(),
      );
      const result: BrowserScrapeResult = {
        company: target.company.name,
        system: "browserats",
        usFound: 0,
        caFound: 0,
        postings: [],
        supported: true,
      };
      try {
        const links = (await boardLinks(page, target)).filter(
          (link) => /\b(intern|co-?op|student)\b/i.test(link.title) && isSoftwareRole(link.title),
        ).slice(0, 20);
        for (const link of links) {
          const posting = await hydrate(page, target.company.name, link);
          result.postings.push(posting);
          if (posting.country === "US") result.usFound++;
          if (posting.country === "CA") result.caFound++;
        }
        await prisma.communityEmployerCandidate.update({
          where: { companyKey: target.companyKey },
          data: { status: "browser_ready", notes: `Monitored through Playwright (${target.family})` },
        });
      } catch (error) {
        result.error = error instanceof Error ? error.message : String(error);
        await prisma.communityEmployerCandidate.update({
          where: { companyKey: target.companyKey },
          data: {
            status: "browser_blocked",
            notes: `Playwright validation failed (${target.family}): ${result.error.slice(0, 350)}`,
          },
        });
      } finally {
        await context.close();
      }
      results.push(result);
      onResult?.(result);
    }
  } finally {
    await browser.close();
  }
  return results;
}
