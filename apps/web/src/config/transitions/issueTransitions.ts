import type { Transition } from "../../components/detail"

// Status enum source: apps/web/src/routes/IssueDetailPage.tsx STATUS_FLOW
// OPEN → IN_PROGRESS → RESOLVED → CLOSED  (RESOLVED can revert to IN_PROGRESS)
export const transitions: Transition[] = [
  {
    from: "OPEN",
    to: "IN_PROGRESS",
    label: "Start work",
    color: "primary",
    requiresDialog: false,
  },
  {
    from: "OPEN",
    to: "CLOSED",
    label: "Close",
    color: "error",
    requiresDialog: true,
    dialogFields: [
      { key: "reason", label: "Reason for closing", type: "textarea", required: true },
    ],
  },
  {
    from: "IN_PROGRESS",
    to: "OPEN",
    label: "Pause",
    color: "warning",
    requiresDialog: false,
  },
  {
    from: "IN_PROGRESS",
    to: "RESOLVED",
    label: "Resolve",
    color: "success",
    requiresDialog: true,
    dialogFields: [
      { key: "resolution", label: "Resolution summary", type: "textarea", required: true },
    ],
  },
  {
    from: "IN_PROGRESS",
    to: "CLOSED",
    label: "Close",
    color: "error",
    requiresDialog: true,
    dialogFields: [
      { key: "reason", label: "Reason for closing", type: "textarea", required: true },
    ],
  },
  {
    from: "RESOLVED",
    to: "IN_PROGRESS",
    label: "Reopen",
    color: "warning",
    requiresDialog: true,
    dialogFields: [
      { key: "reason", label: "Reason for reopening", type: "textarea", required: true },
    ],
  },
  {
    from: "RESOLVED",
    to: "CLOSED",
    label: "Close",
    color: "primary",
    requiresDialog: false,
  },
]
