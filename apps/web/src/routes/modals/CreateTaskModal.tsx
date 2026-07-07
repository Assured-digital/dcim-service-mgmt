import { CreateRecordModal } from "../../components/create/CreateRecordModal"

// CreateTaskModal — now a thin adapter over the shared CreateRecordModal (Create
// Surface spec §1). Task is the first type migrated onto the shared surface; this
// wrapper keeps the existing call sites (Service Desk queue + the per-record detail
// pages' "Add task" flows) unchanged while the create UI is unified. As the other
// types migrate, their bespoke modals fold into CreateRecordModal the same way.
export function CreateTaskModal(props: {
  open: boolean
  onClose: () => void
  linkedEntityType?: string
  linkedEntityId?: string
  linkedEntityLabel?: string
  onSuccess?: () => Promise<void> | void
  navigateAfterCreate?: boolean
}) {
  return <CreateRecordModal recordType="task" {...props} />
}
