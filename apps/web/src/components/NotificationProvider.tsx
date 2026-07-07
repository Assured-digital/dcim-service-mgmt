import React from "react"
import { Alert, Box, Collapse, IconButton, Slide, Stack } from "@mui/material"
import CloseIcon from "@mui/icons-material/Close"

export type NotifySeverity = "success" | "error" | "info" | "warning"

type NotifyOptions = {
  duration?: number | null
}

type Notification = {
  id: string
  severity: NotifySeverity
  message: string
  duration: number | null
}

type Notify = {
  success: (message: string, opts?: NotifyOptions) => string
  error: (message: string, opts?: NotifyOptions) => string
  info: (message: string, opts?: NotifyOptions) => string
  warning: (message: string, opts?: NotifyOptions) => string
  dismiss: (id: string) => void
}

const DEFAULT_DURATION: Record<NotifySeverity, number> = {
  success: 4000,
  info: 5000,
  warning: 6000,
  error: 8000,
}

const MAX_VISIBLE = 5
const DUPLICATE_WINDOW_MS = 500

const NotificationCtx = React.createContext<{ notify: Notify } | null>(null)

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Notification[]>([])
  const timers = React.useRef<Map<string, number>>(new Map())
  const recent = React.useRef<Map<string, { id: string; at: number }>>(new Map())

  const clearTimer = React.useCallback((id: string) => {
    const t = timers.current.get(id)
    if (t != null) { clearTimeout(t); timers.current.delete(id) }
  }, [])

  const dismiss = React.useCallback((id: string) => {
    clearTimer(id)
    setItems(prev => prev.filter(n => n.id !== id))
  }, [clearTimer])

  const scheduleDismiss = React.useCallback((id: string, duration: number | null) => {
    clearTimer(id)
    if (duration == null || duration <= 0) return
    const handle = window.setTimeout(() => dismiss(id), duration)
    timers.current.set(id, handle)
  }, [clearTimer, dismiss])

  const push = React.useCallback((severity: NotifySeverity, message: string, opts?: NotifyOptions): string => {
    const key = `${severity}::${message}`
    const now = Date.now()
    const recentHit = recent.current.get(key)
    if (recentHit && now - recentHit.at < DUPLICATE_WINDOW_MS) {
      // Same message fired within the dedupe window — just refresh the timer on the existing toast.
      const existingId = recentHit.id
      recent.current.set(key, { id: existingId, at: now })
      const duration = opts?.duration !== undefined ? opts.duration : DEFAULT_DURATION[severity]
      scheduleDismiss(existingId, duration)
      return existingId
    }

    const id = newId()
    const duration = opts?.duration !== undefined ? opts.duration : DEFAULT_DURATION[severity]
    const item: Notification = { id, severity, message, duration }
    recent.current.set(key, { id, at: now })
    setItems(prev => [...prev, item])
    scheduleDismiss(id, duration)
    return id
  }, [scheduleDismiss])

  const notify = React.useMemo<Notify>(() => ({
    success: (m, o) => push("success", m, o),
    error: (m, o) => push("error", m, o),
    info: (m, o) => push("info", m, o),
    warning: (m, o) => push("warning", m, o),
    dismiss,
  }), [push, dismiss])

  React.useEffect(() => {
    const t = timers.current
    return () => { t.forEach(handle => clearTimeout(handle)); t.clear() }
  }, [])

  const visible = items.slice(-MAX_VISIBLE)
  const hasError = visible.some(n => n.severity === "error")

  return (
    <NotificationCtx.Provider value={{ notify }}>
      {children}
      <Box
        role="region"
        aria-label="Notifications"
        aria-live={hasError ? "assertive" : "polite"}
        sx={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 2000,
          display: "flex",
          flexDirection: "column-reverse",
          alignItems: "flex-end",
          gap: 1,
          pointerEvents: "none",
          maxWidth: "calc(100vw - 48px)",
        }}
      >
        <Stack spacing={1} sx={{ pointerEvents: "auto", alignItems: "flex-end" }}>
          {visible.map(n => (
            <Collapse key={n.id} in appear unmountOnExit>
              <Slide direction="left" in appear mountOnEnter unmountOnExit>
                <Alert
                  severity={n.severity}
                  variant="filled"
                  role={n.severity === "error" ? "alert" : "status"}
                  sx={{
                    minWidth: 280,
                    maxWidth: 480,
                    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.18)",
                    fontSize: 13,
                    alignItems: "center",
                    // Filled toasts read white on their colour fill (the success/green
                    // variant otherwise renders dark text in dark mode).
                    color: "#fff",
                    "& .MuiAlert-icon": { color: "#fff" },
                  }}
                  action={
                    <IconButton
                      size="small"
                      aria-label="Dismiss notification"
                      onClick={() => dismiss(n.id)}
                      sx={{ color: "inherit", ml: 1 }}
                    >
                      <CloseIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  }
                >
                  {n.message}
                </Alert>
              </Slide>
            </Collapse>
          ))}
        </Stack>
      </Box>
    </NotificationCtx.Provider>
  )
}

export function useNotification() {
  const ctx = React.useContext(NotificationCtx)
  if (!ctx) throw new Error("useNotification must be used inside <NotificationProvider>")
  return ctx
}
