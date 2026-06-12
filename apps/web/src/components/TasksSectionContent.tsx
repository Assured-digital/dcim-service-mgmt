import React from "react"
import { Box, Button, Paper, Typography } from "@mui/material"
import AddIcon from "@mui/icons-material/Add"
import AssignmentIcon from "@mui/icons-material/Assignment"
import PersonIcon from "@mui/icons-material/Person"
import { StatusPopover, type PopoverOption } from "./detail"
import { useDrillNav } from "../lib/drillNav"
import { statusColors, type LinkedTask } from "./shared"
import { type AssignableUser } from "../lib/useAssignableUsers"

// Shared Tasks panel — used by the work-item detail pages (Incident, Service
// Request, Change, Risk, Issue) in the shell's right column. Drill/open wiring
// is internal: inside the Service Desk navigator a row drills to depth 2 (in
// place); standalone (no provider) it calls onSelectTask (the quick modal).

export type TaskRow = LinkedTask & {
  assigneeId?: string | null
  assignee?: { id: string; email: string } | null
}

// ── Task status colour map — spec section 10 ────────────────────────────────

const TASK_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  DONE: "Done",
}

const TASK_STATUS_OPTIONS: PopoverOption[] = ["OPEN", "IN_PROGRESS", "BLOCKED", "DONE"].map((value) => ({
  value,
  label: TASK_STATUS_LABELS[value],
  iconBg: statusColors(value).bg,
  iconColor: statusColors(value).text,
  icon: <AssignmentIcon sx={{ fontSize: 14 }} />,
}))

function getInitials(email: string): string {
  const local = email.split("@")[0] ?? email
  const parts = local.split(/[._-]/).filter(Boolean)
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return local.slice(0, 2).toUpperCase()
}

interface TaskStatusBadgeProps {
  status: string
  onClick: (anchor: HTMLElement) => void
}

const TaskStatusBadge = React.memo(function TaskStatusBadge({
  status,
  onClick,
}: TaskStatusBadgeProps) {
  const colours = statusColors(status)
  const label = TASK_STATUS_LABELS[status] ?? status
  const handleClick = React.useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      e.stopPropagation()
      onClick(e.currentTarget)
    },
    [onClick]
  )
  return (
    <Box
      component="button"
      onClick={handleClick}
      sx={{
        all: "unset",
        cursor: "pointer",
        bgcolor: colours.bg,
        color: colours.text,
        fontSize: 10,
        fontWeight: 500,
        px: 1,
        py: 0.25,
        borderRadius: 1,
        flexShrink: 0,
        textAlign: "center",
        display: "inline-flex",
        justifyContent: "center",
      }}
    >
      {label}
    </Box>
  )
})

interface AssigneeCellProps {
  assignee: { id: string; email: string } | null | undefined
  onClick: (anchor: HTMLElement) => void
}

const AssigneeCell = React.memo(function AssigneeCell({
  assignee,
  onClick,
}: AssigneeCellProps) {
  const handleClick = React.useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      e.stopPropagation()
      onClick(e.currentTarget)
    },
    [onClick]
  )
  return (
    <Box
      onClick={handleClick}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        flexShrink: 0,
        cursor: "pointer",
      }}
    >
      {assignee ? (
        <Box
          sx={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            bgcolor: "#eaf3de",
            color: "#3b6d11",
            fontSize: 9,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {getInitials(assignee.email)}
        </Box>
      ) : (
        <Typography color="text.tertiary" sx={{ fontSize: 11, fontStyle: "italic" }}>
          Unassigned
        </Typography>
      )}
    </Box>
  )
})

export interface TasksSectionContentProps {
  tasks: TaskRow[]
  users: AssignableUser[]
  canManage: boolean
  onCreate: () => void
  onSelectTask: (taskId: string) => void
  onChangeTaskStatus: (taskId: string, nextStatus: string) => void
  onChangeTaskAssignee: (taskId: string, nextAssigneeId: string) => void
  // Inline "Add task" button below the list. Shell pages hoist the add action to
  // the section header "+", so they pass false; non-shell consumers keep the default.
  showAddButton?: boolean
}

