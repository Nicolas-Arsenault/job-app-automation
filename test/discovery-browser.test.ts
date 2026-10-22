import { describe, expect, it } from "vitest";
import { resolveBrowserHref } from "../lib/discovery/browser";

describe("browser source URLs", () => {
  it("resolves Uber relative job links before detail navigation", () => {
    expect(resolveBrowserHref("https://jobs.uber.com", "/en/jobs/303922/")).toBe(
      "https://jobs.uber.com/en/jobs/303922/",
    );
  });

  it("preserves absolute job links", () => {
    expect(resolveBrowserHref("https://jobs.uber.com", "https://example.com/job/1")).toBe(
      "https://example.com/job/1",
    );
  });
});
