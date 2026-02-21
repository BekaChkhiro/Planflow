'use client'

import { useState } from 'react'
import { Check, User, UserPlus, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { getInitials, type TeamMember } from '@/hooks/use-team'
import type { TaskAssignee } from '@/hooks/use-projects'
import { type PresenceStatus, getPresenceColor } from '@/hooks/use-presence'

interface TaskAssigneeSelectorProps {
  assignee: TaskAssignee | null
  teamMembers: TeamMember[]
  onAssign: (userId: string | null) => void
  isLoading?: boolean
  disabled?: boolean
  size?: 'sm' | 'md'
  /** Optional presence status for the assigned user (T7.8) */
  presenceStatus?: PresenceStatus
  /** Function to get presence status for any user (T7.8) */
  getPresenceStatus?: (userId: string) => PresenceStatus | undefined
}

export function TaskAssigneeSelector({
  assignee,
  teamMembers,
  onAssign,
  isLoading = false,
  disabled = false,
  size = 'sm',
  presenceStatus,
  getPresenceStatus,
}: TaskAssigneeSelectorProps) {
  const [open, setOpen] = useState(false)

  const handleSelect = (userId: string | null) => {
    onAssign(userId)
    setOpen(false)
  }

  const avatarSize = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8'
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs'
  const indicatorSize = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5'

  // Get presence status for assignee (T7.8)
  const assigneePresence = presenceStatus ?? (assignee && getPresenceStatus?.(assignee.id))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-auto p-0.5 hover:bg-accent',
            disabled && 'cursor-not-allowed opacity-50'
          )}
          disabled={disabled || isLoading}
          onClick={(e) => e.stopPropagation()}
        >
          {isLoading ? (
            <div className={cn(avatarSize, 'flex items-center justify-center')}>
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            </div>
          ) : assignee ? (
            <div className="relative">
              <Avatar className={avatarSize}>
                <AvatarFallback className={cn(textSize, 'bg-primary/10 text-primary font-medium')}>
                  {getInitials(assignee.name, assignee.email)}
                </AvatarFallback>
              </Avatar>
              {/* Presence indicator (T7.8) */}
              {assigneePresence && (
                <span
                  className={cn(
                    'absolute -bottom-0.5 -right-0.5 block rounded-full ring-2 ring-white',
                    indicatorSize,
                    getPresenceColor(assigneePresence)
                  )}
                />
              )}
            </div>
          ) : (
            <div
              className={cn(
                avatarSize,
                'flex items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30 hover:border-muted-foreground/50 transition-colors'
              )}
              title="Assign task"
            >
              <UserPlus className="h-3 w-3 text-muted-foreground/50" />
            </div>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <Command>
          <CommandInput placeholder="Search members..." className="h-9" />
          <CommandList>
            <CommandEmpty>No members found.</CommandEmpty>
            <CommandGroup>
              {teamMembers.map((member) => {
                const memberPresence = getPresenceStatus?.(member.userId)
                return (
                  <CommandItem
                    key={member.userId}
                    value={`${member.userName} ${member.userEmail}`}
                    onSelect={() => handleSelect(member.userId)}
                    className="flex items-center gap-2"
                  >
                    <div className="relative">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-[10px] font-medium">
                          {getInitials(member.userName, member.userEmail)}
                        </AvatarFallback>
                      </Avatar>
                      {/* Presence indicator for member (T7.8) */}
                      {memberPresence && (
                        <span
                          className={cn(
                            'absolute -bottom-0.5 -right-0.5 block h-2 w-2 rounded-full ring-1 ring-white',
                            getPresenceColor(memberPresence)
                          )}
                        />
                      )}
                    </div>
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="truncate text-sm">
                        {member.userName || member.userEmail}
                      </span>
                      {member.userName && (
                        <span className="truncate text-xs text-muted-foreground">
                          {member.userEmail}
                        </span>
                      )}
                    </div>
                    {assignee?.id === member.userId && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {assignee && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => handleSelect(null)}
                    className="flex items-center gap-2 text-muted-foreground"
                  >
                    <X className="h-4 w-4" />
                    <span>Unassign</span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// Compact display for showing assignee without selector (read-only)
export function TaskAssigneeDisplay({
  assignee,
  size = 'sm',
  presenceStatus,
}: {
  assignee: TaskAssignee | null
  size?: 'sm' | 'md'
  /** Optional presence status for the assignee (T7.8) */
  presenceStatus?: PresenceStatus
}) {
  if (!assignee) return null

  const avatarSize = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'
  const textSize = size === 'sm' ? 'text-[9px]' : 'text-[10px]'
  const indicatorSize = size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2'

  return (
    <div className="relative inline-flex items-center gap-1" title={assignee.name || assignee.email}>
      <Avatar className={avatarSize}>
        <AvatarFallback className={cn(textSize, 'bg-primary/10 text-primary font-medium')}>
          {getInitials(assignee.name, assignee.email)}
        </AvatarFallback>
      </Avatar>
      {/* Presence indicator (T7.8) */}
      {presenceStatus && (
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 block rounded-full ring-1 ring-white',
            indicatorSize,
            getPresenceColor(presenceStatus)
          )}
        />
      )}
    </div>
  )
}
