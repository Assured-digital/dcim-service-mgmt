import {
  PrismaClient,
  Role,
  OwnerType,
  ServiceRequestStatus,
  SurveyStatus,
  IncidentSeverity,
  IncidentStatus,
  TaskStatus
} from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function clientCode(clientId: string): string {
  return clientId.replace(/-/g, "").slice(0, 6).toUpperCase();
}

async function seedClientData(params: {
  client: { id: string; name: string };
  assigneeId: string;
  createdById: string;
}) {
  const { client, assigneeId, createdById } = params;
  const code = clientCode(client.id);
  const isNova = client.name === "Nova Logistics";

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
      ];

  for (const item of serviceRequests) {
    const existing = await prisma.serviceRequest.findUnique({
      where: { reference: item.reference }
    });
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
      });
    }
  }

  const surveyTitle = isNova
    ? "Q1 2026 Facility Walkthrough"
    : `${client.name} Quarterly Facility Walkthrough`;
  const existingSurvey = await prisma.survey.findFirst({
    where: { clientId: client.id, title: surveyTitle }
  });
  if (!existingSurvey) {
    await prisma.survey.create({
      data: {
        clientId: client.id,
        title: surveyTitle,
        surveyType: "Facility",
        status: SurveyStatus.IN_PROGRESS,
        scheduledAt: new Date(),
        assigneeId,
        items: {
          create: [
            { label: "Fire exits clear and signed" },
            { label: "UPS alarms checked" },
            { label: "Cooling operating within range" }
          ]
        }
      }
    });
  }

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
      ];

  for (const sample of triageSamples) {
    const existing = await prisma.publicSubmission.findFirst({
      where: {
        clientId: client.id,
        requesterEmail: sample.requesterEmail,
        subject: sample.subject
      }
    });

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
      });
    }
  }

  const incidentRefs = isNova
    ? ["IN-2026-0001", "IN-2026-0002"]
    : [`IN-${code}-0001`, `IN-${code}-0002`];

  let incidentA = await prisma.incident.findUnique({
    where: { reference: incidentRefs[0] }
  });
  if (!incidentA) {
    incidentA = await prisma.incident.create({
      data: {
        reference: incidentRefs[0],
        clientId: client.id,
        title: `${client.name}: Core switch packet drops`,
        description: "Intermittent packet drops detected on core switch uplink ports.",
        status: IncidentStatus.INVESTIGATING,
        severity: IncidentSeverity.HIGH,
        priority: "high",
        assigneeId,
        createdById
      }
    });
  }

  const incidentB = await prisma.incident.findUnique({
    where: { reference: incidentRefs[1] }
  });
  if (!incidentB) {
    await prisma.incident.create({
      data: {
        reference: incidentRefs[1],
        clientId: client.id,
        title: `${client.name}: Cooling threshold breach`,
        description: "Temperature breached threshold for 12 minutes in one zone.",
        status: IncidentStatus.NEW,
        severity: IncidentSeverity.CRITICAL,
        priority: "high",
        assigneeId,
        createdById
      }
    });
  }

  const taskSamples = [
    {
      title: `${client.name}: Validate switch firmware integrity`,
      description: "Run vendor diagnostics and compare firmware checksums.",
      status: TaskStatus.IN_PROGRESS,
      priority: "high",
      incidentId: incidentA.id
    },
    {
      title: `${client.name}: Capture thermal sensor logs`,
      description: "Export 24h logs from aisle zone sensors.",
      status: TaskStatus.OPEN,
      priority: "medium",
      incidentId: null as string | null
    }
  ];

  for (const task of taskSamples) {
    const existing = await prisma.task.findFirst({
      where: { clientId: client.id, title: task.title }
    });
    if (!existing) {
      await prisma.task.create({
        data: {
          reference: `TSK-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000) + 1000}`,
          clientId: client.id,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          incidentId: task.incidentId,
          assigneeId,
          createdById
        }
      });
    }
  }

  await prisma.asset.createMany({
    data: [
      {
        assetTag: `CL-${code}-RTR-01`,
        name: `${client.name} Core Router`,
        assetType: "ROUTER",
        ownerType: OwnerType.CLIENT,
        clientId: client.id,
        location: "Network Room"
      }
    ],
    skipDuplicates: true
  });

  const intakeTitle = `${client.name}: Request additional weekend support coverage`;
  const existingIntake = await prisma.requestIntake.findFirst({
    where: { clientId: client.id, title: intakeTitle }
  });
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
    });
  }
}

async function main() {
  // 1) Organization (stable by name)
  const orgName = "DCMS Default Organization";
  const organization = await prisma.organization.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: { name: orgName, status: "ACTIVE" },
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: orgName,
      status: "ACTIVE"
    }
  });

  // Backfill existing clients/users without organization to default org.
  await prisma.client.updateMany({
    where: { organizationId: null },
    data: { organizationId: organization.id }
  });
  await prisma.user.updateMany({
    where: { organizationId: null },
    data: { organizationId: organization.id }
  });

  // 2) Client (stable by name)
  const existingClient = await prisma.client.findFirst({
    where: { name: "Nova Logistics" }
  });

  const clientA =
    existingClient ??
    (await prisma.client.create({
      data: { name: "Nova Logistics", status: "ACTIVE", organizationId: organization.id }
    }));
  if (clientA.organizationId !== organization.id) {
    await prisma.client.update({
      where: { id: clientA.id },
      data: { organizationId: organization.id }
    });
  }

  const existingClientB = await prisma.client.findFirst({
    where: { name: "Apex Data Centers" }
  });

  const clientB =
    existingClientB ??
    (await prisma.client.create({
      data: { name: "Apex Data Centers", status: "ACTIVE", organizationId: organization.id }
    }));
  if (clientB.organizationId !== organization.id) {
    await prisma.client.update({
      where: { id: clientB.id },
      data: { organizationId: organization.id }
    });
  }

  // 3) Admin user (stable by email)
  const adminEmail = "admin@dcm.local";
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
  });

  // 4) Global Assets (internal shared assets)
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
  });

  const orgClients = await prisma.client.findMany({
    where: { organizationId: organization.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true }
  });

  for (const client of orgClients) {
    await seedClientData({
      client,
      assigneeId: admin.id,
      createdById: admin.id
    });
  }

  console.log("Seed complete:", {
    organization: organization.id,
    clientsSeeded: orgClients.length,
    admin: admin.email,
    clientNames: orgClients.map((c) => c.name)
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
