// Tokens
// Tokens
export * from "./tokens/colors"

// Primitives
export { InfoField } from "./primitives/InfoField"
export { Badge } from "./primitives/Badge"
export { SectionHeader } from "./primitives/SectionHeader"
export { EmptySlot } from "./primitives/EmptySlot"
export { PanelCard } from "./primitives/PanelCard"
export { TypeBadge } from "./primitives/TypeBadge"
export type { TicketKind, BadgeKind } from "./primitives/TypeBadge"
export { PriorityDot } from "./primitives/PriorityDot"
export { Avatar } from "./primitives/Avatar"
export type { AvatarVariant, AvatarSize } from "./primitives/Avatar"

// Presentational list cells (engine-agnostic — <TableCell> or DataGrid renderCell).
// One shared pill: IntentPill is the base; StatusPill/PriorityPill are thin wrappers.
export { IntentPill, StatusPill, PriorityPill } from "./cells/Pill"
export { AssigneeCell } from "./cells/AssigneeCell"

// Layout
export { DrillDownNavigator } from "./layout/DrillDownNavigator"
export type { DrillDownPanel, DrillDownNavigatorProps } from "./layout/DrillDownNavigator"
export { ListNavRail } from "./layout/ListNavRail"
export type { RailItem, RailSection } from "./layout/ListNavRail"
export { RecordTypePicker } from "./layout/RecordTypePicker"
export type { RecordTypeOption } from "./layout/RecordTypePicker"

// Composites
export { DetailHeader } from "./composites/DetailHeader"
export { PropertiesPanel } from "./composites/PropertiesPanel"
export { LinkedEntitiesPanel } from "./composites/LinkedEntitiesPanel"
export type { PropertyRow } from "./composites/PropertiesPanel"
export type { LinkedTask } from "./composites/LinkedEntitiesPanel"
export { WorkflowStrip } from "./composites/WorkflowStrip"
export type { WorkflowStage } from "./composites/WorkflowStrip"