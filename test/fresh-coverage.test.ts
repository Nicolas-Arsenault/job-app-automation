import { describe, expect, it } from "vitest";
import {
  calculateFreshCoverage,
  type FreshCoverageJob,
} from "../lib/discovery/fresh-coverage";

const now = new Date("2026-10-04T18:00:00Z");
const cutoff = new Date("2026-10-03T18:00:00Z");

function job(
  id: string,
  country: string,
  sightings: Array<{
    system: string;
    evidence: "direct" | "secondary";
    postedAt: string | null;
    name?: string;
  }>,
): FreshCoverageJob {
  return {
    id,
    company: `Company ${id}`,
    title: "Software Engineering Intern",
    country,
    applyUrl: `https://example.com/jobs/${id}`,
    discoverySightings: sightings.map((sighting) => ({
      reportedPostedAt: sighting.postedAt ? new Date(sighting.postedAt) : null,
      eligibleInternship: true,
      source: {
        name: sighting.name ?? sighting.system,
        system: sighting.system,
        positiveEvidence: sighting.evidence,
      },
    })),
  };
}

describe("24-hour source-specific discovery coverage", () => {
  it("compares the fresh union without mixing direct and GitHub dates", () => {
    const report = calculateFreshCoverage(
      [
        job("direct", "CA", [
          { system: "greenhouse", evidence: "direct", postedAt: "2026-10-04T10:00:00Z" },
        ]),
        job("github", "US", [
          { system: "githubboard", evidence: "secondary", postedAt: "2026-10-04T09:00:00Z" },
        ]),
        job("both", "CA", [
          { system: "lever", evidence: "direct", postedAt: "2026-10-04T08:00:00Z" },
          { system: "githubboard", evidence: "secondary", postedAt: "2026-10-04T09:00:00Z" },
        ]),
        job("old-direct-fresh-github", "US", [
          { system: "ashby", evidence: "direct", postedAt: "2026-10-01T09:00:00Z" },
          { system: "githubboard", evidence: "secondary", postedAt: "2026-10-04T09:00:00Z" },
        ]),
      ],
      cutoff,
      now,
    );

    expect(report).toMatchObject({
      union: 4,
      directOnly: 1,
      githubOnly: 2,
      both: 1,
      directFresh: 2,
      githubFresh: 3,
      directCoveragePercent: 50,
      githubCoveragePercent: 75,
      githubIncrementalPercent: 50,
    });
    expect(report.byCountry.CA).toMatchObject({ union: 2, directFresh: 2 });
    expect(report.byCountry.US).toMatchObject({ union: 2, githubOnly: 2 });
  });

  it("excludes unknown dates rather than treating scrape time as publication time", () => {
    const report = calculateFreshCoverage(
      [
        job("unknown-direct", "CA", [
          { system: "workday", evidence: "direct", postedAt: null },
        ]),
        job("unknown-github", "US", [
          { system: "githubboard", evidence: "secondary", postedAt: null },
        ]),
      ],
      cutoff,
      now,
    );
    expect(report.union).toBe(0);
    expect(report.excludedBecauseDateUnknown).toEqual({ direct: 1, github: 1 });
  });

  it("groups exact job URLs and preserves source-level eligibility", () => {
    const github = job("github-card", "US", [
      { system: "githubboard", evidence: "secondary", postedAt: "2026-10-04T09:00:00Z" },
    ]);
    const direct = job("direct-card", "US", [
      { system: "workday", evidence: "direct", postedAt: "2026-10-04T08:00:00Z" },
    ]);
    github.applyUrl = "https://acme.wd1.myworkdayjobs.com/Careers/job/Test/Intern_R12345?utm_source=board";
    direct.applyUrl = "https://acme.wd1.myworkdayjobs.com/Careers/job/Test/Intern_R12345";
    direct.discoverySightings.push({
      reportedPostedAt: new Date("2026-10-04T08:00:00Z"),
      eligibleInternship: false,
      source: { name: "Unrelated", system: "workday", positiveEvidence: "direct" },
    });

    const report = calculateFreshCoverage([github, direct], cutoff, now);
    expect(report).toMatchObject({ union: 1, both: 1, directFresh: 1, githubFresh: 1 });
  });
});
