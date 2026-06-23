export type SemanticIntent =
  | "success" | "active" | "warning" | "danger" | "neutral" | "info" | "muted"

// ── Theme mode ──────────────────────────────────────────────────────────────
// The colour helpers below resolve against the ACTIVE theme mode. The mode is
// kept in sync by the ThemeModeProvider (src/lib/theme.tsx) calling
// setActiveThemeMode() inside the toggle handler — i.e. BEFORE the resulting
// re-render — so any component re-rendering on the theme swap reads the new mode.
// It defaults to "light", so any call before the provider mounts, and every call
// site not yet migrated to pass an explicit `mode`, behaves exactly as it always
// has. Every helper also takes an optional explicit `mode` (defaulting to the
// active mode) so later prompts can migrate call sites off the implicit default.
export type ThemeMode = "light" | "dark"

let activeThemeMode: ThemeMode = "light"
export function setActiveThemeMode(mode: ThemeMode): void { activeThemeMode = mode }
export function getActiveThemeMode(): ThemeMode { return activeThemeMode }

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
  // muted — a lighter slate than `neutral`, for EXPLICIT-only "not-yet-actioned"
  // states (e.g. a check item still Pending an answer). Deliberately NOT in the
  // resolveIntent keyword scan, so it never auto-resolves — pass intent="muted".
  muted:   { bg: "#f1f5f9", text: "#94a3b8", solid: "#94a3b8" },
}

// Dark counterpart of semanticTokens: same intent→hue mapping, re-scaled for a
// dark surface — a deep, low-luminance tinted `bg` with a light same-hue `text`
// (the inverse of the light pastel-fill / saturated-text pairing), and a brighter
// `solid` glyph colour that still reads at ~8px on a dark rail.
export const semanticTokensDark: Record<SemanticIntent, { bg: string; text: string; solid: string }> = {
  success: { bg: "#13351f", text: "#4ade80", solid: "#22c55e" }, // green
  active:  { bg: "#16294a", text: "#60a5fa", solid: "#3b82f6" }, // blue
  warning: { bg: "#3a2c0f", text: "#fbbf24", solid: "#f59e0b" }, // amber
  danger:  { bg: "#3a1a1a", text: "#f87171", solid: "#ef4444" }, // red
  neutral: { bg: "#1e293b", text: "#94a3b8", solid: "#94a3b8" }, // slate
  info:    { bg: "#16294a", text: "#60a5fa", solid: "#3b82f6" }, // blue — mirrors active
  muted:   { bg: "#172033", text: "#64748b", solid: "#64748b" },
}

const semanticByMode: Record<ThemeMode, Record<SemanticIntent, { bg: string; text: string; solid: string }>> = {
  light: semanticTokens,
  dark: semanticTokensDark,
}

export type RAGLevel = "RED" | "AMBER" | "GREEN"

export const ragTokens: Record<RAGLevel, { bg: string; text: string; dot: string }> = {
  RED:   { bg: "#fee2e2", text: "#b91c1c", dot: "#ef4444" },
  AMBER: { bg: "#fef3c7", text: "#b45309", dot: "#f59e0b" },
  GREEN: { bg: "#dcfce7", text: "#15803d", dot: "#22c55e" },
}

export const ragTokensDark: Record<RAGLevel, { bg: string; text: string; dot: string }> = {
  RED:   { bg: "#3a1a1a", text: "#f87171", dot: "#ef4444" },
  AMBER: { bg: "#3a2c0f", text: "#fbbf24", dot: "#f59e0b" },
  GREEN: { bg: "#13351f", text: "#4ade80", dot: "#22c55e" },
}

const ragByMode: Record<ThemeMode, Record<RAGLevel, { bg: string; text: string; dot: string }>> = {
  light: ragTokens,
  dark: ragTokensDark,
}

export const priorityDots: Record<string, string> = {
  low:      "#94a3b8",
  medium:   "#f59e0b",
  high:     "#ef4444",
  critical: "#7c3aed"
}

export const priorityDotsDark: Record<string, string> = {
  low:      "#94a3b8",
  medium:   "#fbbf24",
  high:     "#f87171",
  critical: "#a78bfa"
}

