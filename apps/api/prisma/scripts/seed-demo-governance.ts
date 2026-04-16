/**
 * Demo Governance Overlay
 * ───────────────────────
 * Run AFTER seed-demo-estate.ts. Generates the synthetic governance layer that
 * makes the dashboards look populated: install dates, warranty dates calibrated
 * to trigger Attention items, maintenance history, and a sprinkle of linked
 * tickets/changes/risks/issues against random assets.
 *
 * Uses admin@dcm.local (from base seed) as the actor for audit events and
 * maintenance-performed-by attribution.
 *
 * Run:  pnpm --filter api seed:demo  (chains both)
 *
 * Idempotent: detects if governance has already been generated for this client
 * and skips; pass --force to regenerate.
 */

import { PrismaClient, MaintenanceWorkType } from "@prisma/client"

const prisma = new PrismaClient()
const FORCE = process.argv.includes("--force")
const CLIENT_NAME = "University of Testing"
const ACTOR_EMAIL = "admin@dcm.local"

// ─── Deterministic RNG ───────────────────────────────────────────────

let SEED_RNG = 0xDEADBEEF
function rand(): number {
  SEED_RNG = (SEED_RNG * 1664525 + 1013904223) & 0x7FFFFFFF
  return SEED_RNG / 0x7FFFFFFF
}
function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min
}
function randPick<T>(arr: T[]): T { return arr[Math.floor(rand() * arr.length)] }
function randDateBetween(start: Date, end: Date): Date {
  const t = start.getTime() + rand() * (end.getTime() - start.getTime())
  return new Date(t)
}

// ─── Reference data ──────────────────────────────────────────────────

const MAINT_WORK_TYPES: MaintenanceWorkType[] = [
  "INSPECTION", "PSU_REPLACEMENT", "FIRMWARE_UPGRADE",
  "PAT_INSPECTION", "COOLING_CHECK", "CABLE_AUDIT", "REPAIR", "UPGRADE"
]

const SR_TEMPLATES = [
  { subject: "Asset relocation requested", description: "Client has requested move to a different rack for cooling balance." },
  { subject: "Add asset to monitoring", description: "Asset is operational but not yet enrolled in monitoring." },
  { subject: "Decommission request", description: "Asset to be powered down and removed at next maintenance window." },
  { subject: "Update asset documentation", description: "Vendor has issued new firmware notes; please update runbook." },
  { subject: "Rack airflow assessment", description: "Heat readings have been climbing in this area; review placement." }
]

const INCIDENT_TEMPLATES = [
  { title: "Network device unresponsive", description: "Switch stopped responding to management traffic at 14:22 BST.", severity: "HIGH" as const },
  { title: "Server hardware fault detected", description: "iLO reported a critical PSU failure; redundant PSU still online.", severity: "MEDIUM" as const },
  { title: "Unexpected reboot", description: "Asset rebooted twice in the last 24h with no scheduled change.", severity: "MEDIUM" as const }
]

const RISK_TEMPLATES = [
  { title: "Single-PSU asset in critical rack", description: "Asset has only one functioning PSU in a rack designated for HA workloads." },
  { title: "Out-of-warranty critical asset", description: "Hardware support has lapsed. Replacement parts not guaranteed." },
  { title: "Unbalanced rack power load", description: "Rack approaching rated capacity; risk of breaker trip under peak load." }
]

const ISSUE_TEMPLATES = [
  { title: "Cable management non-compliant", description: "Cabling does not meet labelling and routing standards.", severity: "AMBER" as const },
  { title: "Asset label missing or illegible", description: "Asset tag cannot be read from rack front. Will fail next audit.", severity: "AMBER" as const },
  { title: "Documentation out of date", description: "Asset record does not match physical configuration discovered on site.", severity: "AMBER" as const }
]

