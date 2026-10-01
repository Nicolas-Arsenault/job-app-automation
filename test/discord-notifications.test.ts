import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../lib/db";
import {
  discordMaximumPostAgeMinutes,
  discordMinimumFitScore,
  discordPayload,
  isDiscordWebhookUrl,
  notifyDiscordForDiscovery,
} from "../lib/notifications/discord";

beforeEach(async () => {
  await prisma.job.deleteMany();
});

describe("Discord internship notifications", () => {
  it("uses the dashboard's Strong fit threshold by default", () => {
    expect(discordMinimumFitScore(undefined)).toBe(70);
    expect(discordMinimumFitScore("80")).toBe(80);
    expect(discordMinimumFitScore("invalid")).toBe(70);
    expect(discordMaximumPostAgeMinutes(undefined)).toBe(60);
    expect(discordMaximumPostAgeMinutes("30")).toBe(30);
    expect(discordMaximumPostAgeMinutes("0")).toBe(60);
  });

  it("accepts only actual Discord webhook URLs", () => {
    expect(isDiscordWebhookUrl("https://discord.com/api/webhooks/123/token_abc")).toBe(true);
    expect(isDiscordWebhookUrl("https://example.com/api/webhooks/123/token_abc")).toBe(false);
    expect(isDiscordWebhookUrl("not a URL")).toBe(false);
  });

  it("formats apply links without permitting mentions", () => {
    const payload = discordPayload([
      {
        title: "Software Engineer Intern",
        company: "Acme",
        location: "Toronto, Canada",
        applyUrl: "https://example.test/jobs/1",
        postedAt: null,
        firstSeenAt: new Date("2026-10-01T12:00:00Z"),
        discoverySystem: "greenhouse",
        fitScore: 90,
      },
    ]);
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect(payload.embeds[0]).toMatchObject({
      title: "Software Engineer Intern",
      url: "https://example.test/jobs/1",
    });
  });

  it("sends only internships first seen during the run", async () => {
    const started = new Date("2026-10-01T12:00:00Z");
    await prisma.job.createMany({
      data: [
        {
          dedupeKey: "new-intern",
          title: "Software Engineer Intern",
          company: "Acme",
          applyUrl: "https://example.test/jobs/intern",
          country: "CA",
          isEntryLevel: true,
          employmentType: "intern",
          fitScore: 90,
          postedAt: new Date("2026-10-01T12:15:00Z"),
          firstSeenAt: new Date("2026-10-01T12:01:00Z"),
        },
        {
          dedupeKey: "new-fulltime",
          title: "Software Engineer",
          company: "Acme",
          applyUrl: "https://example.test/jobs/fulltime",
          country: "CA",
          isEntryLevel: true,
          employmentType: "fulltime",
          firstSeenAt: new Date("2026-10-01T12:01:00Z"),
        },
        {
          dedupeKey: "old-intern",
          title: "Backend Intern",
          company: "Old Co",
          applyUrl: "https://example.test/jobs/old",
          country: "US",
          isEntryLevel: true,
          employmentType: "intern",
          firstSeenAt: new Date("2026-10-01T11:59:00Z"),
        },
        {
          dedupeKey: "new-us-unknown",
          title: "Platform Engineering Intern",
          company: "Unknown Visa Co",
          applyUrl: "https://example.test/jobs/us-unknown",
          country: "US",
          isEntryLevel: true,
          employmentType: "intern",
          fitScore: 88,
          postedAt: new Date("2026-10-01T12:20:00Z"),
          firstSeenAt: new Date("2026-10-01T12:02:00Z"),
        },
        {
          dedupeKey: "new-us-none",
          title: "Backend Intern",
          company: "No Sponsor Co",
          applyUrl: "https://example.test/jobs/us-none",
          country: "US",
          isEntryLevel: true,
          employmentType: "intern",
          sponsorship: "none",
          fitScore: 92,
          postedAt: new Date("2026-10-01T12:20:00Z"),
          firstSeenAt: new Date("2026-10-01T12:02:00Z"),
        },
        {
          dedupeKey: "new-us-citizenship",
          title: "Security Software Intern",
          company: "Citizens Only Co",
          applyUrl: "https://example.test/jobs/us-citizenship",
          country: "US",
          isEntryLevel: true,
          employmentType: "intern",
          sponsorship: "citizenship",
          fitScore: 95,
          postedAt: new Date("2026-10-01T12:25:00Z"),
          firstSeenAt: new Date("2026-10-01T12:03:00Z"),
        },
        {
          dedupeKey: "new-us-stale",
          title: "Software Intern",
          company: "Stale Sponsor Co",
          applyUrl: "https://example.test/jobs/us-stale",
          country: "US",
          isEntryLevel: true,
          employmentType: "intern",
          sponsorship: "offers",
          fitScore: 94,
          postedAt: new Date("2026-10-01T10:00:00Z"),
          firstSeenAt: new Date("2026-10-01T12:04:00Z"),
        },
        {
          dedupeKey: "new-low-fit-intern",
          title: "Frontend Intern",
          company: "Lower Fit Co",
          applyUrl: "https://example.test/jobs/lower-fit",
          country: "US",
          isEntryLevel: true,
          employmentType: "intern",
          fitScore: 69,
          firstSeenAt: new Date("2026-10-01T12:02:00Z"),
        },
      ],
    });
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input;
      void init;
      return new Response("{}", { status: 200 });
    });
    const result = await notifyDiscordForDiscovery(started, {
      webhookUrl: "https://discord.com/api/webhooks/123/token_abc",
      fetchImpl,
      now: new Date("2026-10-01T12:30:00Z"),
    });

    expect(result).toMatchObject({ configured: true, candidates: 2, sent: 2, failedBatches: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(String(init.body)).toContain("Software Engineer Intern");
    expect(String(init.body)).not.toContain("Software Engineer\"");
    expect(String(init.body)).not.toContain("Lower Fit Co");
    expect(String(init.body)).toContain("Unknown Visa Co");
    expect(String(init.body)).not.toContain("No Sponsor Co");
    expect(String(init.body)).not.toContain("Citizens Only Co");
    expect(String(init.body)).not.toContain("Stale Sponsor Co");
  });
});
