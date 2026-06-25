import { BadRequestException, Injectable } from "@nestjs/common";
import { ServiceRequestsService } from "../service-requests/service-requests.service";
import { IncidentsService } from "../incidents/incidents.service";
import { ChangesService } from "../changes/changes.service";
import { RisksService } from "../risks/risks.service";
import { IssuesService } from "../issues/issues.service";
import { TasksService } from "../tasks/tasks.service";
import { AttachmentsService } from "../attachments/attachments.service";
import { assemblePhotos, renderToBuffer } from "../common/reporting/assemble-photos";
import { fmtDate, fmtDateTime } from "../common/reporting/report-kit";
import {
  buildRecordReportPdf,
  RecordReportModel
} from "../common/reporting/record-report-pdf";

// The six exportable work-item types. The string literals are the on-the-wire contract
// with the frontend (GET /records/:type/:id/report.pdf) — they mirror LINK_RECORD_TYPES.
export const RECORD_REPORT_TYPES = [
  "service_request",
  "incident",
  "change",
  "risk",
  "issue",
  "task"
] as const;

export type RecordReportType = (typeof RECORD_REPORT_TYPES)[number];

export function isRecordReportType(value: unknown): value is RecordReportType {
  return typeof value === "string" && (RECORD_REPORT_TYPES as readonly string[]).includes(value);
}

// ── Mapping helpers ───────────────────────────────────────────────────────────────────

function toIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

