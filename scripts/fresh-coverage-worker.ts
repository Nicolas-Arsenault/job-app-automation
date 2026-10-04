import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/db";
import {
  BOARD_SOURCES,
  BROWSER_COMPANIES,
  DISCOVERY_SOURCES,
  SCRAPABLE_BROWSER_SYSTEMS,
} from "../lib/discovery/companies";
import {
  saveDiscoveryConfig,
  toEntryLevelOptions,
  type DiscoveryConfigData,
} from "../lib/discovery/config";
import { runDiscovery, ingestSourcePostings } from "../lib/discovery/run";
import { scrapeBrowserCompanies } from "../lib/discovery/browser";
import {
  describeApiSource,
  describeBrowserSource,
  recordDiscoverySourceFailure,
} from "../lib/discovery/lifecycle";
import { validatePendingAtsBoards } from "../lib/discovery/ats-expansion";
import { getFreshCoverageReport } from "../lib/discovery/fresh-coverage";

function line(report: Awaited<ReturnType<typeof getFreshCoverageReport>>) {
  return (
    `union ${report.union}, direct ${report.directFresh} (${report.directCoveragePercent}%), ` +
    `GitHub ${report.githubFresh} (${report.githubCoveragePercent}%), ` +
    `GitHub-only ${report.githubOnly} (${report.githubIncrementalPercent}%)`
  );
}

function markdown(report: {
  startedAt: string;
  finishedAt: string;
  cutoff: string;
  phases: Record<string, unknown>;
  beforeExpansion: Awaited<ReturnType<typeof getFreshCoverageReport>>;
  afterExpansion: Awaited<ReturnType<typeof getFreshCoverageReport>>;
  atsExpansion: Record<string, unknown>;
  sourceHealth: Record<string, number>;
}) {
  const countryRows = Object.entries(report.afterExpansion.byCountry)
    .map(([country, row]) =>
      `| ${country} | ${row.union} | ${row.directFresh} | ${row.githubFresh} | ${row.githubOnly} | ${row.directCoveragePercent}% |`,
    )
    .join("\n");
  return `# Fresh discovery coverage benchmark

- Started: ${report.startedAt}
- Finished: ${report.finishedAt}
- Freshness cutoff: ${report.cutoff}
- Cohort rule: source-reported posting date is within the previous 24 hours

## Before automatic ATS expansion

${line(report.beforeExpansion)}

## After automatic ATS expansion

${line(report.afterExpansion)}

| Country | Fresh union | Direct | GitHub | GitHub only | Direct coverage |
| --- | ---: | ---: | ---: | ---: | ---: |
${countryRows || "| — | 0 | 0 | 0 | 0 | 0% |"}

## ATS expansion

\`\`\`json
${JSON.stringify(report.atsExpansion, null, 2)}
\`\`\`

Unknown source dates are excluded from the 24-hour numerator and denominator. Full job-level attribution and source health are in the JSON report.
`;
}

