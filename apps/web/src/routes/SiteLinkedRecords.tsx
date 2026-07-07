import { ParentLinkedRecords } from "../components/ParentLinkedRecords"

// Linked-records parity for Site (DCIM_DESIGN_BRIEF §6 — exists on Asset + Cabinet).
// Now a thin wrapper over the shared ParentLinkedRecords surface (row list + shared
// CreateRecordModal). Uses the LIVE generic linkedEntityType/Id pointer ("Site" is an
// intended additive parent type per CLAUDE.md) — no schema or backend change.
export default function SiteLinkedRecords({ siteId, siteName, canManage }: {
  siteId: string; siteName: string; canManage: boolean
}) {
  return (
    <ParentLinkedRecords entityType="Site" entityId={siteId} entityLabel={siteName} canManage={canManage} />
  )
}
