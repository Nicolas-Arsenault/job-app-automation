import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../lib/db";
import { ingestPostings } from "../lib/discovery/run";
import { resetDb } from "./helpers";
import type { DiscoveryPosting } from "../lib/discovery/adapters";

function posting(over: Partial<DiscoveryPosting>): DiscoveryPosting {
  return {
    company: "Acme",
    title: "Software Engineer",
    location: "San Francisco, CA",
    country: "US",
    applyUrl: "https://boards.greenhouse.io/acme/jobs/1",
    externalId: "1",
    description: "",
    postedAt: null,
    system: "greenhouse",
    ...over,
  };
}

beforeEach(resetDb);

describe("conservative cross-source dedup (discovery persist)", () => {
  it("keeps both rows when similar titles point at different URLs", async () => {
    await ingestPostings([posting({})], true);
    expect(await prisma.job.count()).toBe(1);

    // A board re-lists the SAME role (same company + title + country) under a
    // different id / apply URL and the githubboard system.
    await ingestPostings(
      [posting({ system: "githubboard", externalId: "board-1", applyUrl: "https://simplify.jobs/acme/1" })],
      true,
    );

    // Similar metadata is not proof of identity. False duplicates are safer
    // than hiding a separate requisition.
    expect(await prisma.job.count()).toBe(2);
  });

  it("promotes a pre-existing board card when the native source appears later", async () => {
    await ingestPostings(
      [
        posting({
          system: "githubboard",
          externalId: "board-1",
          applyUrl: "https://boards.greenhouse.io/acme/jobs/12345?utm_source=board",
        }),
      ],
      true,
    );

    await ingestPostings(
      [
        posting({
          externalId: "12345",
          applyUrl: "https://boards.greenhouse.io/acme/jobs/12345",
        }),
      ],
      true,
    );

    expect(await prisma.job.count()).toBe(1);
    expect(await prisma.job.findFirstOrThrow()).toMatchObject({
      dedupeKey: "greenhouse:12345",
      discoverySystem: "greenhouse",
      applyUrl: "https://boards.greenhouse.io/acme/jobs/12345",
    });
  });

  it("does NOT collapse an employer's distinct same-title reqs from one system", async () => {
    await ingestPostings(
      [
        posting({
          externalId: "1",
          location: "Seattle, WA",
          applyUrl: "https://boards.greenhouse.io/acme/jobs/1",
        }),
        posting({
          externalId: "2",
          location: "New York, NY",
          applyUrl: "https://boards.greenhouse.io/acme/jobs/2",
        }),
      ],
      true,
    );
    // Same company + title + US, same system, distinct ids → two separate reqs.
    expect(await prisma.job.count()).toBe(2);
  });

  it("keeps uncertain board overlaps when their apply URLs differ", async () => {
    await ingestPostings(
      [posting({ system: "githubboard", externalId: "a", applyUrl: "https://board-a/acme/1" })],
      true,
    );
    await ingestPostings(
      [posting({ system: "githubboard", externalId: "b", applyUrl: "https://board-b/acme/1" })],
      true,
    );
    expect(await prisma.job.count()).toBe(2);
  });

  it("does not merge company aliases without a shared requisition identity", async () => {
    await ingestPostings(
      [
        posting({
          company: "Uber",
          externalId: "uber-native",
          applyUrl: "https://jobs.uber.com/1",
        }),
      ],
      true,
    );
    await ingestPostings(
      [
        posting({
          company: "Uber Technologies, Inc.",
          system: "githubboard",
          externalId: "uber-board",
          applyUrl: "https://simplify.jobs/uber/1",
        }),
      ],
      true,
    );

    expect(await prisma.job.count()).toBe(2);
    expect((await prisma.job.findMany()).every((job) => job.company === "Uber")).toBe(true);
  });

  it("dedupes title variants that point at the same job-specific URL", async () => {
    const applyUrl = "https://job-boards.greenhouse.io/acme/jobs/8675309002";
    await ingestPostings(
      [posting({ title: "2027 Internship - Software Engineer", externalId: "8675309002", applyUrl })],
      false,
    );
    await ingestPostings(
      [
        posting({
          title: "Software Engineer Intern - Backend",
          system: "githubboard",
          externalId: "board-8675309002",
          applyUrl: `${applyUrl}?utm_source=community`,
        }),
      ],
      false,
    );

    expect(await prisma.job.count()).toBe(1);
    expect(await prisma.job.findFirstOrThrow()).toMatchObject({
      title: "2027 Internship - Software Engineer",
      discoverySystem: "greenhouse",
      applyUrl,
    });
  });

  it("dedupes changed source IDs when the canonical job URL is unchanged", async () => {
    const applyUrl = "https://apply.careers.microsoft.com/careers/job/1970393556922922";
    await ingestPostings(
      [posting({ system: "microsoft", externalId: "old-id", applyUrl })],
      false,
    );
    await ingestPostings(
      [posting({ system: "microsoft", externalId: "new-id", applyUrl })],
      false,
    );

    expect(await prisma.job.count()).toBe(1);
    expect(await prisma.job.findFirstOrThrow()).toMatchObject({
      dedupeKey: "microsoft:new-id",
      externalId: "new-id",
    });
  });

  it("does not dedupe unrelated roles that share a generic careers page", async () => {
    const applyUrl = "https://careers.example.com/search";
    await ingestPostings(
      [
        posting({ title: "Backend Engineer Intern", externalId: "backend", applyUrl }),
        posting({ title: "Frontend Engineer Intern", externalId: "frontend", applyUrl }),
      ],
      false,
    );

    expect(await prisma.job.count()).toBe(2);
  });
});
