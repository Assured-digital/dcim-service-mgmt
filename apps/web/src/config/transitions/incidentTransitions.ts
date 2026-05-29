import type { Transition } from "../../components/detail"

// Status enum source: apps/web/src/routes/IncidentDetailPage.tsx STATUS_FLOW
// NEW → INVESTIGATING → MITIGATED → RESOLVED → CLOSED
export const transitions: Transition[] = [
  {
    from: "NEW",
    to: "INVESTIGATING",
    label: "Start investigating",
    color: "primary",
    requiresDialog: false,
  },
  {
    from: "NEW",
    to: "CLOSED",
    label: "Close",
    color: "error",
    requiresDialog: true,
    dialogFields: [
      {
        key: "reason",
        label: "Reason for closing",
        type: "textarea",
        required: true,
      },
    ],
  },
  {
    from: "INVESTIGATING",
    to: "MITIGATED",
    label: "Mark mitigated",
    color: "warning",
    requiresDialog: true,
    dialogFields: [
      {
        key: "mitigation",
        label: "Mitigation summary",
        type: "textarea",
        required: true,
      },
    ],
  },
  {
    from: "INVESTIGATING",
    to: "RESOLVED",
    label: "Resolve",
    color: "success",
    requiresDialog: true,
    dialogFields: [
      {
        key: "resolution",
        label: "Resolution summary",
        type: "textarea",
        required: true,
      },
    ],
  },
  {
    from: "INVESTIGATING",
    to: "CLOSED",
    label: "Close",
    color: "error",
    requiresDialog: true,
    dialogFields: [
      {
        key: "reason",
        label: "Reason for closing",
        type: "textarea",
        required: true,
      },
    ],
  },
  {
    from: "MITIGATED",
    to: "INVESTIGATING",
    label: "Reopen investigation",
    color: "warning",
    requiresDialog: false,
  },
  {
    from: "MITIGATED",
    to: "RESOLVED",
    label: "Resolve",
    color: "success",
    requiresDialog: true,
    dialogFields: [
      {
        key: "resolution",
        label: "Resolution summary",
        type: "textarea",
        required: true,
      },
    ],
  },
  {
    from: "MITIGATED",
    to: "CLOSED",
    label: "Close",
    color: "error",
    requiresDialog: true,
    dialogFields: [
      {
        key: "reason",
        label: "Reason for closing",
        type: "textarea",
        required: true,
      },
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