async function main() {
  const configPath = process.env.FRESH_BENCHMARK_CONFIG;
  const outputDir = process.env.FRESH_BENCHMARK_OUTPUT;
  if (!configPath || !outputDir) throw new Error("Missing benchmark paths");
  const startedAt = new Date();
  const cutoff = new Date(startedAt.getTime() - 24 * 60 * 60 * 1_000);
  const config = JSON.parse(await readFile(configPath, "utf8")) as DiscoveryConfigData;
  await saveDiscoveryConfig(config);
  const disabled = new Set(config.disabledSources.map((value) => value.toLowerCase()));

  console.log("\n[1/5] Existing direct/API discovery");
  const directNames = DISCOVERY_SOURCES.filter(
    (source) => source.system !== "githubboard",
  ).map((source) => source.name);
  const direct = await runDiscovery({
    companies: directNames,
    config,
    reconcile: false,
    validatePendingAts: false,
    onProgress: (result) =>
      console.log(`  ${result.outcome.padEnd(8)} ${result.company}`),
  });

  console.log("\n[2/5] Existing direct/browser discovery");
  const browserCompanies = BROWSER_COMPANIES.filter(
    (company) =>
      SCRAPABLE_BROWSER_SYSTEMS.includes(company.system) &&
      !disabled.has(company.name.toLowerCase()),
  );
  const browserResults = await scrapeBrowserCompanies({
    companies: browserCompanies.map((company) => company.name),
    onResult: (result) => console.log(`  ${result.error ? "failed  " : "complete"} ${result.company}`),
  });
  for (const result of browserResults) {
    const company = browserCompanies.find((candidate) => candidate.name === result.company);
    if (!company) continue;
    const descriptor = describeBrowserSource(company);
    if (result.error) {
      await recordDiscoverySourceFailure(descriptor, result.error);
      continue;
    }
    await ingestSourcePostings(descriptor, result.postings, true, undefined, {
      countries: config.countries,
      entryOptions: toEntryLevelOptions(config),
      sourceWarning: result.warning,
    });
  }

  console.log("\n[3/5] GitHub internship boards (forced last)");
  const github = await runDiscovery({
    companies: BOARD_SOURCES.map((source) => source.name),
    config,
    reconcile: false,
    validatePendingAts: false,
    onProgress: (result) =>
      console.log(`  ${result.outcome.padEnd(8)} ${result.company}`),
  });
  const beforeExpansion = await getFreshCoverageReport(cutoff);
  console.log(`  24-hour comparison: ${line(beforeExpansion)}`);

  const beforeBoards = await prisma.discoveredAtsBoard.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  console.log("\n[4/5] Validate every newly learned ATS board (concurrency 2)");
  const validation = await validatePendingAtsBoards(
    {
      yc: config.yc,
      countries: config.countries,
      internshipsOnly: config.internshipsOnly,
      watchedCompanies: config.watchedCompanies,
    },
    {
      limit: null,
      concurrency: 2,
      onVerified: async (company, postings) => {
        await ingestSourcePostings(describeApiSource(company), postings, true, undefined, {
          countries: config.countries,
          entryOptions: toEntryLevelOptions(config),
        });
      },
    },
  );

  console.log("\n[5/5] Calculate final source-specific 24-hour coverage");
  const afterExpansion = await getFreshCoverageReport(cutoff);
  console.log(`  ${line(afterExpansion)}`);
  const [afterBoards, backlog, sourceHealth] = await Promise.all([
    prisma.discoveredAtsBoard.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.communityEmployerCandidate.groupBy({
      by: ["detectedPlatform"],
      where: { status: "needs_adapter" },
      _count: { _all: true },
    }),
    prisma.discoverySource.groupBy({ by: ["lastStatus"], _count: { _all: true } }),
  ]);
  const finishedAt = new Date();
  const report = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    cutoff: cutoff.toISOString(),
    database: "isolated temporary SQLite database",
    phases: {
      directApi: direct,
      directBrowser: browserResults.map(({ company, system, usFound, caFound, error, warning }) => ({
        company,
        system,
        usFound,
        caFound,
        error,
        warning,
      })),
      github,
    },
    beforeExpansion,
    afterExpansion,
    atsExpansion: {
      candidatesBeforeValidation: Object.fromEntries(
        beforeBoards.map((row) => [row.status, row._count._all]),
      ),
      validation,
      candidatesAfterValidation: Object.fromEntries(
        afterBoards.map((row) => [row.status, row._count._all]),
      ),
      customAdapterBacklog: Object.fromEntries(
        backlog.map((row) => [row.detectedPlatform, row._count._all]),
      ),
    },
    sourceHealth: Object.fromEntries(
      sourceHealth.map((row) => [row.lastStatus ?? "never", row._count._all]),
    ),
  };
  await mkdir(outputDir, { recursive: true });
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(outputDir, `fresh-coverage-${stamp}.json`);
  const markdownPath = path.join(outputDir, `fresh-coverage-${stamp}.md`);
  await writeFile(jsonPath, JSON.stringify(report, null, 2));
  await writeFile(markdownPath, markdown(report));
  console.log(`\nJSON report: ${jsonPath}`);
  console.log(`Markdown report: ${markdownPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
