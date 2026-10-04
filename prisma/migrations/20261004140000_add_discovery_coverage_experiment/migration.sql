CREATE TABLE "DiscoveryCoverageExperiment" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "DiscoveryCoverageExperiment" ("id", "startedAt", "createdAt", "updatedAt")
VALUES ('default', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
