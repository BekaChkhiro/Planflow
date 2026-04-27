#!/usr/bin/env node

/**
 * PlanFlow Plugin - Post-install script
 *
 * Creates symlinks in ~/.claude/commands/ for all plugin commands.
 */

import { existsSync, mkdirSync, readdirSync, symlinkSync, unlinkSync, lstatSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const COMMANDS_SOURCE = join(__dirname, '..', 'commands')
const LOCALES_SOURCE = join(__dirname, '..', 'locales')
const CLAUDE_COMMANDS_DIR = join(homedir(), '.claude', 'commands')

function setup() {
  console.log('\n🔧 PlanFlow Plugin - Setting up commands...\n')

  // Create ~/.claude/commands if it doesn't exist
  if (!existsSync(CLAUDE_COMMANDS_DIR)) {
    mkdirSync(CLAUDE_COMMANDS_DIR, { recursive: true })
    console.log(`📁 Created ${CLAUDE_COMMANDS_DIR}`)
  }

  // Check if commands source exists
  if (!existsSync(COMMANDS_SOURCE)) {
    console.log('⚠️  Commands directory not found. Skipping symlink creation.')
    console.log('   You may need to run: planflow-plugin install')
    return
  }

  // Get all command directories
  const commands = readdirSync(COMMANDS_SOURCE, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)

  let created = 0
  let skipped = 0
  let updated = 0

  for (const cmd of commands) {
    const source = join(COMMANDS_SOURCE, cmd)
    const target = join(CLAUDE_COMMANDS_DIR, cmd)

    try {
      // Check if target already exists
      if (existsSync(target)) {
        const stats = lstatSync(target)
        if (stats.isSymbolicLink()) {
          // Remove old symlink and create new one
          unlinkSync(target)
          symlinkSync(source, target)
          updated++
        } else {
          // Not a symlink, skip to avoid overwriting user files
          skipped++
        }
      } else {
        // Create new symlink
        symlinkSync(source, target)
        created++
      }
    } catch (error) {
      console.error(`❌ Failed to create symlink for ${cmd}: ${error.message}`)
    }
  }

  // Symlink locales folder
  const localesTarget = join(CLAUDE_COMMANDS_DIR, 'locales')
  try {
    if (existsSync(LOCALES_SOURCE)) {
      if (existsSync(localesTarget)) {
        const stats = lstatSync(localesTarget)
        if (stats.isSymbolicLink()) {
          unlinkSync(localesTarget)
        }
      }
      if (!existsSync(localesTarget)) {
        symlinkSync(LOCALES_SOURCE, localesTarget)
        console.log(`📁 Locales folder linked`)
      }
    }
  } catch (error) {
    console.error(`⚠️  Could not link locales: ${error.message}`)
  }

  console.log(`✅ Setup complete!`)
  console.log(`   • ${created} commands installed`)
  if (updated > 0) console.log(`   • ${updated} commands updated`)
  if (skipped > 0) console.log(`   • ${skipped} commands skipped (already exist)`)
  console.log(`\n📍 Commands installed to: ${CLAUDE_COMMANDS_DIR}`)
  console.log('\n🚀 Available commands:')
  console.log('   /planNew      - Create a new project plan')
  console.log('   /planUpdate   - Update task status')
  console.log('   /planNext     - Get next task recommendation')
  console.log('   /pfLogin      - Login to PlanFlow cloud')
  console.log('   /pfSyncPush   - Push plan to cloud')
  console.log('\n💡 Restart Claude Code to use the new commands.')
  console.log('')
}

setup()
