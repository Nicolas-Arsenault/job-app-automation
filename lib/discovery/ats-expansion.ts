import { canonicalCompanyName } from "../company-names";
import { prisma } from "../db";
import { createHash } from "node:crypto";
import { detectAts } from "../sources/normalize";
import type { ApiCompany } from "./companies";
import type { DiscoveryPosting, FetchContext } from "./adapters";
import { fetchCompanyPostings } from "./adapters";
import { mapPool, type ResolvedSystem } from "./yc";

export type ExpandableAtsSystem =
  | ResolvedSystem
  | "workable"
  | "teamtailor"
  | "workday";

export interface AtsBoardIdentity {
  system: ExpandableAtsSystem;
  token: string;
}

interface WorkdayBoardIdentity {
  host: string;
  tenant: string;
  site: string;
}

const TOKEN_BLOCKLIST = new Set([
  "api",
  "apply",
  "boards",
  "careers",
  "embed",
  "job",
  "job-boards",
  "jobs",
  "posting-api",
  "public",
  "v1",
  "www",
]);

function normalizedToken(raw: string): string | null {
  let token: string;
  try {
    token = decodeURIComponent(raw).trim();
  } catch {
    return null;
  }
  if (
    token.length < 2 ||
    token.length > 80 ||
    TOKEN_BLOCKLIST.has(token.toLowerCase()) ||
    !/^[a-z0-9._ -]+$/i.test(token)
  ) {
    return null;
  }
  return token;
}

/** Extract a board only from an official ATS URL. Arbitrary redirect or company
 * URLs are deliberately ignored here; they can enter through the bounded
 * watchlist resolver instead of turning this into an open crawler. */
export function atsBoardFromUrl(value: string): AtsBoardIdentity | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  let system: ExpandableAtsSystem | null = null;
  let rawToken: string | undefined;

  if (
    host === "boards.greenhouse.io" ||
    host === "job-boards.greenhouse.io" ||
    host.endsWith(".greenhouse.io") && host.startsWith("job-boards.")
  ) {
    system = "greenhouse";
    rawToken = url.searchParams.get("for") ?? parts[0];
  } else if (host === "jobs.lever.co" || host === "jobs.eu.lever.co") {
    system = "lever";
    rawToken = parts[0];
  } else if (host === "jobs.ashbyhq.com") {
    system = "ashby";
    rawToken = parts[0];
  } else if (
    host === "careers.smartrecruiters.com" ||
    host === "jobs.smartrecruiters.com"
  ) {
    system = "smartrecruiters";
    rawToken = parts[0];
  } else if (host === "apply.workable.com") {
    system = "workable";
    rawToken = parts[0];
  } else if (/^[a-z0-9-]+\.teamtailor\.com$/i.test(host)) {
    system = "teamtailor";
    rawToken = host.split(".")[0];
  } else {
    const workday = workdayBoardFromUrl(url);
    if (workday) {
      return {
        system: "workday",
        token: encodeWorkdayBoard(workday),
      };
    }
  }

  const token = rawToken ? normalizedToken(rawToken) : null;
  return system && token ? { system, token } : null;
}

function encodeWorkdayBoard(board: WorkdayBoardIdentity): string {
  return `${board.host}|${board.tenant}|${board.site}`;
}

function decodeWorkdayBoard(token: string): WorkdayBoardIdentity | null {
  const [host, tenant, site, ...rest] = token.split("|");
  if (
    rest.length > 0 ||
    !host ||
    !tenant ||
    !site ||
    !/^[a-z0-9.-]+$/i.test(host) ||
    !/^[a-z0-9._-]+$/i.test(tenant) ||
    !/^[a-z0-9._-]+$/i.test(site)
  ) {
    return null;
  }
  return { host, tenant, site };
}

function normalizedWorkdaySegment(raw: string): string | null {
  let value: string;
  try {
    value = decodeURIComponent(raw).trim();
  } catch {
    return null;
  }
  return value.length >= 1 && value.length <= 100 && /^[a-z0-9._-]+$/i.test(value)
    ? value
    : null;
}

function workdayBoardFromUrl(url: URL): WorkdayBoardIdentity | null {
  const host = url.hostname.toLowerCase();
  const isWorkdayJobs = /(?:^|\.)myworkdayjobs\.com$/i.test(host);
  const isWorkdaySite = /(?:^|\.)myworkdaysite\.com$/i.test(host);
  if (!isWorkdayJobs && !isWorkdaySite) return null;

  const parts = url.pathname.split("/").filter(Boolean);
  if (isWorkdaySite && parts[0]?.toLowerCase() === "recruiting") {
    const tenant = normalizedWorkdaySegment(parts[1] ?? "");
    const site = normalizedWorkdaySegment(parts[2] ?? "");
    return tenant && site ? { host, tenant, site } : null;
  }

  const withoutLocale = /^[a-z]{2}-[a-z]{2}$/i.test(parts[0] ?? "")
    ? parts.slice(1)
    : parts;
  const site = normalizedWorkdaySegment(withoutLocale[0] ?? "");
  const tenant = normalizedWorkdaySegment(host.split(".")[0] ?? "");
  return tenant && site ? { host, tenant, site } : null;
}

