import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { MsGraphService, type MailMessage } from "../msgraph/msgraph.service"

// Shared-mailbox email sync (CRM_DESIGN.md §8 phase 7b). Reads the CRM mailbox,
// correlates each message to a client via the ladder (ref token → thread →
// participant address), files it as an Activity(source=EMAIL_SYNC), and drops
// anything it can't place into EmailTriage for one-click triage. App-only,
// env-gated; idempotent (dedupe on internetMessageId).

const REF_TOKEN = /\b(QUO|OPP)-\d{4}-\d{3,}\b/i

export type Match = { clientId: string; contactIds: string[] } | null

@Injectable()
export class MailSyncService {
  constructor(private prisma: PrismaService, private graph: MsGraphService) {}

  isConfigured() {
    return this.graph.isMailConfigured()
  }

  async run(organizationId: string) {
    if (!this.graph.isMailConfigured()) return { status: "disabled" as const }
    const messages = await this.graph.listMailboxMessages()
    let filed = 0, triaged = 0, skipped = 0
    for (const msg of messages) {
      if (!msg.internetMessageId) { skipped++; continue }
      const already =
        (await this.prisma.activity.findUnique({ where: { emailMessageId: msg.internetMessageId }, select: { id: true } })) ||
        (await this.prisma.emailTriage.findUnique({ where: { internetMessageId: msg.internetMessageId }, select: { id: true } }))
      if (already) { skipped++; continue }

      const match = await this.correlate(organizationId, msg)
      if (match) {
        await this.fileActivity(match, msg)
        filed++
      } else {
        await this.createTriage(organizationId, msg)
        triaged++
      }
    }
    return { status: "ok" as const, processed: messages.length, filed, triaged, skipped }
  }

  // The correlation ladder, most→least reliable. Everything is scoped to the
  // actor's org (client.organizationId) — a mailbox is org-wide, so a message
  // can only ever match this org's records.
  async correlate(organizationId: string, msg: MailMessage): Promise<Match> {
    // 1. Subject reference token → the exact quote/opportunity's client.
    const token = msg.subject.match(REF_TOKEN)?.[0]?.toUpperCase()
    if (token) {
      if (token.startsWith("QUO")) {
        const q = await this.prisma.quote.findFirst({ where: { reference: token, client: { organizationId } }, select: { clientId: true, contactId: true } })
        if (q) return { clientId: q.clientId, contactIds: q.contactId ? [q.contactId] : [] }
      } else {
        const o = await this.prisma.opportunity.findFirst({ where: { reference: token, client: { organizationId } }, select: { clientId: true, contactId: true } })
        if (o) return { clientId: o.clientId, contactIds: o.contactId ? [o.contactId] : [] }
      }
    }

    // 2. Thread continuity — a previously-synced message in the same Graph
    // conversation (survives subject edits).
    if (msg.conversationId) {
      const prior = await this.prisma.activity.findFirst({
        where: { emailConversationId: msg.conversationId, client: { organizationId } },
        select: { clientId: true }
      })
      if (prior) return { clientId: prior.clientId, contactIds: [] }
    }

    // 3. Participant address → contact(s). Matched only when every matched
    // contact belongs to ONE client (cross-client participants are ambiguous
    // → triage).
    if (msg.participants.length) {
      const contacts = await this.prisma.contact.findMany({
        where: { email: { in: msg.participants }, client: { organizationId } },
        select: { id: true, clientId: true }
      })
      const clientIds = [...new Set(contacts.map(c => c.clientId))]
      if (clientIds.length === 1) {
        return { clientId: clientIds[0], contactIds: contacts.map(c => c.id) }
      }
    }

    return null
  }

  private async fileActivity(match: { clientId: string; contactIds: string[] }, msg: MailMessage) {
    await this.prisma.activity.create({
      data: {
        clientId: match.clientId,
        type: "EMAIL",
        source: "EMAIL_SYNC",
        subject: msg.subject,
        body: msg.bodyPreview,
        occurredAt: new Date(msg.receivedDateTime),
        emailMessageId: msg.internetMessageId,
        emailConversationId: msg.conversationId,
        contacts: match.contactIds.length
          ? { create: [...new Set(match.contactIds)].map(contactId => ({ contactId })) }
          : undefined
      }
    })
  }

  private async createTriage(organizationId: string, msg: MailMessage) {
    await this.prisma.emailTriage.create({
      data: {
        organizationId,
        internetMessageId: msg.internetMessageId,
        conversationId: msg.conversationId,
        subject: msg.subject,
        fromAddress: msg.fromAddress,
        fromName: msg.fromName,
        receivedAt: new Date(msg.receivedDateTime),
        bodyPreview: msg.bodyPreview,
        webLink: msg.webLink
      }
    })
  }

  // ── Triage actions (org-scoped) ───────────────────────────────────────────
  listTriage(organizationId: string) {
    return this.prisma.emailTriage.findMany({
      where: { organizationId, status: "PENDING" },
      orderBy: { receivedAt: "desc" }
    })
  }

  // Assign an unmatched email to a client (+ optional contact): files the
  // Activity under that client and resolves the triage row.
  async assignTriage(organizationId: string, triageId: string, dto: { clientId: string; contactId?: string }) {
    const row = await this.prisma.emailTriage.findFirst({ where: { id: triageId, organizationId } })
    if (!row) throw new NotFoundException("Triage item not found")
    if (row.status !== "PENDING") throw new BadRequestException("Already handled")

    const client = await this.prisma.client.findFirst({ where: { id: dto.clientId, organizationId }, select: { id: true } })
    if (!client) throw new BadRequestException("Client is invalid for this organization")
    if (dto.contactId) {
      const c = await this.prisma.contact.findFirst({ where: { id: dto.contactId, clientId: dto.clientId }, select: { id: true } })
      if (!c) throw new BadRequestException("Contact is invalid for the chosen client")
    }

    const activity = await this.prisma.activity.create({
      data: {
        clientId: dto.clientId,
        type: "EMAIL",
        source: "EMAIL_SYNC",
        subject: row.subject,
        body: row.bodyPreview,
        occurredAt: row.receivedAt,
        emailMessageId: row.internetMessageId,
        emailConversationId: row.conversationId,
        contacts: dto.contactId ? { create: [{ contactId: dto.contactId }] } : undefined
      }
    })
    await this.prisma.emailTriage.update({ where: { id: row.id }, data: { status: "RESOLVED", resolvedActivityId: activity.id } })
    return activity
  }

  async dismissTriage(organizationId: string, triageId: string) {
    const row = await this.prisma.emailTriage.findFirst({ where: { id: triageId, organizationId } })
    if (!row) throw new NotFoundException("Triage item not found")
    return this.prisma.emailTriage.update({ where: { id: row.id }, data: { status: "DISMISSED" } })
  }
}
