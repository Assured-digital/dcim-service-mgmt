import React, { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Drawer,
  FormHelperText,
  IconButton,
  InputAdornment,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material"
import VisibilityIcon from "@mui/icons-material/Visibility"
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff"
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh"
import { api, type ApiError } from "../lib/api"
import { useNotification } from "./NotificationProvider"
import { getCurrentUser, isOrgSuperRole } from "../lib/auth"
import { AD_STAFF_ROLES, CLIENT_OWN_ROLES, ROLES } from "../lib/rbac"
import { getSelectedClientId } from "../lib/scope"
import { createUser, updateUser, type UserRole, type UserView } from "../lib/users"

type Client = { id: string; name: string }

export type UserFormMode = "create" | "edit"

// Which population this drawer is managing. "org-staff" = Assured Digital staff
// (Top Admin → Users); "client" = a client's own users (Client Admin → Users).
// It narrows the role picker to the relevant category and, for the client
// context, pre-fills the client field from the global scope. Undefined keeps the
// legacy behaviour (full assignable list, no pre-fill).
export type UserFormContext = "org-staff" | "client"

type Props = {
  open: boolean
  mode: UserFormMode
  user: UserView | null
  onClose: () => void
  context?: UserFormContext
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

// 12px muted label sitting above each field for consistent vertical rhythm.
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      component="label"
      sx={{
        display: "block",
        fontSize: 12,
        fontWeight: 600,
        color: "var(--color-text-muted, #64748b)",
        mb: 0.625
      }}
    >
      {children}
    </Typography>
  )
}

// Segmented Active / Inactive status control, replacing the oversized Switch.
// Two adjacent pill segments in a bordered container; the active state is
// highlighted (Active = success, Inactive = muted). The Inactive segment is
// disabled when editing your own account (mirrors the server self-guard).
function StatusSegmented({
  value,
  onChange,
  disableInactive
}: {
  value: boolean
  onChange: (active: boolean) => void
  disableInactive: boolean
}) {
  const segment = (active: boolean) => {
    const selected = value === active
    const disabled = !active && disableInactive
    const selectedSx = active
      ? { bgcolor: "#dcfce7", color: "#166534" }
      : { bgcolor: "var(--color-background-tertiary, #f1f5f9)", color: "var(--color-text-secondary, #475569)" }
    return (
      <Box
        role="button"
        aria-pressed={selected}
        onClick={() => {
          if (disabled || selected) return
          onChange(active)
        }}
        sx={{
          flex: 1,
          textAlign: "center",
          py: 0.75,
          fontSize: 13,
          fontWeight: 600,
          borderRadius: 1.5,
          cursor: disabled ? "not-allowed" : selected ? "default" : "pointer",
          userSelect: "none",
          opacity: disabled ? 0.5 : 1,
          ...(selected ? selectedSx : { color: "var(--color-text-muted, #64748b)" }),
          transition: "background-color 120ms ease, color 120ms ease"
        }}
      >
        {active ? "Active" : "Inactive"}
      </Box>
    )
  }

  return (
    <Box
      sx={{
        display: "flex",
        gap: 0.5,
        p: 0.5,
        border: "1px solid var(--color-border-primary, #e2e8f0)",
        borderRadius: 2,
        bgcolor: "var(--color-background-primary, #ffffff)"
      }}
    >
      {segment(true)}
      {segment(false)}
    </Box>
  )
}

