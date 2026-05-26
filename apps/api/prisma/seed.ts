import {
  PrismaClient,
  Role,
  OwnerType,
  ServiceRequestStatus,
  TaskStatus
} from "@prisma/client"
import * as bcrypt from "bcryptjs"

const prisma = new PrismaClient()

function clientCode(clientId: string): string {
  return clientId.replace(/-/g, "").slice(0, 6).toUpperCase()
}

async function seedClientData(params: {
  client: { id: string; name: string }
  assigneeId: string
  createdById: string
}) {
  const { client, assigneeId, createdById } = params
  const code = clientCode(client.id)
  const isNova = client.name === "Nova Logistics"

  // ── Sites ──────────────────────────────────────────────────────────
  const siteAName = isNova ? "Nova London DC" : `${client.name} Primary Site`
  const siteBName = isNova ? "Nova Manchester DC" : `${client.name} Secondary Site`

  let siteA = await prisma.site.findFirst({
    where: { clientId: client.id, name: siteAName }
  })
  if (!siteA) {
    siteA = await prisma.site.create({
      data: {
        clientId: client.id,
        name: siteAName,
        address: isNova ? "12 Docklands Way, London E14" : `1 Industrial Park, ${client.name} HQ`,
      }
    })
  }

  let siteB = await prisma.site.findFirst({
    where: { clientId: client.id, name: siteBName }
  })
  if (!siteB) {
    siteB = await prisma.site.create({
      data: {
        clientId: client.id,
        name: siteBName,
        address: isNova ? "44 Spinningfields, Manchester M3" : `2 Business Park, ${client.name} North`,
      }
    })
  }

  // ── Cabinets ───────────────────────────────────────────────────────
  let cabinetA = await prisma.cabinet.findFirst({
    where: { siteId: siteA.id, name: "Rack A1" }
  })
  if (!cabinetA) {
    cabinetA = await prisma.cabinet.create({
      data: {
        siteId: siteA.id,
        name: "Rack A1",
        totalU: 42,
        notes: "Row A"
      }
    })
  }

  // ── Assets ─────────────────────────────────────────────────────────
  await prisma.asset.createMany({
    data: [
      {
        assetTag: `CL-${code}-RTR-01`,
        name: `${client.name} Core Router`,
        assetType: "ROUTER",
        ownerType: OwnerType.CLIENT,
        clientId: client.id,
        siteId: siteA.id,
        cabinetId: cabinetA.id,
        location: "Rack A1",
        status: "ACTIVE",
        lifecycleState: "ACTIVE"
      },
      {
        assetTag: `CL-${code}-SWT-01`,
        name: `${client.name} Core Switch`,
        assetType: "SWITCH",
        ownerType: OwnerType.CLIENT,
        clientId: client.id,
        siteId: siteA.id,
        cabinetId: cabinetA.id,
        location: "Rack A1",
        status: "ACTIVE",
        lifecycleState: "ACTIVE"
      }
    ],
    skipDuplicates: true
  })

  // ── Service Requests ───────────────────────────────────────────────
  const serviceRequests = isNova
    ? [
        {
          reference: "SR-2026-0001",
          subject: "Network latency on VLAN 200",
          description: "Users report increased latency; investigate switch uplinks and QoS.",
          status: ServiceRequestStatus.IN_PROGRESS,
          priority: "high"
        },
        {
          reference: "SR-2026-0002",
          subject: "Scheduled power maintenance Zone C",
          description: "Planned maintenance; confirm outage window and comms.",
          status: ServiceRequestStatus.ASSIGNED,
          priority: "medium"
        }
      ]
    : [
        {
          reference: `SR-${code}-0001`,
          subject: `${client.name}: Access control panel intermittent errors`,
          description: "Panel in operations corridor intermittently denies valid badges.",
          status: ServiceRequestStatus.NEW,
          priority: "medium"
        },
        {
          reference: `SR-${code}-0002`,
          subject: `${client.name}: Planned electrical maintenance window`,
          description: "Coordinate maintenance runbook and client communications.",
          status: ServiceRequestStatus.ASSIGNED,
          priority: "high"
        }
      ]

  for (const item of serviceRequests) {
    const existing = await prisma.serviceRequest.findUnique({
      where: { reference: item.reference }
    })
    if (!existing) {
      await prisma.serviceRequest.create({
        data: {
          reference: item.reference,
          clientId: client.id,
          subject: item.subject,
          description: item.description,
          status: item.status,
          priority: item.priority,
          assigneeId,
          createdById
        }
      })
    }
  }
  // ────────────────────────────────────────────────────────────────────────
  const staffUsers = await prisma.user.findMany({
    where: {
      role: {
        in: [Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER]
      }
    },
    select: { id: true }
  })

  const pickAssignee = (status: ServiceRequestStatus): string | null => {
    // NEW tickets are unassigned by convention (awaiting triage)
    if (status === ServiceRequestStatus.NEW) return null
    if (staffUsers.length === 0) return assigneeId
    return staffUsers[Math.floor(Math.random() * staffUsers.length)].id
  }

  const daysAgo = (n: number): Date => {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return d
  }

  // Reference numbering follows existing pattern: SR-2026-NNNN for Nova,
  // SR-{code}-NNNN for others. Existing seed uses 0001-0002, so start at 0003.
  const refPrefix = isNova ? "SR-2026" : `SR-${code}`

  type ExtendedSR = {
    refSuffix: string
    subject: string
    description: string
    status: ServiceRequestStatus
    priority: "low" | "medium" | "high" | "critical"
    daysOld: number
    closureSummary?: string
  }

  const extendedRequests: ExtendedSR[] = [
    // ── Maintenance (planned/scheduled work) ────────────────────────────
    {
      refSuffix: "0003",
      subject: "Q3 UPS battery health test - Suite B",
      description:
        "Scheduled quarterly battery health test across all UPS units in Suite B. Includes runtime simulation and load test under controlled conditions. Coordinated with client ops for maintenance window.",
      status: ServiceRequestStatus.COMPLETED,
      priority: "medium",
      daysOld: 12,
      closureSummary:
        "All UPS units passed quarterly health checks. Battery runtime within spec at 18-22 minutes per unit. Next quarterly test scheduled for Q4."
    },
    {
      refSuffix: "0004",
      subject: "Annual generator load test",
      description:
        "Annual full-load test of standby generator unit. Includes coordination with grid disconnection sequence, testing of automatic transfer switch, and review of fuel system condition. Client ops to be notified 48 hours in advance.",
      status: ServiceRequestStatus.IN_PROGRESS,
      priority: "high",
      daysOld: 5
    },
    {
      refSuffix: "0005",
      subject: "HVAC quarterly filter replacement - all CRAC units",
      description:
        "Routine quarterly replacement of intake filters across all CRAC units. Includes visual inspection of coils and condensate drains.",
      status: ServiceRequestStatus.ASSIGNED,
      priority: "medium",
      daysOld: 3
    },
    {
      refSuffix: "0006",
      subject: "Cable management audit - aisle 4",
      description:
        "Walk-through audit of cable routing, labelling and overhead containment for aisle 4. Document any non-compliance for remediation tasks.",
      status: ServiceRequestStatus.IN_PROGRESS,
      priority: "low",
      daysOld: 8
    },
    {
      refSuffix: "0007",
      subject: "Firmware update - core switching",
      description:
        "Apply vendor firmware update to core switching infrastructure. Pre-staging configuration verification required. Maintenance window needed; coordinate with client network team.",
      status: ServiceRequestStatus.WAITING_CUSTOMER,
      priority: "high",
      daysOld: 6
    },
    {
      refSuffix: "0008",
      subject: "Annual electrical safety inspection",
      description:
        "Annual electrical safety inspection (PAT and fixed installation). Engineer to be accompanied by qualified electrician. Generate certificate and file with compliance docs.",
      status: ServiceRequestStatus.NEW,
      priority: "medium",
      daysOld: 1
    },
    {
      refSuffix: "0009",
      subject: "Fire suppression system annual service",
      description:
        "Annual service of fire suppression system by approved vendor. Includes pressure test, sensor calibration, and replacement of any expired components. Coordinate with building management for access.",
      status: ServiceRequestStatus.ASSIGNED,
      priority: "high",
      daysOld: 4
    },

    // ── Change requests (customer-initiated) ────────────────────────────
    {
      refSuffix: "0010",
      subject: "Add new server to Rack A1",
      description:
        "Customer-requested provision of new 1U server (Dell PowerEdge R650) into Rack A1. Includes physical install, power circuit allocation, network port assignment, and asset register entry.",
      status: ServiceRequestStatus.IN_PROGRESS,
      priority: "medium",
      daysOld: 2
    },
    {
      refSuffix: "0011",
      subject: "Move power feed - Rack B3 to redundant PDU",
      description:
        "Customer change request to migrate Rack B3 power feed from PDU-15 to PDU-22 for redundancy compliance. Requires no-impact migration outside business hours.",
      status: ServiceRequestStatus.WAITING_CUSTOMER,
      priority: "high",
      daysOld: 9
    },
    {
      refSuffix: "0012",
      subject: "Network port reconfiguration - VLAN realignment",
      description:
        "Reconfigure 12 switch ports in cabinet A2 onto new VLAN 240. Coordinate with customer's network team for cutover timing.",
      status: ServiceRequestStatus.CLOSED,
      priority: "medium",
      daysOld: 22,
      closureSummary:
        "VLAN realignment completed during planned maintenance window. All 12 ports validated, traffic flowing as expected. Customer signed off."
    },
    {
      refSuffix: "0013",
      subject: "Cross-connect provisioning - new fibre pair to Meet-Me Room",
      description:
        "Provision new fibre cross-connect from customer cage to MMR cabinet position 14. SMF, LC/LC, labelled both ends.",
      status: ServiceRequestStatus.ASSIGNED,
      priority: "medium",
      daysOld: 7
    },
    {
      refSuffix: "0014",
      subject: "Equipment decommission - legacy core switch",
      description:
        "Decommission and remove legacy Cisco 6509 core switch from cabinet B1. Includes secure data sanitisation of any storage, asset register update, and disposal documentation.",
      status: ServiceRequestStatus.IN_PROGRESS,
      priority: "low",
      daysOld: 14
    },
    {
      refSuffix: "0015",
      subject: "Rack space relocation - consolidate aisle 4",
      description:
        "Customer-requested consolidation of partially-occupied racks in aisle 4. Migrate equipment from B5 and B7 into B6 to free contiguous space for upcoming hardware refresh.",
      status: ServiceRequestStatus.COMPLETED,
      priority: "medium",
      daysOld: 18,
      closureSummary:
        "Consolidation complete. B5 and B7 returned to inventory. B6 now hosts all relocated equipment, validated and powered up. Asset register updated."
    },

    // One genuinely urgent change request to show priority variety
    {
      refSuffix: "0016",
      subject: "Emergency access permission - vendor on-call escalation",
      description:
        "Urgent customer request for after-hours access permission for vendor engineer to perform emergency hardware swap. Verify customer authorisation via verbal+email confirmation per policy.",
      status: ServiceRequestStatus.NEW,
      priority: "critical",
      daysOld: 0
    }
  ]

  for (const req of extendedRequests) {
    const reference = `${refPrefix}-${req.refSuffix}`
    const existing = await prisma.serviceRequest.findUnique({
      where: { reference }
    })
    if (existing) continue

    await prisma.serviceRequest.create({
      data: {
        reference,
        clientId: client.id,
        subject: req.subject,
        description: req.description,
        status: req.status,
        priority: req.priority,
        assigneeId: pickAssignee(req.status),
        createdById,
        closureSummary: req.closureSummary,
        createdAt: daysAgo(req.daysOld),
        updatedAt: daysAgo(Math.max(0, req.daysOld - 1))
      }
    })
  }

  // ── Triage / Public Submissions ────────────────────────────────────
  const triageSamples = isNova
    ? [
        {
          requesterName: "Alex Turner",
          requesterEmail: "alex.turner@novalogistics.example",
          subject: "Intermittent rack access badge failure",
          description: "Badge readers in zone B2 fail intermittently for on-call engineers."
        },
        {
          requesterName: "Priya Shah",
          requesterEmail: "priya.shah@novalogistics.example",
          subject: "Cooling alert in aisle 4",
          description: "Temperature spikes observed overnight; request urgent triage."
        }
      ]
    : [
        {
          requesterName: "Operations Desk",
          requesterEmail: `ops+${code.toLowerCase()}@example.local`,
          subject: `${client.name}: UPS alert requires triage`,
          description: "Critical UPS warning observed during shift handover."
        },
        {
          requesterName: "Site Engineer",
          requesterEmail: `engineer+${code.toLowerCase()}@example.local`,
          subject: `${client.name}: CCTV stream intermittent`,
          description: "Camera feed drops every few minutes in corridor 2."
        }
      ]

  for (const sample of triageSamples) {
    const existing = await prisma.publicSubmission.findFirst({
      where: {
        clientId: client.id,
        requesterEmail: sample.requesterEmail,
        subject: sample.subject
      }
    })
    if (!existing) {
      await prisma.publicSubmission.create({
        data: {
          clientId: client.id,
          requesterName: sample.requesterName,
          requesterEmail: sample.requesterEmail,
          subject: sample.subject,
          description: sample.description,
          status: "NEW"
        }
      })
    }
  }

  // ── Request Intakes ────────────────────────────────────────────────
  const intakeTitle = `${client.name}: Request additional weekend support coverage`
  const existingIntake = await prisma.requestIntake.findFirst({
    where: { clientId: client.id, title: intakeTitle }
  })
  if (!existingIntake) {
    await prisma.requestIntake.create({
      data: {
        clientId: client.id,
        requesterUserId: createdById,
        requesterName: "Operations Manager",
        requesterEmail: `ops-manager+${code.toLowerCase()}@example.local`,
        title: intakeTitle,
        description: "Need operations coverage for planned maintenance window and follow-up validation.",
        category: "operational",
        impact: "medium",
        urgency: "medium",
        status: "NEW"
      }
    })
  }

  // ── Risks ──────────────────────────────────────────────────────────
  const riskSamples = isNova
    ? [
        {
          reference: "RSK-2026-0001",
          title: "UPS battery degradation in Zone B",
          description: "UPS unit 3 battery has shown warning indicators over the past 30 days. Risk of power failure during outage.",
          likelihood: "HIGH",
          impact: "HIGH",
          status: "MITIGATING",
          source: "SURVEY"
        },
        {
          reference: "RSK-2026-0002",
          title: "Single cooling path dependency in aisle 4",
          description: "Aisle 4 relies on a single CRAC unit with no failover. Failure would breach thermal thresholds within 20 minutes.",
          likelihood: "MEDIUM",
          impact: "HIGH",
          status: "ASSESSED",
          source: "AUDIT"
        }
      ]
    : [
        {
          reference: `RSK-${code}-0001`,
          title: `${client.name}: Ageing network core hardware`,
          description: "Core switching hardware is approaching end of vendor support. No replacement budget confirmed.",
          likelihood: "MEDIUM",
          impact: "MEDIUM",
          status: "IDENTIFIED",
          source: "MANUAL"
        }
      ]

  for (const risk of riskSamples) {
    const existing = await prisma.risk.findUnique({
      where: { reference: risk.reference }
    })
    if (!existing) {
      await prisma.risk.create({
        data: {
          reference: risk.reference,
          clientId: client.id,
          title: risk.title,
          description: risk.description,
          likelihood: risk.likelihood,
          impact: risk.impact,
          status: risk.status,
          source: risk.source,
          mitigationPlan: risk.status === "MITIGATING"
            ? "Schedule UPS battery replacement within 30 days. Weekly monitoring until resolved."
            : null
        }
      })
    }
  }

  // ── Issues ─────────────────────────────────────────────────────────
  const issueSamples = isNova
    ? [
        {
          reference: "ISS-2026-0001",
          title: "Cable management in Rack B2 non-compliant",
          description: "Rack B2 cabling does not meet labelling and routing standards. Raises audit risk.",
          severity: "AMBER",
          status: "OPEN"
        },
        {
          reference: "ISS-2026-0002",
          title: "Raised floor tile displacement in corridor 3",
          description: "Two floor tiles in corridor 3 are unseated. Trip hazard and airflow impact.",
          severity: "RED",
          status: "IN_PROGRESS"
        }
      ]
    : [
        {
          reference: `ISS-${code}-0001`,
          title: `${client.name}: Missing asset labels on PDU strip`,
          description: "PDU strip in rack A3 has unlabelled outlets. Makes fault isolation slower.",
          severity: "GREEN",
          status: "OPEN"
        }
      ]

  for (const issue of issueSamples) {
    const existing = await prisma.issue.findUnique({
      where: { reference: issue.reference }
    })
    if (!existing) {
      await prisma.issue.create({
        data: {
          reference: issue.reference,
          clientId: client.id,
          title: issue.title,
          description: issue.description,
          severity: issue.severity,
          status: issue.status
        }
      })
    }
  }

  // ── Tasks ──────────────────────────────────────────────────────────
  const taskSamples = isNova
    ? [
        {
          title: "Replace UPS battery unit 3 — Zone B",
          description: "Procure and schedule replacement. Coordinate with client for maintenance window.",
          status: TaskStatus.IN_PROGRESS,
          priority: "high",
          linkedEntityType: "Risk",
          linkedEntityIdRef: "RSK-2026-0001"
        },
        {
          title: "Remediate Rack B2 cable management",
          description: "Re-route and label all cables in Rack B2 to meet standards.",
          status: TaskStatus.OPEN,
          priority: "medium",
          linkedEntityType: "Issue",
          linkedEntityIdRef: "ISS-2026-0001"
        },
        {
          title: "Thermal survey — aisle 4 cooling assessment",
          description: "Conduct point-in-time thermal survey to assess cooling redundancy options.",
          status: TaskStatus.OPEN,
          priority: "high",
          linkedEntityType: null,
          linkedEntityIdRef: null
        }
      ]
    : [
        {
          title: `${client.name}: Validate switch firmware integrity`,
          description: "Run vendor diagnostics and compare firmware checksums.",
          status: TaskStatus.IN_PROGRESS,
          priority: "high",
          linkedEntityType: null,
          linkedEntityIdRef: null
        },
        {
          title: `${client.name}: Label PDU outlets in rack A3`,
          description: "Print and apply asset labels to all PDU outlets.",
          status: TaskStatus.OPEN,
          priority: "low",
          linkedEntityType: "Issue",
          linkedEntityIdRef: `ISS-${code}-0001`
        }
      ]

  for (const task of taskSamples) {
    const existing = await prisma.task.findFirst({
      where: { clientId: client.id, title: task.title }
    })
    if (!existing) {
      // Resolve linked entity ID from reference if provided
      let linkedEntityId: string | null = null
      if (task.linkedEntityType === "Risk" && task.linkedEntityIdRef) {
        const risk = await prisma.risk.findUnique({
          where: { reference: task.linkedEntityIdRef }
        })
        linkedEntityId = risk?.id ?? null
      } else if (task.linkedEntityType === "Issue" && task.linkedEntityIdRef) {
        const issue = await prisma.issue.findUnique({
          where: { reference: task.linkedEntityIdRef }
        })
        linkedEntityId = issue?.id ?? null
      }

      await prisma.task.create({
        data: {
          reference: `TSK-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000) + 1000}`,
          clientId: client.id,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          linkedEntityType: task.linkedEntityType,
          linkedEntityId,
          assigneeId,
          createdById
        }
      })
    }
  }
}