// Free-form status/priority/severity values are stored enum-style (e.g. "IN_PROGRESS",
// "medium"). Humanise to sentence case for display ("In progress", "Medium") — generic so
// it tolerates every type's value set without a per-type label map to drift.
function humanize(v: string | null | undefined): string {
  if (!v) return "—";
  return v.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function assigneeName(rec: { assignee?: { displayName: string } | null }): string {
  return rec.assignee?.displayName ?? "Unassigned";
}
// Takes the resolved creator value directly (not the record) — Task has no createdBy field
// at all, so it passes the literal "—" rather than a property TS would reject.
function creatorName(createdBy: { displayName: string } | null | undefined): string {
  return createdBy?.displayName ?? "—";
}
function mapLinks(rec: { links?: { reference: string; title: string; status: string }[] }) {
  return (rec.links ?? []).map((l) => ({ ref: l.reference, title: l.title, status: humanize(l.status) }));
}

// The per-type model fragment (everything except the attachments — resolved separately from
// already-fetched bytes — and generatedAt, stamped at render time).
type RecordBase = Omit<RecordReportModel, "attachments" | "generatedAt">;

type SRRecord = Awaited<ReturnType<ServiceRequestsService["getForClient"]>>;
type IncidentRecord = Awaited<ReturnType<IncidentsService["getForClient"]>>;
type ChangeRecord = Awaited<ReturnType<ChangesService["getForClient"]>>;
type RiskRecord = Awaited<ReturnType<RisksService["getForClient"]>>;
type IssueRecord = Awaited<ReturnType<IssuesService["getForClient"]>>;
type TaskRecord = Awaited<ReturnType<TasksService["getForClient"]>>;

function mapServiceRequest(sr: SRRecord): RecordBase {
  const statusLabel = humanize(sr.status);
  return {
    brand: "ASSURED DIGITAL · SERVICE REQUEST",
    reference: sr.reference,
    title: sr.subject,
    statusLabel,
    subtitle: `${sr.reference}   ·   ${statusLabel}   ·   Service Request`,
    metaPairs: [
      ["Priority", humanize(sr.priority)],
      ["Assignee", assigneeName(sr)],
      ["Submitted by", creatorName(sr.createdBy)],
      ["Created", fmtDate(toIso(sr.createdAt))],
      ["Updated", fmtDate(toIso(sr.updatedAt))]
    ],
    sections: [
      { heading: "Description", body: sr.description },
      { heading: "Closure summary", body: sr.closureSummary }
    ],
    linkedRecords: mapLinks(sr)
  };
}

function mapIncident(i: IncidentRecord): RecordBase {
  const statusLabel = humanize(i.status);
  return {
    brand: "ASSURED DIGITAL · INCIDENT",
    reference: i.reference,
    title: i.title,
    statusLabel,
    subtitle: `${i.reference}   ·   ${statusLabel}   ·   Incident`,
    metaPairs: [
      ["Severity", humanize(i.severity)],
      ["Priority", humanize(i.priority)],
      ["Assignee", assigneeName(i)],
      ["Submitted by", creatorName(i.createdBy)],
      ["Created", fmtDate(toIso(i.createdAt))],
      ["Updated", fmtDate(toIso(i.updatedAt))]
    ],
    sections: [{ heading: "Description", body: i.description }],
    linkedRecords: mapLinks(i)
  };
}

function mapChange(ch: ChangeRecord): RecordBase {
  const statusLabel = humanize(ch.status);
  const approvalsBody = ch.approvals.length
    ? ch.approvals
        .map(
          (a) =>
            `${humanize(a.decision)} — ${a.approver?.displayName ?? "—"} (${fmtDate(toIso(a.decidedAt))})` +
            (a.notes?.trim() ? `\n${a.notes.trim()}` : "")
        )
        .join("\n\n")
    : null;
  return {
    brand: "ASSURED DIGITAL · CHANGE REQUEST",
    reference: ch.reference,
    title: ch.title,
    statusLabel,
    subtitle: `${ch.reference}   ·   ${statusLabel}   ·   Change`,
    metaPairs: [
      ["Type", humanize(ch.changeType)],
      ["Priority", humanize(ch.priority)],
      ["Assignee", assigneeName(ch)],
      ["Submitted by", creatorName(ch.createdBy)],
      ["Scheduled start", fmtDateTime(toIso(ch.scheduledStart))],
      ["Scheduled end", fmtDateTime(toIso(ch.scheduledEnd))],
      ["Actual start", fmtDateTime(toIso(ch.actualStart))],
      ["Actual end", fmtDateTime(toIso(ch.actualEnd))]
    ],
    sections: [
      { heading: "Description", body: ch.description },
      { heading: "Reason", body: ch.reason },
      { heading: "Impact assessment", body: ch.impactAssessment },
      { heading: "Rollback plan", body: ch.rollbackPlan },
      { heading: "Implementation notes", body: ch.implementationNotes },
      { heading: "Post-implementation review", body: ch.postImplReview },
      { heading: "Approvals", body: approvalsBody }
    ],
    linkedRecords: mapLinks(ch)
  };
}

function mapRisk(r: RiskRecord): RecordBase {
  const statusLabel = humanize(r.status);
  return {
    brand: "ASSURED DIGITAL · RISK",
    reference: r.reference,
    title: r.title,
    statusLabel,
    subtitle: `${r.reference}   ·   ${statusLabel}   ·   Risk`,
    metaPairs: [
      ["Likelihood", humanize(r.likelihood)],
      ["Impact", humanize(r.impact)],
      ["Assignee", assigneeName(r)],
      ["Submitted by", creatorName(r.createdBy)],
      ["Source", r.source?.trim() ? r.source : "—"],
      ["Review date", fmtDate(toIso(r.reviewDate))]
    ],
    sections: [
      { heading: "Description", body: r.description },
      { heading: "Mitigation plan", body: r.mitigationPlan },
      { heading: "Acceptance note", body: r.acceptanceNote }
    ],
    linkedRecords: mapLinks(r)
  };
}

function mapIssue(is: IssueRecord): RecordBase {
  const statusLabel = humanize(is.status);
  return {
    brand: "ASSURED DIGITAL · ISSUE",
    reference: is.reference,
    title: is.title,
    statusLabel,
    subtitle: `${is.reference}   ·   ${statusLabel}   ·   Issue`,
    metaPairs: [
      ["Severity", humanize(is.severity)],
      ["Assignee", assigneeName(is)],
      ["Submitted by", creatorName(is.createdBy)],
      ["Created", fmtDate(toIso(is.createdAt))],
      ["Review date", fmtDate(toIso(is.reviewDate))]
    ],
    sections: [
      { heading: "Description", body: is.description },
      { heading: "Resolution", body: is.resolution }
    ],
    linkedRecords: mapLinks(is)
  };
}

function mapTask(t: TaskRecord): RecordBase {
  const statusLabel = humanize(t.status);
  return {
    brand: "ASSURED DIGITAL · TASK",
    reference: t.reference,
    title: t.title,
    statusLabel,
    subtitle: `${t.reference}   ·   ${statusLabel}   ·   Task`,
    metaPairs: [
      ["Priority", humanize(t.priority)],
      ["Assignee", assigneeName(t)],
      // Task has no resolved createdBy (its getForClient omits it) — show the "—" fallback.
      ["Submitted by", "—"],
      ["Due", fmtDate(toIso(t.dueAt))],
      ["Parent incident", t.incident?.reference ?? "—"],
      ["Created", fmtDate(toIso(t.createdAt))]
    ],
    sections: [{ heading: "Description", body: t.description }],
    linkedRecords: mapLinks(t)
  };
}

// What buildRecord returns: the file-name prefix, the per-type base model, and the resolved
// attachment summaries (their bytes are fetched in generatePdf via the tenant-scoped path).
type BuiltRecord = {
  prefix: string;
  base: RecordBase;
  attachments: SRRecord["attachments"];
};

@Injectable()
export class RecordReportService {
  constructor(
    private serviceRequests: ServiceRequestsService,
    private incidents: IncidentsService,
    private changes: ChangesService,
    private risks: RisksService,
    private issues: IssuesService,
    private tasks: TasksService,
    private attachments: AttachmentsService
  ) {}

  // Generate the export PDF for one record. ALL data flows through clientId-scoped paths:
  // each getForClient uses where: { id, clientId } (so a cross-client id 404s), and every
  // embedded image byte is fetched via AttachmentsService.openForDownload(clientId, …)
  // which re-checks where: { id, clientId }. No status gating — any record is exportable.
  async generatePdf(
    type: RecordReportType,
    clientId: string,
    id: string
  ): Promise<{ filename: string; buffer: Buffer }> {
    const built = await this.buildRecord(type, clientId, id);
    const attachments = await assemblePhotos(this.attachments, clientId, built.attachments);
    const model: RecordReportModel = {
      ...built.base,
      attachments,
      generatedAt: new Date().toISOString()
    };
    const buffer = await renderToBuffer(buildRecordReportPdf(model));
    return { filename: `${built.prefix}-${built.base.reference}.pdf`, buffer };
  }

  // Fetch the record (client-scoped) and map it to the uniform model. The switch keeps each
  // case fully typed against its service's concrete return shape.
  private async buildRecord(type: RecordReportType, clientId: string, id: string): Promise<BuiltRecord> {
    switch (type) {
      case "service_request": {
        const sr = await this.serviceRequests.getForClient(clientId, id);
        return { prefix: "service-request", base: mapServiceRequest(sr), attachments: sr.attachments };
      }
      case "incident": {
        const i = await this.incidents.getForClient(clientId, id);
        return { prefix: "incident", base: mapIncident(i), attachments: i.attachments };
      }
      case "change": {
        const ch = await this.changes.getForClient(clientId, id);
        return { prefix: "change", base: mapChange(ch), attachments: ch.attachments };
      }
      case "risk": {
        const r = await this.risks.getForClient(clientId, id);
        return { prefix: "risk", base: mapRisk(r), attachments: r.attachments };
      }
      case "issue": {
        const is = await this.issues.getForClient(clientId, id);
        return { prefix: "issue", base: mapIssue(is), attachments: is.attachments };
      }
      case "task": {
        const t = await this.tasks.getForClient(clientId, id);
        return { prefix: "task", base: mapTask(t), attachments: t.attachments };
      }
      default: {
        // Exhaustiveness guard — a new RecordReportType must add a case above.
        const _never: never = type;
        throw new BadRequestException(`Unsupported record type: ${String(_never)}`);
      }
    }
  }
}
