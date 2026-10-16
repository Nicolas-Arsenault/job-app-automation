import {
  DEFAULT_WATCHED_COMPANIES,
  type DiscoveryConfigData,
} from "./config";
import { isCompanyFocused } from "./company-focus";

// Recognizable Canadian technology employers, global engineering companies
// with meaningful Canadian teams, and high-signal Canadian institutions. This
// is intentionally broader than FAANG while excluding low-signal long-tail
// inventory. It is a discovery scope, not a claim that every company is
// currently hiring interns.
export const CANADA_BRAND_COMPANIES = [
  // Global technology and infrastructure with Canadian engineering offices.
  "Amazon", "Microsoft", "Google", "Apple", "Meta", "Shopify", "NVIDIA",
  "AMD", "Intel", "Qualcomm", "IBM", "Cisco", "Salesforce", "Autodesk",
  "SAP", "Oracle", "ServiceNow", "Snowflake", "Atlassian", "Ericsson",
  "Nokia", "Ciena", "Intuit", "GitHub", "Stripe", "Datadog", "Cloudflare",
  "MongoDB", "Okta", "PagerDuty", "Dropbox", "Reddit", "Coinbase", "DoorDash",
  "Uber", "Adobe", "Zoom", "HubSpot", "Twilio", "Elastic", "Asana",
  "Instacart", "Affirm", "Coursera", "Grafana Labs", "Block",
  // Canadian product, AI, security, SaaS, networking, and deep-tech companies.
  "Cohere", "Wealthsimple", "1Password", "Hopper", "StackAdapt", "TouchBistro",
  "Thinkific", "D2L", "Wattpad", "Waabi", "Jobber", "Hootsuite", "Kinaxis",
  "Clio", "BlackBerry", "Geotab", "Tenstorrent", "Visier", "Trulioo",
  "Behaviour Interactive", "AlayaCare", "Coveo", "Ada", "League", "Clearco",
  "Genetec", "Nuvei", "Vention", "Lightspeed", "OpenText", "PointClickCare",
  "Dayforce", "ApplyBoard", "Benevity", "Arctic Wolf", "FreshBooks", "Xanadu",
  "Workleap", "Plusgrade", "eSentire", "Miovision", "Vidyard",
  "Magnet Forensics", "Tulip", "Solace",
  // Canadian finance, telecom, semiconductor, industrial, and consulting brands.
  "RBC", "TD", "BMO", "CIBC", "Scotiabank", "National Bank", "Desjardins",
  "Manulife", "Sun Life", "Intact", "CPP Investments", "Bell", "Rogers",
  "TELUS", "Lumentum", "Celestica", "Magna", "Ford", "General Motors", "CAE",
  "Clearpath Robotics", "Ross Video", "Accenture", "CGI", "Deloitte", "PwC",
  "EY", "KPMG", "Bank of Canada", "BDC", "EDC", "Hydro-Québec",
  "Ontario Power Generation", "BC Hydro",
] as const;

export function canadaBrandDiscoveryConfig(
  current: DiscoveryConfigData,
): DiscoveryConfigData {
  const companyFocus = [...CANADA_BRAND_COMPANIES];
  return {
    ...current,
    countries: ["CA"],
    includeInternships: true,
    internshipsOnly: true,
    excludeAdvancedDegree: true,
    companyFocus,
    disabledSources: Array.from(new Set([...current.disabledSources, "Y Combinator"])),
    watchedCompanies: DEFAULT_WATCHED_COMPANIES.filter((company) =>
      isCompanyFocused(company.name, companyFocus),
    ),
  };
}
