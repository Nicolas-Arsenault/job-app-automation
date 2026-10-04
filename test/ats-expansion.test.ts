import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../lib/db";
import {
  atsBoardFromUrl,
  observeCommunityAtsBoards,
  validatePendingAtsBoards,
  verifiedAtsCompanies,
} from "../lib/discovery/ats-expansion";
import type { DiscoveryPosting } from "../lib/discovery/adapters";
import { resetDb } from "./helpers";

beforeEach(resetDb);

function posting(applyUrl: string, company = "Acme, Inc."): DiscoveryPosting {
  return {
    company,
    title: "Software Engineering Intern",
    location: "Toronto, Canada",
    country: "CA",
    applyUrl,
    externalId: "community-1",
    description: "Internship",
    postedAt: new Date("2026-10-04T12:00:00Z"),
    system: "githubboard",
  };
}

describe("automatic ATS expansion", () => {
  it("extracts supported boards only from official ATS hosts", () => {
    expect(
      atsBoardFromUrl("https://job-boards.greenhouse.io/acmeco/jobs/123?utm_source=x"),
    ).toEqual({ system: "greenhouse", token: "acmeco" });
    expect(atsBoardFromUrl("https://jobs.lever.co/acme-co/abc")).toEqual({
      system: "lever",
      token: "acme-co",
    });
    expect(atsBoardFromUrl("https://jobs.ashbyhq.com/Acme%20Labs/abc")).toEqual({
      system: "ashby",
      token: "Acme Labs",
    });
    expect(atsBoardFromUrl("https://evil.example/jobs.lever.co/acme/abc")).toBeNull();
    expect(atsBoardFromUrl("https://jobs.lever.co/jobs/abc")).toBeNull();
  });

  it("records one pending candidate and preserves employer aliases", async () => {
    const url = "https://jobs.lever.co/acme-co/abc";
    await observeCommunityAtsBoards([posting(url)], "Community A");
    await observeCommunityAtsBoards([posting(url, "Acme Technologies")], "Community B");

    const row = await prisma.discoveredAtsBoard.findFirstOrThrow();
    expect(row).toMatchObject({
      system: "lever",
      token: "acme-co",
      company: "Acme, Inc.",
      status: "pending",
      evidenceSource: "Community B",
    });
    expect(JSON.parse(row.companyAliases)).toEqual(
      expect.arrayContaining(["Acme, Inc.", "Acme Technologies"]),
    );
  });

  it("validates a bounded candidate and makes it a pollable source", async () => {
    await observeCommunityAtsBoards(
      [posting("https://job-boards.greenhouse.io/acmeco/jobs/123")],
      "Community A",
    );
    const result = await validatePendingAtsBoards(
      { internshipsOnly: true, countries: ["US", "CA"] },
      { validate: async () => [], concurrency: 1 },
    );

    expect(result).toEqual({ verified: 1, failed: 0 });
    expect(await verifiedAtsCompanies()).toEqual([
      expect.objectContaining({ name: "Acme, Inc.", system: "greenhouse", token: "acmeco" }),
    ]);
  });

  it("backs off after a validation failure without discarding the candidate", async () => {
    await observeCommunityAtsBoards(
      [posting("https://jobs.lever.co/acme-co/abc")],
      "Community A",
    );
    const now = new Date("2026-10-04T12:00:00Z");
    const result = await validatePendingAtsBoards(
      {},
      {
        now,
        concurrency: 1,
        validate: async () => {
          throw new Error("HTTP 429");
        },
      },
    );

    expect(result).toEqual({ verified: 0, failed: 1 });
    expect(await prisma.discoveredAtsBoard.findFirstOrThrow()).toMatchObject({
      status: "pending",
      failureCount: 1,
      lastError: "HTTP 429",
    });
  });
});
