import { vi } from "vitest";

// Point every test at an isolated SQLite database and safe defaults.
// Runs in each worker before test modules (and lib/db) are imported.
process.env.DATABASE_URL = "file:./test.db";
process.env.APPLY_MODE = process.env.APPLY_MODE ?? "dry_run";
delete process.env.OPENAI_API_KEY; // force the deterministic resume fallback
delete process.env.COPILOT_JUDGE_CONNECTED;
delete process.env.DISCORD_WEBHOOK_URL;
delete process.env.DISCORD_MIN_FIT_SCORE;
delete process.env.DISCORD_MAX_POST_AGE_MINUTES;

vi.mock("server-only", () => ({}));
