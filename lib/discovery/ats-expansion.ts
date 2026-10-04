import { canonicalCompanyName } from "../company-names";
import { prisma } from "../db";
import type { ApiCompany } from "./companies";
import type { DiscoveryPosting, FetchContext } from "./adapters";
import { fetchCompanyPostings } from "./adapters";
import { mapPool, type ResolvedSystem } from "./yc";

export type ExpandableAtsSystem = ResolvedSystem;

export interface AtsBoardIdentity {
  system: ExpandableAtsSystem;
  token: string;
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
    rawToken = parts[0];
  } else if (host === "jobs.lever.co") {
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
  }

  const token = rawToken ? normalizedToken(rawToken) : null;
  return system && token ? { system, token } : null;
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

export async function observeCommunityAtsBoards(
  postings: DiscoveryPosting[],
  evidenceSource: string,
): Promise<number> {
  const candidates = new Map<string, { posting: DiscoveryPosting; board: AtsBoardIdentity }>();
  for (const posting of postings) {
    const board = atsBoardFromUrl(posting.applyUrl);
    if (!board) continue;
    candidates.set(`${board.system}:${board.token.toLowerCase()}`, { posting, board });
  }

  for (const { posting, board } of candidates.values()) {
    const current = await prisma.discoveredAtsBoard.findUnique({
      where: { system_token: { system: board.system, token: board.token } },
      select: { companyAliases: true, status: true },
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
        // A disabled or manually rejected board stays that way.
        ...(current?.status === "pending" ? { nextRetryAt: null } : {}),
      },
    });
  }
  return candidates.size;
}

export async function bootstrapCommunityAtsBoards(limit = 500): Promise<number> {
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
}): ApiCompany {
  return {
    name: row.company,
    method: "api",
    system: row.system as ExpandableAtsSystem,
    token: row.token,
    countryFilter: "post",
    queryTerms: ["software engineer", "software developer", "machine learning", "devops"],
  };
}

export async function validatePendingAtsBoards(
  ctx: FetchContext,
  options: {
    limit?: number;
    concurrency?: number;
    validate?: (company: ApiCompany, ctx: FetchContext) => Promise<DiscoveryPosting[]>;
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
    take: options.limit ?? 20,
  });
  const validate = options.validate ?? fetchCompanyPostings;
  let verified = 0;
  let failed = 0;
  await mapPool(rows, options.concurrency ?? 2, async (row) => {
    try {
      await validate(asApiCompany(row), ctx);
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
  return rows.map(asApiCompany);
}

export async function discoveredAtsBoardCount(): Promise<number> {
  return prisma.discoveredAtsBoard.count({ where: { status: "verified" } });
}
