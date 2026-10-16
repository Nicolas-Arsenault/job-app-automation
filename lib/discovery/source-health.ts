export interface SourceHealthRecord {
  key: string;
  name: string;
  company: string | null;
  system: string;
  authoritative: boolean;
  expectedComplete: boolean;
  lastStatus: string | null;
  lastMessage: string | null;
  lastQualityMetrics: string | null;
  lastQualityWarnings: string | null;
  lastRunAt: Date | null;
  lastCompleteRunAt: Date | null;
  lastObservedCount: number | null;
}

const ATTENTION = new Set(["error", "degraded"]);
const COVERING = new Set(["success", "limited"]);
const ALTERNATE_RUN_TOLERANCE_MS = 10 * 60_000;

function identity(source: SourceHealthRecord): string {
  return `${(source.company ?? source.name).trim().toLowerCase()}|${source.system}`;
}

function severity(source: SourceHealthRecord): number {
  return source.lastStatus === "error" ? 2 : 1;
}

export function parsedQualityWarnings(source: SourceHealthRecord): string[] {
  if (!source.lastQualityWarnings) return [];
  try {
    const parsed = JSON.parse(source.lastQualityWarnings) as unknown;
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [source.lastQualityWarnings];
  }
}

/**
 * Report employer coverage problems, not every historical board URL. When one
 * board URL fails but a sibling URL for the same employer/system returned rows
 * in the same cycle, coverage is intact and the stale duplicate is suppressed.
 */
export function sourceHealthIssues(
  sources: SourceHealthRecord[],
): SourceHealthRecord[] {
  const healthyAlternates = new Map<string, SourceHealthRecord[]>();
  for (const source of sources) {
    if (
      source.lastStatus &&
      COVERING.has(source.lastStatus) &&
      (source.lastObservedCount ?? 0) > 0
    ) {
      const key = identity(source);
      healthyAlternates.set(key, [...(healthyAlternates.get(key) ?? []), source]);
    }
  }

  const uncovered = sources.filter((source) => {
    if (parsedQualityWarnings(source).length > 0) return true;
    if (!source.lastStatus || !ATTENTION.has(source.lastStatus)) return false;
    if (!source.company || !source.lastRunAt) return true;
    return !(healthyAlternates.get(identity(source)) ?? []).some(
      (alternate) =>
        alternate.key !== source.key &&
        alternate.lastRunAt != null &&
        alternate.lastRunAt.getTime() >=
          source.lastRunAt!.getTime() - ALTERNATE_RUN_TOLERANCE_MS,
    );
  });

  const byEmployer = new Map<string, SourceHealthRecord>();
  for (const source of uncovered) {
    const key = (source.company ?? source.name).trim().toLowerCase();
    const current = byEmployer.get(key);
    if (
      !current ||
      severity(source) > severity(current) ||
      (severity(source) === severity(current) &&
        (source.lastRunAt?.getTime() ?? 0) > (current.lastRunAt?.getTime() ?? 0))
    ) {
      byEmployer.set(key, source);
    }
  }

  return [...byEmployer.values()].sort(
    (a, b) => (b.lastRunAt?.getTime() ?? 0) - (a.lastRunAt?.getTime() ?? 0),
  );
}
