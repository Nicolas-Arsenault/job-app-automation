import { prisma } from "../lib/db";
import {
  greenhouseBoardFromNetworkUrls,
  resolveBrandedGreenhouseBacklog,
} from "../lib/discovery/ats-expansion";
import { chromium, type Browser } from "playwright";

const limitValue = Number(process.env.BRANDED_GREENHOUSE_LIMIT);
const limit = Number.isFinite(limitValue) && limitValue > 0 ? limitValue : null;
const pauseMs = Math.max(
  750,
  Number(process.env.BRANDED_GREENHOUSE_PAUSE_MS) || 1_500,
);

async function main() {
  const useBrowser = process.env.BRANDED_GREENHOUSE_PLAYWRIGHT === "1";
  let browser: Browser | undefined;
  try {
    browser = useBrowser ? await chromium.launch({ headless: true }) : undefined;
    const result = await resolveBrandedGreenhouseBacklog({
      limit,
      pauseMs,
      unresolvedNote: useBrowser
        ? "Branded Greenhouse token was not exposed after rendered-page validation"
        : "Branded Greenhouse token was not exposed by the public page HTML",
      retryAttempted: useBrowser,
      ...(browser
        ? {
            discoverBoard: async (url: string) => {
              const context = await browser!.newContext({
                userAgent:
                  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
                locale: "en-US",
              });
              await context.route("**/*", (route) =>
                ["image", "media", "font"].includes(route.request().resourceType())
                  ? route.abort()
                  : route.continue(),
              );
              try {
                const page = await context.newPage();
                const networkUrls = new Set<string>();
                page.on("request", (request) => networkUrls.add(request.url()));
                page.on("response", (response) => networkUrls.add(response.url()));
                const response = await page.goto(url, {
                  waitUntil: "domcontentloaded",
                  timeout: 20_000,
                });
                if (!response || response.status() >= 400) return null;
                await page.waitForTimeout(1_200);
                const html = await page.content();
                return greenhouseBoardFromNetworkUrls([
                  ...networkUrls,
                  html,
                ]);
              } catch {
                return null;
              } finally {
                await context.close();
              }
            },
          }
        : {}),
    });
    console.log(
      `Branded Greenhouse ${useBrowser ? "Playwright " : ""}resolution complete: ` +
        `${result.resolved}/${result.attempted} boards resolved.`,
    );
  } finally {
    await browser?.close();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
