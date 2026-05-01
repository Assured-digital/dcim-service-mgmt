import type { Transition } from "../../components/detail"

// Status enum source: apps/web/src/routes/TaskDetailPage.tsx STATUS_FLOW
// OPEN ↔ IN_PROGRESS ↔ BLOCKED → DONE → (reopen) OPEN
export const transitions: Transition[] = [
  {
    from: "OPEN",
    to: "IN_PROGRESS",
    label: "Start",
    color: "primary",
    requiresDialog: false,
  },
  {
    from: "OPEN",
    to: "BLOCKED",
    label: "Block",
    color: "warning",
    requiresDialog: true,
    dialogFields: [
      { key: "reason", label: "Blocker", type: "textarea", required: true },
    ],
  },
  {
    from: "OPEN",
    to: "DONE",
    label: "Mark done",
    color: "success",
    requiresDialog: false,
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
    to: "BLOCKED",
    label: "Block",
    color: "warning",
    requiresDialog: true,
    dialogFields: [
      { key: "reason", label: "Blocker", type: "textarea", required: true },
    ],
  },
  {
    from: "IN_PROGRESS",
    to: "DONE",
    label: "Mark done",
    color: "success",
    requiresDialog: false,
  },
  {
    from: "BLOCKED",
    to: "OPEN",
    label: "Unblock",
    color: "primary",
    requiresDialog: false,
  },
  {
    from: "BLOCKED",
    to: "IN_PROGRESS",
    label: "Resume",
    color: "primary",
    requiresDialog: false,
  },
  {
    from: "BLOCKED",
    to: "DONE",
    label: "Mark done",
    color: "success",
    requiresDialog: false,
  },
  {
    from: "DONE",
    to: "OPEN",
    label: "Reopen",
    color: "warning",
    requiresDialog: true,
    dialogFields: [
      { key: "reason", label: "Reason for reopening", type: "textarea", required: true },
    ],
  },
]
