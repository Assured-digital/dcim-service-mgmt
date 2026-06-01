import React, { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Alert,
  Box,
  Button,
  Drawer,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography
} from "@mui/material"
import VisibilityIcon from "@mui/icons-material/Visibility"
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff"
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh"
import { api, type ApiError } from "../lib/api"
import { getCurrentUser } from "../lib/auth"
import { ROLES } from "../lib/rbac"
import { createUser, updateUser, type UserRole, type UserView } from "../lib/users"

type Client = { id: string; name: string }

export type UserFormMode = "create" | "edit"

type Props = {
  open: boolean
  mode: UserFormMode
  user: UserView | null
  onClose: () => void
}

// Role allow-lists mirror UsersService.assertCanAssignRole (UX only — the
// server enforces these regardless). ADMIN (legacy) and PUBLIC_USER are never
// offered.
const ORG_OWNER_ASSIGNABLE: UserRole[] = [
  ROLES.ORG_OWNER,
  ROLES.ORG_ADMIN,
  ROLES.SERVICE_MANAGER,
  ROLES.SERVICE_DESK_ANALYST,
  ROLES.ENGINEER,
  ROLES.CLIENT_VIEWER
]
const ORG_ADMIN_ASSIGNABLE: UserRole[] = [
  ROLES.SERVICE_MANAGER,
  ROLES.SERVICE_DESK_ANALYST,
  ROLES.ENGINEER,
  ROLES.CLIENT_VIEWER
]
const MANAGER_ASSIGNABLE: UserRole[] = [ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER, ROLES.CLIENT_VIEWER]

function assignableRolesFor(actorRole: string | undefined): UserRole[] {
  if (actorRole === ROLES.ORG_OWNER || actorRole === ROLES.ADMIN) return ORG_OWNER_ASSIGNABLE
  if (actorRole === ROLES.ORG_ADMIN) return ORG_ADMIN_ASSIGNABLE
  if (actorRole === ROLES.SERVICE_MANAGER) return MANAGER_ASSIGNABLE
  return []
}

// Mirrors UsersService.requiresClientScope. ADMIN is org-level too, but it is
// never selectable here, so org-level == ORG_OWNER / ORG_ADMIN.
function requiresClientScope(role: UserRole): boolean {
  return role !== ROLES.ORG_OWNER && role !== ROLES.ORG_ADMIN && role !== ROLES.ADMIN
}

function generateStrongPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*"
  const bytes = new Uint32Array(20)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")
}

