import { createHash } from "node:crypto";
import { prisma } from "../db";
import { canonicalCompanyName } from "../company-names";
import { classifyCountry } from "../discovery/entryLevel";
import { canonicalize } from "../sources/normalize";

export const MANUAL_APPLICATION_STATUSES = [
  "applied",
  "interviewing",
  "offer",
  "rejected",
] as const;

export type ManualApplicationStatus =
  (typeof MANUAL_APPLICATION_STATUSES)[number];

export interface ManualApplicationInput {
  title: string;
  company: string;
  applyUrl: string;
  location?: string;
  country?: "US" | "CA" | "OTHER";
  applicationStatus: ManualApplicationStatus;
  appliedAt: Date;
}

const trackedApplicationSelect = {
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
} as const;

function discoveryFingerprint(
  company: string,
  title: string,
  country: string,
): string {
  return createHash("sha1")
    .update(
      [canonicalCompanyName(company), title, country]
        .join("|")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim(),
    )
    .digest("hex");
}

/**
 * Add a user-reported application without creating a second copy of a role the
 * discovery pipeline already knows. Exact ATS identity/URL wins, followed by
 * the same cross-source fingerprint used by discovery.
 */
export async function addManualApplication(input: ManualApplicationInput) {
  const company = canonicalCompanyName(input.company);
  const location = input.location?.trim() || null;
  const country = input.country ?? classifyCountry(location);
  const canonical = canonicalize({
    title: input.title.trim(),
    company,
    location,
    applyUrl: input.applyUrl,
  });
  const fingerprint = discoveryFingerprint(company, input.title.trim(), country);

  const existing = await prisma.job.findFirst({
    where: {
      OR: [
        { dedupeKey: canonical.dedupeKey },
        { applyUrl: canonical.applyUrl },
        { fingerprint },
      ],
    },
    orderBy: { firstSeenAt: "asc" },
    select: { id: true },
  });

  const applicationData = {
    applicationStatus: input.applicationStatus,
    appliedAt: input.appliedAt,
  };

  if (existing) {
    const application = await prisma.job.update({
      where: { id: existing.id },
      data: applicationData,
      select: trackedApplicationSelect,
    });
    return { application, created: false };
  }

  const application = await prisma.job.create({
    data: {
      dedupeKey: canonical.dedupeKey,
      atsType: canonical.atsType,
      externalId: canonical.externalId,
      title: input.title.trim(),
      company,
      location,
      remote: /remote/i.test(location ?? ""),
      applyUrl: canonical.applyUrl,
      isWorkday: canonical.atsType === "workday",
      country,
      isEntryLevel: false,
      discoverySystem: "manual",
      fingerprint,
      employmentType: "intern",
      ...applicationData,
      raw: JSON.stringify({ manuallyAdded: true }),
    },
    select: trackedApplicationSelect,
  });
  return { application, created: true };
}
