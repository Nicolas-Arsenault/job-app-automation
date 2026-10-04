ALTER TABLE "Job" ADD COLUMN "employerPostedAt" DATETIME;
ALTER TABLE "Job" ADD COLUMN "sourceReportedAt" DATETIME;
ALTER TABLE "Job" ADD COLUMN "firstPartyFirstSeenAt" DATETIME;
ALTER TABLE "Job" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "Job" ADD COLUMN "newnessStatus" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "Job" ADD COLUMN "reopenedAt" DATETIME;

CREATE INDEX "Job_firstPartyFirstSeenAt_idx" ON "Job"("firstPartyFirstSeenAt");
CREATE INDEX "Job_newnessStatus_idx" ON "Job"("newnessStatus");

CREATE TABLE "DiscoveredAtsBoard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "system" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "companyAliases" TEXT NOT NULL DEFAULT '[]',
    "evidenceUrl" TEXT NOT NULL,
    "evidenceSource" TEXT,
    "evidenceJobId" TEXT,
    "confidence" INTEGER NOT NULL DEFAULT 100,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastValidatedAt" DATETIME,
    "nextRetryAt" DATETIME,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "DiscoveredAtsBoard_system_token_key" ON "DiscoveredAtsBoard"("system", "token");
CREATE INDEX "DiscoveredAtsBoard_status_nextRetryAt_idx" ON "DiscoveredAtsBoard"("status", "nextRetryAt");
CREATE INDEX "DiscoveredAtsBoard_company_idx" ON "DiscoveredAtsBoard"("company");
