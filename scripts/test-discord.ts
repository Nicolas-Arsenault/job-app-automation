import { loadEnvConfig } from "@next/env";
import { sendDiscordTestNotification } from "../lib/notifications/discord";
import { prisma } from "../lib/db";

loadEnvConfig(process.cwd());

sendDiscordTestNotification()
  .then(() => console.log("Discord test notification sent."))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
