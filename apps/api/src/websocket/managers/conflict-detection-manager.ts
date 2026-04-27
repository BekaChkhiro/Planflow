import { getActiveWorkStore, type ActiveWorkData, type ActiveWorkStore, type FileConflict } from '../../lib/redis.js'
import { loggers } from '../../lib/logger.js'

const log = loggers.websocket

/**
 * ConflictDetectionManager (T20.9)
 *
 * Detects file-level overlap between users working on the same project.
 * When user A reports they are working on files [a.ts, b.ts] and user B
 * reports [b.ts, c.ts], this manager detects the overlap on b.ts and
 * returns a conflict warning.
 */
export class ConflictDetectionManager {
  private getStore(): ActiveWorkStore {
    return getActiveWorkStore()
  }

  /**
   * Update the files a user is working on and detect any overlaps
   * with other users in the same project.
   *
   * Returns an array of conflicts (empty if no overlaps).
   */
  async updateFilesAndDetectConflicts(
    projectId: string,
    userId: string,
    filePaths: string[]
  ): Promise<{ updatedWork: ActiveWorkData | null; conflicts: FileConflict[] }> {
    const store = this.getStore()

    // Update this user's file paths
    const updatedWork = await store.updateFilePaths(projectId, userId, filePaths)
    if (!updatedWork) {
      return { updatedWork: null, conflicts: [] }
    }

    // Detect conflicts with other users
    const conflicts = await this.detectConflicts(projectId, userId, filePaths)

    if (conflicts.length > 0) {
      log.info(
        { projectId, userId, conflictCount: conflicts.length, files: conflicts.map(c => c.filePath) },
        'File conflicts detected'
      )
    }

    return { updatedWork, conflicts }
  }

  /**
   * Detect file conflicts for a user's file list against all other
   * active workers in the project.
   */
  async detectConflicts(
    projectId: string,
    userId: string,
    filePaths: string[]
  ): Promise<FileConflict[]> {
    if (filePaths.length === 0) return []

    const store = this.getStore()
    const allWork = await store.getProjectActiveWork(projectId)

    // Build a map: filePath -> list of users working on it
    const fileToUsers = new Map<string, Array<{
      userId: string
      userEmail: string
      userName: string | null
      taskId: string
      taskName: string
    }>>()

    // Index all active workers' files
    for (const work of allWork) {
      if (!work.filePaths || work.filePaths.length === 0) continue

      for (const fp of work.filePaths) {
        if (!fileToUsers.has(fp)) {
          fileToUsers.set(fp, [])
        }
        fileToUsers.get(fp)!.push({
          userId: work.userId,
          userEmail: work.userEmail,
          userName: work.userName,
          taskId: work.taskId,
          taskName: work.taskName,
        })
      }
    }

    // Find overlaps: files where the current user overlaps with others
    const conflicts: FileConflict[] = []
    const userFileSet = new Set(filePaths)

    for (const [filePath, users] of fileToUsers) {
      if (!userFileSet.has(filePath)) continue
      // Only count as conflict if another user (not the requesting user) is on the same file
      const otherUsers = users.filter(u => u.userId !== userId)
      if (otherUsers.length === 0) continue

      // Include the requesting user in the conflict list for completeness
      const currentUser = users.find(u => u.userId === userId)
      conflicts.push({
        filePath,
        users: currentUser ? [currentUser, ...otherUsers] : otherUsers,
      })
    }

    return conflicts
  }

  /**
   * Get all current file conflicts in a project (all overlaps between all users).
   */
  async getProjectConflicts(projectId: string): Promise<FileConflict[]> {
    const store = this.getStore()
    const allWork = await store.getProjectActiveWork(projectId)

    // Build file -> users map
    const fileToUsers = new Map<string, Array<{
      userId: string
      userEmail: string
      userName: string | null
      taskId: string
      taskName: string
    }>>()

    for (const work of allWork) {
      if (!work.filePaths || work.filePaths.length === 0) continue

      for (const fp of work.filePaths) {
        if (!fileToUsers.has(fp)) {
          fileToUsers.set(fp, [])
        }
        fileToUsers.get(fp)!.push({
          userId: work.userId,
          userEmail: work.userEmail,
          userName: work.userName,
          taskId: work.taskId,
          taskName: work.taskName,
        })
      }
    }

    // Collect all files with 2+ users
    const conflicts: FileConflict[] = []
    for (const [filePath, users] of fileToUsers) {
      if (users.length >= 2) {
        conflicts.push({ filePath, users })
      }
    }

    return conflicts
  }
}
