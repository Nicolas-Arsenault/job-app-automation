import { prisma } from "@/lib/db";
import { API_COMPANIES, BROWSER_COMPANIES } from "@/lib/discovery/companies";
import {
  categorizeCompany,
  fallbackForSystem,
  CATEGORY_ORDER,
  type JobCategory,
} from "@/lib/discovery/categories";
import { cls, PageHeader, CategoryBadge } from "./components/ui";
import { CompanyLogo } from "./components/CompanyLogo";
import { ScanButton } from "./components/ScanButton";
import { ACTIVE_JOB_WHERE } from "@/lib/jobs/availability";
import { getDiscoveryScopeCopy } from "@/lib/discovery/scope";
import { getDiscoveryConfig } from "@/lib/discovery/config";
import { getDiscoveryCoverageReport } from "@/lib/discovery/coverage";

export const dynamic = "force-dynamic";

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className={cls.card}>
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-400">{hint}</div>}
    </div>
  );
}

function timeAgo(d: Date | null): string {
  if (!d) return "never";
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default async function OverviewPage() {
  const discoveryConfig = await getDiscoveryConfig();
  const entryWhere = {
    isEntryLevel: true,
    ...(discoveryConfig.internshipsOnly ? { employmentType: "intern" } : {}),
    ...ACTIVE_JOB_WHERE,
  } as const;
  const [scope, usEntry, caEntry, workdayJobs, lastJob, byCompany, allByCompany, sourceHealthIssues, atsExpansion, secondaryJobs, directJobs, adapterBacklog, adapterPlatforms, coverage] = await Promise.all([
    getDiscoveryScopeCopy(),
    prisma.job.count({ where: { ...entryWhere, country: "US" } }),
    prisma.job.count({ where: { ...entryWhere, country: "CA" } }),
    prisma.job.count({ where: { isWorkday: true, ...ACTIVE_JOB_WHERE } }),
    prisma.job.findFirst({ where: entryWhere, orderBy: { lastSeenAt: "desc" }, select: { lastSeenAt: true } }),
    prisma.job.groupBy({
      by: ["company"],
      where: { ...entryWhere, country: { in: ["US", "CA"] } },
      _count: { _all: true },
      orderBy: { _count: { company: "desc" } },
      take: 12,
    }),
    // All employers (company + provenance) so we can roll counts up by category.
    prisma.job.groupBy({
      by: ["company", "discoverySystem"],
      where: { ...entryWhere, country: { in: ["US", "CA"] } },
      _count: { _all: true },
    }),
    prisma.discoverySource.findMany({
      where: { lastStatus: { in: ["error", "degraded"] } },
      orderBy: { lastRunAt: "desc" },
      select: {
        key: true,
        name: true,
        company: true,
        lastStatus: true,
        lastMessage: true,
        lastRunAt: true,
        lastCompleteRunAt: true,
      },
      take: 12,
    }),
    prisma.discoveredAtsBoard.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.job.count({ where: { ...entryWhere, discoverySystem: "githubboard" } }),
    prisma.job.count({ where: { ...entryWhere, discoverySystem: { not: "githubboard" } } }),
    prisma.communityEmployerCandidate.findMany({
      where: { status: "needs_adapter" },
      orderBy: [{ observations: "desc" }, { lastSeenAt: "desc" }],
      take: 12,
      select: {
        companyKey: true,
        company: true,
        detectedPlatform: true,
        applicationHost: true,
        exampleApplyUrl: true,
        exampleTitle: true,
        evidenceSource: true,
        observations: true,
      },
    }),
    prisma.communityEmployerCandidate.groupBy({
      by: ["detectedPlatform"],
      where: { status: "needs_adapter" },
      _count: { _all: true },
      orderBy: { _count: { detectedPlatform: "desc" } },
    }),
    getDiscoveryCoverageReport(),
  ]);

  const verifiedExpansion = atsExpansion.find((row) => row.status === "verified")?._count._all ?? 0;
  const pendingExpansion = atsExpansion.find((row) => row.status === "pending")?._count._all ?? 0;
  const companiesCovered = API_COMPANIES.length + BROWSER_COMPANIES.length + verifiedExpansion;
  const directCoverage = directJobs + secondaryJobs > 0
    ? Math.round((directJobs / (directJobs + secondaryJobs)) * 100)
    : 0;

  const byCategory = new Map<JobCategory, number>();
  for (const row of allByCompany) {
    const cat = categorizeCompany(row.company, fallbackForSystem(row.discoverySystem));
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + row._count._all);
  }
  const categoryRows = CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((c) => ({
    category: c,
    count: byCategory.get(c) ?? 0,
  }));

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle={`${scope.geographyNeutralHeadline}, refreshed from company career sites and job boards.`}
      >
        <ScanButton />
      </PageHeader>

      <div className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200">
        <b>Discovery mode.</b> {scope.geographyNeutralSummary} Auto-apply and resume matching are
        paused. Use <b>Run scrape</b> to refresh API and supported browser sources, including Shopify,
        and score newly discovered jobs.
      </div>

      <div
        className={
          "mb-6 rounded-xl border p-4 text-sm " +
          (sourceHealthIssues.length
            ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            : "border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200")
        }
      >
        <div className="font-semibold">
          Source health: {sourceHealthIssues.length ? `${sourceHealthIssues.length} need attention` : "all reporting sources healthy"}
        </div>
        {sourceHealthIssues.length > 0 ? (
          <div className="mt-2 space-y-2">
            {sourceHealthIssues.map((source) => (
              <div key={source.key}>
                <span className="font-medium">{source.company ?? source.name}</span>
                {` · ${source.lastStatus} · ${timeAgo(source.lastRunAt)}`}
                {source.lastMessage ? ` — ${source.lastMessage}` : ""}
                {source.lastCompleteRunAt
                  ? ` · last clean run ${timeAgo(source.lastCompleteRunAt)}`
                  : " · no clean run recorded"}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-1 text-xs opacity-80">
            Per-company scrape results are stored after every discovery run; failures and partial responses appear here.
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Stat label="US queue" value={usEntry} hint="open roles" />
        <Stat label="Canada queue" value={caEntry} hint="open roles" />
        <Stat label="Companies covered" value={companiesCovered} hint={`${API_COMPANIES.length} catalog · ${verifiedExpansion} learned · ${BROWSER_COMPANIES.length} browser`} />
        <Stat label="Last discovery" value={timeAgo(lastJob?.lastSeenAt ?? null)} hint="most recent scrape" />
        <Stat label="Workday jobs" value={workdayJobs} hint="in Jobs — assisted fill available" />
        <Stat label="First-party inventory" value={`${directCoverage}%`} hint={`${directJobs} direct · ${secondaryJobs} community-only`} />
      </div>

      <div className="mt-6 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
        <div className="font-semibold">Automatic ATS expansion</div>
        <div className="mt-1">
          {verifiedExpansion} community-discovered boards are verified and monitored directly.
          {pendingExpansion > 0
            ? ` ${pendingExpansion} candidate${pendingExpansion === 1 ? " is" : "s are"} waiting for a gentle validation retry.`
            : " No candidates are waiting for validation."}
        </div>
        <div className="mt-2 text-xs opacity-80">
          Custom-adapter backlog: {adapterPlatforms.reduce((sum, row) => sum + row._count._all, 0)} employers
          {adapterPlatforms.length
            ? ` · ${adapterPlatforms.map((row) => `${row.detectedPlatform} ${row._count._all}`).join(" · ")}`
            : ""}
        </div>
      </div>

      <div className={cls.card + " mt-6"}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">GitHub vs direct coverage experiment</h2>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Cohort started {new Date(coverage.startedAt).toLocaleString()}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Counts only internships first discovered after the experiment began, so the historical bulk import cannot bias the result.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div><div className="text-xs text-gray-500">Cohort</div><div className="text-2xl font-bold">{coverage.total}</div></div>
          <div><div className="text-xs text-gray-500">Direct coverage</div><div className="text-2xl font-bold">{coverage.directCoveragePercent}%</div></div>
          <div><div className="text-xs text-gray-500">GitHub coverage</div><div className="text-2xl font-bold">{coverage.githubCoveragePercent}%</div></div>
          <div><div className="text-xs text-gray-500">GitHub-only contribution</div><div className="text-2xl font-bold">{coverage.githubUniquePercent}%</div></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <span>Direct only: <b>{coverage.directOnly}</b></span>
          <span>Both: <b>{coverage.both}</b></span>
          <span>GitHub only: <b>{coverage.githubOnly}</b></span>
          <span>Untracked: <b>{coverage.untracked}</b></span>
          <span>External misses: <b>{coverage.externalMisses}</b></span>
          <span>Direct first: <b>{coverage.overlap.directFirst}</b></span>
          <span>GitHub first: <b>{coverage.overlap.githubFirst}</b></span>
          <span>
            Median GitHub lag: <b>{coverage.overlap.medianGithubLagMinutes == null ? "—" : `${Math.round(coverage.overlap.medianGithubLagMinutes)}m`}</b>
          </span>
        </div>
        <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          GitHub-only routing: {coverage.githubOnlyRouting.automaticAts} jobs point to automatically supported ATS boards · {coverage.githubOnlyRouting.customAdapter} require custom coverage.
        </div>
      </div>

      {adapterBacklog.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-lg font-semibold">Employers needing custom coverage</h2>
          <div className={cls.card + " overflow-x-auto p-0"}>
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Employer</th>
                  <th className="px-4 py-2 font-medium">Platform / host</th>
                  <th className="px-4 py-2 font-medium">Evidence</th>
                  <th className="px-4 py-2 font-medium">Seen</th>
                </tr>
              </thead>
              <tbody>
                {adapterBacklog.map((candidate) => (
                  <tr key={candidate.companyKey} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                    <td className="px-4 py-2 font-medium">{candidate.company}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-300">
                      {candidate.detectedPlatform}
                      {candidate.applicationHost ? ` · ${candidate.applicationHost}` : ""}
                    </td>
                    <td className="max-w-md px-4 py-2">
                      <a
                        href={candidate.exampleApplyUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 hover:underline dark:text-indigo-300"
                      >
                        {candidate.exampleTitle ?? "Example posting"}
                      </a>
                      {candidate.evidenceSource ? (
                        <div className="mt-0.5 text-xs text-gray-400">{candidate.evidenceSource}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-gray-600 dark:text-gray-300">
                      {candidate.observations}×
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {categoryRows.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Roles by category</h2>
          <div className="flex flex-wrap gap-2">
            {categoryRows.map((row) => (
              <div
                key={row.category}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm dark:border-gray-800 dark:bg-gray-900"
              >
                <CategoryBadge category={row.category} />
                <span className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">
                  {row.count}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">roles</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Open roles by company</h2>
        <div className={cls.card + " overflow-x-auto p-0"}>
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-800 dark:text-gray-400">
              <tr>
                <th className="px-4 py-2 font-medium">Company</th>
                <th className="px-4 py-2 font-medium">Open in-scope roles</th>
              </tr>
            </thead>
            <tbody>
              {byCompany.length === 0 && (
                <tr>
                  <td className="px-4 py-3 text-gray-400" colSpan={2}>
                    No roles yet — use <b>Run scrape</b> above to populate the queue.
                  </td>
                </tr>
              )}
              {byCompany.map((c) => (
                <tr key={c.company} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                  <td className="px-4 py-2 font-medium">
                    <span className="flex items-center gap-2">
                      <CompanyLogo company={c.company} size={22} />
                      {c.company}
                    </span>
                  </td>
                  <td className="px-4 py-2 tabular-nums text-gray-600 dark:text-gray-300">{c._count._all}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
