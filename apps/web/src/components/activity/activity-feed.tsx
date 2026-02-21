'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity as ActivityIcon, Loader2, RefreshCw, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ActivityItem, ActivityItemCompact } from './activity-item'
import {
  useProjectActivityInfinite,
  useActivitySubscription,
  type Activity,
  type ActivityAction,
  type ActivityEntity,
} from '@/hooks/use-activity'
import { useProjectWebSocket } from '@/hooks/use-websocket'
import { ConnectionDot } from '@/components/ui/connection-indicator'

interface ActivityFeedProps {
  projectId: string
  className?: string
  variant?: 'default' | 'compact' | 'sidebar'
  maxHeight?: string
  showHeader?: boolean
  showFilters?: boolean
  limit?: number
}

// Filter options
const entityFilters: { value: ActivityEntity; label: string }[] = [
  { value: 'task', label: 'Tasks' },
  { value: 'comment', label: 'Comments' },
  { value: 'project', label: 'Project' },
  { value: 'member', label: 'Members' },
]

export function ActivityFeed({
  projectId,
  className,
  variant = 'default',
  maxHeight = '400px',
  showHeader = true,
  showFilters = true,
  limit = 20,
}: ActivityFeedProps) {
  // State for new activities (real-time)
  const [newActivityIds, setNewActivityIds] = useState<Set<string>>(new Set())
  const [selectedEntities, setSelectedEntities] = useState<Set<ActivityEntity>>(new Set())
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  // Build filter params
  const filterParams = selectedEntities.size > 0
    ? { entityType: Array.from(selectedEntities)[0], limit } // API supports single entityType
    : { limit }

  // Fetch activities with infinite scroll
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    isRefetching,
  } = useProjectActivityInfinite(projectId, filterParams)

  // Get the activity subscription handler
  const { handleActivityCreated } = useActivitySubscription(projectId)

  // Handle real-time activity updates
  const onActivityCreated = useCallback(
    (activityData: {
      id: string
      action: string
      entityType: string
      entityId: string | null
      taskId: string | null
      taskUuid: string | null
      organizationId?: string | null
      projectId?: string | null
      metadata: Record<string, unknown> | null
      description: string | null
      createdAt: string
      actor: { id: string; email: string; name: string | null }
    }) => {
      // Convert to Activity type with defaults for optional fields
      const activity: Activity = {
        ...activityData,
        action: activityData.action as Activity['action'],
        entityType: activityData.entityType as Activity['entityType'],
        organizationId: activityData.organizationId ?? null,
        projectId: activityData.projectId ?? projectId,
      }

      // Mark as new for highlighting
      setNewActivityIds((prev) => new Set([...prev, activity.id]))

      // Update the query cache
      handleActivityCreated(activity)

      // Clear the "new" highlight after 5 seconds
      setTimeout(() => {
        setNewActivityIds((prev) => {
          const next = new Set(prev)
          next.delete(activity.id)
          return next
        })
      }, 5000)
    },
    [handleActivityCreated, projectId]
  )

  // Connect to WebSocket for real-time updates
  const { status } = useProjectWebSocket({
    projectId,
    enabled: true,
    onActivityCreated,
  })

  // Flatten pages into single array
  const activities = data?.pages.flatMap((page) => page.activities) ?? []

  // Filter activities based on selected entity types (client-side for multiple filters)
  const filteredActivities = selectedEntities.size > 0
    ? activities.filter((a) => selectedEntities.has(a.entityType))
    : activities

  // Handle scroll for infinite loading
  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const target = event.target as HTMLDivElement
      const { scrollTop, scrollHeight, clientHeight } = target

      // Load more when near bottom (within 100px)
      if (scrollHeight - scrollTop - clientHeight < 100 && hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  )

  // Toggle entity filter
  const toggleEntityFilter = (entity: ActivityEntity) => {
    setSelectedEntities((prev) => {
      const next = new Set(prev)
      if (next.has(entity)) {
        next.delete(entity)
      } else {
        next.add(entity)
      }
      return next
    })
  }

  // Clear all filters
  const clearFilters = () => {
    setSelectedEntities(new Set())
  }

  const ItemComponent = variant === 'compact' || variant === 'sidebar' ? ActivityItemCompact : ActivityItem

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Header */}
      {showHeader && (
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <ActivityIcon className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-medium text-sm">Activity</h3>
            <ConnectionDot status={status} />
          </div>
          <div className="flex items-center gap-1">
            {/* Refresh button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => refetch()}
              disabled={isRefetching}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isRefetching && 'animate-spin')} />
            </Button>

            {/* Filter dropdown */}
            {showFilters && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn('h-7 w-7', selectedEntities.size > 0 && 'text-primary')}
                  >
                    <Filter className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Filter by type</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {entityFilters.map((filter) => (
                    <DropdownMenuCheckboxItem
                      key={filter.value}
                      checked={selectedEntities.has(filter.value)}
                      onCheckedChange={() => toggleEntityFilter(filter.value)}
                    >
                      {filter.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                  {selectedEntities.size > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuCheckboxItem checked={false} onCheckedChange={clearFilters}>
                        Clear filters
                      </DropdownMenuCheckboxItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      )}

      {/* Activity list */}
      <ScrollArea
        ref={scrollAreaRef}
        className="flex-1"
        style={{ maxHeight }}
        onScrollCapture={handleScroll}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <ActivityIcon className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No activity yet</p>
            {selectedEntities.size > 0 && (
              <Button variant="link" size="sm" onClick={clearFilters} className="mt-1">
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y">
            {filteredActivities.map((activity) => (
              <ItemComponent
                key={activity.id}
                activity={activity}
                isNew={newActivityIds.has(activity.id)}
              />
            ))}

            {/* Load more indicator */}
            {isFetchingNextPage && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* End of list */}
            {!hasNextPage && filteredActivities.length > 0 && (
              <div className="text-center py-4 text-xs text-muted-foreground">
                No more activity
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

/**
 * Sidebar variant with minimal styling
 */
export function ActivityFeedSidebar({ projectId }: { projectId: string }) {
  return (
    <ActivityFeed
      projectId={projectId}
      variant="sidebar"
      maxHeight="100%"
      showHeader={true}
      showFilters={false}
      limit={15}
    />
  )
}

/**
 * Activity feed widget for dashboard cards
 */
export function ActivityFeedWidget({
  projectId,
  className,
}: {
  projectId: string
  className?: string
}) {
  return (
    <div className={cn('rounded-lg border bg-card', className)}>
      <ActivityFeed
        projectId={projectId}
        variant="compact"
        maxHeight="300px"
        showHeader={true}
        showFilters={true}
        limit={10}
      />
    </div>
  )
}
