import { prisma } from "./db";
import { isJobSpecificApplyUrl, normalizeUrl } from "./sources/normalize";

export interface JobDedupResult {
  groupsMerged: number;
  jobsRemoved: number;
}

const APPLICATION_STATUS_RANK: Record<string, number> = {
  none: 0,
  saved: 1,
  dismissed: 2,
  rejected: 3,
  applied: 4,
  interviewing: 5,
  offer: 6,
};

const APPLICATION_RECORD_STATUS_RANK: Record<string, number> = {
  drafted: 1,
  failed: 2,
  pending_approval: 3,
  submitted: 4,
};

function rankJob(job: {
  applicationStatus: string;
  discoverySystem: string | null;
  description: string | null;
  application: { status: string } | null;
  match: { status: string } | null;
}): number {
  return (
    (APPLICATION_STATUS_RANK[job.applicationStatus] ?? 0) * 1_000_000 +
    (job.application ? 100_000 + (APPLICATION_RECORD_STATUS_RANK[job.application.status] ?? 0) : 0) +
    (job.match ? 10_000 : 0) +
    (job.discoverySystem !== "githubboard" ? 1_000 : 0) +
    Math.min(job.description?.length ?? 0, 999)
  );
}

/**
 * Merge historical duplicates that resolve to the same job-specific apply URL.
 * Generic company/search pages are deliberately excluded because several
 * distinct requisitions can legitimately share those URLs.
 */
export async function dedupeStoredJobsByApplyUrl(): Promise<JobDedupResult> {
  const jobs = await prisma.job.findMany({
    include: {
      application: true,
      match: true,
    },
    orderBy: { firstSeenAt: "asc" },
  });
  const groups = new Map<string, typeof jobs>();
  for (const job of jobs) {
    const canonicalUrl = normalizeUrl(job.applyUrl);
    if (!isJobSpecificApplyUrl(canonicalUrl)) continue;
    const group = groups.get(canonicalUrl) ?? [];
    group.push(job);
    groups.set(canonicalUrl, group);
  }

  let groupsMerged = 0;
  let jobsRemoved = 0;
  for (const [canonicalUrl, group] of groups) {
    if (group.length < 2) continue;
    const ordered = [...group].sort((a, b) => rankJob(b) - rankJob(a));
    const keeper = ordered[0];
    const duplicates = ordered.slice(1);
    const firstSeenAt = new Date(Math.min(...group.map((job) => job.firstSeenAt.getTime())));
    const lastSeenAt = new Date(Math.max(...group.map((job) => job.lastSeenAt.getTime())));
    const bestStatus = [...group].sort(
      (a, b) =>
        (APPLICATION_STATUS_RANK[b.applicationStatus] ?? 0) -
        (APPLICATION_STATUS_RANK[a.applicationStatus] ?? 0),
    )[0];

    await prisma.$transaction(async (tx) => {
      let keeperHasApplication = Boolean(keeper.application);
      let keeperHasMatch = Boolean(keeper.match);

      for (const duplicate of duplicates) {
        const sightings = await tx.jobSighting.findMany({ where: { jobId: duplicate.id } });
        for (const sighting of sightings) {
          const existing = await tx.jobSighting.findUnique({
            where: { jobId_sourceId: { jobId: keeper.id, sourceId: sighting.sourceId } },
          });
          if (existing) {
            if (sighting.seenAt > existing.seenAt) {
              await tx.jobSighting.update({
                where: { id: existing.id },
                data: { seenAt: sighting.seenAt },
              });
            }
            await tx.jobSighting.delete({ where: { id: sighting.id } });
          } else {
            await tx.jobSighting.update({
              where: { id: sighting.id },
              data: { jobId: keeper.id },
            });
          }
        }

        const discoverySightings = await tx.discoveryJobSighting.findMany({
          where: { jobId: duplicate.id },
        });
        for (const sighting of discoverySightings) {
          const existing = await tx.discoveryJobSighting.findUnique({
            where: { jobId_sourceKey: { jobId: keeper.id, sourceKey: sighting.sourceKey } },
          });
          if (existing) {
            const newest = sighting.lastSeenAt > existing.lastSeenAt ? sighting : existing;
            await tx.discoveryJobSighting.update({
              where: { id: existing.id },
              data: {
                firstSeenAt:
                  sighting.firstSeenAt < existing.firstSeenAt
                    ? sighting.firstSeenAt
                    : existing.firstSeenAt,
                lastSeenAt: newest.lastSeenAt,
                lastSeenRunId: newest.lastSeenRunId,
                consecutiveMisses: Math.min(
                  sighting.consecutiveMisses,
                  existing.consecutiveMisses,
                ),
                lastMissingAt: newest.lastMissingAt,
                lastVerifiedAt: newest.lastVerifiedAt,
                lastVerificationStatus: newest.lastVerificationStatus,
              },
            });
            await tx.discoveryJobSighting.delete({ where: { id: sighting.id } });
          } else {
            await tx.discoveryJobSighting.update({
              where: { id: sighting.id },
              data: { jobId: keeper.id },
            });
          }
        }

        if (duplicate.application && !keeperHasApplication) {
          await tx.application.update({
            where: { id: duplicate.application.id },
            data: { jobId: keeper.id },
          });
          keeperHasApplication = true;
        }
        if (duplicate.match && !keeperHasMatch) {
          await tx.match.update({
            where: { id: duplicate.match.id },
            data: { jobId: keeper.id },
          });
          keeperHasMatch = true;
        }

        await tx.job.delete({ where: { id: duplicate.id } });
      }

      await tx.job.update({
        where: { id: keeper.id },
        data: {
          applyUrl: canonicalUrl,
          firstSeenAt,
          lastSeenAt,
          applicationStatus: bestStatus.applicationStatus,
          appliedAt: bestStatus.appliedAt ?? keeper.appliedAt,
        },
      });
    });

    groupsMerged++;
    jobsRemoved += duplicates.length;
  }

  return { groupsMerged, jobsRemoved };
}
