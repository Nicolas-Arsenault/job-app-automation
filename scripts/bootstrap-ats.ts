import { prisma } from "../lib/db";
import { bootstrapCommunityAtsBoards } from "../lib/discovery/ats-expansion";

async function main() {
  const observed = await bootstrapCommunityAtsBoards();
  const [boards, backlog] = await Promise.all([
    prisma.discoveredAtsBoard.groupBy({
      by: ["system", "status"],
      _count: { _all: true },
      orderBy: [{ system: "asc" }, { status: "asc" }],
    }),
    prisma.communityEmployerCandidate.groupBy({
      by: ["detectedPlatform", "status"],
      _count: { _all: true },
      orderBy: [{ detectedPlatform: "asc" }, { status: "asc" }],
    }),
  ]);
  console.log(JSON.stringify({ observedEmployers: observed, boards, backlog }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
