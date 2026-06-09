import type { Transition } from "../../components/detail"

// Status enum source: apps/web/src/routes/ServiceRequestDetailPage.tsx STATUS_FLOW
// NEW → ASSIGNED → IN_PROGRESS → WAITING_CUSTOMER → COMPLETED → CLOSED
// Side: CANCELLED
export const transitions: Transition[] = [
  {
    from: "NEW",
    to: "ASSIGNED",
    label: "Assign",
    color: "primary",
    requiresDialog: true,
    dialogFields: [
      { key: "assigneeId", label: "Assignee", type: "assignee", required: true },
    ],
  },
  {
    from: "NEW",
    to: "IN_PROGRESS",
    label: "Start work",
    color: "primary",
    requiresDialog: false,
  },
  {
    from: "NEW",
    to: "CANCELLED",
    label: "Cancel",
    color: "error",
    requiresDialog: true,
    dialogFields: [
      { key: "reason", label: "Cancellation reason", type: "textarea", required: true },
    ],
  },
  {
    from: "ASSIGNED",
    to: "IN_PROGRESS",
    label: "Start work",
    color: "primary",
    requiresDialog: false,
  },
  {
    from: "ASSIGNED",
    to: "WAITING_CUSTOMER",
    label: "Wait on customer",
    color: "warning",
    requiresDialog: true,
    dialogFields: [
      { key: "note", label: "What are we waiting for?", type: "textarea", required: true },
    ],
  },
  {
    from: "ASSIGNED",
    to: "CANCELLED",
    label: "Cancel",
    color: "error",
    requiresDialog: true,
    dialogFields: [
      { key: "reason", label: "Cancellation reason", type: "textarea", required: true },
    ],
  },
  {
    from: "IN_PROGRESS",
    to: "WAITING_CUSTOMER",
    label: "Wait on customer",
    color: "warning",
    requiresDialog: true,
    dialogFields: [
      { key: "note", label: "What are we waiting for?", type: "textarea", required: true },
    ],
  },
  {
    from: "IN_PROGRESS",
    to: "COMPLETED",
    label: "Mark completed",
    color: "success",
    requiresDialog: true,
    dialogFields: [
      { key: "resolution", label: "Resolution summary", type: "textarea", required: true },
    ],
  },
  {
    from: "IN_PROGRESS",
    to: "CANCELLED",
    label: "Cancel",
    color: "error",
    requiresDialog: true,
    dialogFields: [
      { key: "reason", label: "Cancellation reason", type: "textarea", required: true },
    ],
  },
  {
    from: "WAITING_CUSTOMER",
    to: "IN_PROGRESS",
    label: "Resume",
    color: "primary",
    requiresDialog: false,
  },
  {
    from: "WAITING_CUSTOMER",
    to: "COMPLETED",
    label: "Mark completed",
    color: "success",
    requiresDialog: true,
    dialogFields: [
      { key: "resolution", label: "Resolution summary", type: "textarea", required: true },
    ],
  },
  {
    from: "WAITING_CUSTOMER",
    to: "CANCELLED",
    label: "Cancel",
    color: "error",
    requiresDialog: true,
    dialogFields: [
      { key: "reason", label: "Cancellation reason", type: "textarea", required: true },
    ],
  },
  {
    from: "COMPLETED",
    to: "CLOSED",
    label: "Close",
    color: "primary",
    requiresDialog: false,
  },
]
