import * as React from "react"
import { Box, Button, IconButton, Tooltip } from "@mui/material"
import FormatBoldIcon from "@mui/icons-material/FormatBold"
import FormatItalicIcon from "@mui/icons-material/FormatItalic"
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted"
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered"
import CodeIcon from "@mui/icons-material/Code"
import LinkIcon from "@mui/icons-material/Link"
import { EditorContent, ReactRenderer, useEditor, useEditorState } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Mention from "@tiptap/extension-mention"
import Placeholder from "@tiptap/extension-placeholder"
import { useAssignableUsers, type AssignableUser } from "../../lib/useAssignableUsers"
import { MentionList, type MentionListRef } from "./commentMentionList"

// ─────────────────────────────────────────────────────────────────────────────
// Activity comment box — shared, quiet Jira-style work-note editor.
//
// A flat bordered field that blends with the surrounding Activity panel (no white
// "card" fill), squarer global radius, subtle divider border. Used by every record
// detail page's ActivityContent. It is SELF-CONTAINED: it owns the TipTap editor
// state internally and hands the page a finished draft (plain-text body + TipTap
// bodyJson + extracted @user mention targets) via onPost. The page owns persistence
// (the POST + cache invalidation + toast); this component clears itself on success.
//
// Constrained formatting (NOT a document editor): bold, italic, bulleted/numbered
// lists, links, inline code — plus @user mentions. Markdown input rules come from
// StarterKit for free (**bold**, *italic*, `- `, `1. `, `` `code` ``); the toolbar
// is just discoverability. Headings/blockquotes/code blocks are disabled.
// ─────────────────────────────────────────────────────────────────────────────

export type CommentMentionTarget = { targetType: "user"; targetId: string }

export interface CommentDraft {
  // Plain-text fallback (the server re-derives its own from bodyJson; this is a
  // convenience/back-compat value and the empty-guard source).
  body: string
  bodyJson: Record<string, unknown>
  mentions: CommentMentionTarget[]
}

// Walks a TipTap doc for mention nodes and returns deduped {targetType,targetId}.
// Each mention node carries the user id under attrs.id (the suggestion command set
// it). targetType is "user" — the only mention type in Phase 1.
export function extractMentionTargets(doc: unknown): CommentMentionTarget[] {
  const ids = new Set<string>()
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return
    const n = node as { type?: string; attrs?: { id?: unknown }; content?: unknown }
    if (n.type === "mention" && n.attrs?.id != null) ids.add(String(n.attrs.id))
    if (Array.isArray(n.content)) n.content.forEach(walk)
  }
  walk(doc)
  return [...ids].map((targetId) => ({ targetType: "user", targetId }))
}

interface ActivityCommentBoxProps {
  saving: boolean
  onPost: (draft: CommentDraft) => Promise<void> | void
}

