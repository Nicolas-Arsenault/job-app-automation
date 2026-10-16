import { prisma } from "../lib/db";
import { getDiscoveryConfig } from "../lib/discovery/config";
import {
  bootstrapCommunityAtsBoards,
  validatePendingAtsBoards,
} from "../lib/discovery/ats-expansion";

const batchSize = Math.max(1, Number(process.env.ATS_QUEUE_BATCH_SIZE) || 8);
const pauseMs = Math.max(500, Number(process.env.ATS_QUEUE_PAUSE_MS) || 2_000);
const concurrency = Math.min(
  2,
  Math.max(1, Number(process.env.ATS_QUEUE_CONCURRENCY) || 2),
);

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function dueCount() {
  return prisma.discoveredAtsBoard.count({
    where: {
      status: "pending",
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
    },
  });
}

async function main() {
  const config = await getDiscoveryConfig();
  const discovered = await bootstrapCommunityAtsBoards();
  console.log(`Queue refreshed from ${discovered} supported community-board identities.`);

  let verified = 0;
  let failed = 0;
  let batch = 0;
  while (await dueCount()) {
    batch++;
    const result = await validatePendingAtsBoards(
      {
        countries: config.countries,
        internshipsOnly: config.internshipsOnly,
      },
      {
        limit: batchSize,
        concurrency,
      },
    );
    verified += result.verified;
    failed += result.failed;
    const remaining = await dueCount();
    console.log(
      `Batch ${batch}: ${result.verified} verified, ${result.failed} backed off, ${remaining} due.`,
    );
    if (result.verified + result.failed === 0 || remaining === 0) break;
    await wait(pauseMs);
  }

  console.log(`Queue drain complete: ${verified} verified, ${failed} safely backed off.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
