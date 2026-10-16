import { canonicalCompanyKey } from "../company-names";
import type { DiscoveryPosting } from "./adapters";

function focusKeys(companyFocus: string[]): Set<string> {
  return new Set(companyFocus.map(canonicalCompanyKey).filter(Boolean));
}

export function isCompanyFocused(
  company: string,
  companyFocus: string[] | undefined,
): boolean {
  if (!companyFocus?.length) return true;
  return focusKeys(companyFocus).has(canonicalCompanyKey(company));
}

export function filterFocusedPostings(
  postings: DiscoveryPosting[],
  companyFocus: string[] | undefined,
): DiscoveryPosting[] {
  if (!companyFocus?.length) return postings;
  const keys = focusKeys(companyFocus);
  return postings.filter((posting) => keys.has(canonicalCompanyKey(posting.company)));
}
