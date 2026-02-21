import { NextResponse } from 'next/server'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

interface HealthStatus {
  status: 'healthy' | 'unhealthy'
  timestamp: string
  version: string
  environment: string
  checks: {
    api: {
      status: 'healthy' | 'unhealthy' | 'unknown'
      responseTime?: number
      error?: string
    }
  }
}

export async function GET(): Promise<NextResponse<HealthStatus>> {
  const startTime = Date.now()

  // Check API connectivity
  let apiStatus: HealthStatus['checks']['api'] = { status: 'unknown' }

  try {
    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001'
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(`${apiUrl}/health`, {
      signal: controller.signal,
      cache: 'no-store',
    })

    clearTimeout(timeoutId)

    if (response.ok) {
      apiStatus = {
        status: 'healthy',
        responseTime: Date.now() - startTime,
      }
    } else {
      apiStatus = {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: `API returned ${response.status}`,
      }
    }
  } catch (error) {
    apiStatus = {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }

  const overallStatus = apiStatus.status === 'healthy' ? 'healthy' : 'unhealthy'

  const healthStatus: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env['npm_package_version'] || '1.0.0',
    environment: process.env['NODE_ENV'] || 'development',
    checks: {
      api: apiStatus,
    },
  }

  return NextResponse.json(healthStatus, {
    status: overallStatus === 'healthy' ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}
