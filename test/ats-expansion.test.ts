import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../lib/db";
import {
  atsBoardFromUrl,
  bootstrapCommunityAtsBoards,
  observeCommunityAtsBoards,
  recordVerifiedAtsPollOutcome,
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

  it("extracts conservative Workday and Workable board identities", () => {
    expect(
      atsBoardFromUrl(
        "https://acme.wd5.myworkdayjobs.com/en-US/Careers/job/Toronto/Software-Intern_R12345",
      ),
    ).toEqual({
      system: "workday",
      token: "acme.wd5.myworkdayjobs.com|acme|Careers",
    });
    expect(
      atsBoardFromUrl(
        "https://wd3.myworkdaysite.com/recruiting/magna/Magna/job/Toronto/Intern_R123",
      ),
    ).toEqual({
      system: "workday",
      token: "wd3.myworkdaysite.com|magna|Magna",
    });
    expect(
      atsBoardFromUrl("https://apply.workable.com/acme-inc/j/ABC123/apply"),
    ).toEqual({ system: "workable", token: "acme-inc" });
    expect(
      atsBoardFromUrl("https://jobs.eu.lever.co/acme/12345678-1234-1234-1234-1234567890ab"),
    ).toEqual({ system: "lever", token: "acme" });
  });

  it("extracts Oracle Recruiting Candidate Experience board identities", () => {
    expect(
      atsBoardFromUrl(
        "https://hdks.fa.ca2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/9341",
      ),
    ).toEqual({
      system: "oracle",
      token: "hdks.fa.ca2.oraclecloud.com|hdks.fa.ca2.oraclecloud.com|CX_1",
    });
  });

  it("recovers Greenhouse boards from official embed URLs", () => {
    expect(
      atsBoardFromUrl(
        "https://boards.greenhouse.io/embed/job_app?for=acme&gh_jid=12345",
      ),
    ).toEqual({ system: "greenhouse", token: "acme" });
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

  it("can validate every pending board when the isolated benchmark removes the cap", async () => {
    const postings = Array.from({ length: 10 }, (_, index) =>
      posting(`https://jobs.lever.co/company-${index}/job-${index}`, `Company ${index}`),
    );
    await observeCommunityAtsBoards(postings, "Benchmark board");
    const validated: string[] = [];
    const result = await validatePendingAtsBoards(
      {
        countries: ["US", "CA"],
        internshipsOnly: true,
      },
      {
        limit: null,
        concurrency: 2,
        validate: async (company) => {
          validated.push(company.name);
          return [];
        },
      },
    );
    expect(result).toEqual({ verified: 10, failed: 0 });
    expect(validated).toHaveLength(10);
    expect(await prisma.discoveredAtsBoard.count({ where: { status: "pending" } })).toBe(0);
  });

  it("records only unsupported employers as a custom-adapter backlog", async () => {
    await observeCommunityAtsBoards(
      [
        posting("https://acme.wd5.myworkdayjobs.com/Acme/job/Toronto/Intern_R123", "Acme"),
        posting("https://careers.example.com/jobs/software-intern-42", "Example Labs"),
        posting("https://jobs.lever.co/supported/abc", "Supported Company"),
      ],
      "Community A",
    );

    const candidates = await prisma.communityEmployerCandidate.findMany({
      orderBy: { company: "asc" },
    });
    expect(candidates).toMatchObject([
      {
        company: "Example Labs",
        detectedPlatform: "unknown",
        applicationHost: "careers.example.com",
        status: "needs_adapter",
        observations: 1,
      },
    ]);
    expect(candidates.some((candidate) => candidate.company === "Supported Company")).toBe(false);
    expect(candidates.some((candidate) => candidate.company === "Acme")).toBe(false);

    await observeCommunityAtsBoards(
      [posting("https://careers.example.com/jobs/software-intern-43", "Example Labs")],
      "Community B",
    );
    expect(
      await prisma.communityEmployerCandidate.findUniqueOrThrow({
        where: { companyKey: candidates[0].companyKey },
      }),
    ).toMatchObject({ observations: 2 });
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

  it("backs off a learned board after three terminal polling failures and recovers on success", async () => {
    await observeCommunityAtsBoards(
      [posting("https://jobs.ashbyhq.com/acme/abc")],
      "Community A",
    );
    await validatePendingAtsBoards(
      {},
      { concurrency: 1, validate: async () => [] },
    );
    const [company] = await verifiedAtsCompanies();
    const now = new Date("2026-10-15T12:00:00Z");

    await recordVerifiedAtsPollOutcome(company, new Error("HTTP 404"), now);
    await recordVerifiedAtsPollOutcome(company, new Error("HTTP 404"), now);
    await recordVerifiedAtsPollOutcome(company, new Error("HTTP 404"), now);

    expect(await prisma.discoveredAtsBoard.findFirstOrThrow()).toMatchObject({
      status: "pending",
      failureCount: 3,
      lastError: "HTTP 404",
      nextRetryAt: new Date("2026-10-22T12:00:00Z"),
    });

    await recordVerifiedAtsPollOutcome(company);
    expect(await prisma.discoveredAtsBoard.findFirstOrThrow()).toMatchObject({
      status: "verified",
      failureCount: 0,
      lastError: null,
      nextRetryAt: null,
    });
  });

  it("turns discovered Workday configuration into a pollable source", async () => {
    await observeCommunityAtsBoards(
      [posting("https://acme.wd5.myworkdayjobs.com/en-US/Careers/job/Toronto/Intern_R123")],
      "Community A",
    );
    await validatePendingAtsBoards(
      { internshipsOnly: true, countries: ["US", "CA"] },
      {
        concurrency: 1,
        validate: async (company) => {
          expect(company).toMatchObject({
            name: "Acme, Inc.",
            system: "workday",
            workday: {
              host: "acme.wd5.myworkdayjobs.com",
              tenant: "acme",
              site: "Careers",
              detailConcurrency: 2,
              fetchDescriptions: false,
              searchTerms: ["intern"],
            },
          });
          return [];
        },
      },
    );
    expect(await verifiedAtsCompanies()).toEqual([
      expect.objectContaining({
        system: "workday",
        workday: expect.objectContaining({ site: "Careers" }),
      }),
    ]);
  });

  it("turns discovered Oracle configuration into a pollable source", async () => {
    await observeCommunityAtsBoards(
      [
        posting(
          "https://hdks.fa.ca2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/9341",
          "Definity Financial",
        ),
      ],
      "Community A",
    );
    await validatePendingAtsBoards(
      { internshipsOnly: true, countries: ["US", "CA"] },
      {
        concurrency: 1,
        validate: async (company) => {
          expect(company).toMatchObject({
            name: "Definity Financial",
            system: "oracle",
            oracle: {
              host: "hdks.fa.ca2.oraclecloud.com",
              careerHost: "hdks.fa.ca2.oraclecloud.com",
              site: "CX_1",
            },
          });
          return [];
        },
      },
    );
    expect(await verifiedAtsCompanies()).toEqual([
      expect.objectContaining({
        system: "oracle",
        oracle: expect.objectContaining({ site: "CX_1" }),
      }),
    ]);
  });

  it("removes built-in automated employers from the custom-adapter backlog", async () => {
    await observeCommunityAtsBoards(
      [
        posting(
          "https://boards.greenhouse.io/embed/job_app?token=8175471",
          "Stripe",
        ),
      ],
      "Community A",
    );
    expect(await prisma.communityEmployerCandidate.findFirstOrThrow()).toMatchObject({
      status: "needs_adapter",
    });

    await bootstrapCommunityAtsBoards(0);
    expect(await prisma.communityEmployerCandidate.findFirstOrThrow()).toMatchObject({
      status: "resolved",
      notes: "Already covered by the built-in automated source catalog",
    });
  });

  it("reconciles stale backlog rows already covered by verified ATS and community sources", async () => {
    await prisma.communityEmployerCandidate.createMany({
      data: [
        {
          companyKey: "d1060a0ab234c8d3d4c5a2c2b39380f2c53e2727",
          company: "Verified Example",
          applicationHost: "careers.example.com",
          exampleApplyUrl: "https://careers.example.com/jobs/1",
        },
        {
          companyKey: "yc-example",
          company: "YC Example",
          applicationHost: "www.workatastartup.com",
          exampleApplyUrl: "https://www.workatastartup.com/jobs/123",
        },
      ],
    });
    await prisma.discoveredAtsBoard.create({
      data: {
        system: "greenhouse",
        token: "verified-example",
        company: "Verified Example",
        companyAliases: JSON.stringify(["Verified Example"]),
        evidenceUrl: "https://job-boards.greenhouse.io/verified-example/jobs/1",
        evidenceSource: "test",
        status: "verified",
      },
    });

    await bootstrapCommunityAtsBoards(0);

    expect(
      await prisma.communityEmployerCandidate.findMany({
        orderBy: { company: "asc" },
        select: { company: true, status: true },
      }),
    ).toEqual([
      { company: "Verified Example", status: "resolved" },
      { company: "YC Example", status: "resolved" },
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

  it("does not erase validation backoff when a board is observed again", async () => {
    const url = "https://jobs.lever.co/acme-co/abc";
    await observeCommunityAtsBoards([posting(url)], "Community A");
    const retryAt = new Date("2026-10-05T12:00:00Z");
    const row = await prisma.discoveredAtsBoard.findFirstOrThrow();
    await prisma.discoveredAtsBoard.update({
      where: { id: row.id },
      data: { nextRetryAt: retryAt, failureCount: 2 },
    });

    await observeCommunityAtsBoards([posting(url)], "Community B");
    expect(await prisma.discoveredAtsBoard.findFirstOrThrow()).toMatchObject({
      nextRetryAt: retryAt,
      failureCount: 2,
    });
  });
});
