import { beforeEach, describe, expect, it } from "vitest";
import { addManualApplication } from "../lib/applications/manual";
import { prisma } from "../lib/db";
import { resetDb } from "./helpers";

beforeEach(resetDb);

describe("manual application tracking", () => {
  it("creates an application-only job for an untracked posting", async () => {
    const result = await addManualApplication({
      company: "Acme",
      title: "Software Engineer Intern",
      applyUrl: "https://jobs.example.com/acme/intern-123?utm_source=linkedin",
      location: "Toronto, Ontario, Canada",
      applicationStatus: "applied",
      appliedAt: new Date("2026-10-01T12:00:00.000Z"),
      externalSource: "linkedin",
    });

    expect(result.created).toBe(true);
    expect(result.application).toMatchObject({
      company: "Acme",
      title: "Software Engineer Intern",
      country: "CA",
      applicationStatus: "applied",
      applyUrl: "https://jobs.example.com/acme/intern-123",
    });
    const stored = await prisma.job.findUniqueOrThrow({
      where: { id: result.application.id },
    });
    expect(stored.discoverySystem).toBe("manual:linkedin");
    expect(stored.isEntryLevel).toBe(true);
    expect(stored.employmentType).toBe("intern");
  });

  it("marks an existing discovered job instead of duplicating it", async () => {
    const existing = await prisma.job.create({
      data: {
        dedupeKey: "greenhouse:123",
        atsType: "greenhouse",
        externalId: "123",
        title: "Backend Engineering Intern",
        company: "Acme",
        location: "New York, New York, United States",
        applyUrl: "https://boards.greenhouse.io/acme/jobs/123",
        country: "US",
        isEntryLevel: true,
        discoverySystem: "greenhouse",
      },
    });

    const result = await addManualApplication({
      company: "Acme",
      title: "Backend Engineering Intern",
      applyUrl: "https://boards.greenhouse.io/acme/jobs/123?gh_src=linkedin",
      location: "New York, New York, United States",
      country: "US",
      applicationStatus: "interviewing",
      appliedAt: new Date("2026-09-30T12:00:00.000Z"),
    });

    expect(result).toMatchObject({ created: false, application: { id: existing.id } });
    expect(await prisma.job.count()).toBe(1);
    expect(result.application.applicationStatus).toBe("interviewing");
  });

  it("keeps similar metadata separate when the requisition URL differs", async () => {
    await prisma.job.create({
      data: {
        dedupeKey: "unknown:first",
        title: "Software Engineer Intern",
        company: "Acme",
        location: "Toronto, Ontario, Canada",
        applyUrl: "https://careers.example.com/jobs/first-opening",
        country: "CA",
        fingerprint: "same-looking-role",
      },
    });

    const result = await addManualApplication({
      company: "Acme",
      title: "Software Engineer Intern",
      applyUrl: "https://careers.example.com/jobs/second-opening",
      location: "Toronto, Ontario, Canada",
      applicationStatus: "applied",
      appliedAt: new Date("2026-10-03T12:00:00.000Z"),
    });

    expect(result.created).toBe(true);
    expect(await prisma.job.count()).toBe(2);
  });
});
