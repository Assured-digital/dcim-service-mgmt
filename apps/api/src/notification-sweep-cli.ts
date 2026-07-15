import { NestFactory } from "@nestjs/core"
import { NotificationSweepModule } from "./notifications/notification-sweep.module"
import { NotificationSweepService } from "./notifications/notification-sweep.service"

// Entry point for the notification-sweep JOB (Container Apps Job on the API image,
// command: `node dist/src/notification-sweep-cli.js`, triggered on a daily cron).
// Runs the time-based sweep across EVERY organization IN-PROCESS — no HTTP, no auth,
// no service-account credential (mirrors provision-cli.ts). Emits DUE_SOON / OVERDUE
// notifications (in-app always; email only where the recipient opted in), then exits.
async function main() {
  // Minimal context — Prisma + the sweep service only. Deliberately NOT AppModule, so
  // the auth stack (JwtStrategy → JWT_SECRET) and HTTP layer aren't required in the job.
  const app = await NestFactory.createApplicationContext(NotificationSweepModule, {
    logger: ["log", "warn", "error"]
  })
  try {
    const svc = app.get(NotificationSweepService)
    const result = await svc.runAllOrgs()
    console.log(`Done: ${JSON.stringify(result)}`)
  } finally {
    await app.close()
  }
}

main().catch((e) => {
  console.error("Notification sweep job failed:", e)
  process.exit(1)
})
