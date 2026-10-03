import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../lib/db";
import { dedupeStoredJobsByApplyUrl } from "../lib/job-dedup";
import { resetDb } from "./helpers";

beforeEach(resetDb);

describe("dedupeStoredJobsByApplyUrl", () => {
  it("merges relations and preserves application progress", async () => {
    const applyUrl = "https://job-boards.greenhouse.io/acme/jobs/8675309002";
    const board = await prisma.job.create({
      data: {
        dedupeKey: "githubboard:acme-8675309002",
        title: "Software Engineer Intern",
        company: "Acme",
        applyUrl,
        discoverySystem: "githubboard",
        applicationStatus: "applied",
        appliedAt: new Date("2026-10-01T12:00:00Z"),
      },
    });
    const native = await prisma.job.create({
      data: {
        dedupeKey: "greenhouse:8675309002",
        title: "2027 Internship - Software Engineer",
        company: "Acme",
        applyUrl: `${applyUrl}?utm_source=board`,
        discoverySystem: "greenhouse",
      },
    });
    const sourceOne = await prisma.source.create({
      data: { name: "Board", kind: "json" },
    });
    const sourceTwo = await prisma.source.create({
      data: { name: "Native", kind: "greenhouse" },
    });
    await prisma.jobSighting.createMany({
      data: [
        { jobId: board.id, sourceId: sourceOne.id },
        { jobId: native.id, sourceId: sourceTwo.id },
      ],
    });
    await prisma.application.create({
      data: { jobId: board.id, status: "submitted" },
    });
    await prisma.match.create({
      data: { jobId: native.id, score: 82 },
    });

    expect(await dedupeStoredJobsByApplyUrl()).toEqual({
      groupsMerged: 1,
      jobsRemoved: 1,
    });
    const survivor = await prisma.job.findFirstOrThrow({
      include: { application: true, match: true, sightings: true },
    });
    expect(survivor.applicationStatus).toBe("applied");
    expect(survivor.application?.status).toBe("submitted");
    expect(survivor.match?.score).toBe(82);
    expect(survivor.sightings).toHaveLength(2);
  });

  it("leaves jobs sharing a generic careers page separate", async () => {
    await prisma.job.createMany({
      data: [
        {
          dedupeKey: "generic:one",
          title: "Backend Intern",
          company: "Acme",
          applyUrl: "https://careers.example.com/search",
        },
        {
          dedupeKey: "generic:two",
          title: "Frontend Intern",
          company: "Acme",
          applyUrl: "https://careers.example.com/search",
        },
      ],
    });

    expect(await dedupeStoredJobsByApplyUrl()).toEqual({
      groupsMerged: 0,
      jobsRemoved: 0,
    });
    expect(await prisma.job.count()).toBe(2);
  });
});
