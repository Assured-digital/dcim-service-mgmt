import * as React from "react"
import { Box, Button, TextField } from "@mui/material"

// ─────────────────────────────────────────────────────────────────────────────
// Activity comment box — shared, quiet Jira-style work-note field.
//
// A flat bordered field that blends with the surrounding Activity panel (no white
// "card" fill), with the squarer global radius token and a subtle divider border.
// Used by every record detail page's ActivityContent. Post behaviour is owned by
// the page (passed in via onPost); this component only renders the input + action.
// ─────────────────────────────────────────────────────────────────────────────

interface ActivityCommentBoxProps {
  value: string
  onChange: (value: string) => void
  saving: boolean
  onPost: () => void
}

export const ActivityCommentBox = React.memo(function ActivityCommentBox({
  value,
  onChange,
  saving,
  onPost,
}: ActivityCommentBoxProps) {
  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    [onChange]
  )

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
      <TextField
        multiline
        minRows={2}
        fullWidth
        placeholder="Add a work note..."
        variant="outlined"
        size="small"
        value={value}
        onChange={handleChange}
        sx={{
          "& .MuiOutlinedInput-root": {
            "& fieldset": { border: 0 },
            "&:hover fieldset": { border: 0 },
            "&.Mui-focused fieldset": { border: 0 },
          },
        }}
      />
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
          disabled={!value.trim() || saving}
          onClick={onPost}
        >
          Post note
        </Button>
      </Box>
    </Box>
  )
})