async function seedCheckTemplates() {
  const templates = [
    {
      reference: "TPL-2026-0001",
      name: "Standard Rack Audit",
      checkType: "Rack Audit",
      description: "Standard physical inspection of rack hardware, cabling, and labelling",
      items: [
        { sortOrder: 1, section: "Physical", label: "Rack door closes and latches securely", responseType: "PASS_FAIL", isRequired: true, isCritical: false },
        { sortOrder: 2, section: "Physical", label: "All blanking panels present and seated", responseType: "PASS_FAIL", isRequired: true, isCritical: false },
        { sortOrder: 3, section: "Physical", label: "Asset labels present and legible on all equipment", responseType: "PASS_FAIL", isRequired: true, isCritical: false },
        { sortOrder: 4, section: "Cabling", label: "Cable management compliant — no trailing cables", responseType: "PASS_FAIL", isRequired: true, isCritical: false },
        { sortOrder: 5, section: "Cabling", label: "All patch cables labelled at both ends", responseType: "PASS_FAIL_NA", isRequired: true, isCritical: false },
        { sortOrder: 6, section: "Power", label: "PDU outlets labelled and load within limits", responseType: "PASS_FAIL", isRequired: true, isCritical: true },
        { sortOrder: 7, section: "Power", label: "No power cables running across aisle floor", responseType: "PASS_FAIL", isRequired: true, isCritical: true },
        { sortOrder: 8, section: "Environment", label: "No visible signs of water ingress or corrosion", responseType: "PASS_FAIL", isRequired: true, isCritical: true },
      ]
    },
    {
      reference: "TPL-2026-0002",
      name: "Site Walkthrough",
      checkType: "Site Walkthrough",
      description: "General facility walkthrough covering safety, environment, and access",
      items: [
        { sortOrder: 1, section: "Safety", label: "Fire exits clear and properly signed", responseType: "PASS_FAIL", isRequired: true, isCritical: true },
        { sortOrder: 2, section: "Safety", label: "Fire extinguishers present, in date, and unobstructed", responseType: "PASS_FAIL", isRequired: true, isCritical: true },
        { sortOrder: 3, section: "Safety", label: "Emergency lighting functional", responseType: "PASS_FAIL_NA", isRequired: true, isCritical: true },
        { sortOrder: 4, section: "Environment", label: "UPS alarms checked — no active warnings", responseType: "PASS_FAIL", isRequired: true, isCritical: true },
        { sortOrder: 5, section: "Environment", label: "Cooling operating within normal range", responseType: "PASS_FAIL", isRequired: true, isCritical: true },
        { sortOrder: 6, section: "Environment", label: "Raised floor tiles seated and no trip hazards", responseType: "PASS_FAIL", isRequired: true, isCritical: false },
        { sortOrder: 7, section: "Access", label: "Access control panel operational", responseType: "PASS_FAIL", isRequired: true, isCritical: false },
        { sortOrder: 8, section: "Access", label: "CCTV cameras operational and feeds visible", responseType: "PASS_FAIL_NA", isRequired: false, isCritical: false },
      ]
    },
    {
      reference: "TPL-2026-0003",
      name: "UPS Health Check",
      checkType: "UPS Health Check",
      description: "Inspection of UPS units, battery health, and power conditioning",
      items: [
        { sortOrder: 1, section: "UPS", label: "UPS status panel shows no active alarms", responseType: "PASS_FAIL", isRequired: true, isCritical: true },
        { sortOrder: 2, section: "UPS", label: "Battery test completed within last 6 months", responseType: "PASS_FAIL", isRequired: true, isCritical: true },
        { sortOrder: 3, section: "UPS", label: "Battery warranty expiry date recorded and valid", responseType: "PASS_FAIL_NA", isRequired: true, isCritical: false },
        { sortOrder: 4, section: "UPS", label: "No visible swelling or corrosion on battery units", responseType: "PASS_FAIL", isRequired: true, isCritical: true },
        { sortOrder: 5, section: "UPS", label: "Bypass switch accessible and labelled", responseType: "PASS_FAIL", isRequired: true, isCritical: false },
        { sortOrder: 6, section: "UPS", label: "Runtime estimate acceptable for load", responseType: "PASS_FAIL", isRequired: true, isCritical: true },
      ]
    },
    {
      reference: "TPL-2026-0004",
      name: "New Engineer Checklist - Imported",
      checkType: "Site Walkthrough",
      description: "Standard visit checklist covering build room, WC, key box, data centre hall and per-rack inspection",
      items: [
        // ── 1. Build Room / Support Area ──────────────────────────────────────
        { sortOrder: 1,  section: "Build Room / Support Area", label: "Desks are clear and ready for use",                                      responseType: "PASS_FAIL", isRequired: true, isCritical: false },
        { sortOrder: 2,  section: "Build Room / Support Area", label: "Floor space is clear of obstructions",                                    responseType: "PASS_FAIL", isRequired: true, isCritical: false },
        { sortOrder: 3,  section: "Build Room / Support Area", label: "Bin is empty",                                                            responseType: "PASS_FAIL", isRequired: true, isCritical: false },
        { sortOrder: 4,  section: "Build Room / Support Area", label: "No rubbish present (cardboard, packaging, loose materials)",              responseType: "PASS_FAIL", isRequired: true, isCritical: false },
        { sortOrder: 5,  section: "Build Room / Support Area", label: "Floor is generally clean and does not require vacuuming",                 responseType: "PASS_FAIL", isRequired: true, isCritical: false },
        { sortOrder: 6,  section: "Build Room / Support Area", label: "Access routes are clear and unobstructed",                                responseType: "PASS_FAIL", isRequired: true, isCritical: false },

        // ── 2. WC ─────────────────────────────────────────────────────────────
        { sortOrder: 7,  section: "WC",                        label: "Bin is empty",                                                            responseType: "PASS_FAIL", isRequired: true, isCritical: false },
        { sortOrder: 8,  section: "WC",                        label: "WC and sink areas are clean",                                             responseType: "PASS_FAIL", isRequired: true, isCritical: false },

        // ── 3. Key Box Inspection ─────────────────────────────────────────────
        { sortOrder: 9,  section: "Key Box Inspection",        label: "Key sign-out book is being correctly used",                               responseType: "PASS_FAIL", isRequired: true, isCritical: false, guidance: "Include a photo of the most recent entry" },
        { sortOrder: 10, section: "Key Box Inspection",        label: "All rack keys are present within the key box",                            responseType: "PASS_FAIL", isRequired: true, isCritical: true  },
        { sortOrder: 11, section: "Key Box Inspection",        label: "Missing keys are recorded with name and date signed out",                 responseType: "PASS_FAIL", isRequired: true, isCritical: false, guidance: "Record who signed out missing keys and when" },
        { sortOrder: 12, section: "Key Box Inspection",        label: "Keys are stored in a correct, secure, and tidy manner",                  responseType: "PASS_FAIL", isRequired: true, isCritical: false },

        // ── 4. Data Centre Hall ───────────────────────────────────────────────
        { sortOrder: 13, section: "Data Centre Hall",          label: "All floor areas are clear of debris, rubbish, materials, or unauthorised furniture", responseType: "PASS_FAIL", isRequired: true, isCritical: false },
        { sortOrder: 14, section: "Data Centre Hall",          label: "Floor is clean with no visible rubbish or loose materials",               responseType: "PASS_FAIL", isRequired: true, isCritical: false },
        { sortOrder: 15, section: "Data Centre Hall",          label: "All rack doors are closed and locked",                                    responseType: "PASS_FAIL", isRequired: true, isCritical: true  },
        { sortOrder: 16, section: "Data Centre Hall",          label: "Storage bins are being used correctly (not mixed, no rubbish inside)",    responseType: "PASS_FAIL", isRequired: true, isCritical: false },
        { sortOrder: 17, section: "Data Centre Hall",          label: "Fire suppression key is correctly set to Auto / Manual",                  responseType: "PASS_FAIL", isRequired: true, isCritical: true  },
        { sortOrder: 18, section: "Data Centre Hall",          label: "Space is free from cardboard and packaging materials",                    responseType: "PASS_FAIL", isRequired: true, isCritical: false },
        { sortOrder: 19, section: "Data Centre Hall",          label: "All cables are installed correctly in overhead basket tray and containment", responseType: "PASS_FAIL", isRequired: true, isCritical: false },
        { sortOrder: 20, section: "Data Centre Hall",          label: "No cabling presents a potential health and safety risk",                  responseType: "PASS_FAIL", isRequired: true, isCritical: true  },
        { sortOrder: 21, section: "Data Centre Hall",          label: "No audible alarms are sounding (other than normal IT and cooling noise)", responseType: "PASS_FAIL", isRequired: true, isCritical: true  },
        { sortOrder: 22, section: "Data Centre Hall",          label: "Crash trolley and server lifter are present and stored in their designated locations", responseType: "PASS_FAIL", isRequired: true, isCritical: false },

        // ── 5. Per-Rack Inspection ────────────────────────────────────────────
        { sortOrder: 23, section: "Per-Rack Inspection",       label: "Blanking panels installed in all unused rack spaces",                    responseType: "PASS_FAIL", isRequired: true, isCritical: false },
        { sortOrder: 24, section: "Per-Rack Inspection",       label: "All racks are free from rubbish, cardboard, plastic, dust caps, or loose materials", responseType: "PASS_FAIL", isRequired: true, isCritical: false },
        { sortOrder: 25, section: "Per-Rack Inspection",       label: "Racks are not being used as general storage",                            responseType: "PASS_FAIL", isRequired: true, isCritical: false },
        { sortOrder: 26, section: "Per-Rack Inspection",       label: "Temporary labels, handwritten notes, or tape are not present on any racks or equipment", responseType: "PASS_FAIL", isRequired: true, isCritical: false },
        { sortOrder: 27, section: "Per-Rack Inspection",       label: "All patch leads (copper and fibre) are connected to a device or patch panel", responseType: "PASS_FAIL", isRequired: true, isCritical: false },
        { sortOrder: 28, section: "Per-Rack Inspection",       label: "Equipment placement matches Hyperview / DCIM rack elevations",           responseType: "PASS_FAIL", isRequired: true, isCritical: false, guidance: "Cross-reference against Hyperview before marking pass" },
      ]
    },
  ]

  for (const t of templates) {
    const existing = await prisma.checkTemplate.findUnique({
      where: { reference: t.reference }
    })
    if (!existing) {
      await prisma.checkTemplate.create({
        data: {
          reference: t.reference,
          name: t.name,
          checkType: t.checkType,
          description: t.description,
          isActive: true,
          items: {
            create: t.items.map(item => ({
              sortOrder: item.sortOrder,
              section: item.section,
              label: item.label,
              responseType: item.responseType as any,
              isRequired: item.isRequired,
              isCritical: item.isCritical
            }))
          }
        }
      })
    }
  }
}

