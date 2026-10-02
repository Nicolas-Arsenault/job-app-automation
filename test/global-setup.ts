import { execSync } from "node:child_process";
import { closeSync, existsSync, openSync, rmSync } from "node:fs";
import path from "node:path";

// Create a fresh test database with the current schema before the suite runs.
export default function setup() {
  const dir = path.join(process.cwd(), "prisma");
  for (const f of ["test.db", "test.db-journal"]) {
    const p = path.join(dir, f);
    if (existsSync(p)) rmSync(p);
  }
  // Prisma's SQLite schema engine does not reliably create the empty database
  // file itself on every local filesystem. Pre-create it after cleanup so a
  // fresh test run is deterministic.
  closeSync(openSync(path.join(dir, "test.db"), "w"));
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
  });
}
