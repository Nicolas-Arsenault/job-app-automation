import { prisma } from "@/lib/db";
import { PageHeader } from "../components/ui";
import {
  ApplicationTracker,
  type TrackedApplication,
  type TrackedApplicationStatus,
} from "../components/applications/ApplicationTracker";

export const dynamic = "force-dynamic";

const TRACKED_STATUSES: TrackedApplicationStatus[] = [
  "applied",
  "interviewing",
  "offer",
  "rejected",
];

export default async function ApplicationsPage() {
  const jobs = await prisma.job.findMany({
    where: { applicationStatus: { in: TRACKED_STATUSES } },
    orderBy: [{ appliedAt: "desc" }, { firstSeenAt: "desc" }],
    select: {
      id: true,
      title: true,
      company: true,
      location: true,
      country: true,
      applyUrl: true,
      applicationStatus: true,
      appliedAt: true,
      availabilityStatus: true,
      closedAt: true,
    },
  });

  const applications: TrackedApplication[] = jobs.map((job) => ({
    ...job,
    applicationStatus: job.applicationStatus as TrackedApplicationStatus,
    appliedAt: job.appliedAt?.toISOString() ?? null,
    closedAt: job.closedAt?.toISOString() ?? null,
  }));

  return (
    <div>
      <PageHeader
        title="Applications"
        subtitle="Track every role you applied to, including postings that later close."
      />
      <ApplicationTracker initialApplications={applications} />
    </div>
  );
}
