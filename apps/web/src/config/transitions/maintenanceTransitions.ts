import type { Transition } from "../../components/detail"

// TODO: verify against backend enum
// MaintenanceDetailPage.tsx has no STATUS_FLOW — maintenance records currently
// model "work performed" rather than a lifecycle. Using ITIL-aligned defaults
// for planned maintenance until the backend exposes a real enum.
// PLANNED → SCHEDULED → IN_PROGRESS → COMPLETED → CLOSED  (Side: CANCELLED)
export const transitions: Transition[] = [
  {
    from: "PLANNED",
    to: "SCHEDULED",
    label: "Schedule",
    color: "primary",
    requiresDialog: true,
    dialogFields: [
      { key: "scheduledAt", label: "Scheduled date/time", type: "text", required: true },
    ],
  },
  {
    from: "PLANNED",
    to: "CANCELLED",
    label: "Cancel",
    color: "error",
    requiresDialog: true,
    dialogFields: [
      { key: "reason", label: "Cancellation reason", type: "textarea", required: true },
    ],
  },
  {
    from: "SCHEDULED",
    to: "IN_PROGRESS",
    label: "Start",
    color: "primary",
    requiresDialog: false,
  },
  {
    from: "SCHEDULED",
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
    label: "Complete",
    color: "success",
    requiresDialog: true,
    dialogFields: [
      { key: "summary", label: "Work performed", type: "textarea", required: true },
      { key: "nextDueAt", label: "Next due (optional)", type: "text", required: false },
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
