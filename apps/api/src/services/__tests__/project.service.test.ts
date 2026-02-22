/**
 * Project Service Unit Tests
 * Tests for project CRUD operations and task management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the database module
vi.mock('../../db/index.js', () => ({
  getDbClient: vi.fn(),
  schema: {
    projects: {
      id: 'id',
      name: 'name',
      description: 'description',
      plan: 'plan',
      userId: 'userId',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    tasks: {
      id: 'id',
      projectId: 'projectId',
      taskId: 'taskId',
      name: 'name',
      description: 'description',
      status: 'status',
      complexity: 'complexity',
      estimatedHours: 'estimatedHours',
      dependencies: 'dependencies',
      assigneeId: 'assigneeId',
      assignedBy: 'assignedBy',
      assignedAt: 'assignedAt',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    users: {
      id: 'id',
      email: 'email',
      name: 'name',
    },
  },
  withTransaction: vi.fn((fn) => fn({
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    }),
  })),
}))

// Mock helper functions
vi.mock('../../utils/helpers.js', () => ({
  canCreateProject: vi.fn(() => Promise.resolve({ allowed: true })),
  getProjectLimits: vi.fn(() => Promise.resolve({
    currentCount: 1,
    maxProjects: 3,
    canCreate: true,
    tier: 'free',
    status: 'active',
  })),
}))

// Mock task parser
vi.mock('../../lib/task-parser.js', () => ({
  parsePlanTasks: vi.fn(() => []),
}))

// Mock WebSocket broadcasts
vi.mock('../../websocket/index.js', () => ({
  broadcastTaskUpdated: vi.fn(),
  broadcastTasksUpdated: vi.fn(),
  broadcastTasksSynced: vi.fn(),
  getTaskLock: vi.fn(() => null),
}))

import { getDbClient, withTransaction } from '../../db/index.js'
import { canCreateProject, getProjectLimits } from '../../utils/helpers.js'
import { parsePlanTasks } from '../../lib/task-parser.js'
import { getTaskLock } from '../../websocket/index.js'
import { ProjectService } from '../project.service.js'
import {
  AuthorizationError,
  NotFoundError,
  ServiceError,
  ValidationError,
} from '../errors.js'

describe('ProjectService', () => {
  let projectService: ProjectService
  let mockDb: ReturnType<typeof createMockDb>

  function createMockDb() {
    const mockSelect = vi.fn()
    const mockFrom = vi.fn()
    const mockWhere = vi.fn()
    const mockLimit = vi.fn()
    const mockOrderBy = vi.fn()
    const mockInsert = vi.fn()
    const mockValues = vi.fn()
    const mockReturning = vi.fn()
    const mockUpdate = vi.fn()
    const mockSet = vi.fn()
    const mockDelete = vi.fn()

    // Storage for mock results
    let whereResults: unknown[] = [[]]
    let limitResults: unknown[] = [[]]
    let orderByResults: unknown[] = [[]]
    let whereIndex = 0
    let limitIndex = 0
    let orderByIndex = 0

    // Create chain object
    const createChain = (): Record<string, unknown> => {
      const chain: Record<string, unknown> = {
        from: mockFrom,
        where: mockWhere,
        limit: mockLimit,
        orderBy: mockOrderBy,
        returning: mockReturning,
      }
      chain.then = (resolve: (value: unknown) => void) => resolve(whereResults[whereIndex++] ?? [])
      return chain
    }

    mockSelect.mockImplementation(() => createChain())
    mockFrom.mockImplementation(() => createChain())
    mockWhere.mockImplementation(() => {
      const chain = createChain()
      chain.then = (resolve: (value: unknown) => void) => resolve(whereResults[whereIndex++] ?? [])
      return chain
    })
    mockOrderBy.mockImplementation(() => {
      const chain = createChain()
      chain.then = (resolve: (value: unknown) => void) => resolve(orderByResults[orderByIndex++] ?? [])
      return chain
    })
    mockLimit.mockImplementation(() => {
      const chain = createChain()
      chain.then = (resolve: (value: unknown) => void) => resolve(limitResults[limitIndex++] ?? [])
      return chain
    })
    mockReturning.mockResolvedValue([])
    mockInsert.mockReturnValue({ values: mockValues })
    mockValues.mockReturnValue({ returning: mockReturning })
    mockUpdate.mockReturnValue({ set: mockSet })
    mockSet.mockReturnValue({ where: mockWhere })
    mockDelete.mockReturnValue({ where: mockWhere })

    return {
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
      _mocks: {
        select: mockSelect,
        from: mockFrom,
        where: mockWhere,
        limit: mockLimit,
        orderBy: mockOrderBy,
        insert: mockInsert,
        values: mockValues,
        returning: mockReturning,
        update: mockUpdate,
        set: mockSet,
        delete: mockDelete,
        setWhereResults: (results: unknown[]) => {
          whereResults = results
          whereIndex = 0
        },
        setLimitResults: (results: unknown[]) => {
          limitResults = results
          limitIndex = 0
        },
        setOrderByResults: (results: unknown[]) => {
          orderByResults = results
          orderByIndex = 0
        },
        resetIndexes: () => {
          whereIndex = 0
          limitIndex = 0
          orderByIndex = 0
        },
      },
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockDb = createMockDb()
    vi.mocked(getDbClient).mockReturnValue(mockDb as never)
    projectService = new ProjectService()
  })

  describe('listProjects', () => {
    it('should return list of projects with limits', async () => {
      const mockProjects = [
        {
          id: 'proj-1',
          name: 'Project 1',
          description: 'Description 1',
          plan: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]
      mockDb._mocks.setOrderByResults([mockProjects])

      const result = await projectService.listProjects('user-123')

      expect(result.projects).toHaveLength(1)
      expect(result.projects[0].name).toBe('Project 1')
      expect(result.limits).toBeDefined()
      expect(getProjectLimits).toHaveBeenCalledWith('user-123')
    })

    it('should return empty array when no projects', async () => {
      mockDb._mocks.setOrderByResults([[]])

      const result = await projectService.listProjects('user-123')

      expect(result.projects).toHaveLength(0)
    })
  })

  describe('getProject', () => {
    it('should return project by ID', async () => {
      const mockProject = {
        id: 'proj-1',
        name: 'Project 1',
        description: 'Description',
        plan: '# Plan',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockDb._mocks.setLimitResults([[mockProject]])

      const result = await projectService.getProject('user-123', 'proj-1')

      expect(result.id).toBe('proj-1')
      expect(result.name).toBe('Project 1')
    })

    it('should throw NotFoundError if project not found', async () => {
      mockDb._mocks.setLimitResults([[]])

      await expect(projectService.getProject('user-123', 'nonexistent'))
        .rejects.toThrow(NotFoundError)
    })
  })

  describe('createProject', () => {
    it('should create project successfully', async () => {
      const mockNewProject = {
        id: 'proj-new',
        name: 'New Project',
        description: 'New Description',
        plan: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockDb._mocks.returning.mockResolvedValueOnce([mockNewProject])

      const result = await projectService.createProject('user-123', {
        name: 'New Project',
        description: 'New Description',
      })

      expect(result.project.id).toBe('proj-new')
      expect(result.project.name).toBe('New Project')
      expect(result.limits).toBeDefined()
    })

    it('should throw AuthorizationError when project limit reached', async () => {
      vi.mocked(canCreateProject).mockResolvedValueOnce({
        allowed: false,
        reason: 'Free tier limit reached',
      })

      await expect(projectService.createProject('user-123', { name: 'Test' }))
        .rejects.toThrow(AuthorizationError)
    })

    it('should throw ServiceError if creation fails', async () => {
      mockDb._mocks.returning.mockResolvedValueOnce([])

      await expect(projectService.createProject('user-123', { name: 'Test' }))
        .rejects.toThrow(ServiceError)
    })

    it('should create project with plan content', async () => {
      const mockNewProject = {
        id: 'proj-new',
        name: 'New Project',
        description: null,
        plan: '# Project Plan\n\n## Tasks',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockDb._mocks.returning.mockResolvedValueOnce([mockNewProject])

      const result = await projectService.createProject('user-123', {
        name: 'New Project',
        plan: '# Project Plan\n\n## Tasks',
      })

      expect(result.project.plan).toBe('# Project Plan\n\n## Tasks')
    })
  })

  describe('updateProject', () => {
    it('should update project name', async () => {
      const mockUpdated = {
        id: 'proj-1',
        name: 'Updated Name',
        description: 'Description',
        plan: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockDb._mocks.returning.mockResolvedValueOnce([mockUpdated])

      const result = await projectService.updateProject('user-123', 'proj-1', {
        name: 'Updated Name',
      })

      expect(result.name).toBe('Updated Name')
    })

    it('should update project description', async () => {
      const mockUpdated = {
        id: 'proj-1',
        name: 'Project',
        description: 'Updated Description',
        plan: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockDb._mocks.returning.mockResolvedValueOnce([mockUpdated])

      const result = await projectService.updateProject('user-123', 'proj-1', {
        description: 'Updated Description',
      })

      expect(result.description).toBe('Updated Description')
    })

    it('should throw ValidationError if no fields provided', async () => {
      await expect(projectService.updateProject('user-123', 'proj-1', {}))
        .rejects.toThrow(ValidationError)
    })

    it('should throw NotFoundError if project not found', async () => {
      mockDb._mocks.returning.mockResolvedValueOnce([])

      await expect(projectService.updateProject('user-123', 'nonexistent', { name: 'Test' }))
        .rejects.toThrow(NotFoundError)
    })
  })

  describe('deleteProject', () => {
    it('should delete project successfully', async () => {
      mockDb._mocks.returning.mockResolvedValueOnce([{ id: 'proj-1' }])

      await projectService.deleteProject('user-123', 'proj-1')

      expect(mockDb.delete).toHaveBeenCalled()
    })

    it('should throw NotFoundError if project not found', async () => {
      mockDb._mocks.returning.mockResolvedValueOnce([])

      await expect(projectService.deleteProject('user-123', 'nonexistent'))
        .rejects.toThrow(NotFoundError)
    })
  })

  describe('getProjectPlan', () => {
    it('should return project plan content', async () => {
      const mockProject = {
        id: 'proj-1',
        name: 'Project 1',
        plan: '# Project Plan',
        updatedAt: new Date(),
      }
      mockDb._mocks.setWhereResults([[mockProject]])

      const result = await projectService.getProjectPlan('user-123', 'proj-1')

      expect(result.projectId).toBe('proj-1')
      expect(result.plan).toBe('# Project Plan')
    })

    it('should throw NotFoundError if project not found', async () => {
      mockDb._mocks.setWhereResults([[]])

      await expect(projectService.getProjectPlan('user-123', 'nonexistent'))
        .rejects.toThrow(NotFoundError)
    })
  })

  describe('updateProjectPlan', () => {
    it('should update project plan', async () => {
      const mockUpdatedProject = {
        id: 'proj-1',
        name: 'Project 1',
        plan: '# Updated Plan',
        updatedAt: new Date(),
      }

      // Mock the transaction
      vi.mocked(withTransaction).mockImplementationOnce(async (fn) => {
        const mockTx = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([mockUpdatedProject]),
              }),
            }),
          }),
          delete: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue([]),
          }),
        }
        return fn(mockTx)
      })

      const result = await projectService.updateProjectPlan('user-123', 'proj-1', '# Updated Plan')

      expect(result.projectId).toBe('proj-1')
      expect(result.plan).toBe('# Updated Plan')
    })

    it('should parse and sync tasks from plan', async () => {
      const mockParsedTasks = [
        { taskId: 'T1', name: 'Task 1', status: 'TODO', description: null, complexity: null, estimatedHours: null, dependencies: [] },
        { taskId: 'T2', name: 'Task 2', status: 'DONE', description: null, complexity: null, estimatedHours: null, dependencies: [] },
      ]
      vi.mocked(parsePlanTasks).mockReturnValueOnce(mockParsedTasks)

      const mockUpdatedProject = {
        id: 'proj-1',
        name: 'Project 1',
        plan: '# Plan with tasks',
        updatedAt: new Date(),
      }

      vi.mocked(withTransaction).mockImplementationOnce(async (fn) => {
        const mockTx = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([mockUpdatedProject]),
              }),
            }),
          }),
          delete: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue([]),
          }),
        }
        return fn(mockTx)
      })

      const result = await projectService.updateProjectPlan('user-123', 'proj-1', '# Plan with tasks')

      expect(result.tasksCount).toBe(2)
      expect(result.completedCount).toBe(1)
      expect(result.progress).toBe(50)
    })
  })

  describe('listTasks', () => {
    it('should return tasks for a project', async () => {
      const mockProject = { id: 'proj-1', name: 'Project 1' }
      const mockTasks = [
        {
          id: 'task-1',
          taskId: 'T1',
          name: 'Task 1',
          description: null,
          status: 'TODO',
          complexity: null,
          estimatedHours: null,
          dependencies: null,
          assigneeId: null,
          assignedBy: null,
          assignedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      mockDb._mocks.setWhereResults([[mockProject]])
      mockDb._mocks.setOrderByResults([mockTasks])

      const result = await projectService.listTasks('user-123', 'proj-1')

      expect(result.projectId).toBe('proj-1')
      expect(result.tasks).toHaveLength(1)
      expect(result.tasks[0].taskId).toBe('T1')
    })

    it('should throw NotFoundError if project not found', async () => {
      mockDb._mocks.setWhereResults([[]])

      await expect(projectService.listTasks('user-123', 'nonexistent'))
        .rejects.toThrow(NotFoundError)
    })

    it('should include assignee info when present', async () => {
      const mockProject = { id: 'proj-1', name: 'Project 1' }
      const mockTasks = [
        {
          id: 'task-1',
          taskId: 'T1',
          name: 'Task 1',
          description: null,
          status: 'TODO',
          complexity: null,
          estimatedHours: null,
          dependencies: null,
          assigneeId: 'user-456',
          assignedBy: 'user-123',
          assignedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]
      const mockAssignee = { id: 'user-456', email: 'assignee@example.com', name: 'Assignee' }

      mockDb._mocks.setWhereResults([[mockProject], [mockAssignee]])
      mockDb._mocks.setOrderByResults([mockTasks])

      const result = await projectService.listTasks('user-123', 'proj-1')

      expect(result.tasks[0].assignee?.email).toBe('assignee@example.com')
    })
  })

  describe('bulkUpdateTasks', () => {
    it('should update multiple tasks', async () => {
      const mockProject = { id: 'proj-1', name: 'Project 1' }
      const mockExistingTasks = [{ id: 'task-1' }, { id: 'task-2' }]
      const mockUpdatedTask = {
        id: 'task-1',
        taskId: 'T1',
        name: 'Updated Task',
        description: null,
        status: 'IN_PROGRESS',
        complexity: null,
        estimatedHours: null,
        dependencies: null,
        assigneeId: null,
        assignedBy: null,
        assignedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockDb._mocks.setWhereResults([[mockProject], mockExistingTasks])

      vi.mocked(withTransaction).mockImplementationOnce(async (fn) => {
        const mockTx = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([mockUpdatedTask]),
              }),
            }),
          }),
        }
        return fn(mockTx)
      })

      const context = { userId: 'user-123', userEmail: 'user@example.com', userName: 'User' }
      const result = await projectService.bulkUpdateTasks('user-123', 'proj-1', [
        { id: 'task-1', status: 'IN_PROGRESS' },
      ], context)

      expect(result.updatedCount).toBe(1)
    })

    it('should throw NotFoundError if project not found', async () => {
      mockDb._mocks.setWhereResults([[]])

      const context = { userId: 'user-123', userEmail: 'user@example.com', userName: 'User' }
      await expect(projectService.bulkUpdateTasks('user-123', 'nonexistent', [], context))
        .rejects.toThrow(NotFoundError)
    })

    it('should throw ValidationError for invalid task IDs', async () => {
      const mockProject = { id: 'proj-1', name: 'Project 1' }
      mockDb._mocks.setWhereResults([[mockProject], [{ id: 'task-1' }]]) // Only task-1 exists

      const context = { userId: 'user-123', userEmail: 'user@example.com', userName: 'User' }
      await expect(projectService.bulkUpdateTasks('user-123', 'proj-1', [
        { id: 'task-1', status: 'DONE' },
        { id: 'task-invalid', status: 'DONE' },
      ], context)).rejects.toThrow(ValidationError)
    })
  })

  describe('updateTaskByTaskId', () => {
    it('should update task by taskId', async () => {
      const mockProject = { id: 'proj-1', name: 'Project 1' }
      const mockExistingTask = { id: 'task-db-id' }
      const mockUpdatedTask = {
        id: 'task-db-id',
        taskId: 'T1.1',
        name: 'Updated Task',
        description: 'New description',
        status: 'DONE',
        complexity: null,
        estimatedHours: null,
        dependencies: null,
        assigneeId: null,
        assignedBy: null,
        assignedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockDb._mocks.setWhereResults([[mockProject], [mockExistingTask]])
      mockDb._mocks.returning.mockResolvedValueOnce([mockUpdatedTask])

      const context = { userId: 'user-123', userEmail: 'user@example.com', userName: 'User' }
      const result = await projectService.updateTaskByTaskId('user-123', 'proj-1', 'T1.1', {
        status: 'DONE',
        description: 'New description',
      }, context)

      expect(result.taskId).toBe('T1.1')
      expect(result.status).toBe('DONE')
    })

    it('should throw NotFoundError if project not found', async () => {
      mockDb._mocks.setWhereResults([[]])

      const context = { userId: 'user-123', userEmail: 'user@example.com', userName: 'User' }
      await expect(projectService.updateTaskByTaskId('user-123', 'nonexistent', 'T1', {}, context))
        .rejects.toThrow(NotFoundError)
    })

    it('should throw NotFoundError if task not found', async () => {
      const mockProject = { id: 'proj-1', name: 'Project 1' }
      mockDb._mocks.setWhereResults([[mockProject], []])

      const context = { userId: 'user-123', userEmail: 'user@example.com', userName: 'User' }
      await expect(projectService.updateTaskByTaskId('user-123', 'proj-1', 'T999', {}, context))
        .rejects.toThrow(NotFoundError)
    })

    it('should throw ServiceError if task is locked by another user', async () => {
      const mockProject = { id: 'proj-1', name: 'Project 1' }
      const mockExistingTask = { id: 'task-db-id' }

      mockDb._mocks.setWhereResults([[mockProject], [mockExistingTask]])
      vi.mocked(getTaskLock).mockReturnValueOnce({
        taskId: 'T1',
        lockedBy: { userId: 'other-user', email: 'other@example.com', name: 'Other User' },
        lockedAt: new Date(),
        expiresAt: new Date(Date.now() + 60000),
      })

      const context = { userId: 'user-123', userEmail: 'user@example.com', userName: 'User' }
      await expect(projectService.updateTaskByTaskId('user-123', 'proj-1', 'T1', { status: 'DONE' }, context))
        .rejects.toThrow(ServiceError)
    })

    it('should allow update if task is locked by same user', async () => {
      const mockProject = { id: 'proj-1', name: 'Project 1' }
      const mockExistingTask = { id: 'task-db-id' }
      const mockUpdatedTask = {
        id: 'task-db-id',
        taskId: 'T1',
        name: 'Task',
        description: null,
        status: 'DONE',
        complexity: null,
        estimatedHours: null,
        dependencies: null,
        assigneeId: null,
        assignedBy: null,
        assignedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockDb._mocks.setWhereResults([[mockProject], [mockExistingTask]])
      mockDb._mocks.returning.mockResolvedValueOnce([mockUpdatedTask])
      vi.mocked(getTaskLock).mockReturnValueOnce({
        taskId: 'T1',
        lockedBy: { userId: 'user-123', email: 'user@example.com', name: 'User' },
        lockedAt: new Date(),
        expiresAt: new Date(Date.now() + 60000),
      })

      const context = { userId: 'user-123', userEmail: 'user@example.com', userName: 'User' }
      const result = await projectService.updateTaskByTaskId('user-123', 'proj-1', 'T1', { status: 'DONE' }, context)

      expect(result.status).toBe('DONE')
    })
  })
})
