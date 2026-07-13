import { Injectable, Logger } from "@nestjs/common"
import { DefaultAzureCredential } from "@azure/identity"

const ARM_SCOPE = "https://management.azure.com/.default"
const ARM_BASE = "https://management.azure.com"

// Starts the SharePoint provisioning JOB when a client is created — event-driven,
// so provisioning compute runs only on onboarding (~monthly), not on a poll.
// Model B intact: the API's identity needs ONLY "start this job" ARM permission
// (Microsoft.App/jobs/start/action) — NOT any SharePoint permission. The job holds
// the elevated identity and does the work. The sweep is idempotent + provisions ALL
// clients missing a site, so a missed/failed trigger self-heals on the next create.
@Injectable()
export class ProvisioningTriggerService {
  private readonly logger = new Logger(ProvisioningTriggerService.name)
  private credential = new DefaultAzureCredential()

  enabled(): boolean {
    return process.env.SP_PROVISION_TRIGGER_ENABLED === "true"
  }

  // Best-effort — never throws, never blocks client creation.
  async triggerProvisioning(): Promise<void> {
    if (!this.enabled()) return
    const sub = process.env.AZURE_SUBSCRIPTION_ID
    const rg = process.env.PROVISION_JOB_RESOURCE_GROUP
    const job = process.env.PROVISION_JOB_NAME
    if (!sub || !rg || !job) {
      this.logger.warn("Provisioning trigger enabled but AZURE_SUBSCRIPTION_ID / PROVISION_JOB_RESOURCE_GROUP / PROVISION_JOB_NAME not all set")
      return
    }
    try {
      const token = (await this.credential.getToken(ARM_SCOPE))?.token
      if (!token) throw new Error("no ARM token")
      const url = `${ARM_BASE}/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.App/jobs/${job}/start?api-version=2024-03-01`
      const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) {
        const b = await res.text().catch(() => "")
        this.logger.warn(`Provisioning job trigger → ${res.status}: ${b.slice(0, 200)}`)
        return
      }
      this.logger.log("Started SharePoint provisioning job for a new client")
    } catch (e) {
      this.logger.warn(`Provisioning trigger failed (non-fatal): ${(e as Error).message}`)
    }
  }
}
