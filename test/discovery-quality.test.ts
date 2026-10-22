import { describe, expect, it } from "vitest";
import { evaluateSourceQuality } from "../lib/discovery/quality";

function row(index: number, overrides: Partial<{
  title: string;
  location: string;
  externalId: string;
  postedAt: Date | null;
}> = {}) {
  return {
    title: `Software Intern ${index}`,
    location: "Toronto, Canada",
    externalId: String(index),
    postedAt: new Date("2026-10-16T12:00:00Z"),
    ...overrides,
  };
}

describe("source semantic quality", () => {
  it("records the requested row, identity, location, and date rates", () => {
    const snapshot = evaluateSourceQuality({
      rows: [
        row(1),
        row(2, { externalId: "1", location: "", postedAt: null }),
        row(3, { location: "", postedAt: null }),
        row(4, { location: "", postedAt: null }),
      ],
      rawRows: 5,
      validRows: 4,
    }, 4);

    expect(snapshot.metrics).toMatchObject({
      validRowPercent: 0.8,
      uniqueIdRatio: 0.75,
      missingLocationRate: 0.75,
      missingDateRate: 0.75,
    });
    expect(snapshot.warnings.join(" ")).toContain("valid-row rate 80%");
    expect(snapshot.warnings.join(" ")).toContain("unique-ID ratio 75%");
    expect(snapshot.warnings.join(" ")).toContain("missing locations 75%");
  });

  it("flags browser zero regressions and implausible count growth independently", () => {
    expect(evaluateSourceQuality({ rows: [], browser: true }, 12).warnings)
      .toContain("zero-result browser regression (previously 12)");

    const rows = Array.from({ length: 30 }, (_, index) => row(index));
    expect(evaluateSourceQuality({ rows }, 10).warnings)
      .toContain("unexpected result increase (10 to 30)");
  });
});
