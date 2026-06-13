import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import App from "./routes/App";
import { NotificationProvider } from "./components/NotificationProvider";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import "./styles.css";

L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow
});

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    }
  }
});
// Register the custom slate `text.tertiary` token so createTheme() type-checks and
// `color="text.tertiary"` resolves app-wide (it mirrors the --color-text-tertiary CSS var).
declare module "@mui/material/styles" {
  interface TypeText {
    tertiary: string;
  }
}

const theme = createTheme({
  palette: {
    mode: "light",
    // Accent unified on #1d4ed8 — the value already hardcoded across tabs/queue/nav and
    // documented as primary; replaces the legacy #0b4a9f so every `color="primary"` matches.
    primary: { main: "#1d4ed8" },
    secondary: { main: "#0f766e" },
    background: { default: "#f2f6fb", paper: "#ffffff" },
    // tertiary mirrors --color-text-tertiary so MUI + CSS-var muted text resolve identically;
    // disabled is slate-aligned (was MUI's off-palette rgba(0,0,0,0.38) fallback).
    text: { primary: "#0f172a", secondary: "#475569", tertiary: "#94a3b8", disabled: "#94a3b8" },
    divider: "#e2e8f0"
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
    caption: { fontSize: "0.75rem", lineHeight: 1.4, color: "#64748b" },
    overline: { fontSize: "0.6875rem", lineHeight: 1.4, letterSpacing: "0.06em", fontWeight: 600, color: "#64748b" },
    button: { fontSize: "0.8125rem", fontWeight: 600, lineHeight: 1.2, textTransform: "none" }
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: "linear-gradient(180deg, #f4f7fb 0%, #eef3f9 100%)",
          color: "#0f172a"
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
          border: "1px solid #e2e8f0",
          boxShadow: "0 10px 28px rgba(15, 23, 42, 0.06)"
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
          background: "#f8fafc"
        }
      }
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: "#e2e8f0"
        },
        head: {
          fontSize: "0.6875rem",
          fontWeight: 600,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.05em"
        },
        body: {
          fontSize: "0.8125rem",
          color: "#0f172a"
        }
      }
    }
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={qc}>
        <NotificationProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </NotificationProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>
);
