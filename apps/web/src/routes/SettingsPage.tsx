import React, { useState } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  InputAdornment,
  IconButton,
  useTheme
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { api, type ApiError } from "../lib/api";
import NotificationSettings from "../components/NotificationSettings";

const NEW_PASSWORD_RULE = /(?=.*[A-Za-z])(?=.*\d)/;
const NEW_PASSWORD_HELPER = "At least 8 characters, including a letter and a number.";

function isNewPasswordValid(pw: string) {
  return pw.length >= 8 && NEW_PASSWORD_RULE.test(pw);
}

export default function SettingsPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const newPasswordInvalid = newPassword.length > 0 && !isNewPasswordValid(newPassword);

  const theme = useTheme();

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    if (busy) return;

    setError(null);
    setSuccess(false);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Please fill in all three fields.");
      return;
    }

    if (!isNewPasswordValid(newPassword)) {
      setError("New password must be at least 8 characters and include a letter and a number.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      await api.post("/auth/change-password", { currentPassword, newPassword });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(true);
    } catch (err) {
      const apiErr = err as ApiError;

      const msg = Array.isArray(apiErr?.message)
        ? apiErr.message.join(", ")
        : apiErr?.message ?? "Failed to change password";

      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box>
      <Typography sx={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary, #0f172a)", mb: 2 }}>
        Settings
      </Typography>

      <Box
        sx={{
          maxWidth: 440,
          bgcolor: theme.palette.background.paper,
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 2,
          p: 3
        }}
      >
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary, #0f172a)", mb: 2 }}>
          Change password
        </Typography>

        <Box component="form" onSubmit={submit} sx={{ display: "grid", gap: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {success && (
            <Box sx={{ display: "grid", gap: 0.5 }}>
              <Alert severity="success">Password changed successfully.</Alert>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                Your other sessions will be signed out.
              </Typography>
            </Box>
          )}

          <TextField
            label="Current password"
            type={showCurrent ? "text" : "password"}
            value={currentPassword}
            fullWidth
            onChange={(e) => setCurrentPassword(e.target.value)}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={showCurrent ? "Hide password" : "Show password"}
                    onClick={() => setShowCurrent((s) => !s)}
                    edge="end"
                    size="small"
                  >
                    {showCurrent ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              )
            }}
          />

          <TextField
            label="New password"
            type={showNew ? "text" : "password"}
            value={newPassword}
            fullWidth
            onChange={(e) => setNewPassword(e.target.value)}
            error={newPasswordInvalid}
            helperText={NEW_PASSWORD_HELPER}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={showNew ? "Hide password" : "Show password"}
                    onClick={() => setShowNew((s) => !s)}
                    edge="end"
                    size="small"
                  >
                    {showNew ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              )
            }}
          />

          <TextField
            label="Confirm new password"
            type={showConfirm ? "text" : "password"}
            value={confirmPassword}
            fullWidth
            onChange={(e) => setConfirmPassword(e.target.value)}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                    onClick={() => setShowConfirm((s) => !s)}
                    edge="end"
                    size="small"
                  >
                    {showConfirm ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              )
            }}
          />

          <Box>
            <Button type="submit" variant="contained" disabled={busy}>
              {busy ? "Saving..." : "Change password"}
            </Button>
          </Box>
        </Box>
      </Box>

      <NotificationSettings />
    </Box>
  );
}