export default function UserFormDrawer({ open, mode, user, onClose, context }: Props) {
  const qc = useQueryClient()
  const { notify } = useNotification()
  const currentUser = getCurrentUser()
  const isEdit = mode === "edit"

  const allowedRoles = useMemo(() => assignableRolesFor(currentUser?.role), [currentUser?.role])

  // Narrow the actor's assignable roles to the view's population. Keeps the same
  // server-mirrored allow-list, just scoped to AD-staff or client-own roles.
  const contextRoles = useMemo(() => {
    if (context === "org-staff") return allowedRoles.filter((r) => AD_STAFF_ROLES.includes(r))
    if (context === "client") return allowedRoles.filter((r) => CLIENT_OWN_ROLES.includes(r))
    return allowedRoles
  }, [allowedRoles, context])

  const [email, setEmail] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [knownAs, setKnownAs] = useState("")
  const [role, setRole] = useState<UserRole>(contextRoles[0] ?? ROLES.CLIENT_VIEWER)
  const [clientIds, setClientIds] = useState<string[]>([])
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isActive, setIsActive] = useState(true)

  // Assignable-client source by role: org-super creators see ALL org clients
  // (/clients); client-scoped creators see only their own assignments
  // (/clients/mine) and must never call the admin-only /clients.
  const isOrgSuper = isOrgSuperRole(currentUser?.role)
  const clients = useQuery({
    queryKey: isOrgSuper ? ["clients"] : ["clients-mine"],
    enabled: open,
    queryFn: async () => (await api.get<Client[]>(isOrgSuper ? "/clients" : "/clients/mine")).data
  })

  const clientNameById = useMemo(
    () => new Map((clients.data ?? []).map((c) => [c.id, c.name])),
    [clients.data]
  )

  // Reset form whenever the drawer opens or the target user changes.
  useEffect(() => {
    if (!open) return
    if (isEdit && user) {
      setEmail(user.email)
      setFirstName(user.firstName ?? "")
      setLastName(user.lastName ?? "")
      setKnownAs(user.knownAs ?? "")
      setRole(contextRoles.includes(user.role) ? user.role : (contextRoles[0] ?? user.role))
      setClientIds(user.clientIds ?? [])
      setIsActive(user.isActive)
    } else {
      setEmail("")
      setFirstName("")
      setLastName("")
      setKnownAs("")
      setRole(contextRoles[0] ?? ROLES.CLIENT_VIEWER)
      // In the client view, pre-fill the client field from the global scope so
      // the admin doesn't have to re-pick the client they're already in.
      const scoped = context === "client" ? getSelectedClientId() : null
      setClientIds(scoped ? [scoped] : [])
      setIsActive(true)
    }
    setPassword("")
    setShowPassword(false)
  }, [open, mode, user, contextRoles, context])

  const needsClient = requiresClientScope(role)

  // Clear the client field when switching to an org-level role.
  useEffect(() => {
    if (!needsClient && clientIds.length) setClientIds([])
  }, [needsClient]) // eslint-disable-line react-hooks/exhaustive-deps

  const editingSelf = isEdit && !!user && user.id === currentUser?.userId

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit && user) {
        return updateUser(user.id, {
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          knownAs: knownAs.trim() || undefined,
          role,
          clientIds: needsClient ? clientIds : undefined,
          isActive,
          password: password.trim() ? password : undefined
        })
      }
      return createUser({
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        knownAs: knownAs.trim() || undefined,
        role,
        clientIds: needsClient ? clientIds : undefined,
        isActive
      })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["users-admin"] })
      await qc.invalidateQueries({ queryKey: ["users-org"] })
      await qc.invalidateQueries({ queryKey: ["users"] })
      notify.success(isEdit ? "User updated" : "User created")
      onClose()
    }
  })

  const mutationError = [mutation.error].find(Boolean) as ApiError | undefined
  const errorMessage = Array.isArray(mutationError?.message)
    ? mutationError.message.join(", ")
    : mutationError?.message

  const passwordTooShort = password.trim().length > 0 && password.trim().length < 8
  const passwordMissing = !isEdit && password.trim().length < 8
  // Email is only editable on create; surface the required + format indicator there.
  const emailMissing = !isEdit && !email.trim()
  const emailInvalid = !isEdit && !!email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const emailError = emailMissing || emailInvalid
  // First / last name are required in BOTH create and edit modes.
  const firstNameMissing = !firstName.trim()
  const lastNameMissing = !lastName.trim()
  const clientMissing = needsClient && clientIds.length === 0
  const canSubmit =
    !emailError &&
    !firstNameMissing &&
    !lastNameMissing &&
    !passwordMissing &&
    !passwordTooShort &&
    !clientMissing &&
    !mutation.isPending

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

        <Stack spacing={2.25} sx={{ flex: 1, overflowY: "auto", pr: 0.5 }}>
          <Box>
            <FieldLabel>Email</FieldLabel>
            <TextField
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isEdit}
              required={!isEdit}
              error={emailError}
              helperText={emailMissing ? "Email is required." : emailInvalid ? "Enter a valid email." : undefined}
              fullWidth
              size="small"
              autoComplete="off"
              inputProps={{ autoComplete: "off" }}
              sx={
                isEdit
                  ? {
                      "& .MuiInputBase-root.Mui-disabled": {
                        bgcolor: "var(--color-background-secondary, #f8fafc)"
                      },
                      "& .MuiInputBase-input.Mui-disabled": {
                        WebkitTextFillColor: "var(--color-text-muted, #64748b)",
                        color: "var(--color-text-muted, #64748b)"
                      }
                    }
                  : undefined
              }
            />
          </Box>

          <Box>
            <FieldLabel>First name</FieldLabel>
            <TextField
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              error={firstNameMissing}
              helperText={firstNameMissing ? "First name is required." : undefined}
              fullWidth
              size="small"
            />
          </Box>

          <Box>
            <FieldLabel>Last name</FieldLabel>
            <TextField
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              error={lastNameMissing}
              helperText={lastNameMissing ? "Last name is required." : undefined}
              fullWidth
              size="small"
            />
          </Box>

          <Box>
            <FieldLabel>Known as</FieldLabel>
            <TextField
              value={knownAs}
              onChange={(e) => setKnownAs(e.target.value)}
              placeholder={firstName.trim() ? `Defaults to ${firstName.trim()}` : "Defaults to first name"}
              fullWidth
              size="small"
            />
          </Box>

          <Box>
            <FieldLabel>Role</FieldLabel>
            <TextField
              select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              fullWidth
              size="small"
            >
              {contextRoles.map((r) => (
                <MenuItem key={r} value={r}>
                  {r}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          {needsClient ? (
            <Box>
              <FieldLabel>{clientIds.length > 1 ? "Clients" : "Client"}</FieldLabel>
              <Select
                multiple
                value={clientIds}
                onChange={(e) => {
                  const v = e.target.value
                  setClientIds(typeof v === "string" ? v.split(",") : v)
                }}
                input={<OutlinedInput />}
                displayEmpty
                error={clientMissing}
                fullWidth
                size="small"
                renderValue={(selected) =>
                  selected.length === 0 ? (
                    <Typography sx={{ color: "var(--color-text-muted, #64748b)", fontSize: 14 }}>
                      — Select client(s) —
                    </Typography>
                  ) : (
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                      {selected.map((id) => (
                        <Chip key={id} size="small" label={clientNameById.get(id) ?? id} />
                      ))}
                    </Box>
                  )
                }
              >
                {(clients.data ?? []).map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    <Checkbox checked={clientIds.includes(c.id)} size="small" sx={{ py: 0.25 }} />
                    <ListItemText primary={c.name} />
                  </MenuItem>
                ))}
              </Select>
              {clientMissing ? (
                <FormHelperText error>At least one client is required for this role.</FormHelperText>
              ) : null}
            </Box>
          ) : null}

          <Box>
            <FieldLabel>{isEdit ? "Reset password" : "Password"}</FieldLabel>
            <TextField
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!isEdit}
              error={passwordTooShort}
              placeholder={isEdit ? "Leave blank to keep current" : undefined}
              helperText={
                passwordTooShort
                  ? "Must be at least 8 characters."
                  : "Setting a password signs the user out of existing sessions."
              }
              fullWidth
              size="small"
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
          </Box>

          {isEdit ? (
            <Box>
              <FieldLabel>Status</FieldLabel>
              <Tooltip
                title={editingSelf ? "You cannot deactivate your own account" : ""}
                placement="top-start"
              >
                <Box>
                  <StatusSegmented value={isActive} onChange={setIsActive} disableInactive={editingSelf} />
                </Box>
              </Tooltip>
            </Box>
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
