import { NestFactory } from "@nestjs/core"
import { SharePointProvisioningModule } from "./sharepoint-provisioning/provisioning.module"
import { SharePointProvisioningService } from "./sharepoint-provisioning/provisioning.service"

// Entry point for the SharePoint provisioning JOB (Container Apps Job on the API
// image, command: `node dist/provision-cli.js`). Runs under the ELEVATED provisioner
// identity (AZURE_CLIENT_ID set to id-adsm-provisioner on the job). Sweeps clients
// missing a SharePoint site, provisions each, then exits. Inert unless
// SP_PROVISION_ENABLED=true.
async function main() {
  // Minimal context — Prisma + the provisioner only. Deliberately NOT AppModule,
  // so the auth stack (JwtStrategy → JWT_SECRET) isn't required in the job.
  const app = await NestFactory.createApplicationContext(SharePointProvisioningModule, { logger: ["log", "warn", "error"] })
  try {
    const svc = app.get(SharePointProvisioningService)
    if (!svc.enabled()) {
      console.log("SharePoint provisioning is disabled (SP_PROVISION_ENABLED != true) — nothing to do.")
      return
    }
    const result = await svc.sweep()
    console.log(`Done: ${JSON.stringify(result)}`)
  } finally {
    await app.close()
  }
}

main().catch((e) => {
  console.error("Provisioning job failed:", e)
  process.exit(1)
})
