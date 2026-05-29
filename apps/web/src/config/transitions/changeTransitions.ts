import type { Transition } from "../../components/detail"

// Status enum source: apps/web/src/routes/ChangeDetailPage.tsx STATUS_FLOW
// DRAFT → SUBMITTED → PENDING_APPROVAL → APPROVED → IN_PROGRESS → COMPLETED → CLOSED
// Side: REJECTED, CANCELLED
export const transitions: Transition[] = [
  {
    from: "DRAFT",
    to: "SUBMITTED",
    label: "Submit",
    color: "primary",
    requiresDialog: false,
  },
  {
    from: "DRAFT",
    to: "CANCELLED",
    label: "Cancel",
    color: "error",
    requiresDialog: true,
    dialogFields: [
      { key: "reason", label: "Cancellation reason", type: "textarea", required: true },
    ],
  },
  {
    from: "SUBMITTED",
    to: "PENDING_APPROVAL",
    label: "Send for approval",
    color: "primary",
    requiresDialog: false,
  },
  {
    from: "SUBMITTED",
    to: "CANCELLED",
    label: "Cancel",
    color: "error",
    requiresDialog: true,
    dialogFields: [
      { key: "reason", label: "Cancellation reason", type: "textarea", required: true },
    ],
  },
  {
    from: "PENDING_APPROVAL",
    to: "APPROVED",
    label: "Approve",
    color: "success",
    requiresDialog: true,
    dialogFields: [
      { key: "comment", label: "Approval comment", type: "textarea", required: false },
    ],
  },
  {
    from: "PENDING_APPROVAL",
    to: "REJECTED",
    label: "Reject",
    color: "error",
    requiresDialog: true,
    dialogFields: [
      { key: "reason", label: "Rejection reason", type: "textarea", required: true },
    ],
  },
  {
    from: "PENDING_APPROVAL",
    to: "CANCELLED",
    label: "Cancel",
    color: "error",
    requiresDialog: true,
    dialogFields: [
      { key: "reason", label: "Cancellation reason", type: "textarea", required: true },
    ],
  },
  {
    from: "APPROVED",
    to: "IN_PROGRESS",
    label: "Start implementation",
    color: "primary",
    requiresDialog: false,
  },
  {
    from: "APPROVED",
    to: "CANCELLED",
    label: "Cancel",
    color: "error",
    requiresDialog: true,
    dialogFields: [
      { key: "reason", label: "Cancellation reason", type: "textarea", required: true },
    ],
  },
  {
    from: "REJECTED",
    to: "DRAFT",
    label: "Return to draft",
    color: "warning",
    requiresDialog: false,
  },
  {
    from: "REJECTED",
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
    to: "COMPLETED",
    label: "Mark completed",
    color: "success",
    requiresDialog: true,
    dialogFields: [
      { key: "summary", label: "Implementation summary", type: "textarea", required: true },
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
    from: "COMPLETED",
    to: "CLOSED",
    label: "Close",
    color: "primary",
    requiresDialog: false,
  },
]
