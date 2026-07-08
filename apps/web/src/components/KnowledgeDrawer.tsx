import React, { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Alert, Box, Button, Drawer, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from "@mui/material"
import { type ApiError } from "../lib/api"
import { createKnowledge, updateKnowledge, type KnowledgeArticle, type KnowledgeStatus } from "../lib/knowledge"

type Props = {
  open: boolean
  article: KnowledgeArticle | null   // null = create
  canEdit: boolean                   // author role? else read-only
  onClose: () => void
}

const STATUSES: KnowledgeStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"]

export default function KnowledgeDrawer({ open, article, canEdit, onClose }: Props) {
  const qc = useQueryClient()
  const isEdit = !!article

  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("General")
  const [status, setStatus] = useState<KnowledgeStatus>("DRAFT")
  const [shared, setShared] = useState(false)
  const [body, setBody] = useState("")

  useEffect(() => {
    if (!open) return
    setTitle(article?.title ?? "")
    setCategory(article?.category ?? "General")
    setStatus(article?.status ?? "DRAFT")
    setShared(article?.shared ?? false)
    setBody(article?.body ?? "")
  }, [open, article])

  const mutation = useMutation({
    mutationFn: async () => {
      const dto = { title: title.trim(), body, category: category.trim() || "General", status, shared }
      if (isEdit && article) return updateKnowledge(article.id, dto)
      return createKnowledge(dto)
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["knowledge"] })
      onClose()
    }
  })

  const err = [mutation.error].find(Boolean) as ApiError | undefined
  const errorMessage = Array.isArray(err?.message) ? err.message.join(", ") : err?.message
  const titleTooShort = title.trim().length < 2
  const canSubmit = canEdit && !titleTooShort && body.trim().length > 0 && !mutation.isPending

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: { xs: 360, sm: 520 }, p: 2.5, display: "flex", flexDirection: "column", height: "100%" }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.25 }}>
          {isEdit ? (canEdit ? "Edit article" : "Article") : "New article"}
        </Typography>
        {article ? (
          <Typography color="text.secondary" sx={{ fontSize: 12, mb: 2 }}>
            {article.reference} · {article.shared ? "Shared across all clients" : "This client only"}
          </Typography>
        ) : (
          <Typography color="text.secondary" sx={{ fontSize: 13, mb: 2 }}>
            Write a knowledge base article for the service desk.
          </Typography>
        )}

        <Stack spacing={2} sx={{ flex: 1, overflowY: "auto", pr: 0.5 }}>
          <TextField
            label="Title" value={title} onChange={(e) => setTitle(e.target.value)}
            required disabled={!canEdit} fullWidth InputLabelProps={{ shrink: true }}
            error={title.trim().length > 0 && titleTooShort}
            helperText={title.trim().length > 0 && titleTooShort ? "Must be at least 2 characters." : undefined}
          />
          <Stack direction="row" spacing={2}>
            <TextField
              label="Category" value={category} onChange={(e) => setCategory(e.target.value)}
              disabled={!canEdit} fullWidth InputLabelProps={{ shrink: true }} placeholder="General"
            />
            <TextField
              select label="Status" value={status} onChange={(e) => setStatus(e.target.value as KnowledgeStatus)}
              disabled={!canEdit} sx={{ minWidth: 160 }} InputLabelProps={{ shrink: true }}
            >
              {STATUSES.map((s) => <MenuItem key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</MenuItem>)}
            </TextField>
          </Stack>
          <FormControlLabel
            sx={{ mx: 0 }}
            control={<Switch size="small" checked={shared} disabled={!canEdit} onChange={(e) => setShared(e.target.checked)} />}
            label={
              <Box sx={{ ml: 0.5 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Shared across all clients</Typography>
                <Typography color="text.secondary" sx={{ fontSize: 11.5 }}>Off = visible only to the current client.</Typography>
              </Box>
            }
          />
          <TextField
            label="Body" value={body} onChange={(e) => setBody(e.target.value)}
            disabled={!canEdit} fullWidth multiline minRows={10} InputLabelProps={{ shrink: true }}
          />
          {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
        </Stack>

        <Stack direction="row" spacing={1.2} sx={{ mt: 2, pt: 2, borderTop: "1px solid", borderColor: "divider" }}>
          <Button variant="outlined" onClick={onClose} disabled={mutation.isPending} fullWidth>
            {canEdit ? "Cancel" : "Close"}
          </Button>
          {canEdit ? (
            <Button variant="contained" onClick={() => mutation.mutate()} disabled={!canSubmit} fullWidth>
              {mutation.isPending ? "Saving…" : isEdit ? "Save" : "Create"}
            </Button>
          ) : null}
        </Stack>
      </Box>
    </Drawer>
  )
}