function aliases(raw: string, incoming: string): string {
  let values: string[] = [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) values = parsed.map(String);
  } catch {
    values = [];
  }
  const canonical = canonicalCompanyName(incoming);
  return JSON.stringify(
    [...new Set([...values, incoming.trim(), canonical].filter(Boolean))].slice(0, 20),
  );
}

function companyCandidateKey(company: string): string {
  const normalized = canonicalCompanyName(company)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return createHash("sha1").update(normalized || company.trim().toLowerCase()).digest("hex");
}

function applicationHost(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

async function observeUnsupportedEmployers(
  postings: DiscoveryPosting[],
  evidenceSource: string,
): Promise<number> {
  const candidates = new Map<string, DiscoveryPosting>();
  for (const posting of postings) {
    if (atsBoardFromUrl(posting.applyUrl)) continue;
    const company = canonicalCompanyName(posting.company);
    if (!company) continue;
    candidates.set(companyCandidateKey(company), posting);
  }
  if (!candidates.size) return 0;

  const keys = [...candidates.keys()];
  const existing = await prisma.communityEmployerCandidate.findMany({
    where: { companyKey: { in: keys } },
    select: { companyKey: true },
  });
  const existingKeys = new Set(existing.map((row) => row.companyKey));
  const now = new Date();
  const newRows = [...candidates].flatMap(([companyKey, posting]) => {
    if (existingKeys.has(companyKey)) return [];
    return [{
      companyKey,
      company: canonicalCompanyName(posting.company),
      detectedPlatform: detectAts(posting.applyUrl),
      applicationHost: applicationHost(posting.applyUrl),
      exampleApplyUrl: posting.applyUrl,
      exampleTitle: posting.title || null,
      evidenceSource,
      firstSeenAt: now,
      lastSeenAt: now,
    }];
  });
  if (newRows.length) {
    await prisma.communityEmployerCandidate.createMany({ data: newRows });
  }
  if (existingKeys.size) {
    await prisma.communityEmployerCandidate.updateMany({
      where: { companyKey: { in: [...existingKeys] } },
      data: { lastSeenAt: now, observations: { increment: 1 } },
    });
  }
  return candidates.size;
}

async function resolveSupportedEmployers(postings: DiscoveryPosting[]): Promise<void> {
  const keys = [...new Set(
    postings
      .filter((posting) => atsBoardFromUrl(posting.applyUrl))
      .map((posting) => companyCandidateKey(canonicalCompanyName(posting.company))),
  )];
  if (!keys.length) return;
  await prisma.communityEmployerCandidate.updateMany({
    where: { companyKey: { in: keys }, status: "needs_adapter" },
    data: {
      status: "resolved",
      notes: "Automatically promoted to direct ATS monitoring",
      lastSeenAt: new Date(),
    },
  });
}

export async function observeCommunityAtsBoards(
  postings: DiscoveryPosting[],
  evidenceSource: string,
): Promise<number> {
  await observeUnsupportedEmployers(postings, evidenceSource);
  await resolveSupportedEmployers(postings);
  const candidates = new Map<string, { posting: DiscoveryPosting; board: AtsBoardIdentity }>();
  for (const posting of postings) {
    const board = atsBoardFromUrl(posting.applyUrl);
    if (!board) continue;
    candidates.set(`${board.system}:${board.token.toLowerCase()}`, { posting, board });
  }

  for (const { posting, board } of candidates.values()) {
    const current = await prisma.discoveredAtsBoard.findUnique({
      where: { system_token: { system: board.system, token: board.token } },
      select: { companyAliases: true },
    });
    await prisma.discoveredAtsBoard.upsert({
      where: { system_token: { system: board.system, token: board.token } },
      create: {
        system: board.system,
        token: board.token,
        company: canonicalCompanyName(posting.company),
        companyAliases: aliases("[]", posting.company),
        evidenceUrl: posting.applyUrl,
        evidenceSource,
        evidenceJobId: posting.externalId || null,
        confidence: 100,
      },
      update: {
        companyAliases: aliases(current?.companyAliases ?? "[]", posting.company),
        evidenceUrl: posting.applyUrl,
        evidenceSource,
        evidenceJobId: posting.externalId || null,
        lastSeenAt: new Date(),
        // Preserve validation backoff. Merely seeing another posting from the
        // same board is not evidence that a throttled or unavailable endpoint
        // should be retried before nextRetryAt.
      },
    });
  }
  return candidates.size;
}

export async function bootstrapCommunityAtsBoards(limit = 5000): Promise<number> {
  const jobs = await prisma.job.findMany({
    where: { discoverySystem: "githubboard" },
    orderBy: { firstSeenAt: "desc" },
    take: limit,
    select: {
      company: true,
      title: true,
      location: true,
      country: true,
      applyUrl: true,
      externalId: true,
      description: true,
      postedAt: true,
    },
  });
  return observeCommunityAtsBoards(
    jobs.map((job) => ({
      ...job,
      location: job.location ?? "",
      country: job.country === "US" || job.country === "CA" || job.country === "OTHER"
        ? job.country
        : "OTHER",
      externalId: job.externalId ?? "",
      description: job.description ?? "",
      system: "githubboard" as const,
    })),
    "existing community inventory",
  );
}

function asApiCompany(row: {
  company: string;
  system: string;
  token: string;
}, validationOnly = false): ApiCompany {
  if (row.system === "workday") {
    const workday = decodeWorkdayBoard(row.token);
    if (!workday) throw new Error(`Invalid discovered Workday identity: ${row.token}`);
    return {
      name: row.company,
      method: "api",
      system: "workday",
      countryFilter: "post",
      queryTerms: validationOnly ? ["intern"] : ["intern", "co-op", "student"],
      workday: {
        ...workday,
        searchTerms: validationOnly ? ["intern"] : ["intern", "co-op", "student"],
        fetchDescriptions: !validationOnly,
        detailConcurrency: 2,
      },
    };
  }
  return {
    name: row.company,
    method: "api",
    system: row.system as Exclude<ExpandableAtsSystem, "workday">,
    token: row.token,
    countryFilter: "post",
    queryTerms: ["software engineer", "software developer", "machine learning", "devops"],
  };
}

export function atsCompanyBoardKey(company: ApiCompany): string | null {
  if (company.system === "workday" && company.workday) {
    return `workday:${encodeWorkdayBoard(company.workday).toLowerCase()}`;
  }
  return company.token
    ? `${company.system}:${company.token.toLowerCase()}`
    : null;
}

export async function validatePendingAtsBoards(
  ctx: FetchContext,
  options: {
    /** null validates every pending board (used only by the isolated benchmark). */
    limit?: number | null;
    concurrency?: number;
    validate?: (company: ApiCompany, ctx: FetchContext) => Promise<DiscoveryPosting[]>;
    onVerified?: (
      company: ApiCompany,
      postings: DiscoveryPosting[],
    ) => Promise<void>;
    now?: Date;
  } = {},
): Promise<{ verified: number; failed: number }> {
  const now = options.now ?? new Date();
  const rows = await prisma.discoveredAtsBoard.findMany({
    where: {
      status: "pending",
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
    },
    orderBy: [{ confidence: "desc" }, { firstSeenAt: "asc" }],
    // New community boards are intentionally admitted slowly. Eight boards per
    // two-hour cycle keeps validation useful without creating a burst across
    // third-party ATS infrastructure.
    ...(options.limit === null ? {} : { take: options.limit ?? 8 }),
  });
  const validate = options.validate ?? fetchCompanyPostings;
  let verified = 0;
  let failed = 0;
  await mapPool(rows, options.concurrency ?? 2, async (row) => {
    try {
      const company = asApiCompany(row, true);
      const postings = await validate(company, ctx);
      await options.onVerified?.(company, postings);
      await prisma.discoveredAtsBoard.update({
        where: { id: row.id },
        data: {
          status: "verified",
          lastValidatedAt: now,
          nextRetryAt: null,
          failureCount: 0,
          lastError: null,
        },
      });
      verified++;
    } catch (error) {
      const failureCount = row.failureCount + 1;
      const hours = Math.min(24 * 7, 2 ** Math.min(failureCount, 7));
      await prisma.discoveredAtsBoard.update({
        where: { id: row.id },
        data: {
          failureCount,
          lastValidatedAt: now,
          nextRetryAt: new Date(now.getTime() + hours * 3_600_000),
          lastError: (error instanceof Error ? error.message : String(error)).slice(0, 500),
        },
      });
      failed++;
    }
  });
  return { verified, failed };
}

export async function verifiedAtsCompanies(): Promise<ApiCompany[]> {
  const rows = await prisma.discoveredAtsBoard.findMany({
    where: { status: "verified" },
    orderBy: [{ company: "asc" }, { system: "asc" }],
    select: { company: true, system: true, token: true },
  });
  return rows.map((row) => asApiCompany(row));
}

export async function discoveredAtsBoardCount(): Promise<number> {
  return prisma.discoveredAtsBoard.count({ where: { status: "verified" } });
}
