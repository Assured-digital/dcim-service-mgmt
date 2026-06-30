import React from "react"
import { Box, Card, CardContent, Stack, Typography } from "@mui/material"
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded"
import RadioButtonUncheckedRoundedIcon from "@mui/icons-material/RadioButtonUncheckedRounded"
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded"
import { useThemeMode } from "../../lib/theme"
import { ragToken } from "../shared"
import { DASH_CARD_SX, CARD_CONTENT_SX } from "./primitives"

// ── Cold-start state machine (DASHBOARD_SPEC "Cold-start & empty states") ──────
// Three resting states detected by WHAT DATA EXISTS, not by client age — each visibly
// distinct from the others AND from a loading/error state (those are handled upstream;
// this only runs once the snapshot has loaded cleanly).
//   onboarding — nothing set up: no estate, no checks, no open work → setup checklist.
//   estate     — configured but quiet: has estate, no open work, no checks needing
//                attention → estate-forward (lead with the estate, collapse the band).
//   active     — the normal case: estate and/or live work → the full dashboard.
export type ColdState = "onboarding" | "estate" | "active"

export function deriveColdState(p: {
  hasEstate: boolean
  checksCount: number
  openWorkCount: number
  checksNeedAttention: boolean
}): ColdState {
  if (!p.hasEstate && p.checksCount === 0 && p.openWorkCount === 0) return "onboarding"
  if (p.hasEstate && p.openWorkCount === 0 && !p.checksNeedAttention) return "estate"
  return "active"
}

// The slice of GET /sites the estate-forward hero consumes (cabinets for the per-site
// count + the rolled-up asset count). Reuses the dashboard's existing ["infrastructure"]
// query — no new fetch.
export type EstateSite = {
  id: string
  name: string
  cabinets?: { id: string }[] | null
  _count?: { assets: number; checks: number } | null
}

// ── Onboarding (state a) ───────────────────────────────────────────────────────
// CDS empty-state voice: headline NAMES the space, body explains, each CTA is a verb.
// An invitation to set up — never an apology or a "nothing here yet" dead end.
type ChecklistItem = { label: string; description: string; to?: string; done?: boolean }

function ChecklistRow({ item, onNavigate }: { item: ChecklistItem; onNavigate: (to: string) => void }) {
  const { mode } = useThemeMode()
  const clickable = !item.done && !!item.to
  return (
    <Box
      onClick={clickable ? () => onNavigate(item.to as string) : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate(item.to as string) } } : undefined}
      sx={{
        display: "flex", alignItems: "center", gap: "12px",
        px: "12px", py: "12px", borderRadius: "9px",
        border: "0.5px solid", borderColor: "divider", bgcolor: "background.paper",
        cursor: clickable ? "pointer" : "default",
        transition: "background-color 0.12s",
        "&:hover": clickable ? { bgcolor: "var(--color-background-secondary)" } : {},
        "&:focus-visible": { outline: "2px solid", outlineColor: "var(--color-border-secondary)", outlineOffset: "-2px" },
      }}
    >
      {item.done
        ? <CheckCircleRoundedIcon sx={{ fontSize: 20, color: ragToken("GREEN", mode).dot, flexShrink: 0 }} />
        : <RadioButtonUncheckedRoundedIcon sx={{ fontSize: 20, color: "var(--color-text-muted)", flexShrink: 0 }} />}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: item.done ? "var(--color-text-muted)" : "text.primary" }}>
          {item.label}
        </Typography>
        <Typography sx={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          {item.done ? "Done" : item.description}
        </Typography>
      </Box>
      {clickable ? <ChevronRightRoundedIcon sx={{ fontSize: 18, color: "var(--color-text-muted)", flexShrink: 0 }} /> : null}
    </Box>
  )
}

