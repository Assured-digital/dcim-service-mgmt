import React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Alert, Box, Button, CircularProgress, Switch, Typography, useTheme } from "@mui/material"
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
  NOTIFICATION_TYPE_LABELS,
  type NotificationPreference,
} from "../lib/notifications"

// Settings card: per-event-type × per-channel (in-app / email) notification
// preferences. Absent server-side rows come back as effective defaults, so the
// table always renders the full current picture. Save is enabled only when dirty.
export default function NotificationSettings() {
  const theme = useTheme()
  const qc = useQueryClient()
  const [draft, setDraft] = React.useState<NotificationPreference[] | null>(null)
  const [saved, setSaved] = React.useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: fetchNotificationPreferences,
  })

  React.useEffect(() => {
    if (data) setDraft(data)
  }, [data])

  const save = useMutation({
    mutationFn: () => updateNotificationPreferences(draft ?? []),
    onSuccess: (res) => {
      setDraft(res)
      setSaved(true)
      qc.invalidateQueries({ queryKey: ["notification-preferences"] })
    },
  })

  const dirty = !!data && !!draft && JSON.stringify(data) !== JSON.stringify(draft)

  function toggle(type: string, channel: "inApp" | "email") {
    setSaved(false)
    setDraft((prev) => prev?.map((p) => (p.type === type ? { ...p, [channel]: !p[channel] } : p)) ?? null)
  }

  return (
    <Box
      sx={{
        maxWidth: 440,
        bgcolor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 2,
        p: 3,
        mt: 3,
      }}
    >
      <Typography sx={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary, #0f172a)", mb: 0.5 }}>
        Notifications
      </Typography>
      <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 2 }}>
        Choose which events notify you, and how.
      </Typography>

      {isLoading || !draft ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
          <CircularProgress size={20} />
        </Box>
      ) : (
        <Box>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 56px 56px", alignItems: "center", mb: 0.5 }}>
            <Box />
            <Typography sx={{ fontSize: 11, color: "text.tertiary", textAlign: "center" }}>In-app</Typography>
            <Typography sx={{ fontSize: 11, color: "text.tertiary", textAlign: "center" }}>Email</Typography>
          </Box>

          {draft.map((p) => (
            <Box
              key={p.type}
              sx={{ display: "grid", gridTemplateColumns: "1fr 56px 56px", alignItems: "center", py: 0.5 }}
            >
              <Typography sx={{ fontSize: 13 }}>{NOTIFICATION_TYPE_LABELS[p.type] ?? p.type}</Typography>
              <Box sx={{ textAlign: "center" }}>
                <Switch size="small" checked={p.inApp} onChange={() => toggle(p.type, "inApp")} />
              </Box>
              <Box sx={{ textAlign: "center" }}>
                <Switch size="small" checked={p.email} onChange={() => toggle(p.type, "email")} />
              </Box>
            </Box>
          ))}

          {saved && !dirty ? (
            <Alert severity="success" sx={{ mt: 2 }}>
              Notification preferences saved.
            </Alert>
          ) : null}

          <Box sx={{ mt: 2 }}>
            <Button variant="contained" size="small" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  )
}
