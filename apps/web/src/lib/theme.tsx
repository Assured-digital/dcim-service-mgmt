import React from "react"
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material"
import type { Theme } from "@mui/material"
import { setActiveThemeMode, type ThemeMode } from "../components/shared/tokens/colors"

// ── Persistence ──────────────────────────────────────────────────────────────
// Mirrors lib/scope.ts: one localStorage key, read on init, written on change.
// No backend — the User model is not touched.
const THEME_MODE_KEY = "dcms_theme_mode"

export function getStoredThemeMode(): ThemeMode {
  return localStorage.getItem(THEME_MODE_KEY) === "dark" ? "dark" : "light"
}

export function setStoredThemeMode(mode: ThemeMode) {
  localStorage.setItem(THEME_MODE_KEY, mode)
}

// Register the custom slate `text.tertiary` token so createTheme() type-checks and
// `color="text.tertiary"` resolves app-wide (it mirrors the --color-text-tertiary CSS var).
declare module "@mui/material/styles" {
  interface TypeText {
    tertiary: string
  }
}

// ── Theme factory ──────────────────────────────────────────────────────────
// One factory, two palettes. The LIGHT branch reproduces the previous (light-only)
// theme exactly — the proven default, byte-for-byte — so light mode does not
// regress. The DARK branch re-scales the same structure for a dark surface.
export function getTheme(mode: ThemeMode): Theme {
  const isDark = mode === "dark"
  const mutedText = isDark ? "#94a3b8" : "#64748b"
  return createTheme({
    palette: isDark
      ? {
          mode: "dark",
          primary: { main: "#3b82f6" },
          secondary: { main: "#14b8a6" },
          background: { default: "#0b1220", paper: "#1e293b" },
          // secondary/tertiary lifted from the carried-over slate-400/500 so they
          // read on the dark surfaces — secondary clears WCAG AA (~7.6:1 on paper),
          // tertiary clears AA-large (~4.3:1) — while staying subordinate to primary.
          text: { primary: "#e2e8f0", secondary: "#b0bccd", tertiary: "#7e8ca1", disabled: "#475569" },
          divider: "#334155",
        }
      : {
          mode: "light",
          // Accent unified on #1d4ed8 — the value already hardcoded across tabs/queue/nav and
          // documented as primary; replaces the legacy #0b4a9f so every `color="primary"` matches.
          primary: { main: "#1d4ed8" },
          secondary: { main: "#0f766e" },
          background: { default: "#f2f6fb", paper: "#ffffff" },
          // tertiary mirrors --color-text-tertiary so MUI + CSS-var muted text resolve identically;
          // disabled is slate-aligned (was MUI's off-palette rgba(0,0,0,0.38) fallback).
          text: { primary: "#0f172a", secondary: "#475569", tertiary: "#94a3b8", disabled: "#94a3b8" },
          divider: "#e2e8f0",
        },
    shape: { borderRadius: 6 },
    typography: {
      fontFamily: "'Manrope', sans-serif",
      h3: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: "-0.01em", fontSize: "2rem", lineHeight: 1.2 },
      h4: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: "-0.01em" },
      h5: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: "-0.01em" },
      h6: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 },
      subtitle1: { fontSize: "0.9375rem", lineHeight: 1.35, fontWeight: 600 },
      subtitle2: { fontSize: "0.875rem", lineHeight: 1.35, fontWeight: 600 },
      body1: { fontSize: "0.875rem", lineHeight: 1.5 },
      body2: { fontSize: "0.8125rem", lineHeight: 1.5 },
      caption: { fontSize: "0.75rem", lineHeight: 1.4, color: mutedText },
      overline: { fontSize: "0.6875rem", lineHeight: 1.4, letterSpacing: "0.06em", fontWeight: 600, color: mutedText },
      button: { fontSize: "0.8125rem", fontWeight: 600, lineHeight: 1.2, textTransform: "none" }
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            background: isDark
              ? "linear-gradient(180deg, #0b1220 0%, #0d1526 100%)"
              : "linear-gradient(180deg, #f4f7fb 0%, #eef3f9 100%)",
            color: isDark ? "#e2e8f0" : "#0f172a"
          }
        }
      },
      MuiTypography: {
        styleOverrides: {
          root: {
            color: "inherit"
          }
        }
      },
      MuiCard: {
        styleOverrides: {
          root: {
            border: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
            boxShadow: isDark ? "0 10px 28px rgba(0, 0, 0, 0.45)" : "0 10px 28px rgba(15, 23, 42, 0.06)",
            // Suppress MUI's dark-mode elevation overlay so cards stay the flat palette paper.
            ...(isDark ? { backgroundImage: "none" } : {})
          }
        }
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 6
          },
          sizeSmall: {
            fontSize: "0.75rem",
            minHeight: 28,
            paddingTop: 4,
            paddingBottom: 4
          }
        }
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            background: isDark ? "#172033" : "#f8fafc"
          }
        }
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderColor: isDark ? "#334155" : "#e2e8f0"
          },
          head: {
            fontSize: "0.6875rem",
            fontWeight: 600,
            color: mutedText,
            textTransform: "uppercase",
            letterSpacing: "0.05em"
          },
          body: {
            fontSize: "0.8125rem",
            color: isDark ? "#e2e8f0" : "#0f172a"
          }
        }
      }
    }
  })
}

// ── Mode context ─────────────────────────────────────────────────────────────
// Mirrors NotificationProvider: a single app-level context + a throw-if-missing
// hook. Holds the mode, swaps the theme object, and keeps three things in sync on
// change — the token-layer active mode (so colour helpers resolve correctly), the
// `data-theme` attribute on <html> (so the dark CSS-var scope in styles.css
// applies), and localStorage (persistence).
type ThemeModeContextValue = {
  mode: ThemeMode
  toggleMode: () => void
  setMode: (mode: ThemeMode) => void
}

const ThemeModeContext = React.createContext<ThemeModeContextValue | null>(null)

function applyModeSideEffects(mode: ThemeMode) {
  // Run in the toggle handler (an event, NOT during render) so the token-layer
  // global is updated BEFORE the re-render the state change triggers — every
  // component re-rendering on the theme swap then reads the correct mode.
  setActiveThemeMode(mode)
  setStoredThemeMode(mode)
  document.documentElement.setAttribute("data-theme", mode)
}

// Initialise from storage at module load — before the first render — so the token
// helpers and the CSS-var scope reflect the persisted choice with no light→dark flash.
const initialThemeMode = getStoredThemeMode()
setActiveThemeMode(initialThemeMode)
if (typeof document !== "undefined") {
  document.documentElement.setAttribute("data-theme", initialThemeMode)
}

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = React.useState<ThemeMode>(initialThemeMode)
  const theme = React.useMemo(() => getTheme(mode), [mode])

  const setMode = React.useCallback((next: ThemeMode) => {
    applyModeSideEffects(next)
    setModeState(next)
  }, [])

  const toggleMode = React.useCallback(() => {
    setMode(mode === "dark" ? "light" : "dark")
  }, [mode, setMode])

  const value = React.useMemo<ThemeModeContextValue>(() => ({ mode, toggleMode, setMode }), [mode, toggleMode, setMode])

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  )
}

export function useThemeMode() {
  const ctx = React.useContext(ThemeModeContext)
  if (!ctx) throw new Error("useThemeMode must be used inside <ThemeModeProvider>")
  return ctx
}
