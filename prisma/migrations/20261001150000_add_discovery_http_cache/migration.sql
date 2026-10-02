CREATE TABLE "DiscoveryHttpCache" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "etag" TEXT,
    "lastModified" TEXT,
    "body" TEXT NOT NULL,
    "contentType" TEXT,
    "lastCheckedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

ALTER TABLE "DiscoveryRunState" ADD COLUMN "lastManualSucceededAt" DATETIME;
