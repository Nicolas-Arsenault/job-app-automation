import { prisma } from "../db";
import { isJobSpecificApplyUrl, normalizeUrl } from "../sources/normalize";
import { getDiscoveryCoverageReport } from "./coverage";

export interface DiscoveryBenchmark {
  generatedAt: string;
  inventory: {
    activeInternships: number;
    companies: number;
    canada: number;
    unitedStates: number;
  };
  historicalSightings: {
    directOnly: number;
    githubOnly: number;
    both: number;
    neither: number;
    directCoveragePercent: number;
    githubCoveragePercent: number;
  };
  forwardCohort: Awaited<ReturnType<typeof getDiscoveryCoverageReport>>;
  quality: {
    richDescriptions: number;
    thinDescriptions: number;
    usVisaKnown: number;
    usVisaUnknown: number;
    strictDuplicateGroups: number;
    strictDuplicateExtraCards: number;
    suspect: number;
    externalMisses: number;
  };
  automaticAts: Record<string, number>;
  customAdapterBacklog: Record<string, number>;
  sourceHealth: Record<string, number>;
}

function percent(numerator: number, denominator: number): number {
  return denominator ? Math.round((numerator / denominator) * 1_000) / 10 : 0;
}

function countsBy<T extends string>(values: T[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}

export async function getDiscoveryBenchmark(): Promise<DiscoveryBenchmark> {
  const jobs = await prisma.job.findMany({
    where: {
      isEntryLevel: true,
      employmentType: "intern",
      availabilityStatus: { not: "closed" },
    },
    select: {
      id: true,
      company: true,
      country: true,
      description: true,
      sponsorship: true,
      applyUrl: true,
      availabilityStatus: true,
      discoverySystem: true,
      discoverySightings: {
        select: {
          source: { select: { system: true, positiveEvidence: true } },
        },
      },
    },
  });
  const [forwardCohort, boards, backlog, sources] = await Promise.all([
    getDiscoveryCoverageReport(),
    prisma.discoveredAtsBoard.findMany({ select: { status: true } }),
    prisma.communityEmployerCandidate.findMany({
      where: { status: "needs_adapter" },
      select: { detectedPlatform: true },
    }),
    prisma.discoverySource.findMany({ select: { lastStatus: true } }),
  ]);

  let directOnly = 0;
  let githubOnly = 0;
  let both = 0;
  let neither = 0;
  let richDescriptions = 0;
  let usVisaKnown = 0;
  let usVisaUnknown = 0;
  let suspect = 0;
  let externalMisses = 0;
  const urls = new Map<string, number>();

  for (const job of jobs) {
    const githubSeen = job.discoverySightings.some(
      (sighting) => sighting.source.system === "githubboard",
    );
    const directSeen = job.discoverySightings.some(
      (sighting) =>
        sighting.source.system !== "githubboard" &&
        sighting.source.positiveEvidence === "direct",
    );
    if (githubSeen && directSeen) both++;
    else if (githubSeen) githubOnly++;
    else if (directSeen) directOnly++;
    else neither++;

    if ((job.description?.trim().length ?? 0) >= 200) richDescriptions++;
    if (job.country === "US") {
      if (job.sponsorship) usVisaKnown++;
      else usVisaUnknown++;
    }
    if (job.availabilityStatus === "suspect") suspect++;
    if (job.discoverySystem?.startsWith("manual:")) externalMisses++;

    const canonicalUrl = normalizeUrl(job.applyUrl);
    if (isJobSpecificApplyUrl(canonicalUrl)) {
      urls.set(canonicalUrl, (urls.get(canonicalUrl) ?? 0) + 1);
    }
  }

  const duplicateCounts = [...urls.values()].filter((count) => count > 1);
  const total = jobs.length;
  return {
    generatedAt: new Date().toISOString(),
    inventory: {
      activeInternships: total,
      companies: new Set(jobs.map((job) => job.company)).size,
      canada: jobs.filter((job) => job.country === "CA").length,
      unitedStates: jobs.filter((job) => job.country === "US").length,
    },
    historicalSightings: {
      directOnly,
      githubOnly,
      both,
      neither,
      directCoveragePercent: percent(directOnly + both, total),
      githubCoveragePercent: percent(githubOnly + both, total),
    },
    forwardCohort,
    quality: {
      richDescriptions,
      thinDescriptions: total - richDescriptions,
      usVisaKnown,
      usVisaUnknown,
      strictDuplicateGroups: duplicateCounts.length,
      strictDuplicateExtraCards: duplicateCounts.reduce((sum, count) => sum + count - 1, 0),
      suspect,
      externalMisses,
    },
    automaticAts: countsBy(boards.map((board) => board.status)),
    customAdapterBacklog: countsBy(
      backlog.map((candidate) => candidate.detectedPlatform),
    ),
    sourceHealth: countsBy(
      sources.map((source) => source.lastStatus ?? "never"),
    ),
  };
}