export function OnboardingCard({ clientName, onNavigate }: { clientName: string | null; onNavigate: (to: string) => void }) {
  const name = clientName ?? "this client"
  const items: ChecklistItem[] = [
    { label: "Client created", description: "", done: true },
    { label: "Add a site", description: "Create the first site for this client’s estate.", to: "/asset-hierarchy" },
    { label: "Invite a contact", description: "Add someone from the client to collaborate.", to: "/users" },
    { label: "Schedule first check", description: "Plan an engineering check to start the governance loop.", to: "/checks" },
  ]
  return (
    <Card variant="outlined" sx={DASH_CARD_SX}>
      <CardContent sx={CARD_CONTENT_SX}>
        <Typography sx={{ fontFamily: "Space Grotesk, Manrope", fontSize: 20, fontWeight: 700, color: "text.primary", mb: "4px" }}>
          Get {name} set up
        </Typography>
        <Typography sx={{ fontSize: 13.5, color: "var(--color-text-muted)", mb: "16px", maxWidth: 560 }}>
          No activity yet — this client is newly onboarded. Work through the steps below to get going.
        </Typography>
        <Stack spacing="8px" sx={{ maxWidth: 560 }}>
          {items.map((item) => <ChecklistRow key={item.label} item={item} onNavigate={onNavigate} />)}
        </Stack>
      </CardContent>
    </Card>
  )
}

// ── Estate-forward (state b) ───────────────────────────────────────────────────
// The collapsed operational band: one calm "all on track" line, NOT a wall of zero-stats.
export function AllClearLine() {
  const { mode } = useThemeMode()
  return (
    <Card variant="outlined" sx={DASH_CARD_SX}>
      <CardContent sx={{ ...CARD_CONTENT_SX, py: "14px", "&:last-child": { pb: "14px" } }}>
        <Stack direction="row" alignItems="center" gap="12px">
          <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: ragToken("GREEN", mode).dot, flexShrink: 0 }} />
          <Box>
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: "text.primary", lineHeight: 1.3 }}>All on track</Typography>
            <Typography sx={{ fontSize: 12, color: "var(--color-text-muted)", lineHeight: 1.3 }}>
              No live work needs attention right now.
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  )
}

function EstateStat({ label, value }: { label: string; value: number }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-muted)", mb: "3px" }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1, color: "text.primary" }}>{value}</Typography>
    </Box>
  )
}

// The hero for a quiet-but-configured client: estate is the interesting content, so it
// leads. Summary counts + a short sites list (name · cabinet count), each row → that
// site's hierarchy; "View all" → the asset hierarchy.
export function EstateHero({ sites, onNavigate }: { sites: EstateSite[]; onNavigate: (to: string) => void }) {
  const cabinetCount = sites.reduce((n, s) => n + (s.cabinets?.length ?? 0), 0)
  const assetCount = sites.reduce((n, s) => n + (s._count?.assets ?? 0), 0)
  const sitesList = [...sites].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 6)
  const hidden = sites.length - sitesList.length

  return (
    <Card variant="outlined" sx={DASH_CARD_SX}>
      <CardContent sx={CARD_CONTENT_SX}>
        <Stack direction="row" gap="36px" sx={{ mb: "16px" }}>
          <EstateStat label="Sites" value={sites.length} />
          <EstateStat label="Cabinets" value={cabinetCount} />
          <EstateStat label="Assets" value={assetCount} />
        </Stack>

        <Stack spacing="2px">
          {sitesList.map((s) => (
            <Box
              key={s.id}
              onClick={() => onNavigate(`/asset-hierarchy/${s.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate(`/asset-hierarchy/${s.id}`) } }}
              sx={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
                px: "10px", py: "9px", borderRadius: "8px", cursor: "pointer",
                transition: "background-color 0.12s",
                "&:hover": { bgcolor: "var(--color-background-secondary)" },
                "&:focus-visible": { outline: "2px solid", outlineColor: "var(--color-border-secondary)", outlineOffset: "-2px" },
              }}
            >
              <Typography sx={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 500, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.name}
              </Typography>
              <Typography sx={{ flexShrink: 0, fontSize: 11.5, color: "var(--color-text-muted)" }}>
                {s.cabinets?.length ?? 0} cabinet{(s.cabinets?.length ?? 0) === 1 ? "" : "s"}
              </Typography>
            </Box>
          ))}
        </Stack>

        <Box
          onClick={() => onNavigate("/asset-hierarchy")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate("/asset-hierarchy") } }}
          sx={{
            display: "flex", alignItems: "center", px: "10px", py: "9px", mt: "2px", borderRadius: "8px", cursor: "pointer",
            transition: "background-color 0.12s",
            "&:hover": { bgcolor: "var(--color-background-secondary)" },
          }}
        >
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)" }}>
            {hidden > 0 ? `View all ${sites.length} sites →` : "View all →"}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  )
}
