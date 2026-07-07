import { CreateRecordModal } from "../../components/create/CreateRecordModal"

// CreateIncidentModal — thin adapter over the shared CreateRecordModal (Create
// Surface spec §1). Incident is migrated onto the shared surface; this wrapper
// keeps the existing Service Desk "New ticket → Incident" call site unchanged.
export function CreateIncidentModal(props: {
  open: boolean
  onClose: () => void
  onSuccess?: () => Promise<void> | void
  navigateAfterCreate?: boolean
}) {
  return <CreateRecordModal recordType="incident" {...props} />
}