const CHANGE_TEMPLATES = [
  { title: "Firmware upgrade", description: "Apply vendor-recommended firmware update to address security advisory.", reason: "Security CVE published, patch available." },
  { title: "PSU replacement", description: "Swap failed PSU module; service window requested.", reason: "Predictive failure alert from previous inspection." },
  { title: "Decommission and remove", description: "End-of-life asset to be powered down, wiped, and removed from rack.", reason: "Asset is past warranty and replaced by new equipment." }
]

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🎭 Generating governance overlay…\n")

  const client = await prisma.client.findFirst({ where: { name: CLIENT_NAME } })
  if (!client) {
    console.error(`❌ Client "${CLIENT_NAME}" not found. Run seed-demo-estate first.`)
    process.exit(1)
  }

  const assets = await prisma.asset.findMany({ where: { clientId: client.id } })
  console.log(`   Found ${assets.length} assets for ${client.name}`)

  const existingLogs = await prisma.maintenanceLog.count({
    where: { asset: { clientId: client.id } }
  })
  if (existingLogs > 0 && !FORCE) {
    console.log(`   ↺ Governance already generated (${existingLogs} maintenance logs found). Use --force to regenerate.`)
    return
  }
  if (FORCE && existingLogs > 0) {
    console.log(`   🧹 Wiping existing governance data…`)
    await prisma.maintenanceLog.deleteMany({ where: { asset: { clientId: client.id } } })
    await prisma.connection.deleteMany({ where: { clientId: client.id } })
    const assetIds = assets.map(a => a.id)
    await prisma.task.deleteMany({
      where: { clientId: client.id, linkedEntityType: "Asset", linkedEntityId: { in: assetIds } }
    })
    await prisma.serviceRequest.deleteMany({
      where: { clientId: client.id, linkedEntityType: "Asset", linkedEntityId: { in: assetIds } }
    })
    await prisma.incident.deleteMany({
      where: { clientId: client.id, linkedEntityType: "Asset", linkedEntityId: { in: assetIds } }
    })
    await prisma.risk.deleteMany({
      where: { clientId: client.id, linkedEntityType: "Asset", linkedEntityId: { in: assetIds } }
    })
    await prisma.issue.deleteMany({
      where: { clientId: client.id, linkedEntityType: "Asset", linkedEntityId: { in: assetIds } }
    })
    await prisma.changeRequest.deleteMany({
      where: { clientId: client.id, linkedEntityType: "Asset", linkedEntityId: { in: assetIds } }
    })
  }

  // Use the existing admin user as actor
  const actor = await prisma.user.findUnique({ where: { email: ACTOR_EMAIL } })
  if (!actor) {
    console.error(`❌ Actor user ${ACTOR_EMAIL} not found. Run base seed first.`)
    process.exit(1)
  }
  console.log(`   Using ${actor.email} as actor`)

  const now = new Date()
  const monthsAgo = (n: number) => new Date(now.getFullYear(), now.getMonth() - n, now.getDate())
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000)
  const daysFromNow = (n: number) => new Date(now.getTime() + n * 86400000)

  // ─── 1. Install dates + warranties ─────────────────────────────────

  console.log("\n   📅 Setting install dates and warranty dates…")
  let expired = 0, expiringSoon = 0, healthy = 0

  for (const asset of assets) {
    const ageMonths = randInt(6, 60)
    const installDate = monthsAgo(ageMonths)
    const warrantyMonths = randPick([12, 24, 36, 36, 36, 60])
    const warrantyExpiry = new Date(installDate)
    warrantyExpiry.setMonth(warrantyExpiry.getMonth() + warrantyMonths)

    const r = rand()
    let lifecycleState: "ACTIVE" | "STAGING" | "RETIRED" | "PLANNED" | "PROCUREMENT" = "ACTIVE"
    if (r < 0.03) lifecycleState = "RETIRED"
    else if (r < 0.05) lifecycleState = "STAGING"
    else if (r < 0.06) lifecycleState = "PLANNED"

    if (warrantyExpiry < now) expired++
    else if (warrantyExpiry < daysFromNow(30)) expiringSoon++
    else healthy++

    await prisma.asset.update({
      where: { id: asset.id },
      data: { installDate, warrantyExpiry, lifecycleState }
    })
  }
  console.log(`      Expired warranties: ${expired}`)
  console.log(`      Expiring in 30d: ${expiringSoon}`)
  console.log(`      Healthy warranties: ${healthy}`)

  // ─── 2. Maintenance history ────────────────────────────────────────

  console.log("\n   🔧 Generating maintenance history…")
  let logCount = 0
  for (const asset of assets) {
    if (rand() > 0.30) continue
    const fresh = await prisma.asset.findUnique({ where: { id: asset.id } })
    if (!fresh?.installDate) continue

    const eventCount = randInt(1, 3)
    let lastMaintAt: Date | null = null
    for (let i = 0; i < eventCount; i++) {
      const performedAt = randDateBetween(fresh.installDate, now)
      const workType = randPick(MAINT_WORK_TYPES)
      const isLast = i === eventCount - 1
      const nextDueAt = isLast && rand() < 0.4
        ? daysFromNow(randInt(-15, 90))
        : null

      await prisma.maintenanceLog.create({
        data: {
          assetId: asset.id,
          workType,
          performedAt,
          performedById: actor.id,
          notes: `${workType.replace(/_/g, " ").toLowerCase()} performed during scheduled service window.`,
          nextDueAt
        }
      })
      logCount++
      if (!lastMaintAt || performedAt > lastMaintAt) lastMaintAt = performedAt
    }
    if (lastMaintAt) {
      await prisma.asset.update({
        where: { id: asset.id },
        data: { lastMaintenanceAt: lastMaintAt }
      })
    }
  }
  console.log(`      Maintenance logs created: ${logCount}`)

  // ─── 3. Connections ────────────────────────────────────────────────

  console.log("\n   🔌 Generating asset connections…")
  let connectionCount = 0
  const connectedAssetIds = new Set<string>()
  const maxConnections = Math.max(6, Math.floor(assets.length * 0.18))
  let attempts = 0
  const maxAttempts = maxConnections * 10
  while (connectionCount < maxConnections && attempts < maxAttempts && assets.length > 1) {
    attempts++
    const from = randPick(assets)
    const to = randPick(assets)
    if (from.id === to.id) continue
    const key = `${from.id}:${to.id}`
    const reverseKey = `${to.id}:${from.id}`
    if (connectedAssetIds.has(key) || connectedAssetIds.has(reverseKey)) continue

    const created = await prisma.connection.create({
      data: {
        clientId: client.id,
        fromAssetId: from.id,
        toAssetId: to.id,
        connectionType: randPick(["Power Feed", "Fibre", "Ethernet", "Management Link", "Cross Connect"]),
        status: randPick(["ACTIVE", "PLANNED", "DEGRADED"]) as any,
        label: rand() < 0.55 ? `Link ${connectionCount + 1}` : null,
        notes: rand() < 0.4 ? "Generated demo connection for topology view." : null,
        installedAt: rand() < 0.65 ? daysAgo(randInt(20, 420)) : null,
        lastValidatedAt: rand() < 0.55 ? daysAgo(randInt(0, 60)) : null,
        createdById: actor.id
      }
    })

    connectedAssetIds.add(key)
    connectionCount++

    if (rand() < 0.35) {
      await prisma.auditEvent.create({
        data: {
          entityType: "Connection",
          entityId: created.id,
          action: "CREATED",
          actorUserId: actor.id,
          clientId: client.id,
          data: {
            fromAssetTag: from.assetTag,
            toAssetTag: to.assetTag,
            connectionType: created.connectionType
          } as any
        }
      })
    }
  }
  console.log(`      Connections created: ${connectionCount}`)

  // ─── 4. Linked records ──────────────────────────────────────────────

  console.log("\n   🔗 Generating linked governance records…")
  const sample = (n: number) => {
    const shuffled = [...assets].sort(() => rand() - 0.5)
    return shuffled.slice(0, n)
  }
  const createdIncidentIds: string[] = []
  const createdChangeIds: string[] = []

  let refCounter = 1
  const ref = (prefix: string) => `${prefix}-DEMO-${(refCounter++).toString().padStart(4, "0")}`

  for (const asset of sample(5)) {
    const t = randPick(SR_TEMPLATES)
    await prisma.serviceRequest.create({
      data: {
        reference: ref("SR"),
        clientId: client.id,
        subject: `${t.subject} (${asset.assetTag})`,
        description: `${t.description}\n\nAsset: ${asset.name} (${asset.modelNumber ?? "unknown model"})`,
        status: randPick(["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING_CUSTOMER"]) as any,
        priority: randPick(["low", "medium", "high"]),
        linkedEntityType: "Asset",
        linkedEntityId: asset.id,
        assigneeId: actor.id,
        createdById: actor.id,
      }
    })
  }
  refCounter = 1

  for (const asset of sample(3)) {
    const t = randPick(INCIDENT_TEMPLATES)
    const incident = await prisma.incident.create({
      data: {
        reference: ref("INC"),
        clientId: client.id,
        title: `${t.title} — ${asset.assetTag}`,
        description: `${t.description}\n\nAffected asset: ${asset.name}`,
        severity: t.severity,
        status: randPick(["NEW", "INVESTIGATING", "MITIGATED", "RESOLVED", "CLOSED"]) as any,
        priority: t.severity === "HIGH" ? "high" : "medium",
        linkedEntityType: "Asset",
        linkedEntityId: asset.id,
        assigneeId: actor.id,
        createdById: actor.id,
      }
    })
    createdIncidentIds.push(incident.id)
  }
  refCounter = 1

  for (const asset of sample(3)) {
    const t = randPick(RISK_TEMPLATES)
    await prisma.risk.create({
      data: {
        reference: ref("RSK"),
        clientId: client.id,
        title: `${t.title} — ${asset.assetTag}`,
        description: `${t.description}\n\nAsset: ${asset.name}`,
        likelihood: randPick(["LOW", "MEDIUM", "HIGH"]),
        impact: randPick(["MEDIUM", "HIGH"]),
        status: randPick(["IDENTIFIED", "ASSESSED", "MITIGATING"]),
        linkedEntityType: "Asset",
        linkedEntityId: asset.id,
        source: "AUDIT"
      }
    })
  }
  refCounter = 1

  for (const asset of sample(3)) {
    const t = randPick(ISSUE_TEMPLATES)
    await prisma.issue.create({
      data: {
        reference: ref("ISS"),
        clientId: client.id,
        title: `${t.title} — ${asset.assetTag}`,
        description: `${t.description}\n\nAsset: ${asset.name}`,
        severity: t.severity,
        status: randPick(["OPEN", "IN_PROGRESS"]),
        linkedEntityType: "Asset",
        linkedEntityId: asset.id,
      }
    })
  }
  refCounter = 1

  for (const asset of sample(6)) {
    await prisma.task.create({
      data: {
        reference: ref("TSK"),
        clientId: client.id,
        title: `Follow up on ${asset.assetTag}`,
        description: `Routine follow-up task generated by audit on ${asset.name}.`,
        status: randPick(["OPEN", "IN_PROGRESS"]) as any,
        priority: randPick(["low", "medium", "high"]),
        dueAt: daysFromNow(randInt(1, 21)),
        linkedEntityType: "Asset",
        linkedEntityId: asset.id,
        assigneeId: actor.id,
        createdById: actor.id,
      }
    })
  }
  refCounter = 1

  for (const asset of sample(4)) {
    const t = randPick(CHANGE_TEMPLATES)
    const scheduledStart = daysFromNow(randInt(1, 14))
    const scheduledEnd = new Date(scheduledStart.getTime() + 2 * 3600000)
    const status = randPick(["DRAFT", "SUBMITTED", "PENDING_APPROVAL", "APPROVED", "REJECTED", "IN_PROGRESS", "COMPLETED"])
    const change = await prisma.changeRequest.create({
      data: {
        reference: ref("CHG"),
        clientId: client.id,
        title: `${t.title} — ${asset.assetTag}`,
        description: `${t.description}\n\nAsset: ${asset.name}`,
        reason: t.reason,
        impactAssessment: "Service interruption expected during change window.",
        rollbackPlan: "Revert firmware via management interface; restore from snapshot if required.",
        scheduledStart,
        scheduledEnd,
        status,
        priority: "medium",
        changeType: "NORMAL",
        linkedEntityType: "Asset",
        linkedEntityId: asset.id,
        assigneeId: actor.id,
        createdById: actor.id,
      }
    })
    createdChangeIds.push(change.id)

    if (["APPROVED", "REJECTED"].includes(status)) {
      await prisma.changeApproval.create({
        data: {
          changeRequestId: change.id,
          approverId: actor.id,
          decision: status === "APPROVED" ? "APPROVED" : "REJECTED",
          notes: status === "APPROVED" ? "Approved for planned maintenance window." : "Rejected pending more impact evidence."
        }
      })
    }
  }

  for (const incidentId of createdIncidentIds.slice(0, 2)) {
    await prisma.task.create({
      data: {
        reference: ref("TSK"),
        clientId: client.id,
        title: "Incident investigation follow-up",
        description: "Track incident actions and confirm remediation outcomes.",
        status: randPick(["OPEN", "IN_PROGRESS"]) as any,
        priority: randPick(["medium", "high"]),
        dueAt: daysFromNow(randInt(1, 10)),
        linkedEntityType: "Incident",
        linkedEntityId: incidentId,
        assigneeId: actor.id,
        createdById: actor.id,
      }
    })

    await prisma.comment.create({
      data: {
        authorId: actor.id,
        body: "Initial triage complete. Monitoring for recurrence.",
        entityType: "Incident",
        entityId: incidentId,
        type: "WORK_NOTE",
        visibleToCustomer: false,
        fromCustomer: false
      }
    })
  }

  for (const changeId of createdChangeIds.slice(0, 2)) {
    await prisma.task.create({
      data: {
        reference: ref("TSK"),
        clientId: client.id,
        title: "Prepare change implementation checklist",
        description: "Confirm dependencies and implementation steps before execution.",
        status: randPick(["OPEN", "IN_PROGRESS"]) as any,
        priority: "medium",
        dueAt: daysFromNow(randInt(2, 12)),
        linkedEntityType: "ChangeRequest",
        linkedEntityId: changeId,
        assigneeId: actor.id,
        createdById: actor.id,
      }
    })

    await prisma.comment.create({
      data: {
        authorId: actor.id,
        body: "Pre-implementation checklist drafted and pending peer review.",
        entityType: "ChangeRequest",
        entityId: changeId,
        type: "WORK_NOTE",
        visibleToCustomer: false,
        fromCustomer: false
      }
    })
  }

  console.log(`      Service requests: 5`)
  console.log(`      Incidents: 3`)
  console.log(`      Risks: 3`)
  console.log(`      Issues: 3`)
  console.log(`      Tasks: 10 (including incident/change linked tasks)`)
  console.log(`      Change requests: 4 (distributed across lifecycle statuses)`)

  // ─── 5. Recent audit events ────────────────────────────────────────

  console.log("\n   📜 Generating recent audit events…")
  const recentAssets = sample(8)
  for (const asset of recentAssets) {
    await prisma.auditEvent.create({
      data: {
        entityType: "Asset",
        entityId: asset.id,
        action: randPick(["UPDATED", "MOVED", "STATUS_UPDATED", "MAINTAINED"]),
        actorUserId: actor.id,
        clientId: client.id,
        data: { note: "Generated demo activity event" } as any,
        createdAt: daysAgo(randInt(0, 7))
      }
    })
  }
  console.log(`      Audit events: ${recentAssets.length}`)

  console.log("\n✅ Governance overlay complete\n")
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())