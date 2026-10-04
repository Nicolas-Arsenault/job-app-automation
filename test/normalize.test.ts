import { describe, it, expect } from "vitest";
import {
  detectAts,
  normalizeUrl,
  extractExternalId,
  canonicalize,
  isJobSpecificApplyUrl,
} from "../lib/sources/normalize";
import type { NormalizedJob } from "../lib/sources/types";

describe("detectAts", () => {
  it("identifies known ATS hosts", () => {
    expect(detectAts("https://boards.greenhouse.io/figma/jobs/123")).toBe("greenhouse");
    expect(detectAts("https://jobs.lever.co/palantir/abc")).toBe("lever");
    expect(detectAts("https://jobs.ashbyhq.com/ramp/xyz")).toBe("ashby");
    expect(detectAts("https://acme.wd1.myworkdayjobs.com/careers/job/1")).toBe("workday");
    expect(detectAts("https://careers-acme.icims.com/jobs/1")).toBe("icims");
    expect(detectAts("https://apply.workable.com/j/ABC123")).toBe("workable");
    expect(detectAts("https://vention.na.teamtailor.com/jobs/123")).toBe("teamtailor");
    expect(detectAts("https://example.com/careers/1")).toBe("unknown");
    expect(detectAts("not a url")).toBe("unknown");
  });
});

describe("isJobSpecificApplyUrl", () => {
  it("recognizes common path and query requisition identifiers", () => {
    expect(
      isJobSpecificApplyUrl("https://careers.example.com/jobs?gh_jid=8675309002"),
    ).toBe(true);
    expect(
      isJobSpecificApplyUrl("https://example.com/careers/job/1970393556922922"),
    ).toBe(true);
    expect(
      isJobSpecificApplyUrl(
        "https://jobs.lever.co/acme/12345678-1234-1234-1234-1234567890ab",
      ),
    ).toBe(true);
    expect(
      isJobSpecificApplyUrl(
        "https://acme.wd5.myworkdayjobs.com/Careers/job/Ottawa/Software-Intern_R031631",
      ),
    ).toBe(true);
  });

  it("rejects generic careers and search pages", () => {
    expect(isJobSpecificApplyUrl("https://careers.example.com/jobs")).toBe(false);
    expect(isJobSpecificApplyUrl("https://careers.example.com/search?team=engineering")).toBe(false);
  });
});

describe("normalizeUrl", () => {
  it("strips tracking query parameters, fragments, and trailing slashes", () => {
    expect(normalizeUrl("https://x.com/jobs/9/?utm_source=foo#apply")).toBe(
      "https://x.com/jobs/9",
    );
  });
  it.each([
    [
      "https://careers.withwaymo.com/jobs?gh_jid=8049315&utm_source=greenhouse#apply",
      "https://careers.withwaymo.com/jobs?gh_jid=8049315",
    ],
    [
      "https://www.hudsonrivertrading.com/careers/job/?gh_jid=7972593&gh_src=abc",
      "https://www.hudsonrivertrading.com/careers/job/?gh_jid=7972593",
    ],
  ])("preserves Greenhouse job identifiers in %s", (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });
  it.each([
    [
      "https://ibmglobal.avature.net/en_US/careers/JobDetail?jobId=61672&source=SN_LinkedIn",
      "https://ibmglobal.avature.net/en_US/careers/JobDetail?jobId=61672",
    ],
    [
      "https://boards.greenhouse.io/embed/job_app?token=123&utm_medium=board",
      "https://boards.greenhouse.io/embed/job_app?token=123",
    ],
  ])("preserves non-Greenhouse job identifiers in %s", (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });
  it("returns input unchanged when not a URL", () => {
    expect(normalizeUrl("  garbage ")).toBe("garbage");
  });

  it.each([
    [
      "https://apply.workable.com/acme/j/ABC123/apply?utm_source=board",
      "https://apply.workable.com/acme/j/ABC123",
    ],
    [
      "https://jobs.eu.lever.co/acme/12345678-1234-1234-1234-1234567890ab/apply",
      "https://jobs.eu.lever.co/acme/12345678-1234-1234-1234-1234567890ab",
    ],
    [
      "https://careers-acme.icims.com/jobs/32343/software-engineer/job?mobile=false",
      "https://careers-acme.icims.com/jobs/32343/job",
    ],
    [
      "https://acme.wd5.myworkdayjobs.com/en-US/Careers/job/Toronto/Intern_R123?utm_source=x",
      "https://acme.wd5.myworkdayjobs.com/Careers/job/Toronto/Intern_R123",
    ],
    [
      "https://boards.greenhouse.io/embed/job_app?for=acme&gh_jid=12345&utm_source=x",
      "https://job-boards.greenhouse.io/acme/jobs/12345",
    ],
    [
      "https://apply.careers.microsoft.com/careers?pid=1970393556922922&query=intern&start=0",
      "https://apply.careers.microsoft.com/careers/job/1970393556922922",
    ],
  ])("canonicalizes vendor presentation variants in %s", (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });
});

