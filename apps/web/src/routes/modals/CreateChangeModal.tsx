import { CreateRecordModal } from "../../components/create/CreateRecordModal"

// CreateChangeModal — thin adapter over the shared CreateRecordModal (Create
// Surface spec §1). Change is migrated onto the shared surface; this wrapper keeps
// the existing Service Desk "New ticket → Change" call site unchanged.
export function CreateChangeModal(props: {
  open: boolean
  onClose: () => void
  onSuccess?: () => Promise<void> | void
  navigateAfterCreate?: boolean
}) {
  return <CreateRecordModal recordType="change" {...props} />
}
