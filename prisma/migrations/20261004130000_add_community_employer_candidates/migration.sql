CREATE TABLE "CommunityEmployerCandidate" (
    "companyKey" TEXT NOT NULL PRIMARY KEY,
    "company" TEXT NOT NULL,
    "detectedPlatform" TEXT NOT NULL DEFAULT 'unknown',
    "applicationHost" TEXT,
    "exampleApplyUrl" TEXT NOT NULL,
    "exampleTitle" TEXT,
    "evidenceSource" TEXT,
    "status" TEXT NOT NULL DEFAULT 'needs_adapter',
    "observations" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "CommunityEmployerCandidate_status_detectedPlatform_idx" ON "CommunityEmployerCandidate"("status", "detectedPlatform");
CREATE INDEX "CommunityEmployerCandidate_applicationHost_idx" ON "CommunityEmployerCandidate"("applicationHost");
CREATE INDEX "CommunityEmployerCandidate_lastSeenAt_idx" ON "CommunityEmployerCandidate"("lastSeenAt");
