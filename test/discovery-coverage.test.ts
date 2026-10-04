import { describe, expect, it } from "vitest";
import {
  calculateCoverageReport,
  type CoverageJob,
} from "../lib/discovery/coverage";

const startedAt = new Date("2026-10-04T12:00:00Z");

function job(
  applyUrl: string,
  sightings: Array<{ system: string; evidence?: string; minute: number }>,
  country: "US" | "CA" = "CA",
): CoverageJob {
  return {
    country,
    applyUrl,
    discoverySightings: sightings.map((sighting) => ({
      firstSeenAt: new Date(startedAt.getTime() + sighting.minute * 60_000),
      source: {
        system: sighting.system,
        positiveEvidence: sighting.evidence ?? "direct",
      },
    })),
  };
}

describe("forward discovery coverage experiment", () => {
  it("separates direct-only, GitHub-only, overlap, and untracked jobs", () => {
    const report = calculateCoverageReport(
      [
        job("https://jobs.example.com/direct", [{ system: "workday", minute: 10 }]),
        job("https://jobs.lever.co/acme/abc", [
          { system: "githubboard", evidence: "secondary", minute: 20 },
        ]),
        job("https://jobs.example.com/both", [
          { system: "greenhouse", minute: 30 },
          { system: "githubboard", evidence: "secondary", minute: 90 },
        ], "US"),
        job("https://jobs.example.com/manual", []),
      ],
      startedAt,
    );

    expect(report).toMatchObject({
      total: 4,
      directOnly: 1,
      githubOnly: 1,
      both: 1,
      untracked: 1,
      directCoveragePercent: 50,
      githubCoveragePercent: 50,
      githubUniquePercent: 25,
      externalMisses: 0,
      overlap: {
        directFirst: 1,
        githubFirst: 0,
        sameTime: 0,
        medianGithubLagMinutes: 60,
      },
      githubOnlyRouting: { automaticAts: 1, customAdapter: 0 },
    });
    expect(report.byCountry.CA.total).toBe(3);
    expect(report.byCountry.US.both).toBe(1);
  });

  it("routes unsupported GitHub-only jobs into the custom-adapter metric", () => {
    const report = calculateCoverageReport(
      [job("https://careers.example.com/jobs/42", [
        { system: "githubboard", evidence: "secondary", minute: 1 },
      ])],
      startedAt,
    );
    expect(report.githubOnlyRouting).toEqual({ automaticAts: 0, customAdapter: 1 });
  });

  it("counts manually reported jobs as external misses", () => {
    const manual = job("https://careers.example.com/jobs/99", []);
    manual.discoverySystem = "manual:linkedin";
    const report = calculateCoverageReport([manual], startedAt);
    expect(report).toMatchObject({
      total: 1,
      untracked: 1,
      externalMisses: 1,
    });
  });
});