export const ActivityCommentBox = React.memo(function ActivityCommentBox({
  saving,
  onPost,
}: ActivityCommentBoxProps) {
  // Tenant-scoped assignable users — the same source (and scope) the backend
  // validates mentions against, so the dropdown can never offer an out-of-tenant
  // user. Held in a ref so the suggestion pipeline (created once with the editor)
  // always reads the freshest list without rebuilding the editor on every fetch.
  const { data: assignable } = useAssignableUsers()
  const usersRef = React.useRef<AssignableUser[]>([])
  React.useEffect(() => {
    usersRef.current = assignable ?? []
  }, [assignable])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Constrained comment set: drop document-editor nodes/marks.
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        // Keep: bold, italic, bulletList, orderedList, listItem, code, paragraph,
        // hardBreak, undoRedo, link.
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        },
      }),
      Placeholder.configure({ placeholder: "Add a work note..." }),
      Mention.configure({
        HTMLAttributes: { class: "comment-mention" },
        suggestion: {
          items: ({ query }) => {
            const q = query.toLowerCase()
            return (usersRef.current ?? [])
              .filter(
                (u) =>
                  u.displayName.toLowerCase().includes(q) ||
                  u.email.toLowerCase().includes(q)
              )
              .slice(0, 8)
              .map((u) => ({ id: u.id, label: u.displayName, email: u.email }))
          },
          render: () => {
            let renderer: ReactRenderer<MentionListRef> | null = null
            return {
              onStart: (props) => {
                renderer = new ReactRenderer(MentionList, {
                  props,
                  editor: props.editor,
                })
              },
              onUpdate: (props) => {
                renderer?.updateProps(props)
              },
              onKeyDown: (props) => {
                if (props.event.key === "Escape") {
                  renderer?.destroy()
                  renderer = null
                  return true
                }
                return renderer?.ref?.onKeyDown(props) ?? false
              },
              onExit: () => {
                renderer?.destroy()
                renderer = null
              },
            }
          },
        },
      }),
    ],
    editorProps: {
      attributes: { class: "comment-editor", "aria-label": "Add a work note" },
    },
  })

  // Reactive toolbar/empty state — re-renders only when these flags change.
  const ed = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor
        ? {
            bold: editor.isActive("bold"),
            italic: editor.isActive("italic"),
            bullet: editor.isActive("bulletList"),
            ordered: editor.isActive("orderedList"),
            code: editor.isActive("code"),
            link: editor.isActive("link"),
            empty: editor.isEmpty,
          }
        : null,
  })

  const handlePost = React.useCallback(async () => {
    if (!editor || saving) return
    const body = editor.getText().trim()
    if (!body) return
    const bodyJson = editor.getJSON() as Record<string, unknown>
    const mentions = extractMentionTargets(bodyJson)
    // Only clear on a clean post — if the page's onPost throws, keep the draft.
    await onPost({ body, bodyJson, mentions })
    editor.commands.clearContent(true)
  }, [editor, saving, onPost])

  const handleLink = React.useCallback(() => {
    if (!editor) return
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run()
      return
    }
    const prev = editor.getAttributes("link").href as string | undefined
    const url = window.prompt("Link URL", prev ?? "https://")
    if (url === null) return
    if (url.trim() === "") {
      editor.chain().focus().unsetLink().run()
      return
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url.trim() })
      .run()
  }, [editor])

  const disabled = !ed || ed.empty || saving

  return (
    <Box
      sx={{
        mb: 1.75,
        borderRadius: 1,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "transparent",
        overflow: "hidden",
        // Shared focus affordance with the editable title/description fields:
        // idle = divider token, active = accent token. 1px in both states, so
        // clicking in highlights the edge without resizing or jumping.
        transition: "border-color 120ms ease",
        "&:focus-within": { borderColor: "primary.main" },
      }}
    >
      {/* Quiet toolbar — markdown shortcuts work too; these are for discoverability. */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.25,
          px: 0.5,
          py: 0.25,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <ToolbarBtn
          label="Bold"
          active={!!ed?.bold}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <FormatBoldIcon fontSize="small" />
        </ToolbarBtn>
        <ToolbarBtn
          label="Italic"
          active={!!ed?.italic}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <FormatItalicIcon fontSize="small" />
        </ToolbarBtn>
        <ToolbarBtn
          label="Bulleted list"
          active={!!ed?.bullet}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <FormatListBulletedIcon fontSize="small" />
        </ToolbarBtn>
        <ToolbarBtn
          label="Numbered list"
          active={!!ed?.ordered}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <FormatListNumberedIcon fontSize="small" />
        </ToolbarBtn>
        <ToolbarBtn
          label="Inline code"
          active={!!ed?.code}
          onClick={() => editor?.chain().focus().toggleCode().run()}
        >
          <CodeIcon fontSize="small" />
        </ToolbarBtn>
        <ToolbarBtn label="Link" active={!!ed?.link} onClick={handleLink}>
          <LinkIcon fontSize="small" />
        </ToolbarBtn>
      </Box>

      {/* Editor surface. Styling targets the ProseMirror root (.comment-editor). */}
      <Box
        sx={{
          px: 1.5,
          py: 1,
          fontSize: "0.875rem",
          "& .comment-editor": { outline: "none", minHeight: "3em", lineHeight: 1.5 },
          "& .comment-editor p": { m: 0 },
          "& .comment-editor p + p": { mt: 0.75 },
          "& .comment-editor ul, & .comment-editor ol": { pl: 3, my: 0.5 },
          "& .comment-editor li > p": { m: 0 },
          "& .comment-editor code": {
            px: 0.5,
            py: "1px",
            borderRadius: 0.5,
            bgcolor: "action.hover",
            fontFamily: "monospace",
            fontSize: "0.85em",
          },
          "& .comment-editor a": { color: "primary.main", textDecoration: "underline" },
          "& .comment-mention": {
            color: "primary.main",
            fontWeight: 600,
            bgcolor: "action.hover",
            borderRadius: 0.5,
            px: 0.25,
          },
          // Placeholder (TipTap Placeholder extension marks the empty first node).
          "& .comment-editor p.is-editor-empty:first-of-type::before": {
            content: "attr(data-placeholder)",
            color: "text.disabled",
            float: "left",
            height: 0,
            pointerEvents: "none",
          },
        }}
      >
        <EditorContent editor={editor} />
      </Box>

      <Box
        sx={{
          display: "flex",
          justifyContent: "flex-end",
          p: 0.75,
          borderTop: "1px solid",
          borderColor: "divider",
        }}
      >
        <Button
          variant="contained"
          size="small"
          disabled={disabled}
          onClick={handlePost}
        >
          Post note
        </Button>
      </Box>
    </Box>
  )
})

function ToolbarBtn({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip title={label} disableInteractive>
      <IconButton
        size="small"
        aria-label={label}
        aria-pressed={active}
        // mousedown + preventDefault keeps the editor selection intact when
        // toggling a mark over selected text.
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        sx={{
          borderRadius: 1,
          color: active ? "primary.main" : "text.secondary",
          bgcolor: active ? "action.selected" : "transparent",
        }}
      >
        {children}
      </IconButton>
    </Tooltip>
  )
}
