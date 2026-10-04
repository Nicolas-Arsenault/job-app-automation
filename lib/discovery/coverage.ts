import { prisma } from "../db";
import { atsBoardFromUrl } from "./ats-expansion";

interface CoverageSighting {
  firstSeenAt: Date;
  source: {
    system: string;
    positiveEvidence: string;
  };
}

export interface CoverageJob {
  country: string | null;
  applyUrl: string;
  discoverySystem?: string | null;
  discoverySightings: CoverageSighting[];
}

export interface CoverageBucket {
  total: number;
  directOnly: number;
  githubOnly: number;
  both: number;
  untracked: number;
  directCoveragePercent: number;
  githubCoveragePercent: number;
  githubUniquePercent: number;
}

export interface DiscoveryCoverageReport extends CoverageBucket {
  startedAt: string;
  externalMisses: number;
  byCountry: Record<string, CoverageBucket>;
  overlap: {
    directFirst: number;
    githubFirst: number;
    sameTime: number;
    medianGithubLagMinutes: number | null;
  };
  githubOnlyRouting: {
    automaticAts: number;
    customAdapter: number;
  };
}

function percent(numerator: number, denominator: number): number {
  return denominator ? Math.round((numerator / denominator) * 1_000) / 10 : 0;
}

function emptyBucket(): CoverageBucket {
  return {
    total: 0,
    directOnly: 0,
    githubOnly: 0,
    both: 0,
    untracked: 0,
    directCoveragePercent: 0,
    githubCoveragePercent: 0,
    githubUniquePercent: 0,
  };
}

function finalize(bucket: CoverageBucket): CoverageBucket {
  return {
    ...bucket,
    directCoveragePercent: percent(bucket.directOnly + bucket.both, bucket.total),
    githubCoveragePercent: percent(bucket.githubOnly + bucket.both, bucket.total),
    githubUniquePercent: percent(bucket.githubOnly, bucket.total),
  };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round(((sorted[middle - 1] + sorted[middle]) / 2) * 10) / 10;
}

export function calculateCoverageReport(
  jobs: CoverageJob[],
  startedAt: Date,
): DiscoveryCoverageReport {
  const total = emptyBucket();
  const countries = new Map<string, CoverageBucket>();
  const lags: number[] = [];
  let directFirst = 0;
  let githubFirst = 0;
  let sameTime = 0;
  let automaticAts = 0;
  let customAdapter = 0;
  let externalMisses = 0;

  for (const job of jobs) {
    const country = job.country ?? "UNKNOWN";
    const countryBucket = countries.get(country) ?? emptyBucket();
    countries.set(country, countryBucket);
    total.total++;
    countryBucket.total++;
    if (job.discoverySystem?.startsWith("manual:")) externalMisses++;

    const githubTimes = job.discoverySightings
      .filter((sighting) => sighting.source.system === "githubboard")
      .map((sighting) => sighting.firstSeenAt.getTime());
    const directTimes = job.discoverySightings
      .filter(
        (sighting) =>
          sighting.source.system !== "githubboard" &&
          sighting.source.positiveEvidence === "direct",
      )
      .map((sighting) => sighting.firstSeenAt.getTime());
    const githubSeen = githubTimes.length > 0;
    const directSeen = directTimes.length > 0;
    const key = directSeen
      ? githubSeen
        ? "both"
        : "directOnly"
      : githubSeen
        ? "githubOnly"
        : "untracked";
    total[key]++;
    countryBucket[key]++;

    if (key === "githubOnly") {
      if (atsBoardFromUrl(job.applyUrl)) automaticAts++;
      else customAdapter++;
    }
    if (key === "both") {
      const firstGithub = Math.min(...githubTimes);
      const firstDirect = Math.min(...directTimes);
      const differenceMinutes = (firstGithub - firstDirect) / 60_000;
      lags.push(differenceMinutes);
      if (differenceMinutes > 0) directFirst++;
      else if (differenceMinutes < 0) githubFirst++;
      else sameTime++;
    }
  }

  return {
    ...finalize(total),
    startedAt: startedAt.toISOString(),
    externalMisses,
    byCountry: Object.fromEntries(
      [...countries].map(([country, bucket]) => [country, finalize(bucket)]),
    ),
    overlap: {
      directFirst,
      githubFirst,
      sameTime,
      medianGithubLagMinutes: median(lags),
    },
    githubOnlyRouting: { automaticAts, customAdapter },
  };
}

export async function getDiscoveryCoverageReport(): Promise<DiscoveryCoverageReport> {
  const experiment = await prisma.discoveryCoverageExperiment.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
  const jobs = await prisma.job.findMany({
    where: {
      firstSeenAt: { gte: experiment.startedAt },
      isEntryLevel: true,
      employmentType: "intern",
    },
    select: {
      country: true,
      applyUrl: true,
      discoverySystem: true,
      discoverySightings: {
        select: {
          firstSeenAt: true,
          source: { select: { system: true, positiveEvidence: true } },
        },
      },
    },
  });
  return calculateCoverageReport(jobs, experiment.startedAt);
}
