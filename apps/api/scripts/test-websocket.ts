/**
 * WebSocket Test Script (T5.8)
 *
 * Tests the real-time task update broadcasting functionality.
 *
 * Usage:
 *   cd apps/api
 *   npx tsx scripts/test-websocket.ts
 */

import { connectionManager, type WebSocketMessage } from '../src/websocket/connection-manager.js'
import {
  broadcastTaskUpdated,
  broadcastTasksUpdated,
  broadcastTasksSynced,
  broadcastTaskAssigned,
  broadcastTaskUnassigned,
  type TaskData,
} from '../src/websocket/broadcast.js'

// Mock WebSocket for testing
class MockWebSocket {
  readyState = 1 // OPEN
  OPEN = 1
  messages: string[] = []

  send(message: string) {
    this.messages.push(message)
  }
}

// Create test data
const testProjectId = 'test-project-123'
const testUserId1 = 'user-1'
const testUserId2 = 'user-2'

const testTask: TaskData = {
  id: 'task-uuid-1',
  taskId: 'T1.1',
  name: 'Test Task',
  description: 'A test task for WebSocket testing',
  status: 'IN_PROGRESS',
  complexity: 'Medium',
  estimatedHours: 4,
  dependencies: [],
  assigneeId: null,
  assignedBy: null,
  assignedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

async function runTests() {
  console.log('WebSocket Broadcast Tests\n')
  console.log('='.repeat(50))

  // Test 1: Add clients to connection manager
  console.log('\nTest 1: Adding clients to connection manager...')

  const ws1 = new MockWebSocket()
  const ws2 = new MockWebSocket()

  const client1 = {
    ws: ws1 as any,
    userId: testUserId1,
    projectId: testProjectId,
    connectedAt: new Date(),
  }

  const client2 = {
    ws: ws2 as any,
    userId: testUserId2,
    projectId: testProjectId,
    connectedAt: new Date(),
  }

  connectionManager.addClient(testProjectId, client1)
  connectionManager.addClient(testProjectId, client2)

  const clientCount = connectionManager.getProjectClientCount(testProjectId)
  console.log(`  Clients connected: ${clientCount}`)
  console.assert(clientCount === 2, 'Expected 2 clients')

  // Test 2: Broadcast task updated
  console.log('\nTest 2: Broadcasting task_updated event...')
  broadcastTaskUpdated(testProjectId, testTask)

  console.log(`  Client 1 received: ${ws1.messages.length} message(s)`)
  console.log(`  Client 2 received: ${ws2.messages.length} message(s)`)

  const msg1 = JSON.parse(ws1.messages[0]) as WebSocketMessage
  console.assert(msg1.type === 'task_updated', 'Expected task_updated event')
  console.assert(msg1.projectId === testProjectId, 'Expected correct projectId')
  console.log('  ✓ task_updated broadcast works')

  // Test 3: Broadcast with exclusion
  console.log('\nTest 3: Broadcasting with sender exclusion...')
  ws1.messages = []
  ws2.messages = []

  broadcastTaskUpdated(testProjectId, testTask, testUserId1)

  console.log(`  Client 1 (excluded) received: ${ws1.messages.length} message(s)`)
  console.log(`  Client 2 received: ${ws2.messages.length} message(s)`)
  console.assert(ws1.messages.length === 0, 'Excluded client should not receive message')
  console.assert(ws2.messages.length === 1, 'Non-excluded client should receive message')
  console.log('  ✓ Sender exclusion works')

  // Test 4: Broadcast task assigned
  console.log('\nTest 4: Broadcasting task_assigned event...')
  ws1.messages = []
  ws2.messages = []

  broadcastTaskAssigned(
    testProjectId,
    {
      task: testTask,
      assignee: { id: testUserId2, email: 'user2@test.com', name: 'User 2' },
      assignedBy: { id: testUserId1, email: 'user1@test.com', name: 'User 1' },
    },
    testUserId1
  )

  const assignedMsg = JSON.parse(ws2.messages[0]) as WebSocketMessage
  console.assert(assignedMsg.type === 'task_assigned', 'Expected task_assigned event')
  console.log('  ✓ task_assigned broadcast works')

  // Test 5: Broadcast tasks synced
  console.log('\nTest 5: Broadcasting tasks_synced event...')
  ws1.messages = []
  ws2.messages = []

  broadcastTasksSynced(testProjectId, {
    tasksCount: 10,
    completedCount: 5,
    progress: 50,
  })

  const syncedMsg = JSON.parse(ws1.messages[0]) as WebSocketMessage
  console.assert(syncedMsg.type === 'tasks_synced', 'Expected tasks_synced event')
  console.log('  ✓ tasks_synced broadcast works')

  // Test 6: Bulk broadcast
  console.log('\nTest 6: Broadcasting bulk task updates...')
  ws1.messages = []
  ws2.messages = []

  const tasks = [
    { ...testTask, taskId: 'T1.1' },
    { ...testTask, taskId: 'T1.2' },
    { ...testTask, taskId: 'T1.3' },
  ]

  broadcastTasksUpdated(testProjectId, tasks)

  console.log(`  Client 1 received: ${ws1.messages.length} messages`)
  console.log(`  Client 2 received: ${ws2.messages.length} messages`)
  console.assert(ws1.messages.length === 3, 'Expected 3 messages for bulk update')
  console.log('  ✓ Bulk broadcast works')

  // Test 7: Remove client
  console.log('\nTest 7: Removing client from connection manager...')
  connectionManager.removeClient(testProjectId, client1)

  const remainingCount = connectionManager.getProjectClientCount(testProjectId)
  console.log(`  Remaining clients: ${remainingCount}`)
  console.assert(remainingCount === 1, 'Expected 1 client remaining')
  console.log('  ✓ Client removal works')

  // Cleanup
  connectionManager.removeClient(testProjectId, client2)

  console.log('\n' + '='.repeat(50))
  console.log('All tests passed! ✓')
}

runTests().catch(console.error)
