// Types and utilities
export * from './types'
export * from './utils'

// State components (not lazy loaded)
export { ProjectDetailSkeleton, ErrorState, NotFoundState } from './states'

// Tab components (can be lazy loaded)
export { OverviewTab, OverviewTabSkeleton } from './overview-tab'
export { PlanTab, PlanTabSkeleton } from './plan-tab'
export { TasksTab, TasksTabSkeleton } from './tasks-tab'

// Dialog components (can be lazy loaded)
export { EditProjectDialog } from './edit-project-dialog'
