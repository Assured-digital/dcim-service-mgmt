import type { Transition } from "../../components/detail"

// Status enum source: apps/web/src/routes/CheckDetailPage.tsx STATUS_ALL
// DRAFT → SCHEDULED → ASSIGNED → IN_PROGRESS → PENDING_REVIEW → COMPLETED
// STATUS_LABELS also references CLOSED and CANCELLED but they are not in
// STATUS_ALL — leaving them out of the flow.
// TODO: verify against backend enum — CheckDetailPage has no STATUS_FLOW table,
// so the edges below are inferred from the linear order of STATUS_ALL.
export const transitions: Transition[] = [
  {
    from: "DRAFT",
    to: "SCHEDULED",
    label: "Schedule",
    color: "primary",
    requiresDialog: true,
    dialogFields: [
      { key: "scheduledAt", label: "Scheduled date/time", type: "text", required: true },
    ],
  },
  {
    from: "SCHEDULED",
    to: "ASSIGNED",
    label: "Assign",
    color: "primary",
    requiresDialog: true,
    dialogFields: [
      { key: "assigneeId", label: "Assignee", type: "assignee", required: true },
    ],
  },
  {
    from: "ASSIGNED",
    to: "IN_PROGRESS",
    label: "Start",
    color: "primary",
    requiresDialog: false,
  },
  {
    from: "IN_PROGRESS",
    to: "PENDING_REVIEW",
    label: "Submit for review",
    color: "warning",
    requiresDialog: false,
  },
  {
    from: "PENDING_REVIEW",
    to: "IN_PROGRESS",
    label: "Send back",
    color: "warning",
    requiresDialog: true,
    dialogFields: [
      { key: "reason", label: "Why is rework needed?", type: "textarea", required: true },
    ],
  },
  {
    from: "PENDING_REVIEW",
    to: "COMPLETED",
    label: "Approve",
    color: "success",
    requiresDialog: true,
    dialogFields: [
      { key: "comment", label: "Review comment", type: "textarea", required: false },
    ],
  },
]
