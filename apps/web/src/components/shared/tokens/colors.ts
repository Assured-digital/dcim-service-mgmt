export type SemanticIntent =
  | "success" | "active" | "warning" | "danger" | "neutral" | "info"

export const uiText = {
  primary: "#0f172a",
  secondary: "#475569",
  muted: "#64748b",
  subtle: "#94a3b8",
  inverse: "#e2e8f0",
} as const

export const uiSurface = {
  app: "#f8fafc",
  card: "#ffffff",
  soft: "#f8fafc",
  subtle: "#f1f5f9",
  accentSoft: "#e8f1ff",
} as const

export const uiBorder = {
  default: "#e2e8f0",
  subtle: "#f1f5f9",
  strong: "#cbd5e1",
} as const

// Status has ONE intent→hue mapping exposed at TWO scales:
//  - `bg` + `text`: the soft PASTEL scale — a light tinted fill with a darker,
//    same-hue text/icon, so state is legible without shouting. Used by every
//    LABELLED status surface (Tasks pill, detail pill, queue table StatusPill,
//    Risks/Issues, filter chips) via resolveIntent / chipSx / statusColors.
//  - `solid`: the SATURATED scale — a single deep, fully-saturated colour (the
//    pre-pastel status fills, recovered from git history) for tiny standalone
//    GLYPHS with no adjacent label, where the pastel fill is too washed out to
//    tell intents apart. Used by the Service Desk queue-rail status dot via
//    statusSolid(). At ~8px the soft fill is near-invisible between intents; the
//    solid value keeps New/Investigating/Mitigated/Resolved/Closed distinct.
// This is the single source of truth — pills stay soft, only the rail dot is solid.
export const semanticTokens: Record<SemanticIntent, { bg: string; text: string; solid: string }> = {
  success: { bg: "#dcfce7", text: "#16a34a", solid: "#15803d" }, // green — resolved / done / completed
  active:  { bg: "#dbeafe", text: "#1d4ed8", solid: "#1d4ed8" }, // blue  — in progress / assigned
  warning: { bg: "#fef3c7", text: "#b45309", solid: "#b45309" }, // amber — waiting / pending
  danger:  { bg: "#fee2e2", text: "#dc2626", solid: "#b91c1c" }, // red   — blocked / cancelled / overdue
  neutral: { bg: "#e2e8f0", text: "#475569", solid: "#475569" }, // slate — new / open / closed (terminal)
  info:    { bg: "#dbeafe", text: "#1d4ed8", solid: "#1d4ed8" }, // blue  — mirrors active
}

export type RAGLevel = "RED" | "AMBER" | "GREEN"

export const ragTokens: Record<RAGLevel, { bg: string; text: string; dot: string }> = {
  RED:   { bg: "#fee2e2", text: "#b91c1c", dot: "#ef4444" },
  AMBER: { bg: "#fef3c7", text: "#b45309", dot: "#f59e0b" },
  GREEN: { bg: "#dcfce7", text: "#15803d", dot: "#22c55e" },
}

export const priorityDots: Record<string, string> = {
  low:      "#94a3b8",
  medium:   "#f59e0b",
  high:     "#ef4444",
  critical: "#7c3aed"
}

// Priority pastel ramp — a true 4-step low -> critical scale (green/amber/orange/
// red), used by the shared PriorityPill. This is the SAME scheme the detail pages
// already render for priority, so a priority is the same colour on a list pill as
// on a detail chip. Distinct from semanticTokens (status) and from the solid
// priorityDots (the compact leading dots). This is the single source of truth for
// priority-pill colour — read it via priorityToken().
export const priorityTokens: Record<string, { bg: string; text: string }> = {
  low:      { bg: "#dcfce7", text: "#15803d" }, // green
  medium:   { bg: "#fef3c7", text: "#b45309" }, // amber
  high:     { bg: "#ffedd5", text: "#c2410c" }, // orange
  critical: { bg: "#fee2e2", text: "#b91c1c" }, // red
}

// Semantic status -> intent. First match wins, so order matters:
//  - danger before success/active so CANCELLED/REJECTED/BLOCKED win.
//  - success keys are terminal-good (RESOLVED/COMPLETED/DONE/MITIGATED/ACCEPTED);
//    CLOSED is intentionally NOT here -> falls through to neutral (terminal, not "good").
//  - warning = waiting/paused (WAITING/PENDING/ASSESSED).
//  - active = being worked (IN_PROGRESS/ASSIGNED/INVESTIGATING/MITIGATING/SUBMITTED/APPROVED).
//  - neutral = not started / terminal-closed (NEW/DRAFT/OPEN/IDENTIFIED/PLANNED/SCHEDULED/CLOSED).
// RAG/priority keywords (RED/AMBER/GREEN/HIGH/MEDIUM/CRITICAL) are kept as a safety net
// so any chipSx call on those still resolves sensibly.
export function resolveIntent(value: string): SemanticIntent {
  const v = value.toUpperCase()
  if (["OVERDUE","FAIL","CANCELLED","REJECTED","BLOCKED","RED","CRITICAL","HIGH"].some(k => v.includes(k)))
    return "danger"
  if (["RESOLVED","COMPLETED","DONE","MITIGATED","ACCEPTED","PASS","GREEN"].some(k => v.includes(k)))
    return "success"
  if (["WAITING","PENDING","ASSESSED","ON_HOLD","AMBER","MEDIUM"].some(k => v.includes(k)))
    return "warning"
  if (["IN_PROGRESS","ASSIGNED","INVESTIGATING","MITIGATING","ACTIVE","SUBMITTED","APPROVED"].some(k => v.includes(k)))
    return "active"
  if (["NEW","DRAFT","OPEN","IDENTIFIED","PLANNED","SCHEDULED","CLOSED"].some(k => v.includes(k)))
    return "neutral"
  return "neutral"
}

