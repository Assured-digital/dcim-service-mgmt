import { DefaultAzureCredential } from "@azure/identity"

// App-only email send via Microsoft Graph (Mail.Send). A plain function (not the
// injectable MsGraphService) so the best-effort notification path can call it without
// module wiring — mirrors emitNotification. Uses the runtime managed identity, which
// needs the Graph **Mail.Send** application permission scoped to the from-mailbox via
// an Exchange application access policy (least privilege). Inert unless configured.

const GRAPH_BASE = "https://graph.microsoft.com/v1.0"
const GRAPH_SCOPE = "https://graph.microsoft.com/.default"
const credential = new DefaultAzureCredential()

// Email is on only when Graph is enabled, the feature flag is set, AND a from-mailbox
// is configured — so shipping this code sends nothing until all three are in place.
export function mailSendConfigured(): boolean {
  return (
    process.env.GRAPH_ENABLED === "true" &&
    process.env.NOTIFICATIONS_EMAIL_ENABLED === "true" &&
    !!process.env.NOTIFICATIONS_FROM_ADDRESS
  )
}

// Send one HTML email. Throws on failure — callers (best-effort) swallow.
export async function graphSendMail(to: string[], subject: string, html: string): Promise<void> {
  const from = process.env.NOTIFICATIONS_FROM_ADDRESS
  const recipients = [...new Set(to.filter((a): a is string => !!a))]
  if (!from || recipients.length === 0) return
  const token = (await credential.getToken(GRAPH_SCOPE))?.token
  if (!token) throw new Error("Failed to acquire a Graph token for sendMail")
  const res = await fetch(`${GRAPH_BASE}/users/${encodeURIComponent(from)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: recipients.map((address) => ({ emailAddress: { address } }))
      },
      saveToSentItems: false
    })
  })
  if (!res.ok) {
    const b = await res.text().catch(() => "")
    throw new Error(`Graph sendMail → ${res.status}: ${b.slice(0, 200)}`)
  }
}
