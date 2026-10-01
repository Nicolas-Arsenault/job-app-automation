"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CompanyLogo } from "../CompanyLogo";
import { AppliedBadge, cls } from "../ui";
import type { ApplicationStatus } from "../jobs/types";

export type TrackedApplicationStatus = Extract<
  ApplicationStatus,
  "applied" | "interviewing" | "offer" | "rejected"
>;

export interface TrackedApplication {
  id: string;
  title: string;
  company: string;
  location: string | null;
  country: string | null;
  applyUrl: string;
  applicationStatus: TrackedApplicationStatus;
  appliedAt: string | null;
  availabilityStatus: string;
  closedAt: string | null;
}

const STAGES: { value: TrackedApplicationStatus; label: string }[] = [
  { value: "applied", label: "Applied" },
  { value: "interviewing", label: "Interviewing" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
];

type StageFilter = "all" | TrackedApplicationStatus;

function formatDate(value: string | null): string {
  if (!value) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function ApplicationTracker({
  initialApplications,
}: {
  initialApplications: TrackedApplication[];
}) {
  const [applications, setApplications] = useState(initialApplications);
  const [filter, setFilter] = useState<StageFilter>("all");
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const result: Record<TrackedApplicationStatus, number> = {
      applied: 0,
      interviewing: 0,
      offer: 0,
      rejected: 0,
    };
    for (const application of applications) result[application.applicationStatus]++;
    return result;
  }, [applications]);

  const visibleApplications =
    filter === "all"
      ? applications
      : applications.filter((application) => application.applicationStatus === filter);

  async function updateStatus(
    application: TrackedApplication,
    status: TrackedApplicationStatus,
  ) {
    if (status === application.applicationStatus) return;
    const previousStatus = application.applicationStatus;
    setError(null);
    setUpdatingIds((current) => new Set(current).add(application.id));
    setApplications((current) =>
      current.map((item) =>
        item.id === application.id ? { ...item, applicationStatus: status } : item,
      ),
    );

    try {
      const response = await fetch(`/api/jobs/${application.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationStatus: status }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error || `Update failed (${response.status})`);
      }
    } catch (caught) {
      setApplications((current) =>
        current.map((item) =>
          item.id === application.id
            ? { ...item, applicationStatus: previousStatus }
            : item,
        ),
      );
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setUpdatingIds((current) => {
        const next = new Set(current);
        next.delete(application.id);
        return next;
      });
    }
  }

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`${cls.card} text-left transition-colors ${
            filter === "all" ? "ring-2 ring-indigo-500" : "hover:border-indigo-300"
          }`}
        >
          <span className="text-xs text-gray-500 dark:text-gray-400">All</span>
          <span className="mt-1 block text-2xl font-bold">{applications.length}</span>
        </button>
        {STAGES.map((stage) => (
          <button
            key={stage.value}
            type="button"
            onClick={() => setFilter(stage.value)}
            className={`${cls.card} text-left transition-colors ${
              filter === stage.value
                ? "ring-2 ring-indigo-500"
                : "hover:border-indigo-300"
            }`}
          >
            <span className="text-xs text-gray-500 dark:text-gray-400">{stage.label}</span>
            <span className="mt-1 block text-2xl font-bold">{counts[stage.value]}</span>
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          Could not update application: {error}
        </p>
      )}

      {visibleApplications.length === 0 ? (
        <div className={`${cls.card} text-center`}>
          <p className="font-medium">No applications in this stage.</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Mark a role as applied from the Jobs page and it will appear here.
          </p>
          <Link href="/jobs" className="mt-4 inline-block text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-300">
            Browse jobs
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleApplications.map((application) => {
            const updating = updatingIds.has(application.id);
            const closed = application.availabilityStatus === "closed";
            return (
              <article key={application.id} className={`${cls.card} flex flex-wrap items-center gap-3`}>
                <CompanyLogo company={application.company} size={40} />
                <div className="min-w-[220px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={application.applyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-gray-950 hover:text-indigo-600 hover:underline dark:text-gray-100 dark:hover:text-indigo-300"
                    >
                      {application.title}
                    </a>
                    <AppliedBadge status={application.applicationStatus} />
                    {closed && (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-100">
                        Posting closed
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    <span className="font-medium">{application.company}</span>
                    {application.location ? ` · ${application.location}` : ""}
                    {application.country ? ` · ${application.country}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Applied {formatDate(application.appliedAt)}
                    {closed && application.closedAt
                      ? ` · posting closed ${formatDate(application.closedAt)}`
                      : ""}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm font-medium">
                  Stage
                  <select
                    value={application.applicationStatus}
                    disabled={updating}
                    onChange={(event) =>
                      void updateStatus(
                        application,
                        event.target.value as TrackedApplicationStatus,
                      )
                    }
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900"
                  >
                    {STAGES.map((stage) => (
                      <option key={stage.value} value={stage.value}>
                        {stage.label}
                      </option>
                    ))}
                  </select>
                </label>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
