import React, { useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
  Alert
} from "@mui/material";
import { api, setAuthToken, type ApiError, type LoginResponse } from "../lib/api";
import { setToken } from "../lib/auth";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("admin@dcm.local");
  const [password, setPassword] = useState("Admin123!");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      const res = await api.post<LoginResponse>("/auth/login", {
        email,
        password
      });

      const token = res.data.accessToken;

      setToken(token);
      setAuthToken(token);

      navigate("/", { replace: true });
    } catch (err) {
      const apiErr = err as ApiError;

      const msg = Array.isArray(apiErr?.message)
        ? apiErr.message.join(", ")
        : apiErr?.message ?? "Login failed";

      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        p: 2
      }}
    >
      <Card sx={{ width: 420 }}>
        <CardContent>
          <Typography variant="h5" sx={{ mb: 2 }}>
            Sign in
          </Typography>

          <Box component="form" onSubmit={submit} sx={{ display: "grid", gap: 2 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              label="Email"
              value={email}
              fullWidth
              onChange={(e) => setEmail(e.target.value)}
            />

            <TextField
              label="Password"
              type="password"
              value={password}
              fullWidth
              onChange={(e) => setPassword(e.target.value)}
            />

            <Button type="submit" variant="contained" disabled={busy}>
              {busy ? "Signing in..." : "Sign in"}
            </Button>
          </Box>

          <Typography
            variant="caption"
            sx={{ display: "block", mt: 2, opacity: 0.8 }}
          >
            MVP uses email/password. SSO (OIDC / Azure AD) can be enabled later.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}