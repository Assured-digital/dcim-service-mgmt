import * as React from "react"
import { Box, Typography } from "@mui/material"

// ─────────────────────────────────────────────────────────────────────────────
// CommentBody — shared read-only renderer for posted comments (Phase 1, Stage 4).
//
// Branches on bodyJson:
//   • bodyJson present  → read-only rich render of the TipTap doc — the SAME
//     constrained set the editor (activityCommentBox) produces: bold, italic,
//     bulleted/numbered lists, links, inline code — plus @user mention chips.
//   • bodyJson absent   → the existing plain-text path (whiteSpace: pre-wrap),
//     unchanged, so every legacy plain-text comment (and audit transition
//     comments, which never carry bodyJson) renders exactly as before.
//
// Mention chips show the RESOLVED displayName from the backend's mentions
// projection ({ targetType, targetId, displayName }), looked up by the mention
// node's attrs.id — not the label frozen into the doc at authoring time — so a
// renamed user shows their current name. Falls back to the stored label, then a
// neutral placeholder if the user is gone (displayName null).
//
// Read-only by construction: plain React elements, no editor instance (cheap to
// render many in a feed). Styling mirrors the editor so input and output match.
// ─────────────────────────────────────────────────────────────────────────────

export type ResolvedMention = {
  targetType: string
  targetId: string
  displayName: string | null
}

type TipTapMark = { type?: string; attrs?: Record<string, unknown> }
type TipTapNode = {
  type?: string
  text?: string
  marks?: TipTapMark[]
  attrs?: Record<string, unknown>
  content?: TipTapNode[]
}

interface CommentBodyProps {
  note?: string
  bodyJson?: Record<string, unknown> | null
  mentions?: ResolvedMention[]
}

// Rich-surface styling — kept in lock-step with the .comment-editor styles in
// activityCommentBox so a posted comment reads identically to its draft.
const richSx = {
  fontSize: 12,
  color: "text.primary",
  lineHeight: 1.5,
  "& p": { m: 0 },
  "& p + p": { mt: 0.75 },
  "& ul, & ol": { pl: 3, my: 0.5 },
  "& li > p": { m: 0 },
  "& code": {
    px: 0.5,
    py: "1px",
    borderRadius: 0.5,
    bgcolor: "action.hover",
    fontFamily: "monospace",
    fontSize: "0.85em",
  },
  "& a": { color: "primary.main", textDecoration: "underline" },
  "& .comment-mention": {
    color: "primary.main",
    fontWeight: 600,
    bgcolor: "action.hover",
    borderRadius: 0.5,
    px: 0.25,
  },
} as const

// Wraps a text run in its marks (bold/italic/code/link). Order is immaterial to
// the constrained set; unknown marks pass through untouched.
function applyMarks(text: string, marks: TipTapMark[] | undefined, key: React.Key): React.ReactNode {
  let node: React.ReactNode = text
  for (const mark of marks ?? []) {
    switch (mark.type) {
      case "bold":
        node = <strong>{node}</strong>
        break
      case "italic":
        node = <em>{node}</em>
        break
      case "code":
        node = <code>{node}</code>
        break
      case "link": {
        const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : undefined
        node = (
          <a href={href} target="_blank" rel="noopener noreferrer nofollow">
            {node}
          </a>
        )
        break
      }
      default:
        break
    }
  }
  return <React.Fragment key={key}>{node}</React.Fragment>
}

function renderNodes(nodes: TipTapNode[] | undefined, nameById: Map<string, string>): React.ReactNode[] {
  return (nodes ?? []).map((node, i) => renderNode(node, i, nameById))
}

function renderNode(node: TipTapNode, key: React.Key, nameById: Map<string, string>): React.ReactNode {
  switch (node.type) {
    case "text":
      return applyMarks(node.text ?? "", node.marks, key)
    case "hardBreak":
      return <br key={key} />
    case "mention": {
      const id = node.attrs?.id != null ? String(node.attrs.id) : undefined
      const label = typeof node.attrs?.label === "string" ? node.attrs.label : undefined
      const name = (id ? nameById.get(id) : undefined) ?? label ?? "unknown"
      return (
        <span key={key} className="comment-mention">
          @{name}
        </span>
      )
    }
    case "paragraph":
      return <p key={key}>{renderNodes(node.content, nameById)}</p>
    case "bulletList":
      return <ul key={key}>{renderNodes(node.content, nameById)}</ul>
    case "orderedList":
      return <ol key={key}>{renderNodes(node.content, nameById)}</ol>
    case "listItem":
      return <li key={key}>{renderNodes(node.content, nameById)}</li>
    default:
      // Unknown node: render its children if any (forward-compatible), else drop.
      return node.content ? (
        <React.Fragment key={key}>{renderNodes(node.content, nameById)}</React.Fragment>
      ) : null
  }
}

export const CommentBody = React.memo(function CommentBody({ note, bodyJson, mentions }: CommentBodyProps) {
  const doc = bodyJson as TipTapNode | null | undefined
  const hasRich = !!doc && Array.isArray(doc.content) && doc.content.length > 0

  if (!hasRich) {
    // Back-compat: legacy plain-text comment / transition comment — unchanged.
    return (
      <Typography sx={{ fontSize: 12, color: "text.primary", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
        {note}
      </Typography>
    )
  }

  const nameById = new Map<string, string>()
  for (const m of mentions ?? []) {
    if (m.targetType === "user" && m.displayName) nameById.set(m.targetId, m.displayName)
  }

  return <Box sx={richSx}>{renderNodes(doc!.content, nameById)}</Box>
})
