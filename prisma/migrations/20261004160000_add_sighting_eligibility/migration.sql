ALTER TABLE "DiscoveryJobSighting"
ADD COLUMN "eligibleInternship" BOOLEAN NOT NULL DEFAULT false;

UPDATE "DiscoveryJobSighting"
SET "eligibleInternship" = true
WHERE "jobId" IN (
  SELECT "id" FROM "Job"
  WHERE "isEntryLevel" = true AND "employmentType" = 'intern'
);

CREATE INDEX "DiscoveryJobSighting_eligibleInternship_idx"
ON "DiscoveryJobSighting"("eligibleInternship");
