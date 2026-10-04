import { prisma } from "../db";

const DISCORD_HOSTS = new Set([
  "discord.com",
  "discordapp.com",
  "canary.discord.com",
  "ptb.discord.com",
]);

export interface DiscordNotificationResult {
  configured: boolean;
  candidates: number;
  sent: number;
  failedBatches: number;
  error?: string;
}

export interface DiscordJob {
  title: string;
  company: string;
  location: string | null;
  applyUrl: string;
  postedAt: Date | null;
  firstSeenAt: Date;
  discoverySystem: string | null;
  fitScore: number | null;
}

export function discordMaximumPostAgeMinutes(
  value: string | number | undefined = process.env.DISCORD_MAX_POST_AGE_MINUTES,
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 24 * 60
    ? Math.round(parsed)
    : 120;
}

export function isDiscordWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      DISCORD_HOSTS.has(url.hostname.toLowerCase()) &&
      /^\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`;
}

function webhookRequestUrl(webhookUrl: string): string {
  const url = new URL(webhookUrl);
  url.searchParams.set("wait", "true");
  return url.toString();
}

async function postDiscord(
  webhookUrl: string,
  body: unknown,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetchImpl(webhookRequestUrl(webhookUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function discordPayload(jobs: DiscordJob[]) {
  return {
    username: "Internship Scout",
    allowed_mentions: { parse: [] as string[] },
    content:
      jobs.length === 1
        ? "New eligible software internship detected"
        : `${jobs.length} new eligible software internships detected`,
    embeds: jobs.slice(0, 10).map((job) => ({
      title: truncate(job.title, 256),
      url: job.applyUrl,
      color: 0x4f46e5,
      description: truncate(
        [
          `**${job.company}**`,
          job.location || "Location not provided",
          job.fitScore == null ? null : `Fit score: ${job.fitScore}`,
        ]
          .filter(Boolean)
          .join(" · "),
        4096,
      ),
      fields: [
        {
          name: "Timing",
          value: job.postedAt
            ? `Posted ${job.postedAt.toISOString()}`
            : `First seen ${job.firstSeenAt.toISOString()}`,
          inline: false,
        },
        {
          name: "Source",
          value: truncate(job.discoverySystem || "unknown", 1024),
          inline: true,
        },
      ],
      footer: { text: "Review the posting before applying. This app never submits automatically." },
    })),
  };
}

export async function sendDiscordTestNotification(
  webhookUrl = process.env.DISCORD_WEBHOOK_URL ?? "",
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const normalized = webhookUrl.trim();
  if (!isDiscordWebhookUrl(normalized)) {
    throw new Error("Set DISCORD_WEBHOOK_URL to a valid Discord webhook URL first");
  }
  const response = await postDiscord(
    normalized,
    {
      username: "Internship Scout",
      allowed_mentions: { parse: [] },
      content: "Internship Scout is connected. New matching internships will appear here.",
    },
    fetchImpl,
  );
  if (!response.ok) throw new Error(`Discord webhook returned HTTP ${response.status}`);
}

export async function notifyDiscordForDiscovery(
  discoveredAfter: Date,
  deps: {
    webhookUrl?: string;
    fetchImpl?: typeof fetch;
    maxPostAgeMinutes?: number;
    now?: Date;
  } = {},
): Promise<DiscordNotificationResult> {
  const webhookUrl = (deps.webhookUrl ?? process.env.DISCORD_WEBHOOK_URL ?? "").trim();
  if (!webhookUrl) return { configured: false, candidates: 0, sent: 0, failedBatches: 0 };
  if (!isDiscordWebhookUrl(webhookUrl)) {
    return {
      configured: true,
      candidates: 0,
      sent: 0,
      failedBatches: 1,
      error: "DISCORD_WEBHOOK_URL is not a valid Discord webhook URL",
    };
  }

  const maxPostAgeMinutes = discordMaximumPostAgeMinutes(deps.maxPostAgeMinutes);
  const now = deps.now ?? new Date();
  const postedAfter = new Date(now.getTime() - maxPostAgeMinutes * 60_000);
  // Permit a small amount of source clock skew, but reject implausible future dates.
  const postedBefore = new Date(now.getTime() + 5 * 60_000);
  const jobs = await prisma.job.findMany({
    where: {
      firstSeenAt: { gte: discoveredAfter },
      isEntryLevel: true,
      employmentType: "intern",
      applicationStatus: {
        notIn: ["applied", "interviewing", "offer", "rejected"],
      },
      availabilityStatus: { not: "closed" },
      postedAt: { gte: postedAfter, lte: postedBefore },
      OR: [
        { country: "CA" },
        { country: "US", sponsorship: "offers" },
        { country: "US", sponsorship: "unknown" },
        { country: "US", sponsorship: null },
      ],
    },
    orderBy: [{ postedAt: "desc" }, { firstSeenAt: "desc" }],
    select: {
      title: true,
      company: true,
      location: true,
      applyUrl: true,
      postedAt: true,
      firstSeenAt: true,
      discoverySystem: true,
      fitBaseScore: true,
    },
  });
  if (!jobs.length) return { configured: true, candidates: 0, sent: 0, failedBatches: 0 };

  const fetchImpl = deps.fetchImpl ?? fetch;
  let sent = 0;
  let failedBatches = 0;
  let firstError: string | undefined;
  for (let index = 0; index < jobs.length; index += 10) {
    const batch = jobs.slice(index, index + 10);
    try {
      const response = await postDiscord(
        webhookUrl,
        discordPayload(
          batch.map(({ fitBaseScore, ...job }) => ({
            ...job,
            fitScore: fitBaseScore,
          })),
        ),
        fetchImpl,
      );
      if (!response.ok) throw new Error(`Discord webhook returned HTTP ${response.status}`);
      sent += batch.length;
    } catch (error) {
      failedBatches++;
      firstError ??= error instanceof Error ? error.message : String(error);
    }
  }
  return {
    configured: true,
    candidates: jobs.length,
    sent,
    failedBatches,
    ...(firstError ? { error: firstError } : {}),
  };
}
