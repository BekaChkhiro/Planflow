#!/usr/bin/env node

/**
 * PlanFlow Plugin CLI
 *
 * Usage:
 *   planflow-plugin install   - Install/reinstall commands
 *   planflow-plugin uninstall - Remove all commands
 *   planflow-plugin list      - List installed commands
 *   planflow-plugin help      - Show help
 */

import { existsSync, mkdirSync, readdirSync, symlinkSync, unlinkSync, lstatSync, readlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const COMMANDS_SOURCE = join(__dirname, '..', 'commands')
const CLAUDE_COMMANDS_DIR = join(homedir(), '.claude', 'commands')

const VERSION = '0.1.0'

function install() {
  console.log('\n🔧 Installing PlanFlow commands...\n')

  if (!existsSync(CLAUDE_COMMANDS_DIR)) {
    mkdirSync(CLAUDE_COMMANDS_DIR, { recursive: true })
    console.log(`📁 Created ${CLAUDE_COMMANDS_DIR}`)
  }

  if (!existsSync(COMMANDS_SOURCE)) {
    console.error('❌ Commands directory not found.')
    process.exit(1)
  }

  const commands = readdirSync(COMMANDS_SOURCE, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)

  let count = 0
  for (const cmd of commands) {
    const source = join(COMMANDS_SOURCE, cmd)
    const target = join(CLAUDE_COMMANDS_DIR, cmd)

    try {
      if (existsSync(target)) {
        const stats = lstatSync(target)
        if (stats.isSymbolicLink()) {
          unlinkSync(target)
        }
      }
      symlinkSync(source, target)
      count++
    } catch (error) {
      console.error(`❌ Failed: ${cmd} - ${error.message}`)
    }
  }

  console.log(`✅ Installed ${count} commands to ${CLAUDE_COMMANDS_DIR}`)
  console.log('\n💡 Restart Claude Code to use the commands.')
}

function uninstall() {
  console.log('\n🗑️  Uninstalling PlanFlow commands...\n')

  if (!existsSync(CLAUDE_COMMANDS_DIR)) {
    console.log('Nothing to uninstall.')
    return
  }

  const items = readdirSync(CLAUDE_COMMANDS_DIR, { withFileTypes: true })
  let count = 0

  for (const item of items) {
    const name = item.name
    // Only remove planflow-related commands
    if (name.startsWith('plan') || name.startsWith('pf')) {
      const target = join(CLAUDE_COMMANDS_DIR, name)
      try {
        if (lstatSync(target).isSymbolicLink()) {
          unlinkSync(target)
          count++
        }
      } catch (error) {
        console.error(`❌ Failed to remove ${name}: ${error.message}`)
      }
    }
  }

  console.log(`✅ Removed ${count} commands.`)
}

function list() {
  console.log('\n📋 PlanFlow Commands:\n')

  if (!existsSync(CLAUDE_COMMANDS_DIR)) {
    console.log('No commands installed.')
    return
  }

  const items = readdirSync(CLAUDE_COMMANDS_DIR, { withFileTypes: true })
  const planflowCmds = items
    .filter(item => item.name.startsWith('plan') || item.name.startsWith('pf'))

  if (planflowCmds.length === 0) {
    console.log('No PlanFlow commands installed.')
    return
  }

  for (const item of planflowCmds) {
    const target = join(CLAUDE_COMMANDS_DIR, item.name)
    const isSymlink = lstatSync(target).isSymbolicLink()
    const status = isSymlink ? '✓' : '?'
    console.log(`  ${status} /${item.name}`)
  }

  console.log(`\nTotal: ${planflowCmds.length} commands`)
}

function help() {
  console.log(`
PlanFlow Plugin v${VERSION}

Usage:
  planflow-plugin <command>

Commands:
  install     Install or reinstall all commands
  uninstall   Remove all PlanFlow commands
  list        List installed commands
  help        Show this help message

Examples:
  planflow-plugin install
  planflow-plugin list

Documentation: https://planflow.tools/docs/plugin-commands
`)
}

// Main
const args = process.argv.slice(2)
const command = args[0]

switch (command) {
  case 'install':
    install()
    break
  case 'uninstall':
    uninstall()
    break
  case 'list':
    list()
    break
  case 'help':
  case '--help':
  case '-h':
    help()
    break
  default:
    if (command) {
      console.error(`Unknown command: ${command}`)
    }
    help()
    break
}
