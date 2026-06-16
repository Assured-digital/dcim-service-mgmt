import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  resolve: {
    dedupe: ["react", "react-dom"]
  },
  optimizeDeps: {
    include: [
      // React singletons (keep — fixes dispatcher-splitting "Invalid hook call")
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      // Heavy deps that lazy-loaded routes import. Pin them so Vite pre-bundles
      // everything upfront in one coherent optimize pass at startup. Otherwise a
      // lazy route's first import of e.g. @mui/icons-material triggers a mid-session
      // re-optimize, discarding the hash the running page already loaded → 504
      // "Outdated Optimize Dep" white screens. See CLAUDE.md dev-environment notes.
      "@mui/material",
      "@mui/icons-material",
      "@mui/x-charts",
      "@mui/x-data-grid",
      "@emotion/react",
      "@emotion/styled",
      "@tanstack/react-query",
      "react-router-dom"
    ]
  }
});