const priorityDotsByMode: Record<ThemeMode, Record<string, string>> = {
  light: priorityDots,
  dark: priorityDotsDark,
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

// Dark counterpart of the 4-step priority ramp (low → critical).
export const priorityTokensDark: Record<string, { bg: string; text: string }> = {
  low:      { bg: "#13351f", text: "#4ade80" }, // green
  medium:   { bg: "#3a2c0f", text: "#fbbf24" }, // amber
  high:     { bg: "#3a240f", text: "#fb923c" }, // orange
  critical: { bg: "#3a1a1a", text: "#f87171" }, // red
}

const priorityByMode: Record<ThemeMode, Record<string, { bg: string; text: string }>> = {
  light: priorityTokens,
  dark: priorityTokensDark,
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
  if (["WAITING","PENDING","ASSESSED","ON_HOLD","DEGRADED","AMBER","MEDIUM"].some(k => v.includes(k)))
    return "warning"
  if (["IN_PROGRESS","ASSIGNED","INVESTIGATING","MITIGATING","ACTIVE","SUBMITTED","APPROVED"].some(k => v.includes(k)))
    return "active"
  if (["NEW","DRAFT","OPEN","IDENTIFIED","PLANNED","SCHEDULED","CLOSED"].some(k => v.includes(k)))
    return "neutral"
  return "neutral"
}

// Operational-entity status -> intent. An EXPLICIT map (NOT the resolveIntent
// keyword scan) for the non-workflow record types — Client, WorkPackage, Connection
// and Asset lifecycle. Two reasons it can't share resolveIntent:
//  - "ACTIVE" must read as operational/healthy (GREEN) here, not in-progress (blue).
//  - "INACTIVE" CONTAINS the substring "ACTIVE", so any keyword scan mis-resolves it.
// This is the single source of truth for entity-status colour — read via
// entityStatusIntent(); unknown values fall through to neutral.
const entityStatusIntentMap: Record<string, SemanticIntent> = {
  ACTIVE:      "success", // green — operational / healthy / live
  INACTIVE:    "neutral", // slate — disabled
  DEGRADED:    "warning", // amber — impaired but live (connections)
  PLANNED:     "neutral", // slate — not yet live
  PROCUREMENT: "warning", // amber — in-flight provisioning (asset lifecycle)
  STAGING:     "active",  // blue  — being brought up (asset lifecycle)
  RETIRED:     "neutral", // slate — decommissioned (terminal)
}

export function entityStatusIntent(value: string): SemanticIntent {
  return entityStatusIntentMap[(value ?? "").toUpperCase()] ?? "neutral"
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

// Shared tag radius — small metadata tags (Required / Critical / Ad hoc) and any
// little close/remove badge. A touch rounder than the pill (8px) but still squared
// off, so tags read as the unified aesthetic rather than fully-rounded lozenges.
export const TAG_RADIUS = radii.md

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

// Dark counterpart of the type badges — same identity hue, dark-tinted fill.
export const typeBadgeTokensDark = {
  SR:   { bg: "#0c2a3a", text: "#7dd3fc" },
  INC:  { bg: "#3a1a1a", text: "#f87171" },
  CHG:  { bg: "#2a1a3a", text: "#d8b4fe" },
  RSK:  { bg: "#3a2c0f", text: "#fbbf24" },
  ISS:  { bg: "#3a1428", text: "#f9a8d4" },
  TASK: { bg: "#1e1b3a", text: "#a5b4fc" },
} as const

export type TypeBadgeKey = keyof typeof typeBadgeTokens

const typeBadgeByMode: Record<ThemeMode, Record<TypeBadgeKey, { bg: string; text: string }>> = {
  light: typeBadgeTokens,
  dark: typeBadgeTokensDark,
}

// Status fill + text for a resolved intent (mode-aware). Sibling of statusColors
// that takes the intent directly, for callers that already have it (e.g. the
// shared StatusPill, which accepts an explicit `intent` prop).
export function semanticToken(intent: SemanticIntent, mode: ThemeMode = activeThemeMode): { bg: string; text: string; solid: string } {
  return semanticByMode[mode][intent]
}

export function chipSx(value: string, mode: ThemeMode = activeThemeMode) {
  const { bg, text } = semanticByMode[mode][resolveIntent(value)]
  return { bgcolor: bg, color: text, fontWeight: 700 }
}

// Status fill + text for non-chip status indicators (e.g. the detail status pill
// and StatusPopover icon squares). Resolves to the same deepened tokens as chipSx,
// so a given status is the same colour everywhere it appears.
export function statusColors(value: string, mode: ThemeMode = activeThemeMode): { bg: string; text: string } {
  return semanticByMode[mode][resolveIntent(value)]
}

// Saturated status colour for tiny standalone glyphs (the queue-rail status dot),
// where the pastel `bg` washes out at ~8px. Same intent mapping as statusColors —
// only the scale differs (solid vs soft). Do NOT use for pills; they stay pastel.
export function statusSolid(value: string, mode: ThemeMode = activeThemeMode): string {
  return semanticByMode[mode][resolveIntent(value)].solid
}

// RAG fill + text + dot for a level (mode-aware). Unknown values are impossible
// (RAGLevel is a closed union) so no fallback is needed.
export function ragToken(level: RAGLevel, mode: ThemeMode = activeThemeMode): { bg: string; text: string; dot: string } {
  return ragByMode[mode][level]
}

// Type-badge fill + text for SR/INC/CHG/RSK/ISS/TASK (mode-aware).
export function typeBadge(key: TypeBadgeKey, mode: ThemeMode = activeThemeMode): { bg: string; text: string } {
  return typeBadgeByMode[mode][key]
}

export function priorityDot(priority: string, mode: ThemeMode = activeThemeMode): string {
  return priorityDotsByMode[mode][priority.toLowerCase()] ?? "#94a3b8"
}

// Priority pastel fill + text for the shared PriorityPill. Resolves to the 4-step
// priorityTokens ramp; unknown values fall back to medium.
export function priorityToken(priority: string, mode: ThemeMode = activeThemeMode): { bg: string; text: string } {
  const map = priorityByMode[mode]
  return map[priority.toLowerCase()] ?? map.medium
}

// ── Detail-page accent palette ──────────────────────────────────────────────
// A soft 6-hue accent set used by the work-item detail pages + the shared activity
// feed: the assignee/person identity wash, the comment/status/assignment/link event
// icons, change-approval decisions, and the closure summary. Distinct from
// semanticTokens (status) — warmer/softer, hand-picked for these surfaces. This is
// the single source of truth — read via accentToken(). The light values reproduce
// the prior inline literals exactly; the dark counterparts re-scale to a deep,
// low-luminance fill + light same-hue text, matching the other *Dark groups.
export type AccentKey = "green" | "red" | "blue" | "amber" | "pink" | "neutral"

export const accentTokens: Record<AccentKey, { bg: string; text: string }> = {
  green:   { bg: "#eaf3de", text: "#3b6d11" }, // person/assigned · comment · APPROVED · closure
  red:     { bg: "#fcebeb", text: "#a32d2d" }, // REJECTED
  blue:    { bg: "#e6f1fb", text: "#185fa5" }, // status event · customer-update badge
  amber:   { bg: "#faeeda", text: "#854f0b" }, // assignment event · DEFERRED
  pink:    { bg: "#fbeaf0", text: "#993556" }, // link event
  neutral: { bg: "#f1efe8", text: "#5f5e5a" }, // unassigned · approval default
}

export const accentTokensDark: Record<AccentKey, { bg: string; text: string }> = {
  green:   { bg: "#20300f", text: "#a3c57a" },
  red:     { bg: "#371b1b", text: "#e8918c" },
  blue:    { bg: "#14283f", text: "#74a9e0" },
  amber:   { bg: "#322611", text: "#d9a85e" },
  pink:    { bg: "#311823", text: "#d98fae" },
  neutral: { bg: "#26261f", text: "#a8a59c" },
}

const accentByMode: Record<ThemeMode, Record<AccentKey, { bg: string; text: string }>> = {
  light: accentTokens,
  dark: accentTokensDark,
}

// Soft accent fill + text for a hue (mode-aware). Single source for the detail-page
// person/event/approval washes — read it instead of inlining the literals.
export function accentToken(key: AccentKey, mode: ThemeMode = activeThemeMode): { bg: string; text: string } {
  return accentByMode[mode][key]
}

export function statusSelectSx(minWidth = 180, mode: ThemeMode = activeThemeMode) {
  const isDark = mode === "dark"
  return {
    minWidth,
    "& .MuiInputLabel-root": {
      display: "none",
    },
    "& .MuiOutlinedInput-root": {
      height: 32,
      borderRadius: 999,
      bgcolor: isDark ? "#1e293b" : "#ffffff",
      fontSize: 12,
      fontWeight: 600,
      color: isDark ? "#e2e8f0" : "#334155",
      "& fieldset": {
        borderColor: isDark ? "#334155" : "#cbd5e1",
      },
      "&:hover fieldset": {
        borderColor: isDark ? "#475569" : "#94a3b8",
      },
      "&.Mui-focused fieldset": {
        borderColor: isDark ? "#64748b" : "#64748b",
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
      color: isDark ? "#94a3b8" : "#64748b",
      fontSize: 18,
    },
  }
}