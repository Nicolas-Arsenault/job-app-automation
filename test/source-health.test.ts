import { describe, expect, it } from "vitest";
import {
  sourceHealthIssues,
  sourceCoverageIssues,
  sourceQualityIssues,
  type SourceHealthRecord,
} from "../lib/discovery/source-health";

function source(
  key: string,
  company: string,
  status: string,
  minutes: number,
  count: number,
): SourceHealthRecord {
  return {
    key,
    name: company,
    company,
    system: "greenhouse",
    authoritative: true,
    expectedComplete: true,
    lastStatus: status,
    lastMessage: null,
    lastQualityMetrics: null,
    lastQualityWarnings: null,
    lastRunAt: new Date(Date.UTC(2026, 9, 15, 12, minutes)),
    lastCompleteRunAt: status === "success" ? new Date() : null,
    lastObservedCount: count,
  };
}

describe("source health summary", () => {
  it("suppresses a stale duplicate when another board covered the employer", () => {
    const issues = sourceHealthIssues([
      source("old", "Graphcore", "degraded", 0, 1),
      source("current", "Graphcore", "success", 1, 178),
    ]);

    expect(issues).toEqual([]);
  });

  it("keeps an employer alert when no sibling source returned postings", () => {
    const issues = sourceHealthIssues([
      source("failed", "Saronic", "error", 0, 0),
      source("empty", "Saronic", "success", 1, 0),
    ]);

    expect(issues.map((issue) => issue.key)).toEqual(["failed"]);
  });

  it("reports one highest-severity issue per employer", () => {
    const issues = sourceHealthIssues([
      source("degraded", "Acme", "degraded", 2, 10),
      source("error", "Acme", "error", 1, 0),
    ]);

    expect(issues.map((issue) => issue.key)).toEqual(["error"]);
  });

  it("reports semantic quality warnings without changing source status", () => {
    const healthy = source("quality", "Acme", "success", 2, 10);
    healthy.lastQualityWarnings = JSON.stringify(["missing posting dates 100% (10/10)"]);

    expect(sourceHealthIssues([healthy]).map((issue) => issue.key)).toEqual(["quality"]);
    expect(sourceCoverageIssues([healthy])).toEqual([]);
    expect(sourceQualityIssues([healthy]).map((issue) => issue.key)).toEqual(["quality"]);
  });

  it("suppresses a stale platform after a newer replacement source succeeds", () => {
    const stale = source("old-greenhouse", "HubSpot", "error", 0, 132);
    const replacement = source("new-ripplematch", "HubSpot", "limited", 5, 0);
    replacement.system = "ripplematch";

    expect(sourceCoverageIssues([stale, replacement])).toEqual([]);
  });
});
