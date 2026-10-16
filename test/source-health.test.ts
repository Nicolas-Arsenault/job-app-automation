import { describe, expect, it } from "vitest";
import {
  sourceHealthIssues,
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
});
