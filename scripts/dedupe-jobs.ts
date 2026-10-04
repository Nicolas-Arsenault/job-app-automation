import { dedupeStoredJobsByApplyUrl } from "../lib/job-dedup";

async function main() {
  const result = await dedupeStoredJobsByApplyUrl();
  console.log(
    `Merged ${result.groupsMerged} duplicate URL groups; removed ${result.jobsRemoved} duplicate jobs.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
