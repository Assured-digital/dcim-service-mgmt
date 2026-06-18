// Single source of truth for the standard page gutter — the top/left/right/bottom inset
// around routed page content. The Shell <main> applies this whenever a page is NOT
// full-bleed (apps/web/src/routes/Shell.tsx). Full-bleed pages that re-add a content
// gutter should reference THIS (not a hand-rolled value) so every surface aligns at the
// same inset AND the same breakpoint — e.g. the checks landing, which is full-bleed but
// re-adds the gutter for its card content.
export const PAGE_GUTTER = { xs: "12px", md: "20px" } as const
