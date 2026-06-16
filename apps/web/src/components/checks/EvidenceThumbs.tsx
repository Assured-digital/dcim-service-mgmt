import React from "react"
import { Box } from "@mui/material"
import { type AttachmentSummary, fetchAttachmentBlob, isImageType } from "../../lib/attachments"

// Small evidence thumbnail strip for the Checks review cards. The bytes are fetched
// through the authenticated api client (NEVER a raw <img src> at the endpoint — that
// would 401 and bypass the tenant re-check) and rendered from object URLs that are all
// revoked on cleanup. Mirrors AttachmentPreviewModal's blob lifecycle. Tiles are
// non-interactive: the whole card opens the check, and the full preview lives on the
// detail page. Only mounted for review cards, so the blob fetches stay scoped to the
// (small) PENDING_REVIEW set.

const TILE = { xs: 40, sm: 48 }

export function EvidenceThumbs({
  attachments,
  max = 3,
}: {
  attachments: AttachmentSummary[]
  max?: number
}) {
  // Only inline raster images can render as a thumbnail; PDFs/other evidence still
  // count toward the overflow tally so reviewers see total evidence volume.
  const images = attachments.filter((a) => a.inline && isImageType(a.contentType))
  const shown = images.slice(0, max)
  const overflow = attachments.length - shown.length
  const shownIds = shown.map((a) => a.id).join(",")

  const [urls, setUrls] = React.useState<Map<string, string>>(new Map())

  React.useEffect(() => {
    if (shown.length === 0) {
      setUrls(new Map())
      return
    }
    let revoked = false
    const made: string[] = []
    // Parallel fetch; a single tile failing never throws (allSettled) — it just stays
    // a neutral placeholder.
    Promise.allSettled(
      shown.map((a) => fetchAttachmentBlob(a.id).then((blob) => [a.id, blob] as const))
    ).then((results) => {
      if (revoked) return
      const next = new Map<string, string>()
      for (const r of results) {
        if (r.status === "fulfilled") {
          const [id, blob] = r.value
          const url = window.URL.createObjectURL(blob)
          made.push(url)
          next.set(id, url)
        }
      }
      setUrls(next)
    })
    return () => {
      revoked = true
      made.forEach((u) => window.URL.revokeObjectURL(u))
      setUrls(new Map())
    }
    // Keyed on the joined ids (not array identity) so we don't refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownIds])

  if (attachments.length === 0) return null

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
      {shown.map((a) => {
        const url = urls.get(a.id)
        return (
          <Box
            key={a.id}
            sx={{
              width: TILE,
              height: TILE,
              borderRadius: "6px",
              border: "1px solid #e2e8f0",
              bgcolor: "#f1f5f9", // loading placeholder — reserves space, no layout jump
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {url ? (
              <Box
                component="img"
                src={url}
                alt={a.caption ?? a.filename}
                sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : null}
          </Box>
        )
      })}
      {overflow > 0 ? (
        <Box
          sx={{
            width: TILE,
            height: TILE,
            borderRadius: "6px",
            border: "1px solid #e2e8f0",
            bgcolor: "#e2e8f0",
            color: "#475569",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          +{overflow}
        </Box>
      ) : null}
    </Box>
  )
}
