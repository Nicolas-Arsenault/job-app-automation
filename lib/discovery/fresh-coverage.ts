import { prisma } from "../db";
import { isJobSpecificApplyUrl, normalizeUrl } from "../sources/normalize";

export interface FreshCoverageSighting {
  reportedPostedAt: Date | null;
  eligibleInternship: boolean;
  source: {
    name: string;
    system: string;
    positiveEvidence: string;
  };
}

export interface FreshCoverageJob {
  id: string;
  company: string;
  title: string;
  country: string | null;
  applyUrl: string;
  discoverySightings: FreshCoverageSighting[];
}

export interface FreshCoverageBucket {
  union: number;
  directOnly: number;
  githubOnly: number;
  both: number;
  directFresh: number;
  githubFresh: number;
  directCoveragePercent: number;
  githubCoveragePercent: number;
  githubIncrementalPercent: number;
  githubMissedByDirectPercent: number;
}

export interface FreshCoverageReport extends FreshCoverageBucket {
  cutoff: string;
  generatedAt: string;
  excludedBecauseDateUnknown: {
    direct: number;
    github: number;
  };
  byCountry: Record<string, FreshCoverageBucket>;
  byDirectSource: Record<string, number>;
  byGithubBoard: Record<string, number>;
  jobs: Array<{
    id: string;
    company: string;
    title: string;
    country: string;
    applyUrl: string;
    classification: "direct_only" | "github_only" | "both";
    directSources: string[];
    githubBoards: string[];
  }>;
}

function percent(numerator: number, denominator: number): number {
  return denominator ? Math.round((numerator / denominator) * 1_000) / 10 : 0;
}

function emptyBucket(): FreshCoverageBucket {
  return {
    union: 0,
    directOnly: 0,
    githubOnly: 0,
    both: 0,
    directFresh: 0,
    githubFresh: 0,
    directCoveragePercent: 0,
    githubCoveragePercent: 0,
    githubIncrementalPercent: 0,
    githubMissedByDirectPercent: 0,
  };
}

function finish(bucket: FreshCoverageBucket): FreshCoverageBucket {
  return {
    ...bucket,
    directCoveragePercent: percent(bucket.directFresh, bucket.union),
    githubCoveragePercent: percent(bucket.githubFresh, bucket.union),
    githubIncrementalPercent: percent(bucket.githubOnly, bucket.union),
    githubMissedByDirectPercent: percent(bucket.githubOnly, bucket.githubFresh),
  };
}

function bump(record: Record<string, number>, key: string) {
  record[key] = (record[key] ?? 0) + 1;
}

export function calculateFreshCoverage(
  jobs: FreshCoverageJob[],
  cutoff: Date,
  generatedAt = new Date(),
): FreshCoverageReport {
  const total = emptyBucket();
  const countries = new Map<string, FreshCoverageBucket>();
  const byDirectSource: Record<string, number> = {};
  const byGithubBoard: Record<string, number> = {};
  const details: FreshCoverageReport["jobs"] = [];
  let unknownDirect = 0;
  let unknownGithub = 0;

  // The production persist layer is deliberately conservative, but exact job
  // URLs are safe identities for measurement. Group them here so a duplicate
  // database card cannot inflate either side of the coverage benchmark.
  const grouped = new Map<string, FreshCoverageJob>();
  for (const job of jobs) {
    const normalized = normalizeUrl(job.applyUrl);
    const key = isJobSpecificApplyUrl(normalized) ? `url:${normalized}` : `id:${job.id}`;
    const existing = grouped.get(key);
    if (existing) existing.discoverySightings.push(...job.discoverySightings);
    else grouped.set(key, { ...job, applyUrl: normalized, discoverySightings: [...job.discoverySightings] });
  }

  for (const job of grouped.values()) {
    const eligibleSightings = job.discoverySightings.filter(
      (sighting) => sighting.eligibleInternship,
    );
    const directSightings = eligibleSightings.filter(
      (sighting) =>
        sighting.source.system !== "githubboard" &&
        sighting.source.positiveEvidence === "direct",
    );
    const githubSightings = eligibleSightings.filter(
      (sighting) => sighting.source.system === "githubboard",
    );
    if (directSightings.length && directSightings.every((s) => !s.reportedPostedAt)) {
      unknownDirect++;
    }
    if (githubSightings.length && githubSightings.every((s) => !s.reportedPostedAt)) {
      unknownGithub++;
    }

    const directFreshSightings = directSightings.filter(
      (sighting) =>
        sighting.reportedPostedAt !== null && sighting.reportedPostedAt >= cutoff,
    );
    const githubFreshSightings = githubSightings.filter(
      (sighting) =>
        sighting.reportedPostedAt !== null && sighting.reportedPostedAt >= cutoff,
    );
    const directFresh = directFreshSightings.length > 0;
    const githubFresh = githubFreshSightings.length > 0;
    if (!directFresh && !githubFresh) continue;

    const bucket = countries.get(job.country ?? "UNKNOWN") ?? emptyBucket();
    countries.set(job.country ?? "UNKNOWN", bucket);
    total.union++;
    bucket.union++;
    if (directFresh) {
      total.directFresh++;
      bucket.directFresh++;
    }
    if (githubFresh) {
      total.githubFresh++;
      bucket.githubFresh++;
    }

    const classification = directFresh
      ? githubFresh
        ? "both"
        : "direct_only"
      : "github_only";
    if (classification === "both") {
      total.both++;
      bucket.both++;
    } else if (classification === "direct_only") {
      total.directOnly++;
      bucket.directOnly++;
    } else {
      total.githubOnly++;
      bucket.githubOnly++;
    }

    const directSources = [...new Set(directFreshSightings.map((s) => s.source.name))];
    const githubBoards = [...new Set(githubFreshSightings.map((s) => s.source.name))];
    directSources.forEach((source) => bump(byDirectSource, source));
    githubBoards.forEach((source) => bump(byGithubBoard, source));
    details.push({
      id: job.id,
      company: job.company,
      title: job.title,
      country: job.country ?? "UNKNOWN",
      applyUrl: job.applyUrl,
      classification,
      directSources,
      githubBoards,
    });
  }

  return {
    ...finish(total),
    cutoff: cutoff.toISOString(),
    generatedAt: generatedAt.toISOString(),
    excludedBecauseDateUnknown: { direct: unknownDirect, github: unknownGithub },
    byCountry: Object.fromEntries(
      [...countries].map(([country, bucket]) => [country, finish(bucket)]),
    ),
    byDirectSource,
    byGithubBoard,
    jobs: details.sort((a, b) =>
      `${a.classification}:${a.company}:${a.title}`.localeCompare(
        `${b.classification}:${b.company}:${b.title}`,
      ),
    ),
  };
}

export async function getFreshCoverageReport(
  cutoff: Date,
): Promise<FreshCoverageReport> {
  const jobs = await prisma.job.findMany({
    where: {
      availabilityStatus: { not: "closed" },
      discoverySightings: { some: { eligibleInternship: true } },
    },
    select: {
      id: true,
      company: true,
      title: true,
      country: true,
      applyUrl: true,
      discoverySightings: {
        select: {
          reportedPostedAt: true,
          eligibleInternship: true,
          source: {
            select: { name: true, system: true, positiveEvidence: true },
          },
        },
      },
    },
  });
  return calculateFreshCoverage(jobs, cutoff);
}
