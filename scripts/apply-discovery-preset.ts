import { prisma } from "../lib/db";
import { getDiscoveryConfig, saveDiscoveryConfig } from "../lib/discovery/config";
import { canadaBrandDiscoveryConfig } from "../lib/discovery/presets";

async function main() {
  const preset = process.argv[2];
  if (preset !== "canada-brand") {
    throw new Error("Usage: tsx scripts/apply-discovery-preset.ts canada-brand");
  }

  const current = await getDiscoveryConfig();
  const backupId = `backup:${preset}:${new Date().toISOString()}`;
  await prisma.discoveryConfig.create({
    data: { id: backupId, data: JSON.stringify(current) },
  });

  const saved = await saveDiscoveryConfig(canadaBrandDiscoveryConfig(current));
  console.log(
    `Applied ${preset}: ${saved.companyFocus.length} employers, ` +
      `${saved.countries.join(", ")} only, ${saved.watchedCompanies.length} watched sites.`,
  );
  console.log(`Previous configuration saved as ${backupId}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
