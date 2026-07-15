# B3 Completion Runbook — get notifications fully live (test)

The B3 code is all merged + deployed to test. Three operational switches remain to make
notifications work end-to-end. All steps are cloud config (no app code). **Cloud Shell is
bash; Exchange cmdlets need `pwsh` + `Connect-ExchangeOnline`.** Work top-to-bottom.

Refs: test RG `rg-adsm-test`, API app `adsm-api-test`. Env vars are set out-of-band and
persist across image deploys (CLAUDE.md deploy gotcha #6).

---

## Step 1 — Email channel: finish the Exchange RBAC-for-Apps grant

**Why:** the tenant enforces RBAC for Applications, so `Mail.Send` alone 403s — the app
must be authorised to send *as* the shared mailbox. The service principal + org
customization were done in a prior session; only the scope + role assignment remain (they
were blocked on `Enable-OrganizationCustomization` propagation, which has now had >24h).

Run in **`pwsh`** (not bash), after `Connect-ExchangeOnline`:

```powershell
Connect-ExchangeOnline
# 1. Restrict a management scope to the notifications mailbox
New-ManagementScope -Name "ADSM-Notify-Mailbox" -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'no-reply@assured-digital.com'"
# 2. Grant the app Mail.Send limited to that scope (App = the Exchange service principal ObjectId)
New-ManagementRoleAssignment -Role "Application Mail.Send" -App d287c6bf-8421-4b3e-92d8-74d6c81086f7 -CustomResourceScope "ADSM-Notify-Mailbox"
```

**Verify (~15 min after — RBAC takes time to propagate):**
- Assign a task (or @mention) to a user whose email is a **real inbox** (NOT a self-assign —
  the helper skips actor == recipient; NOT a `@dcm.local` seed user).
- Watch the API logs for the send: `az containerapp logs show -g rg-adsm-test --name adsm-api-test --tail 50 --follow` — the 403 `ErrorAccessDenied` should be gone.
- Env already set on `adsm-api-test`: `NOTIFICATIONS_EMAIL_ENABLED=true`, `NOTIFICATIONS_FROM_ADDRESS=no-reply@assured-digital.com`. (Confirm with `az containerapp show -g rg-adsm-test --name adsm-api-test --query "properties.template.containers[0].env" -o json`.)

---

## Step 2 — Fix test `WEB_BASE_URL` (email deep-links)

**Why:** it was set to the prod URL, so test email links open the prod app ("record not
found"). Point it at the **test** web host.

```bash
# Get the test web app's public host
WEBHOST=$(az containerapp show -g rg-adsm-test --name adsm-web-test --query "properties.configuration.ingress.fqdn" -o tsv)
echo "$WEBHOST"     # sanity-check it's the TEST host
# Set it on the API (env persists; no redeploy needed for env-only change)
az containerapp update -g rg-adsm-test --name adsm-api-test --set-env-vars WEB_BASE_URL="https://$WEBHOST"
```
> If test uses a custom domain instead of the `azurecontainerapps.io` fqdn, use that instead.

**Verify:** the next notification email's "Open it" link resolves to a real test record.

---

## Step 3 — Wire the notification sweep schedule

**Why:** `POST /v1/notifications/sweep` (org-super, idempotent) is built + deployed but
**nothing calls it** — the DUE_SOON / OVERDUE alerts never fire until an external schedule
hits it. Mirror the CRM sweep, which uses the same pattern (`POST /crm/sweep`).

**3a — Discover how the CRM sweep is currently triggered** (so we reuse its auth):
```bash
az containerapp job list -g rg-adsm-test -o table
```
- **If a CRM-sweep job exists:** inspect its command
  (`az containerapp job show -g rg-adsm-test --name <job> --query "properties.template.containers[0].args" -o json`).
  It already solves auth (logs in as an org-super service user → gets a JWT → POSTs). The
  cleanest fix is to **add a second POST** to that job's script, right after the CRM one:
  `POST $API/v1/notifications/sweep` with the same bearer token.
- **If NO sweep job exists** (the CRM sweep isn't scheduled either): we create one Container
  Apps Job on a cron (e.g. daily 07:00) that: `POST /v1/auth/login` with a stored org-super
  service-account secret → capture `accessToken` → `POST /v1/notifications/sweep` (and
  `/crm/sweep`) with `Authorization: Bearer` + `x-client-id` not required (org-super, org-scoped).

**Report back what 3a shows** and I'll give the exact job command for your case.

**Verify:** run the job once manually
(`az containerapp job start -g rg-adsm-test --name <job>`), then confirm DUE_SOON/OVERDUE
notifications appear for a user with a due/overdue assigned work-item.

---

## Done when
- A real-inbox user receives an assignment email with a working test deep-link.
- A manual sweep run produces due-soon / overdue notifications.

Then → the **prod release pass** (promote B3/D3/D2 + enable C1 on prod + release-readiness
blockers), which gets its own runbook.