async function main() {
  // 1) Organisation
  const orgName = "DCMS Default Organization"
  const organization = await prisma.organization.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: { name: orgName, status: "ACTIVE" },
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: orgName,
      status: "ACTIVE"
    }
  })

  await prisma.client.updateMany({
    where: { organizationId: null },
    data: { organizationId: organization.id }
  })
  await prisma.user.updateMany({
    where: { organizationId: null },
    data: { organizationId: organization.id }
  })

  // 2) Clients
  const existingClient = await prisma.client.findFirst({
    where: { name: "Nova Logistics" }
  })
  const clientA = existingClient ?? (await prisma.client.create({
    data: { name: "Nova Logistics", status: "ACTIVE", organizationId: organization.id }
  }))
  if (clientA.organizationId !== organization.id) {
    await prisma.client.update({
      where: { id: clientA.id },
      data: { organizationId: organization.id }
    })
  }

  const existingClientB = await prisma.client.findFirst({
    where: { name: "Apex Data Centers" }
  })
  const clientB = existingClientB ?? (await prisma.client.create({
    data: { name: "Apex Data Centers", status: "ACTIVE", organizationId: organization.id }
  }))
  if (clientB.organizationId !== organization.id) {
    await prisma.client.update({
      where: { id: clientB.id },
      data: { organizationId: organization.id }
    })
  }

  // 3) Admin user
  const adminEmail = "admin@dcm.local"
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      role: Role.ORG_OWNER,
      organizationId: organization.id,
      clientId: clientA.id
    },
    create: {
      email: adminEmail,
      passwordHash: await bcrypt.hash("Admin123!", 10),
      role: Role.ORG_OWNER,
      organizationId: organization.id,
      clientId: clientA.id,
      isActive: true
    }
  })

  // 4) Internal staff users
  const internalUsers = [
    {
      email: "manager@dcm.local",
      role: Role.SERVICE_MANAGER,
      clientId: clientA.id
    },
    {
      email: "analyst@dcm.local",
      role: Role.SERVICE_DESK_ANALYST,
      clientId: clientA.id
    },
    {
      email: "engineer@dcm.local",
      role: Role.ENGINEER,
      clientId: clientA.id
    },
    {
      email: "viewer@dcm.local",
      role: Role.CLIENT_VIEWER,
      clientId: clientA.id
    }
  ]

  for (const u of internalUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role, organizationId: organization.id, clientId: u.clientId },
      create: {
        email: u.email,
        passwordHash: await bcrypt.hash("Admin123!", 10),
        role: u.role,
        organizationId: organization.id,
        clientId: u.clientId,
        isActive: true
      }
    })
  }

  // 4) Global internal assets
  await prisma.asset.createMany({
    data: [
      {
        assetTag: "DC-UPS-004",
        name: "APC Smart-UPS 3000",
        assetType: "UPS",
        ownerType: OwnerType.INTERNAL,
        location: "Rack A3"
      },
      {
        assetTag: "DC-PDU-015",
        name: "Raritan PX3-5000",
        assetType: "PDU",
        ownerType: OwnerType.INTERNAL,
        location: "Rack B1"
      }
    ],
    skipDuplicates: true
  })

  // 5) Seed all clients
  const orgClients = await prisma.client.findMany({
    where: { organizationId: organization.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true }
  })

  for (const client of orgClients) {
    await seedClientData({
      client,
      assigneeId: admin.id,
      createdById: admin.id
    })
  }

  console.log("Seed complete:", {
    organization: organization.id,
    clientsSeeded: orgClients.length,
    admin: admin.email,
    clientNames: orgClients.map((c) => c.name)
  })

  await seedCheckTemplates()
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })