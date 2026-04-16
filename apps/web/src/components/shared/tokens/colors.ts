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

export const semanticTokens: Record<SemanticIntent, { bg: string; text: string }> = {
  success: { bg: "#dcfce7", text: "#15803d" },
  active:  { bg: "#e8f1ff", text: "#1d4ed8" },
  warning: { bg: "#fef3c7", text: "#b45309" },
  danger:  { bg: "#fee2e2", text: "#b91c1c" },
  neutral: { bg: "#eef2f7", text: "#334155" },
  info:    { bg: "#e8f1ff", text: "#1d4ed8" },
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

export function resolveIntent(value: string): SemanticIntent {
  const v = value.toUpperCase()
  if (["CLOSED","COMPLETED","RESOLVED","GREEN","PASS","DONE"].some(k => v.includes(k)))
    return "success"
  if (["IN_PROGRESS","ASSIGNED","OPEN","ACTIVE","MITIGATING"].some(k => v.includes(k)))
    return "active"
  if (["NEW","DRAFT","AMBER","MEDIUM","WAITING","IDENTIFIED","ASSESSED","ACCEPTED"].some(k => v.includes(k)))
    return "warning"
  if (["FAIL","CANCELLED","REJECTED","RED","HIGH","BLOCKED","CRITICAL"].some(k => v.includes(k)))
    return "danger"
  return "neutral"
}

export function chipSx(value: string) {
  const { bg, text } = semanticTokens[resolveIntent(value)]
  return { bgcolor: bg, color: text, fontWeight: 700 }
}

export function priorityDot(priority: string): string {
  return priorityDots[priority.toLowerCase()] ?? "#94a3b8"
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