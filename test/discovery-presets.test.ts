import { describe, expect, it } from "vitest";
import { DEFAULT_DISCOVERY_CONFIG } from "../lib/discovery/config";
import { isCompanyFocused } from "../lib/discovery/company-focus";
import {
  CANADA_BRAND_COMPANIES,
  canadaBrandDiscoveryConfig,
} from "../lib/discovery/presets";

describe("Canada brand discovery preset", () => {
  it("selects Canadian internships and a broad high-signal employer set", () => {
    const config = canadaBrandDiscoveryConfig(DEFAULT_DISCOVERY_CONFIG);

    expect(config.countries).toEqual(["CA"]);
    expect(config.internshipsOnly).toBe(true);
    expect(config.excludeAdvancedDegree).toBe(true);
    expect(config.disabledSources).toContain("Y Combinator");
    expect(config.companyFocus).toEqual([...CANADA_BRAND_COMPANIES]);
    expect(config.companyFocus).toEqual(
      expect.arrayContaining([
        "Shopify", "Microsoft", "Nokia", "Ericsson", "Ciena", "Coveo",
        "Autodesk", "Genetec", "RBC", "AMD", "IBM", "Clio",
      ]),
    );
    expect(config.companyFocus.length).toBeGreaterThanOrEqual(90);
    expect(config.watchedCompanies.every((company) =>
      isCompanyFocused(company.name, config.companyFocus),
    )).toBe(true);
  });
});
