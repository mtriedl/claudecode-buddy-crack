#!/usr/bin/env node

// Claude Code Buddy System Cracker
// Three-stage pipeline:
//   1. PATCH  — Binary-patch claude.exe to disable bone recomputation
//   2. ROLL   — Find a target roll (or specify one manually)
//   3. INJECT — Write full companion data (bones + soul) to ~/.claude.json
//
// Usage:
//   node buddy-crack.js patch              Patch claude.exe (creates backup)
//   node buddy-crack.js unpatch            Restore original binary from backup
//   node buddy-crack.js roll <uuid>        Show what a UUID rolls
//   node buddy-crack.js inject <json>      Write companion to config
//   node buddy-crack.js inject --interactive   Guided companion builder
//   node buddy-crack.js status             Show current patch & companion state

const fs = require('fs')
const path = require('path')
const os = require('os')
const readline = require('readline')

// --- Binary locations ---
const CLAUDE_BIN = path.join(os.homedir(), '.local', 'bin', 'claude.exe')
const CLAUDE_BACKUP = CLAUDE_BIN + '.bak'
const VERSIONS_DIR = path.join(os.homedir(), '.local', 'share', 'claude', 'versions')

// --- Config location ---
const CONFIG_PATH = path.join(os.homedir(), '.claude.json')

// --- The patch ---
// In the minified binary, getCompanion() looks like:
//   function FR(){let H=z8().companion;if(!H)return;let{bones:$}=Gh$(Th$());return{...H,...$}}
//
// {bones:$}=Gh$(Th$());return{...H,...$}  — bones last, bones win (tamper protection)
// {bones:$}=Gh$(Th$());return{...$,...H}  — stored last, stored win (our patch)
//
// Both patterns are exactly 38 bytes. Clean swap, no offset shift.
const SEARCH  = Buffer.from('{bones:$}=Gh$(Th$());return{...H,...$}')
const REPLACE = Buffer.from('{bones:$}=Gh$(Th$());return{...$,...H}')

// --- Gacha constants (from buddy/types.ts) ---
const SPECIES = [
  'duck', 'goose', 'blob', 'cat', 'dragon', 'octopus', 'owl', 'penguin',
  'turtle', 'snail', 'ghost', 'axolotl', 'capybara', 'cactus', 'robot',
  'rabbit', 'mushroom', 'chonk',
]
const EYES = ['·', '✦', '×', '◉', '@', '°']
const HATS = ['none', 'crown', 'tophat', 'propeller', 'halo', 'wizard', 'beanie', 'tinyduck']
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary']
const STAT_NAMES = ['DEBUGGING', 'PATIENCE', 'CHAOS', 'WISDOM', 'SNARK']
const RARITY_STARS = { common: '★', uncommon: '★★', rare: '★★★', epic: '★★★★', legendary: '★★★★★' }

// --- Mulberry32 PRNG ---
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// --- FNV-1a hash (Node.js fallback) ---
function hashString(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)] }

function rollRarity(rng) {
  const weights = { common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1 }
  const total = 100
  let roll = rng() * total
  for (const r of RARITIES) {
    roll -= weights[r]
    if (roll < 0) return r
  }
  return 'common'
}

function rollStats(rng, rarity) {
  const floors = { common: 5, uncommon: 15, rare: 25, epic: 35, legendary: 50 }
  const floor = floors[rarity]
  const peak = pick(rng, STAT_NAMES)
  let dump = pick(rng, STAT_NAMES)
  while (dump === peak) dump = pick(rng, STAT_NAMES)
  const stats = {}
  for (const name of STAT_NAMES) {
    if (name === peak) stats[name] = Math.min(100, floor + 50 + Math.floor(rng() * 30))
    else if (name === dump) stats[name] = Math.max(1, floor - 10 + Math.floor(rng() * 15))
    else stats[name] = floor + Math.floor(rng() * 40)
  }
  return stats
}

function rollFrom(rng) {
  const rarity = rollRarity(rng)
  return {
    rarity,
    species: pick(rng, SPECIES),
    eye: pick(rng, EYES),
    hat: rarity === 'common' ? 'none' : pick(rng, HATS),
    shiny: rng() < 0.01,
    stats: rollStats(rng, rarity),
  }
}

function roll(userId) {
  const SALT = 'friend-2026-401'
  return rollFrom(mulberry32(hashString(userId + SALT)))
}

