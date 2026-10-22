ALTER TABLE "DiscoverySource" ADD COLUMN "lastQualityMetrics" TEXT;
ALTER TABLE "DiscoverySource" ADD COLUMN "lastQualityWarnings" TEXT;

ALTER TABLE "DiscoverySourceRun" ADD COLUMN "qualityMetrics" TEXT;
ALTER TABLE "DiscoverySourceRun" ADD COLUMN "qualityWarnings" TEXT;
