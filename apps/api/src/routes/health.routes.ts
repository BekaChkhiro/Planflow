import { Hono } from 'hono'
import { swaggerUI } from '@hono/swagger-ui'
import { checkDbConnection, getDbInfo } from '../db/index.js'
import { openApiSpec } from '../openapi.js'
import { isRedisAvailable } from '../lib/redis.js'

const healthRoutes = new Hono()

// Root health check
healthRoutes.get('/', (c) => {
  return c.json({
    name: 'PlanFlow API',
    version: '0.0.2',
    status: 'ok',
  })
})

// Basic health check
healthRoutes.get('/health', (c) => {
  return c.json({ status: 'healthy', timestamp: new Date().toISOString() })
})

// OpenAPI documentation
healthRoutes.get('/openapi.json', (c) => {
  return c.json(openApiSpec)
})

// Swagger UI
healthRoutes.get('/docs', swaggerUI({ url: '/openapi.json' }))

// Database health check
healthRoutes.get('/health/db', async (c) => {
  const connectionStatus = await checkDbConnection()

  if (!connectionStatus.connected) {
    return c.json(
      {
        status: 'unhealthy',
        database: connectionStatus,
        timestamp: new Date().toISOString(),
      },
      503
    )
  }

  const dbInfo = await getDbInfo()

  return c.json({
    status: 'healthy',
    database: {
      ...connectionStatus,
      ...dbInfo,
    },
    timestamp: new Date().toISOString(),
  })
})

// Redis health check
healthRoutes.get('/health/redis', async (c) => {
  const redisAvailable = await isRedisAvailable()

  return c.json({
    status: redisAvailable ? 'healthy' : 'unhealthy',
    redis: {
      connected: redisAvailable,
    },
    timestamp: new Date().toISOString(),
  })
})

// Full system health check
healthRoutes.get('/health/full', async (c) => {
  const [dbStatus, redisAvailable] = await Promise.all([
    checkDbConnection(),
    isRedisAvailable(),
  ])

  const isHealthy = dbStatus.connected && redisAvailable

  return c.json(
    {
      status: isHealthy ? 'healthy' : 'degraded',
      database: {
        connected: dbStatus.connected,
      },
      redis: {
        connected: redisAvailable,
      },
      timestamp: new Date().toISOString(),
    },
    isHealthy ? 200 : 503
  )
})

export { healthRoutes }