describe("extractExternalId", () => {
  it("pulls greenhouse numeric ids", () => {
    expect(
      extractExternalId("greenhouse", "https://boards.greenhouse.io/figma/jobs/456"),
    ).toBe("456");
  });
  it("pulls lever/ashby uuids", () => {
    const uuid = "12345678-1234-1234-1234-1234567890ab";
    expect(extractExternalId("lever", `https://jobs.lever.co/x/${uuid}`)).toBe(uuid);
  });
  it("prefers a provided id", () => {
    expect(extractExternalId("greenhouse", "https://x/jobs/1", "explicit")).toBe("explicit");
  });
  it("uses the canonical URL job id for iCIMS instead of an aggregator id", () => {
    expect(
      extractExternalId(
        "icims",
        "https://careers-rivian.icims.com/jobs/32343/software-engineer/job",
        "feed-row-uuid",
      ),
    ).toBe("32343");
  });
});

function job(over: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    title: "Software Engineer",
    company: "Acme",
    location: "Remote",
    applyUrl: "https://boards.greenhouse.io/acme/jobs/1001",
    atsType: "greenhouse",
    externalId: "1001",
    ...over,
  };
}

describe("canonicalize (dedup identity)", () => {
  it("uses atsType:externalId as the dedupe key when available", () => {
    const c = canonicalize(job());
    expect(c.dedupeKey).toBe("greenhouse:1001");
    expect(c.fingerprint).toMatch(/^fp:[0-9a-f]{40}$/);
  });

  it("collapses the same posting seen via different URLs / sources", () => {
    const a = canonicalize(job({ applyUrl: "https://boards.greenhouse.io/acme/jobs/1001?utm=x" }));
    const b = canonicalize(
      job({ applyUrl: "https://job-boards.greenhouse.io/acme/jobs/1001", externalId: null }),
    );
    expect(a.dedupeKey).toBe(b.dedupeKey); // cross-source dedup
  });

  it("collapses iCIMS listings that use different source-local ids", () => {
    const first = canonicalize(
      job({
        applyUrl: "https://careers-rivian.icims.com/jobs/32343/software-engineer/job",
        atsType: "icims",
        externalId: "aggregator-a",
      }),
    );
    const second = canonicalize(
      job({
        applyUrl: "https://careers-rivian.icims.com/jobs/32343/software-engineer/job?mobile=false",
        atsType: "icims",
        externalId: "aggregator-b",
      }),
    );
    expect(first.dedupeKey).toBe("icims:32343");
    expect(second.dedupeKey).toBe(first.dedupeKey);
  });

  it("uses a conservative source identity for an unknown ATS", () => {
    const c = canonicalize(
      job({ applyUrl: "https://careers.acme.com/1", atsType: undefined, externalId: null }),
    );
    expect(c.dedupeKey.startsWith("source:")).toBe(true);
    expect(c.dedupeKey).not.toBe(c.fingerprint);
  });

  it("does not merge unknown-ATS postings from different URLs based on metadata", () => {
    const first = canonicalize(
      job({ applyUrl: "https://careers.acme.com/req/one", atsType: undefined, externalId: null }),
    );
    const second = canonicalize(
      job({ applyUrl: "https://careers.acme.com/req/two", atsType: undefined, externalId: null }),
    );
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.dedupeKey).not.toBe(second.dedupeKey);
  });

  it("gives reposts (new id, same role) the same fingerprint", () => {
    const first = canonicalize(job({ externalId: "1001" }));
    const repost = canonicalize(
      job({ externalId: "2002", applyUrl: "https://boards.greenhouse.io/acme/jobs/2002" }),
    );
    expect(first.fingerprint).toBe(repost.fingerprint);
    expect(first.dedupeKey).not.toBe(repost.dedupeKey);
  });

  it("ignores seniority markers in the fingerprint so 'Senior X' == 'X'", () => {
    const base = canonicalize(job({ title: "Software Engineer" }));
    const senior = canonicalize(job({ title: "Senior Software Engineer" }));
    expect(base.fingerprint).toBe(senior.fingerprint);
  });
});
