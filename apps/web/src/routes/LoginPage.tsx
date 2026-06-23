import React, { useState } from "react";
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
  Link,
  Divider
} from "@mui/material";
import {
  Mail,
  Lock,
  Visibility,
  VisibilityOff,
  Microsoft
} from "@mui/icons-material";
import { api, setAuthToken, type ApiError, type LoginResponse } from "../lib/api";
import { setSession } from "../lib/auth";
import { shellTokens } from "../components/shared";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ssoEnabled = import.meta.env.VITE_SSO_ENABLED === "true";

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
      setSession(token, res.data.user);
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
        gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }
      }}
    >
      {/* Left brand panel */}
      <Box
        sx={{
          display: { xs: "none", md: "flex" },
          alignItems: "center",
          justifyContent: "center",
          bgcolor: shellTokens.bg,
          p: 4
        }}
      >
        <Box
          component="img"
          src="/ad-logo-white-new.svg"
          alt="AD Service Management"
          sx={{ width: 400 }}
        />
      </Box>

      {/* Right form panel */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "background.paper",
          p: { xs: 3, sm: 6 }
        }}
      >
        <Box sx={{ width: "100%", maxWidth: 360 }}>
          <Typography variant="h5" sx={{ color: "text.primary", mb: 0.5 }}>
            Sign in
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 2.5 }}>
            Use your work email to continue.
          </Typography>

          <Box component="form" onSubmit={submit} sx={{ display: "grid", gap: 2 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              label="Email"
              type="email"
              value={email}
              fullWidth
              onChange={(e) => setEmail(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Mail fontSize="small" />
                  </InputAdornment>
                )
              }}
            />

            <TextField
              label="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              fullWidth
              onChange={(e) => setPassword(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Lock fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword((s) => !s)}
                      edge="end"
                      size="small"
                    >
                      {showPassword ? (
                        <VisibilityOff fontSize="small" />
                      ) : (
                        <Visibility fontSize="small" />
                      )}
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />

            <Box sx={{ textAlign: "right", mt: -1 }}>
              <Link
                component="button"
                type="button"
                onClick={() => {
                  /* TODO: wire reset flow */
                }}
                sx={{ color: "primary.main", fontSize: 12 }}
              >
                Forgot password?
              </Link>
            </Box>

            <Button type="submit" variant="contained" fullWidth disabled={busy}>
              {busy ? "Signing in..." : "Sign in"}
            </Button>

            {ssoEnabled && (
              <>
                <Divider sx={{ my: 1 }}>OR</Divider>

                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={<Microsoft />}
                  onClick={() => {
                    /* TODO: start OIDC / Azure AD sign-in */
                  }}
                >
                  Continue with Microsoft
                </Button>
              </>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