export default function UserFormDrawer({ open, mode, user, onClose }: Props) {
  const qc = useQueryClient()
  const currentUser = getCurrentUser()
  const isEdit = mode === "edit"

  const allowedRoles = useMemo(() => assignableRolesFor(currentUser?.role), [currentUser?.role])

  const [email, setEmail] = useState("")
  const [role, setRole] = useState<UserRole>(allowedRoles[0] ?? ROLES.CLIENT_VIEWER)
  const [clientId, setClientId] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isActive, setIsActive] = useState(true)

  const clients = useQuery({
    queryKey: ["clients"],
    enabled: open,
    queryFn: async () => (await api.get<Client[]>("/clients")).data
  })

  // Reset form whenever the drawer opens or the target user changes.
  useEffect(() => {
    if (!open) return
    if (isEdit && user) {
      setEmail(user.email)
      setRole(allowedRoles.includes(user.role) ? user.role : (allowedRoles[0] ?? user.role))
      setClientId(user.clientId ?? "")
      setIsActive(user.isActive)
    } else {
      setEmail("")
      setRole(allowedRoles[0] ?? ROLES.CLIENT_VIEWER)
      setClientId("")
      setIsActive(true)
    }
    setPassword("")
    setShowPassword(false)
  }, [open, mode, user, allowedRoles])

  const needsClient = requiresClientScope(role)

  // Clear the client field when switching to an org-level role.
  useEffect(() => {
    if (!needsClient && clientId) setClientId("")
  }, [needsClient]) // eslint-disable-line react-hooks/exhaustive-deps

  const editingSelf = isEdit && !!user && user.id === currentUser?.userId

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit && user) {
        return updateUser(user.id, {
          role,
          clientId: needsClient ? clientId : undefined,
          isActive,
          password: password.trim() ? password : undefined
        })
      }
      return createUser({
        email: email.trim(),
        password,
        role,
        clientId: needsClient ? clientId : undefined,
        isActive
      })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["users-admin"] })
      await qc.invalidateQueries({ queryKey: ["users"] })
      onClose()
    }
  })

  const mutationError = [mutation.error].find(Boolean) as ApiError | undefined
  const errorMessage = Array.isArray(mutationError?.message)
    ? mutationError.message.join(", ")
    : mutationError?.message

  const passwordTooShort = password.trim().length > 0 && password.trim().length < 8
  const passwordMissing = !isEdit && password.trim().length < 8
  const emailMissing = !isEdit && !email.trim()
  const clientMissing = needsClient && !clientId
  const canSubmit = !emailMissing && !passwordMissing && !passwordTooShort && !clientMissing && !mutation.isPending

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: { xs: 340, sm: 420 }, p: 2.5, display: "flex", flexDirection: "column", height: "100%" }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
          {isEdit ? "Edit user" : "Create user"}
        </Typography>
        <Typography color="text.secondary" sx={{ fontSize: 13, mb: 2 }}>
          {isEdit
            ? "Update role, client scope, status, or reset the password."
            : "Provision operational access for a user in the selected scope."}
        </Typography>

        <Stack spacing={2} sx={{ flex: 1, overflowY: "auto", pr: 0.5 }}>
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isEdit}
            fullWidth
            InputLabelProps={{ shrink: true }}
            autoComplete="off"
            inputProps={{ autoComplete: "off" }}
          />

          <TextField
            select
            label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            fullWidth
            InputLabelProps={{ shrink: true }}
          >
            {allowedRoles.map((r) => (
              <MenuItem key={r} value={r}>
                {r}
              </MenuItem>
            ))}
          </TextField>

          {needsClient ? (
            <TextField
              select
              label="Client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
              error={clientMissing}
              helperText={clientMissing ? "A client is required for this role." : undefined}
              fullWidth
              InputLabelProps={{ shrink: true }}
            >
              <MenuItem value="">— Select client —</MenuItem>
              {(clients.data ?? []).map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
          ) : null}

          <TextField
            label={isEdit ? "Reset password (leave blank to keep current)" : "Password"}
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required={!isEdit}
            error={passwordTooShort}
            helperText={
              passwordTooShort
                ? "Must be at least 8 characters."
                : "Setting a password signs the user out of existing sessions."
            }
            fullWidth
            InputLabelProps={{ shrink: true }}
            autoComplete="new-password"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title="Generate strong password">
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={() => {
                        setPassword(generateStrongPassword())
                        setShowPassword(true)
                      }}
                    >
                      <AutoFixHighIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <IconButton edge="end" size="small" onClick={() => setShowPassword((s) => !s)}>
                    {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              )
            }}
          />

          {isEdit ? (
            <Tooltip title={editingSelf ? "You cannot deactivate your own account" : ""} placement="top-start">
              <FormControlLabel
                control={
                  <Switch
                    checked={isActive}
                    disabled={editingSelf}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                }
                label={isActive ? "Active" : "Inactive"}
                sx={{ width: "fit-content" }}
              />
            </Tooltip>
          ) : null}

          {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
        </Stack>

        <Stack direction="row" spacing={1.2} sx={{ mt: 2, pt: 2, borderTop: "1px solid #e2e8f0" }}>
          <Button variant="outlined" onClick={onClose} disabled={mutation.isPending} fullWidth>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => mutation.mutate()} disabled={!canSubmit} fullWidth>
            {mutation.isPending ? "Saving…" : isEdit ? "Save" : "Create"}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  )
}
