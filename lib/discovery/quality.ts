export interface SourceQualityRow {
  title: string;
  location: string;
  externalId: string;
  postedAt: Date | null;
}

export interface SourceQualityInput {
  rows: SourceQualityRow[];
  rawRows?: number;
  validRows?: number;
  browser?: boolean;
  externalWarnings?: string[];
}

export interface SourceQualityMetrics {
  rawRows: number;
  validRows: number;
  validRowPercent: number;
  uniqueIdentifiers: number;
  uniqueIdRatio: number;
  missingLocations: number;
  missingLocationRate: number;
  missingDates: number;
  missingDateRate: number;
  noisyTitles: number;
  repeatedCards: number;
  observedCount: number;
  previousObservedCount: number | null;
}

export interface SourceQualitySnapshot {
  metrics: SourceQualityMetrics;
  warnings: string[];
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : 0;
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function noisyTitle(title: string): boolean {
  const value = title.replace(/\s+/g, " ").trim();
  return (
    value.length > 120 ||
    /(?:apply now|view job|learn more).*(?:apply now|view job|learn more)/i.test(value) ||
    /(?:privacy policy|cookie preferences|sign in|job alert)/i.test(value)
  );
}

/** Semantic source checks are advisory. They are persisted and surfaced, but
 * never turn usable rows into a failed run or closure evidence. */
export function evaluateSourceQuality(
  input: SourceQualityInput,
  previousObservedCount: number | null,
): SourceQualitySnapshot {
  const observedCount = input.rows.length;
  const rawRows = Math.max(observedCount, input.rawRows ?? observedCount);
  const validRows = Math.min(rawRows, Math.max(0, input.validRows ?? observedCount));
  const identifiers = input.rows
    .map((row) => normalized(row.externalId))
    .filter(Boolean);
  const uniqueIdentifiers = new Set(identifiers).size;
  const missingLocations = input.rows.filter((row) => !row.location.trim()).length;
  const missingDates = input.rows.filter((row) => row.postedAt == null).length;
  const noisyTitles = input.rows.filter((row) => noisyTitle(row.title)).length;
  const signatures = input.rows.map((row) =>
    `${normalized(row.title)}|${normalized(row.location)}`,
  );
  const repeatedCards = signatures.length - new Set(signatures).size;
  const metrics: SourceQualityMetrics = {
    rawRows,
    validRows,
    validRowPercent: ratio(validRows, rawRows),
    uniqueIdentifiers,
    uniqueIdRatio: ratio(uniqueIdentifiers, observedCount),
    missingLocations,
    missingLocationRate: ratio(missingLocations, observedCount),
    missingDates,
    missingDateRate: ratio(missingDates, observedCount),
    noisyTitles,
    repeatedCards,
    observedCount,
    previousObservedCount,
  };

  const warnings: string[] = [...new Set(input.externalWarnings ?? [])];
  if (rawRows >= 4 && metrics.validRowPercent < 0.98) {
    warnings.push(
      `valid-row rate ${Math.round(metrics.validRowPercent * 100)}% (${validRows}/${rawRows})`,
    );
  }
  if (observedCount >= 4 && metrics.uniqueIdRatio < 0.98) {
    warnings.push(
      `unique-ID ratio ${Math.round(metrics.uniqueIdRatio * 100)}% (${uniqueIdentifiers}/${observedCount})`,
    );
  }
  if (observedCount >= 4 && metrics.missingLocationRate > 0.5) {
    warnings.push(
      `missing locations ${Math.round(metrics.missingLocationRate * 100)}% (${missingLocations}/${observedCount})`,
    );
  }
  if (observedCount >= 4 && metrics.missingDateRate > 0.75) {
    warnings.push(
      `missing posting dates ${Math.round(metrics.missingDateRate * 100)}% (${missingDates}/${observedCount})`,
    );
  }
  if (noisyTitles > 0) {
    warnings.push(`${noisyTitles} likely concatenated/noisy title${noisyTitles === 1 ? "" : "s"}`);
  }
  if (observedCount >= 8 && repeatedCards / observedCount > 0.25) {
    warnings.push(`${repeatedCards} repeated title/location cards`);
  }
  if (
    previousObservedCount != null &&
    previousObservedCount >= 4 &&
    observedCount - previousObservedCount >= 20 &&
    observedCount >= previousObservedCount * 3
  ) {
    warnings.push(
      `unexpected result increase (${previousObservedCount} to ${observedCount})`,
    );
  }
  if (input.browser && previousObservedCount != null && previousObservedCount > 0 && observedCount === 0) {
    warnings.push(`zero-result browser regression (previously ${previousObservedCount})`);
  }
  return { metrics, warnings };
}
