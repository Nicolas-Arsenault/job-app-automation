import { loadEnvConfig } from "@next/env";
import cron from "node-cron";
import { runDiscoveryRefresh } from "../lib/discovery/refresh";

loadEnvConfig(process.cwd());

// Scheduled scanner. Runs the same discovery pipeline as the dashboard once
// per hour by default, offset from the top of the hour to avoid synchronized
// crawler traffic. It bypasses only the manual-button cooldown.
// Never submits anything — discovery + scoring only. Submission stays behind
// the human approval gate in the dashboard.
const schedule = process.env.SCAN_CRON || "17 * * * *";
let scanRunning = false;

if (!cron.validate(schedule)) {
  console.error(`Invalid SCAN_CRON expression: "${schedule}"`);
  process.exit(1);
}

async function scanOnce(reason: string) {
  if (scanRunning) {
    console.log(`[${new Date().toISOString()}] scan skipped (${reason}): previous cycle is still running`);
    return;
  }
  scanRunning = true;
  const started = new Date().toISOString();
  console.log(`[${started}] scan start (${reason})`);
  try {
    const summary = await runDiscoveryRefresh({ bypassManualCooldown: true });
    console.log(
      `[${new Date().toISOString()}] scan done: +${summary.totals.created} new, ` +
        `${summary.totals.updated} refreshed, ${summary.judge.scored} fit-scored, ` +
        `${summary.discord.sent} Discord alerts (${summary.durationMs}ms)`,
    );
    if (summary.discord.error) {
      console.error(
        `[${new Date().toISOString()}] Discord alert delivery failed for ` +
          `${summary.discord.failedBatches} batch(es): ${summary.discord.error}`,
      );
    }
  } catch (e) {
    console.error("scan failed:", e);
  } finally {
    scanRunning = false;
  }
}

console.log(`Cron scanner armed: "${schedule}". Press Ctrl+C to stop.`);
cron.schedule(schedule, () => void scanOnce("cron"));

// Startup scans are opt-in: frequent process restarts must not create request
// bursts between scheduled cycles.
if (process.env.SCAN_ON_START === "1") {
  void scanOnce("startup");
}
