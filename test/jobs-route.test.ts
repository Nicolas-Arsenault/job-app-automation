import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../app/api/jobs/route";
import { prisma } from "../lib/db";
import { resetDb } from "./helpers";

beforeEach(resetDb);

describe("jobs route", () => {
  it("does not discard recent US jobs when the active inventory exceeds 4,000 rows", async () => {
    const old = new Date("2026-01-01T00:00:00Z");
    await prisma.job.createMany({
      data: Array.from({ length: 4_000 }, (_, index) => ({
        dedupeKey: `old-${index}`,
        title: `Old Internship ${index}`,
        company: "Old Co",
        applyUrl: `https://example.com/jobs/${index}`,
        country: "US",
        isEntryLevel: true,
        employmentType: "intern",
        postedAt: old,
        firstSeenAt: old,
        lastSeenAt: old,
      })),
    });
    const recent = new Date();
    await prisma.job.create({
      data: {
        dedupeKey: "recent-after-old-cap",
        title: "Newest Software Engineering Internship",
        company: "Current Co",
        applyUrl: "https://example.com/jobs/newest",
        country: "US",
        isEntryLevel: true,
        employmentType: "intern",
        postedAt: recent,
        firstSeenAt: recent,
        lastSeenAt: recent,
      },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/jobs?country=US&since=24h&sort=posted"),
    );
    const jobs = await response.json() as { title: string }[];

    expect(jobs.map((job) => job.title)).toEqual([
      "Newest Software Engineering Internship",
    ]);
  });
});
