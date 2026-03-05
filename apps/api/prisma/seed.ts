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

async function main() {
  // 1) Client (stable by name)
  const existingClient = await prisma.client.findFirst({
    where: { name: "Nova Logistics" }
  });

  const clientA =
    existingClient ??
    (await prisma.client.create({
      data: { name: "Nova Logistics", status: "ACTIVE" }
    }));

  // 2) Admin user (stable by email)
  const adminEmail = "admin@dcm.local";
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: await bcrypt.hash("Admin123!", 10),
      role: Role.ADMIN,
      clientId: clientA.id,
      isActive: true
    }
  });

  // 3) Service Requests (idempotent by fixed references)
  const sr1Ref = "SR-2026-0001";
  const sr2Ref = "SR-2026-0002";

  const sr1 = await prisma.serviceRequest.findFirst({
    where: { clientId: clientA.id, reference: sr1Ref }
  });

  if (!sr1) {
    await prisma.serviceRequest.create({
      data: {
        reference: sr1Ref,
        clientId: clientA.id,
        subject: "Network latency on VLAN 200",
        description: "Users report increased latency; investigate switch uplinks and QoS.",
        status: ServiceRequestStatus.IN_PROGRESS,
        priority: "high",
        assigneeId: admin.id
      }
    });
  }

  const sr2 = await prisma.serviceRequest.findFirst({
    where: { clientId: clientA.id, reference: sr2Ref }
  });

  if (!sr2) {
    await prisma.serviceRequest.create({
      data: {
        reference: sr2Ref,
        clientId: clientA.id,
        subject: "Scheduled power maintenance Zone C",
        description: "Planned maintenance; confirm outage window and comms.",
        status: ServiceRequestStatus.ASSIGNED,
        priority: "medium",
        assigneeId: admin.id
      }
    });
  }

  // 4) Assets (assumes assetTag is unique; skipDuplicates prevents repeats)
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

  // 5) Survey (idempotent by (clientId + title))
  const surveyTitle = "Q1 2026 Facility Walkthrough";

  let survey = await prisma.survey.findFirst({
    where: { clientId: clientA.id, title: surveyTitle }
  });

  if (!survey) {
    survey = await prisma.survey.create({
      data: {
        clientId: clientA.id,
        title: surveyTitle,
        surveyType: "Facility",
        status: SurveyStatus.IN_PROGRESS,
        scheduledAt: new Date(),
        assigneeId: admin.id,
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

  // 6) Public submissions for triage inbox (idempotent by requesterEmail + subject + client)
  const triageSamples = [
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
  ];

  for (const sample of triageSamples) {
    const existing = await prisma.publicSubmission.findFirst({
      where: {
        clientId: clientA.id,
        requesterEmail: sample.requesterEmail,
        subject: sample.subject
      }
    });

    if (!existing) {
      await prisma.publicSubmission.create({
        data: {
          clientId: clientA.id,
          requesterName: sample.requesterName,
          requesterEmail: sample.requesterEmail,
          subject: sample.subject,
          description: sample.description,
          status: "NEW"
        }
      });
    }
  }

  // 7) Incidents (idempotent by reference + client)
  const inc1Ref = "IN-2026-0001";
  const inc2Ref = "IN-2026-0002";

  const inc1 = await prisma.incident.findFirst({
    where: { clientId: clientA.id, reference: inc1Ref }
  });

  const incidentA =
    inc1 ??
    (await prisma.incident.create({
      data: {
        reference: inc1Ref,
        clientId: clientA.id,
        title: "Core switch packet drops",
        description: "Intermittent packet drops detected on core switch uplink ports.",
        status: IncidentStatus.INVESTIGATING,
        severity: IncidentSeverity.HIGH,
        priority: "high",
        assigneeId: admin.id,
        createdById: admin.id
      }
    }));

  const inc2 = await prisma.incident.findFirst({
    where: { clientId: clientA.id, reference: inc2Ref }
  });

  if (!inc2) {
    await prisma.incident.create({
      data: {
        reference: inc2Ref,
        clientId: clientA.id,
        title: "Cooling threshold breach - zone C",
        description: "Temperature breached threshold for 12 minutes in zone C.",
        status: IncidentStatus.NEW,
        severity: IncidentSeverity.CRITICAL,
        priority: "high",
        assigneeId: admin.id,
        createdById: admin.id
      }
    });
  }

  // 8) Tasks (idempotent by title + client)
  const taskSamples = [
    {
      title: "Validate switch firmware integrity",
      description: "Run vendor diagnostics and compare firmware checksums.",
      status: TaskStatus.IN_PROGRESS,
      priority: "high",
      incidentId: incidentA.id
    },
    {
      title: "Capture thermal sensor logs",
      description: "Export 24h logs from aisle zone C sensors.",
      status: TaskStatus.OPEN,
      priority: "medium",
      incidentId: null as string | null
    }
  ];

  for (const task of taskSamples) {
    const existing = await prisma.task.findFirst({
      where: { clientId: clientA.id, title: task.title }
    });
    if (!existing) {
      await prisma.task.create({
        data: {
          clientId: clientA.id,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          incidentId: task.incidentId,
          assigneeId: admin.id,
          createdById: admin.id
        }
      });
    }
  }

  console.log("Seed complete:", {
    clientA: clientA.id,
    admin: admin.email,
    survey: survey.id
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
