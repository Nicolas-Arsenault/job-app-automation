const SEASONS = ["winter", "spring", "summer", "fall"] as const;

type RecruitingSeason = (typeof SEASONS)[number];

const SEASON_ORDER = new Map(
  SEASONS.map((season, index) => [season, index]),
);

function normalizeSeason(value: string): RecruitingSeason {
  return value.toLowerCase() === "autumn"
    ? "fall"
    : (value.toLowerCase() as RecruitingSeason);
}

function normalizeYear(value: string): number {
  const year = Number(value);
  return value.length === 2 ? 2000 + year : year;
}

function termValue(season: string, year: string): string | null {
  const normalizedYear = normalizeYear(year);
  if (normalizedYear < 2020 || normalizedYear > 2049) return null;
  return `${normalizeSeason(season)}-${normalizedYear}`;
}

/**
 * Finds explicit terms such as "Summer 2027", "Fall '27", and
 * "Summer/Fall 2027" in the supplied text.
 */
export function extractRecruitingTerms(...values: Array<string | null | undefined>): string[] {
  const text = values.filter(Boolean).join(" \n ");
  const found = new Set<string>();
  const season = "(winter|spring|summer|fall|autumn)";
  const year = "(?:['’]?(20\\d{2}|\\d{2}))";

  const compoundPattern = new RegExp(
    `\\b${season}\\s*(?:[/&]|\\band\\b)\\s*${season}\\s+(?:terms?\\s+)?${year}\\b`,
    "gi",
  );
  for (const match of text.matchAll(compoundPattern)) {
    const first = termValue(match[1], match[3]);
    const second = termValue(match[2], match[3]);
    if (first) found.add(first);
    if (second) found.add(second);
  }

  const forwardPattern = new RegExp(
    `\\b${season}(?:\\s+(?:terms?|semesters?))?\\s*[-–—,]?\\s*${year}\\b`,
    "gi",
  );
  for (const match of text.matchAll(forwardPattern)) {
    const value = termValue(match[1], match[2]);
    if (value) found.add(value);
  }

  const reversePattern = new RegExp(
    `\\b${year}\\s*[-–—,]?\\s*${season}\\b`,
    "gi",
  );
  for (const match of text.matchAll(reversePattern)) {
    const value = termValue(match[2], match[1]);
    if (value) found.add(value);
  }

  return [...found].sort(compareRecruitingTerms);
}

export function extractJobRecruitingTerms(job: {
  title: string;
  description?: string | null;
  sourceNames?: string[];
}): string[] {
  // A posting title is the strongest signal. Do not mix in graduation dates
  // from the description or a broader board when the title already names one.
  const titleTerms = extractRecruitingTerms(job.title);
  if (titleTerms.length > 0) return titleTerms;

  // Curated seasonal boards apply their named term to otherwise generic rows.
  const sourceTerms = extractRecruitingTerms(...(job.sourceNames ?? []));
  if (sourceTerms.length > 0) return sourceTerms;

  // Descriptions are intentionally conservative: eligibility sentences often
  // contain a graduation season that is not the job's recruiting term.
  const relevantSegments = (job.description ?? "")
    .split(/[\n.!?;]+/)
    .filter(
      (segment) =>
        /\b(?:internship|co-?op|placement|recruiting term|semester|start(?:ing|s| date)?)\b/i.test(
          segment,
        ) &&
        !/\b(?:graduat(?:e|es|ing|ion)|degree|enrolled|school year)\b/i.test(
          segment,
        ),
    );
  return extractRecruitingTerms(...relevantSegments);
}

export function compareRecruitingTerms(a: string, b: string): number {
  if (a === "unknown") return b === "unknown" ? 0 : 1;
  if (b === "unknown") return -1;
  const [aSeason, aYearText] = a.split("-");
  const [bSeason, bYearText] = b.split("-");
  const yearDifference = Number(aYearText) - Number(bYearText);
  if (yearDifference !== 0) return yearDifference;
  return (
    (SEASON_ORDER.get(aSeason as RecruitingSeason) ?? 99) -
    (SEASON_ORDER.get(bSeason as RecruitingSeason) ?? 99)
  );
}

export function formatRecruitingTerm(value: string): string {
  if (value === "unknown") return "Unknown";
  const [season, year] = value.split("-");
  if (!season || !year) return value;
  return `${season[0].toUpperCase()}${season.slice(1)} ${year}`;
}
