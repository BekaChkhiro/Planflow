/**
 * PlanFlow MCP Server - Logger
 *
 * Simple logging utility that writes to stderr to avoid
 * interfering with MCP protocol communication on stdout.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

class Logger {
  private minLevel: LogLevel = 'info'
  private prefix = '[PlanFlow MCP]'

  setLevel(level: LogLevel): void {
    this.minLevel = level
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel]
  }

  private formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString()
    const levelStr = level.toUpperCase().padEnd(5)
    let formatted = `${timestamp} ${levelStr} ${this.prefix} ${message}`

    if (meta && Object.keys(meta).length > 0) {
      formatted += ` ${JSON.stringify(meta)}`
    }

    return formatted
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      console.error(this.formatMessage('debug', message, meta))
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      console.error(this.formatMessage('info', message, meta))
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      console.error(this.formatMessage('warn', message, meta))
    }
  }

  error(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, meta))
    }
  }
}

export const logger = new Logger()
