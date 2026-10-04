ALTER TABLE "DiscoveryJobSighting" ADD COLUMN "reportedPostedAt" DATETIME;

CREATE INDEX "DiscoveryJobSighting_reportedPostedAt_idx"
ON "DiscoveryJobSighting"("reportedPostedAt");