// --- Binary patching ---
function findAllOccurrences(buffer, search) {
  const positions = []
  let pos = 0
  while (pos < buffer.length) {
    const idx = buffer.indexOf(search, pos)
    if (idx === -1) break
    positions.push(idx)
    pos = idx + 1
  }
  return positions
}

function patchBinary(binPath) {
  if (!fs.existsSync(binPath)) {
    console.error(`  Binary not found: ${binPath}`)
    return false
  }

  const data = fs.readFileSync(binPath)
  const positions = findAllOccurrences(data, SEARCH)

  if (positions.length === 0) {
    const reverseCheck = findAllOccurrences(data, REPLACE)
    if (reverseCheck.length > 0) {
      console.log(`  Already patched (${reverseCheck.length} occurrence(s))`)
      return true
    }
    console.error('  Pattern not found — binary may be a different version')
    return false
  }

  console.log(`  Found ${positions.length} occurrence(s) at offsets: ${positions.map(p => '0x' + p.toString(16)).join(', ')}`)

  for (const pos of positions) {
    REPLACE.copy(data, pos)
  }

  fs.writeFileSync(binPath, data)
  console.log(`  Patched ${positions.length} occurrence(s)`)
  return true
}

function unpatchBinary(binPath) {
  if (!fs.existsSync(binPath)) {
    console.error(`  Binary not found: ${binPath}`)
    return false
  }

  const data = fs.readFileSync(binPath)
  const positions = findAllOccurrences(data, REPLACE)

  if (positions.length === 0) {
    const forwardCheck = findAllOccurrences(data, SEARCH)
    if (forwardCheck.length > 0) {
      console.log('  Already unpatched (original pattern found)')
      return true
    }
    console.error('  Neither pattern found — binary may be a different version')
    return false
  }

  for (const pos of positions) {
    SEARCH.copy(data, pos)
  }

  fs.writeFileSync(binPath, data)
  console.log(`  Restored ${positions.length} occurrence(s)`)
  return true
}

function checkPatchStatus(binPath) {
  if (!fs.existsSync(binPath)) return 'missing'
  const data = fs.readFileSync(binPath)
  const origCount = findAllOccurrences(data, SEARCH).length
  const patchCount = findAllOccurrences(data, REPLACE).length
  if (patchCount > 0 && origCount === 0) return 'patched'
  if (origCount > 0 && patchCount === 0) return 'original'
  if (origCount > 0 && patchCount > 0) return 'partial'
  return 'unknown'
}

// --- Config manipulation ---
function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {}
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n')
}

function getUserId() {
  const config = readConfig()
  return config.oauthAccount?.accountUuid ?? config.userID ?? 'anon'
}

// --- Display helpers ---
function renderBones(bones) {
  const shinyTag = bones.shiny ? ' ✨ SHINY ✨' : ''
  const lines = [
    `  ${RARITY_STARS[bones.rarity]} ${bones.rarity.toUpperCase()} ${bones.species.toUpperCase()}${shinyTag}`,
    `  Eyes: ${bones.eye}  Hat: ${bones.hat}`,
    '',
    '  Stats:',
  ]
  for (const [stat, val] of Object.entries(bones.stats)) {
    const bar = '█'.repeat(Math.floor(val / 5)) + '░'.repeat(20 - Math.floor(val / 5))
    lines.push(`    ${stat.padEnd(10)} ${bar} ${val}`)
  }
  return lines.join('\n')
}

