import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../lib/db";
import { browserBacklogTargets } from "../lib/discovery/browser-backlog";
import { resetDb } from "./helpers";

beforeEach(resetDb);

describe("browser-only ATS backlog", () => {
  it("routes supported rendered ATS families to stable board URLs", async () => {
    await prisma.communityEmployerCandidate.createMany({
      data: [
        {
          companyKey: "icims",
          company: "Example iCIMS",
          detectedPlatform: "icims",
          applicationHost: "careers-example.icims.com",
          exampleApplyUrl: "https://careers-example.icims.com/jobs/123/software-intern/job",
        },
        {
          companyKey: "rippling",
          company: "Example Rippling",
          applicationHost: "ats.rippling.com",
          exampleApplyUrl: "https://ats.rippling.com/example/jobs/12345678-1234-1234-1234-123456789012",
        },
        {
          companyKey: "localized-rippling",
          company: "Localized Rippling",
          applicationHost: "ats.rippling.com",
          exampleApplyUrl: "https://ats.rippling.com/en-GB/localized/jobs/12345678-1234-1234-1234-123456789012",
        },
        {
          companyKey: "custom-icims",
          company: "Branded iCIMS",
          applicationHost: "careers.example.com",
          exampleApplyUrl: "https://careers.example.com/jobs/456/intern?icims=1",
        },
        {
          companyKey: "custom",
          company: "Unsupported Custom Site",
          applicationHost: "careers.example.com",
          exampleApplyUrl: "https://careers.example.com/jobs/1",
        },
      ],
    });

    const targets = await browserBacklogTargets();
    expect(targets).toHaveLength(4);
    expect(targets.map((target) => target.company.searchUrlUS)).toEqual(
      expect.arrayContaining([
        "https://careers-example.icims.com/jobs/search?ss=1&searchKeyword=intern",
        "https://ats.rippling.com/example/jobs",
        "https://ats.rippling.com/localized/jobs",
        "https://careers.example.com/jobs",
      ]),
    );
    expect(targets.every((target) => target.company.system === "browserats")).toBe(true);
  });
});
