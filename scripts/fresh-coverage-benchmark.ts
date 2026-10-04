import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getDiscoveryConfig } from "../lib/discovery/config";
import { prisma } from "../lib/db";

const execFileAsync = promisify(execFile);

async function main() {
  const root = process.cwd();
  const temporary = await mkdtemp(path.join(os.tmpdir(), "auto-apply-fresh-benchmark-"));
  const databasePath = path.join(temporary, "benchmark.db");
  const configPath = path.join(temporary, "config.json");
  const keepDatabase = process.argv.includes("--keep-db");
  const config = await getDiscoveryConfig();
  await writeFile(configPath, JSON.stringify(config));
  // Prisma's SQLite schema engine does not consistently create a missing file
  // on macOS temporary volumes. Pre-create it, as the test harness does.
  await writeFile(databasePath, "");
  await prisma.$disconnect();

  const env = {
    ...process.env,
    DATABASE_URL: `file:${databasePath}`,
    FRESH_BENCHMARK_CONFIG: configPath,
    FRESH_BENCHMARK_OUTPUT: path.join(root, ".discovery"),
    // A benchmark must never send notifications or apply to jobs.
    APPLY_MODE: "dry_run",
    DISCORD_WEBHOOK_URL: "",
  };
  try {
    console.log(`Using isolated database: ${databasePath}`);
    await execFileAsync("npx", ["prisma", "migrate", "deploy"], {
      cwd: root,
      env,
      maxBuffer: 10 * 1024 * 1024,
    });
    const child = await import("node:child_process").then(({ spawn }) =>
      spawn("npx", ["tsx", "scripts/fresh-coverage-worker.ts"], {
        cwd: root,
        env,
        stdio: "inherit",
      }),
    );
    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? 1));
    });
    if (exitCode !== 0) throw new Error(`Benchmark worker exited with ${exitCode}`);
  } finally {
    if (keepDatabase) console.log(`Kept benchmark database at ${databasePath}`);
    else await rm(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
