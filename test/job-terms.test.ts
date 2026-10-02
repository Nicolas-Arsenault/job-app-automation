import { describe, expect, it } from "vitest";
import {
  compareRecruitingTerms,
  extractJobRecruitingTerms,
  extractRecruitingTerms,
  formatRecruitingTerm,
} from "../lib/jobs/term";

describe("recruiting term extraction", () => {
  it.each([
    ["Software Development Internship (Summer 2027)", ["summer-2027"]],
    ["Fall '27 Software Engineering Co-op", ["fall-2027"]],
    ["Autumn 2027 placement", ["fall-2027"]],
    ["2027 Winter internship", ["winter-2027"]],
  ])("normalizes %s", (title, expected) => {
    expect(extractRecruitingTerms(title)).toEqual(expected);
  });

  it("extracts both seasons from a compound recruiting term", () => {
    expect(extractRecruitingTerms("Summer/Fall 2027 internships")).toEqual([
      "summer-2027",
      "fall-2027",
    ]);
  });

  it("uses a source-board name when the job itself omits the term", () => {
    expect(
      extractJobRecruitingTerms({
        title: "Software Engineer Intern",
        description: "Build useful products.",
        sourceNames: ["SimplifyJobs Summer 2027 Internships"],
      }),
    ).toEqual(["summer-2027"]);
  });

  it("does not confuse a graduation season with the job term", () => {
    expect(
      extractJobRecruitingTerms({
        title: "Software Engineer Intern (Summer 2027)",
        description: "Applicants must graduate in Spring 2028.",
      }),
    ).toEqual(["summer-2027"]);
  });

  it("accepts explicit start-term language in a description", () => {
    expect(
      extractJobRecruitingTerms({
        title: "Software Engineer Intern",
        description: "This internship starts in Fall 2027. Applicants graduate in Spring 2028.",
      }),
    ).toEqual(["fall-2027"]);
  });

  it("does not infer a term from a season without a year", () => {
    expect(extractRecruitingTerms("Spring Framework Developer Intern")).toEqual([]);
  });

  it("sorts chronologically and formats labels for the UI", () => {
    const values = ["unknown", "fall-2027", "summer-2026", "winter-2027"];
    expect(values.sort(compareRecruitingTerms)).toEqual([
      "summer-2026",
      "winter-2027",
      "fall-2027",
      "unknown",
    ]);
    expect(formatRecruitingTerm("summer-2027")).toBe("Summer 2027");
    expect(formatRecruitingTerm("unknown")).toBe("Unknown");
  });
});