// ── Extended tokens for Service Desk mid-fi ────────────────────────────────
// Slate scale mirroring the polished design's --s-* custom properties.
export const slate = {
  50:  "#f8fafc",
  100: "#f1f5f9",
  200: "#e2e8f0",
  300: "#cbd5e1",
  400: "#94a3b8",
  500: "#64748b",
  600: "#475569",
  700: "#334155",
  800: "#1e293b",
  900: "#0f172a",
} as const

// Dark operator shell tokens (sidebar, topbar).
export const shellTokens = {
  bg: "#0d1526",
  top: "#080f1e",
  divider: "rgba(255,255,255,0.06)",
  hover: "rgba(255,255,255,0.04)",
  selected: "rgba(59,130,246,0.15)",
  text: "#a3b4c9",
  bright: "#e2e8f0",
  mute: "#64748b",
} as const

export const radii = {
  xs: 4, sm: 6, md: 8, lg: 12, pill: 999,
} as const

// Shared pill radius — the status pill and the priority pill use ONE value (the
// app's ~6px baseline), so they match each other and the surrounding UI rather
// than the old fully-rounded lozenge. Reduce/raise here and both pills follow.
export const PILL_RADIUS = radii.sm

export const shadows = {
  card: "0 10px 28px rgba(15,23,42,0.06)",
  hover: "0 2px 8px rgba(15,23,42,0.06)",
} as const

// Type-badge colours for SR / INC / CHG / RSK / ISS / TASK. (TASK has no list
// indicator; its colour mirrors the detail-page TASK_TYPE_BADGE so Task keeps one
// identity colour — used full-label in the detail-panel "Type" row.)
export const typeBadgeTokens = {
  SR:   { bg: "#e0f2fe", text: "#075985" },
  INC:  { bg: "#fee2e2", text: "#b91c1c" },
  CHG:  { bg: "#f3e8ff", text: "#6b21a8" },
  RSK:  { bg: "#fef3c7", text: "#b45309" },
  ISS:  { bg: "#fce7f3", text: "#be185d" },
  TASK: { bg: "#eeedfe", text: "#3c3489" },
} as const

export function chipSx(value: string) {
  const { bg, text } = semanticTokens[resolveIntent(value)]
  return { bgcolor: bg, color: text, fontWeight: 700 }
}

// Status fill + text for non-chip status indicators (e.g. the detail status pill
// and StatusPopover icon squares). Resolves to the same deepened tokens as chipSx,
// so a given status is the same colour everywhere it appears.
export function statusColors(value: string): { bg: string; text: string } {
  return semanticTokens[resolveIntent(value)]
}

// Saturated status colour for tiny standalone glyphs (the queue-rail status dot),
// where the pastel `bg` washes out at ~8px. Same intent mapping as statusColors —
// only the scale differs (solid vs soft). Do NOT use for pills; they stay pastel.
export function statusSolid(value: string): string {
  return semanticTokens[resolveIntent(value)].solid
}

export function priorityDot(priority: string): string {
  return priorityDots[priority.toLowerCase()] ?? "#94a3b8"
}

// Priority pastel fill + text for the shared PriorityPill. Resolves to the 4-step
// priorityTokens ramp; unknown values fall back to medium.
export function priorityToken(priority: string): { bg: string; text: string } {
  return priorityTokens[priority.toLowerCase()] ?? priorityTokens.medium
}

export function statusSelectSx(minWidth = 180) {
  return {
    minWidth,
    "& .MuiInputLabel-root": {
      display: "none",
    },
    "& .MuiOutlinedInput-root": {
      height: 32,
      borderRadius: 999,
      bgcolor: "#ffffff",
      fontSize: 12,
      fontWeight: 600,
      color: "#334155",
      "& fieldset": {
        borderColor: "#cbd5e1",
      },
      "&:hover fieldset": {
        borderColor: "#94a3b8",
      },
      "&.Mui-focused fieldset": {
        borderColor: "#64748b",
      },
    },
    "& .MuiSelect-select": {
      py: "6px !important",
      pl: "10px !important",
      pr: "28px !important",
      display: "flex",
      alignItems: "center",
    },
    "& .MuiSvgIcon-root": {
      color: "#64748b",
      fontSize: 18,
    },
  }
}