'use client'

import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import {
  CheckCircle2,
  Circle,
  Loader2,
  Ban,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'

const statusConfig: Record<TaskStatus, {
  label: string
  color: string
  bgColor: string
  icon: typeof Circle
  iconClass?: string
}> = {
  TODO: {
    label: 'To Do',
    color: 'text-slate-700',
    bgColor: 'bg-slate-100 hover:bg-slate-200',
    icon: Circle,
  },
  IN_PROGRESS: {
    label: 'In Progress',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100 hover:bg-blue-200',
    icon: Loader2,
    iconClass: 'animate-spin',
  },
  DONE: {
    label: 'Done',
    color: 'text-green-700',
    bgColor: 'bg-green-100 hover:bg-green-200',
    icon: CheckCircle2,
  },
  BLOCKED: {
    label: 'Blocked',
    color: 'text-red-700',
    bgColor: 'bg-red-100 hover:bg-red-200',
    icon: Ban,
  },
}

interface TaskStatusSelectorProps {
  status: TaskStatus
  onStatusChange: (newStatus: TaskStatus) => void
  disabled?: boolean
  size?: 'sm' | 'default'
}

export function TaskStatusSelector({
  status,
  onStatusChange,
  disabled = false,
  size = 'default',
}: TaskStatusSelectorProps) {
  const [open, setOpen] = useState(false)
  const config = statusConfig[status]
  const StatusIcon = config.icon

  const handleStatusChange = (newStatus: TaskStatus) => {
    if (newStatus !== status) {
      onStatusChange(newStatus)
    }
    setOpen(false)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={size}
          disabled={disabled}
          className={cn(
            'gap-2 font-medium',
            config.bgColor,
            config.color,
            size === 'sm' && 'h-7 px-2 text-xs'
          )}
          aria-label={`Status: ${config.label}. Click to change.`}
        >
          <StatusIcon className={cn('h-4 w-4', config.iconClass)} />
          {config.label}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        {(Object.keys(statusConfig) as TaskStatus[]).map((statusKey) => {
          const itemConfig = statusConfig[statusKey]
          const ItemIcon = itemConfig.icon
          const isSelected = statusKey === status

          return (
            <DropdownMenuItem
              key={statusKey}
              onClick={() => handleStatusChange(statusKey)}
              className={cn(
                'gap-2 cursor-pointer',
                isSelected && 'bg-accent'
              )}
            >
              <ItemIcon className={cn('h-4 w-4', itemConfig.color, itemConfig.iconClass)} />
              <span className={itemConfig.color}>{itemConfig.label}</span>
              {isSelected && (
                <CheckCircle2 className="h-3 w-3 ml-auto text-primary" />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
