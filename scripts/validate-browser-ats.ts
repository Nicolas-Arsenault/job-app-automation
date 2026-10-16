import { prisma } from "../lib/db";
import {
  browserBacklogTargets,
  scrapeBrowserBacklogCompanies,
} from "../lib/discovery/browser-backlog";

async function main() {
  const targets = await browserBacklogTargets(["needs_adapter"]);
  console.log(`Validating ${targets.length} rendered ATS boards sequentially.`);
  const results = await scrapeBrowserBacklogCompanies(
    targets,
    (result) => {
      console.log(
        `${result.error ? "✗" : "✓"} ${result.company}: ` +
          `${result.postings.length} internship candidate(s)` +
          `${result.error ? ` · ${result.error}` : ""}`,
      );
    },
    // Queue admission deliberately stays sequential even though normal refreshes
    // use the bounded parallel pool.
    { concurrency: 1, detailConcurrency: 1, validationMode: true },
  );
  const failed = results.filter((result) => result.error).length;
  console.log(`Browser validation complete: ${results.length - failed} ready, ${failed} failed.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