export const TasksSectionContent = React.memo(function TasksSectionContent({
  tasks,
  users,
  canManage,
  onCreate,
  onSelectTask,
  onChangeTaskStatus,
  onChangeTaskAssignee,
  showAddButton = true,
}: TasksSectionContentProps) {
  const [activePopover, setActivePopover] = React.useState<{
    taskId: string
    type: "status" | "assignee"
    anchor: HTMLElement
  } | null>(null)

  const handleStatusClick = React.useCallback(
    (taskId: string) => (anchor: HTMLElement) => {
      setActivePopover({ taskId, type: "status", anchor })
    },
    []
  )

  const closeStatusPopover = React.useCallback(() => setActivePopover(null), [])

  const handleStatusSelect = React.useCallback(
    (next: string) => {
      if (activePopover?.type !== "status") return
      onChangeTaskStatus(activePopover.taskId, next)
      setActivePopover(null)
    },
    [activePopover, onChangeTaskStatus]
  )

  const handleAssigneeClick = React.useCallback(
    (taskId: string) => (anchor: HTMLElement) => {
      setActivePopover({ taskId, type: "assignee", anchor })
    },
    []
  )

  const closeAssigneePopover = React.useCallback(() => setActivePopover(null), [])

  const handleAssigneeSelect = React.useCallback(
    (next: string) => {
      if (activePopover?.type !== "assignee") return
      onChangeTaskAssignee(activePopover.taskId, next)
      setActivePopover(null)
    },
    [activePopover, onChangeTaskAssignee]
  )

  // Inside the navigator, drill the task to depth 2; standalone, open the quick
  // modal (no provider → drill is null).
  const drill = useDrillNav()
  const handleRowClick = React.useCallback(
    (taskId: string) => () => (drill ? drill("task", taskId) : onSelectTask(taskId)),
    [drill, onSelectTask]
  )

  const assigneeOptions = React.useMemo<PopoverOption[]>(() => {
    const list: PopoverOption[] = users.map((u) => ({
      value: u.id,
      label: u.displayName,
      iconBg: "#eaf3de",
      iconColor: "#3b6d11",
      icon: (
        <Box component="span" sx={{ fontSize: 9, fontWeight: 600 }}>
          {getInitials(u.email)}
        </Box>
      ),
    }))
    return [
      {
        value: "",
        label: "Unassigned",
        iconBg: "#f1efe8",
        iconColor: "#5f5e5a",
        icon: <PersonIcon sx={{ fontSize: 14 }} />,
      },
      ...list,
    ]
  }, [users])

  return (
    <Box>
      {tasks.length === 0 ? (
        <Typography variant="caption" sx={{ color: "var(--color-text-tertiary)", display: "block", py: 0.5 }}>
          No tasks
        </Typography>
      ) : (
        tasks.map((task) => (
          <Paper
            key={task.id}
            variant="outlined"
            onClick={handleRowClick(task.id)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              px: 1.25,
              py: 0.875,
              mb: 0.5,
              borderRadius: 1,
              cursor: "pointer",
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <Typography
              sx={{
                flex: 1,
                fontSize: 12,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: "text.primary",
                textDecoration: task.status === "DONE" ? "line-through" : "none",
              }}
            >
              {task.title}
            </Typography>
            <AssigneeCell
              assignee={task.assignee ?? null}
              onClick={handleAssigneeClick(task.id)}
            />
            <TaskStatusBadge status={task.status} onClick={handleStatusClick(task.id)} />
          </Paper>
        ))
      )}

      {showAddButton && canManage ? (
        <Button
          variant="text"
          size="small"
          startIcon={<AddIcon sx={{ fontSize: 14 }} />}
          onClick={onCreate}
          sx={{ textTransform: "none", mt: 1 }}
        >
          Add task
        </Button>
      ) : null}

      <StatusPopover
        id="task-status-popover"
        header="Task status"
        options={TASK_STATUS_OPTIONS}
        currentValue={
          activePopover?.type === "status"
            ? tasks.find((t) => t.id === activePopover.taskId)?.status ?? ""
            : ""
        }
        onSelect={handleStatusSelect}
        anchorEl={activePopover?.type === "status" ? activePopover.anchor : null}
        open={activePopover?.type === "status"}
        onClose={closeStatusPopover}
      />

      <StatusPopover
        id="task-assignee-popover"
        header="Assignee"
        options={assigneeOptions}
        currentValue={
          activePopover?.type === "assignee"
            ? tasks.find((t) => t.id === activePopover.taskId)?.assigneeId ?? ""
            : ""
        }
        onSelect={handleAssigneeSelect}
        anchorEl={activePopover?.type === "assignee" ? activePopover.anchor : null}
        open={activePopover?.type === "assignee"}
        onClose={closeAssigneePopover}
      />
    </Box>
  )
})
