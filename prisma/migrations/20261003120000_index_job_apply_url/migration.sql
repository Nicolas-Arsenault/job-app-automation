-- Speed up canonical apply-URL deduplication in both ingestion pipelines.
CREATE INDEX "Job_applyUrl_idx" ON "Job"("applyUrl");