// --- Interactive companion builder ---
async function interactiveBuilder() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ask = (q) => new Promise(resolve => rl.question(q, resolve))

  console.log('\n┌──────────────────────────────────────┐')
  console.log('│  COMPANION BUILDER                   │')
  console.log('└──────────────────────────────────────┘\n')

  console.log('Rarities: ' + RARITIES.join(', '))
  const rarity = (await ask('Rarity: ')).trim().toLowerCase()
  if (!RARITIES.includes(rarity)) { console.error('Invalid rarity'); rl.close(); return }

  console.log('\nSpecies: ' + SPECIES.join(', '))
  const species = (await ask('Species: ')).trim().toLowerCase()
  if (!SPECIES.includes(species)) { console.error('Invalid species'); rl.close(); return }

  console.log('\nEyes: ' + EYES.join('  '))
  const eyeIdx = parseInt(await ask('Eye index (0-5): '))
  const eye = EYES[eyeIdx] || EYES[0]

  console.log('\nHats: ' + HATS.join(', '))
  const hat = (await ask('Hat (or "none"): ')).trim().toLowerCase()
  if (!HATS.includes(hat)) { console.error('Invalid hat'); rl.close(); return }

  const shinyInput = (await ask('\nShiny? (y/n): ')).trim().toLowerCase()
  const shiny = shinyInput === 'y' || shinyInput === 'yes'

  const name = (await ask('\nCompanion name: ')).trim()
  const personality = (await ask('Personality (short description): ')).trim()

  // Generate stats based on rarity
  const floors = { common: 5, uncommon: 15, rare: 25, epic: 35, legendary: 50 }
  const floor = floors[rarity]
  const stats = {}
  console.log(`\nStats (floor for ${rarity}: ${floor}, range ${floor}-100):`)
  for (const stat of STAT_NAMES) {
    const val = parseInt(await ask(`  ${stat}: `))
    stats[stat] = Math.max(1, Math.min(100, val || floor))
  }

  const companion = {
    name,
    personality,
    hatchedAt: Date.now(),
    rarity,
    species,
    eye,
    hat,
    shiny,
    stats,
  }

  console.log('\n--- Preview ---')
  console.log(renderBones(companion))
  console.log(`  Name: ${name}`)
  console.log(`  Personality: ${personality}`)

  const confirm = (await ask('\nWrite to config? (y/n): ')).trim().toLowerCase()
  if (confirm === 'y' || confirm === 'yes') {
    const config = readConfig()
    config.companion = companion
    writeConfig(config)
    console.log(`\nWritten to ${CONFIG_PATH}`)
    console.log('Make sure claude.exe is patched, otherwise bones will be recomputed on next read.')
  }

  rl.close()
}

