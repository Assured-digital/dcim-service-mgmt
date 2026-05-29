import type { Transition } from "../../components/detail"

// Status enum source: apps/web/src/routes/RiskDetailPage.tsx STATUS_FLOW
// IDENTIFIED → ASSESSED → MITIGATING ↔ ACCEPTED → CLOSED
export const transitions: Transition[] = [
  {
    from: "IDENTIFIED",
    to: "ASSESSED",
    label: "Mark assessed",
    color: "primary",
    requiresDialog: true,
    dialogFields: [
      { key: "likelihood", label: "Likelihood", type: "select", required: true,
        options: ["LOW", "MEDIUM", "HIGH"] },
      { key: "impact", label: "Impact", type: "select", required: true,
        options: ["LOW", "MEDIUM", "HIGH"] },
      { key: "notes", label: "Assessment notes", type: "textarea", required: false },
    ],
  },
  {
    from: "IDENTIFIED",
    to: "CLOSED",
    label: "Close",
    color: "error",
    requiresDialog: true,
    dialogFields: [
      { key: "reason", label: "Reason for closing", type: "textarea", required: true },
    ],
  },
  {
    from: "ASSESSED",
    to: "MITIGATING",
    label: "Start mitigation",
    color: "warning",
    requiresDialog: true,
    dialogFields: [
      { key: "plan", label: "Mitigation plan", type: "textarea", required: true },
    ],
  },
  {
    from: "ASSESSED",
    to: "ACCEPTED",
    label: "Accept",
    color: "primary",
    requiresDialog: true,
    dialogFields: [
      { key: "rationale", label: "Acceptance rationale", type: "textarea", required: true },
    ],
  },
  {
    from: "ASSESSED",
    to: "CLOSED",
    label: "Close",
    color: "error",
    requiresDialog: true,
    dialogFields: [
      { key: "reason", label: "Reason for closing", type: "textarea", required: true },
    ],
  },
  {
    from: "MITIGATING",
    to: "ASSESSED",
    label: "Reassess",
    color: "warning",
    requiresDialog: false,
  },
  {
    from: "MITIGATING",
    to: "ACCEPTED",
    label: "Accept",
    color: "primary",
    requiresDialog: true,
    dialogFields: [
      { key: "rationale", label: "Acceptance rationale", type: "textarea", required: true },
    ],
  },
  {
    from: "MITIGATING",
    to: "CLOSED",
    label: "Close",
    color: "success",
    requiresDialog: true,
    dialogFields: [
      { key: "outcome", label: "Mitigation outcome", type: "textarea", required: true },
    ],
  },
  {
    from: "ACCEPTED",
    to: "MITIGATING",
    label: "Start mitigating",
    color: "warning",
    requiresDialog: true,
    dialogFields: [
      { key: "plan", label: "Mitigation plan", type: "textarea", required: true },
    ],
  },
  {
    from: "ACCEPTED",
    to: "CLOSED",
    label: "Close",
    color: "primary",
    requiresDialog: false,
  },
]
