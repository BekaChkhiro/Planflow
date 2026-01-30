// Re-export shared types from @planflow/shared
// Additional web-specific types will be added here

export interface User {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
  createdAt: string
}

export interface Project {
  id: string
  name: string
  description: string | null
  ownerId: string
  createdAt: string
  updatedAt: string
}

export interface Task {
  id: string
  projectId: string
  title: string
  description: string | null
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  complexity: 'LOW' | 'MEDIUM' | 'HIGH'
  estimatedHours: number | null
  createdAt: string
  updatedAt: string
}

export interface ApiToken {
  id: string
  name: string
  prefix: string
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
}

export type PageProps<
  TParams = Record<string, string>,
  TSearchParams = Record<string, string | string[] | undefined>
> = {
  params: Promise<TParams>
  searchParams: Promise<TSearchParams>
}