// --- Main ---
async function main() {
  const args = process.argv.slice(2)
  const mode = args[0] || 'help'

  if (mode === 'patch') {
    console.log('\n=== STAGE 1: Binary Patch ===\n')

    // Backup
    if (!fs.existsSync(CLAUDE_BACKUP)) {
      console.log(`Creating backup: ${CLAUDE_BACKUP}`)
      fs.copyFileSync(CLAUDE_BIN, CLAUDE_BACKUP)
      console.log('  Backup created\n')
    } else {
      console.log(`Backup already exists: ${CLAUDE_BACKUP}\n`)
    }

    // Patch main binary
    console.log(`Patching: ${CLAUDE_BIN}`)
    patchBinary(CLAUDE_BIN)

    // Patch versioned copies
    if (fs.existsSync(VERSIONS_DIR)) {
      const versions = fs.readdirSync(VERSIONS_DIR)
      for (const ver of versions) {
        const verPath = path.join(VERSIONS_DIR, ver)
        const stat = fs.statSync(verPath)
        if (stat.isFile() && stat.size > 100_000_000) {
          console.log(`\nPatching version: ${ver}`)
          patchBinary(verPath)
        }
      }
    }

    console.log('\nDone. Run "node buddy-crack.js status" to verify.\n')
  }

  else if (mode === 'unpatch') {
    console.log('\n=== Restoring Original Binary ===\n')

    if (fs.existsSync(CLAUDE_BACKUP)) {
      console.log(`Restoring from backup: ${CLAUDE_BACKUP}`)
      fs.copyFileSync(CLAUDE_BACKUP, CLAUDE_BIN)
      console.log('  Restored\n')
    } else {
      console.log('No backup found. Attempting reverse patch...\n')
      console.log(`Unpatching: ${CLAUDE_BIN}`)
      unpatchBinary(CLAUDE_BIN)
    }

    if (fs.existsSync(VERSIONS_DIR)) {
      const versions = fs.readdirSync(VERSIONS_DIR)
      for (const ver of versions) {
        const verPath = path.join(VERSIONS_DIR, ver)
        const stat = fs.statSync(verPath)
        if (stat.isFile() && stat.size > 100_000_000) {
          console.log(`\nUnpatching version: ${ver}`)
          unpatchBinary(verPath)
        }
      }
    }

    console.log('\nDone.\n')
  }

  else if (mode === 'roll') {
    const userId = args[1] || getUserId()
    console.log(`\nRolling for userId: ${userId}`)
    console.log('(Note: Uses FNV-1a hash. Run under Bun for exact Bun.hash match)\n')
    const bones = roll(userId)
    console.log(renderBones(bones))
    console.log()
  }

  else if (mode === 'inject') {
    if (args[1] === '--interactive' || args[1] === '-i') {
      await interactiveBuilder()
      return
    }

    if (!args[1]) {
      console.error('Usage: node buddy-crack.js inject \'{"rarity":"legendary",...}\' ')
      console.error('   or: node buddy-crack.js inject --interactive')
      process.exit(1)
    }

    const input = JSON.parse(args.slice(1).join(' '))
    const config = readConfig()

    // Merge with existing companion if present
    const existing = config.companion || {}
    config.companion = {
      name: input.name || existing.name || 'Unknown',
      personality: input.personality || existing.personality || 'A mysterious companion.',
      hatchedAt: input.hatchedAt || existing.hatchedAt || Date.now(),
      rarity: input.rarity || existing.rarity || 'legendary',
      species: input.species || existing.species || 'dragon',
      eye: input.eye || existing.eye || '✦',
      hat: input.hat || existing.hat || 'crown',
      shiny: input.shiny !== undefined ? input.shiny : (existing.shiny || false),
      stats: input.stats || existing.stats || {
        DEBUGGING: 100, PATIENCE: 85, CHAOS: 90, WISDOM: 95, SNARK: 80
      },
    }

    writeConfig(config)
    console.log(`\nCompanion written to ${CONFIG_PATH}:`)
    console.log(renderBones(config.companion))
    console.log(`  Name: ${config.companion.name}`)
    console.log()
  }

  else if (mode === 'status') {
    console.log('\n=== Buddy Crack Status ===\n')

    // Binary status
    const mainStatus = checkPatchStatus(CLAUDE_BIN)
    console.log(`Binary: ${CLAUDE_BIN}`)
    console.log(`  Status: ${mainStatus.toUpperCase()}`)
    console.log(`  Backup: ${fs.existsSync(CLAUDE_BACKUP) ? 'exists' : 'none'}`)

    if (fs.existsSync(VERSIONS_DIR)) {
      const versions = fs.readdirSync(VERSIONS_DIR)
      for (const ver of versions) {
        const verPath = path.join(VERSIONS_DIR, ver)
        const stat = fs.statSync(verPath)
        if (stat.isFile() && stat.size > 100_000_000) {
          const verStatus = checkPatchStatus(verPath)
          console.log(`  Version ${ver}: ${verStatus.toUpperCase()}`)
        }
      }
    }

    // Config status
    console.log(`\nConfig: ${CONFIG_PATH}`)
    const config = readConfig()
    const userId = getUserId()
    console.log(`  userId: ${userId}`)

    if (config.companion) {
      console.log(`  Companion: ${config.companion.name} (${config.companion.species || 'no species stored'})`)
      console.log(`  Stored rarity: ${config.companion.rarity || 'none (will be recomputed)'}`)
      console.log(`  Stored species: ${config.companion.species || 'none (will be recomputed)'}`)

      if (mainStatus === 'patched') {
        console.log('\n  With patch active, stored bones will persist.')
        if (config.companion.rarity) {
          console.log(`  Your companion will display as: ${RARITY_STARS[config.companion.rarity]} ${config.companion.rarity.toUpperCase()} ${(config.companion.species || '???').toUpperCase()}`)
        }
      } else {
        console.log('\n  Without patch, bones are recomputed from userId hash.')
        const realBones = roll(userId)
        console.log(`  Your ACTUAL roll (FNV-1a):`)
        console.log(renderBones(realBones))
      }
    } else {
      console.log('  Companion: none (not hatched yet)')
    }
    console.log()
  }

  else {
    console.log(`
Claude Code Buddy Cracker
=========================

Usage:
  node buddy-crack.js patch              Patch claude.exe to disable bone recomputation
  node buddy-crack.js unpatch            Restore original binary
  node buddy-crack.js status             Show patch state and companion info
  node buddy-crack.js roll [uuid]        Preview what a userId rolls (FNV-1a)
  node buddy-crack.js inject -i          Interactive companion builder
  node buddy-crack.js inject '<json>'    Write companion JSON to config

Pipeline:
  1. node buddy-crack.js patch           Disable tamper protection
  2. node buddy-crack.js inject -i       Build your dream companion
  3. Restart Claude Code                 See your custom companion

Reversible:
  node buddy-crack.js unpatch            Restores original binary from backup
`)
  }
}

main().catch(console.error)
