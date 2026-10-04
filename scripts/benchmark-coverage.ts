import { getDiscoveryBenchmark } from "../lib/discovery/benchmark";

async function main() {
  const report = await getDiscoveryBenchmark();
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
