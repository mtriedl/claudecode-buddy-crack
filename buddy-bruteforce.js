#!/usr/bin/env node

// Claude Code Buddy Gacha Brute-Forcer
// Exact algorithm from leaked source: buddy/companion.ts + buddy/types.ts
// Finds rare, epic, legendary, and shiny rolls by generating random UUIDs

const crypto = require('crypto')

let bunHashFn = null

async function initHash() {
  try {
    const mod = await import('bun-wyhash')
    bunHashFn = mod.hash || mod.default?.hash
  } catch {}
}

// --- Exact Mulberry32 PRNG from source ---
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

// --- Wyhash implementation matching Bun.hash ---
// Bun.hash uses wyhash with default seed 0. We implement the core algorithm
// in pure JS using BigInt to match Bun's output exactly.
// Reference: https://github.com/wangyi-fudan/wyhash

function wymix(a, b) {
  a = BigInt.asUintN(64, a)
  b = BigInt.asUintN(64, b)
  const lo = BigInt.asUintN(64, a * b)
  // Approximate hi via splitting into 32-bit halves
  const aLo = a & 0xFFFFFFFFn
  const aHi = a >> 32n
  const bLo = b & 0xFFFFFFFFn
  const bHi = b >> 32n
  const cross1 = aHi * bLo
  const cross2 = aLo * bHi
  const hi = BigInt.asUintN(64, aHi * bHi + (cross1 >> 32n) + (cross2 >> 32n) +
    (((cross1 & 0xFFFFFFFFn) + (cross2 & 0xFFFFFFFFn) + ((aLo * bLo) >> 32n)) >> 32n))
  return BigInt.asUintN(64, lo ^ hi)
}

function wyr8(buf, offset) {
  let v = 0n
  for (let i = 0; i < 8; i++) {
    v |= BigInt(buf[offset + i] || 0) << BigInt(i * 8)
  }
  return v
}

function wyr4(buf, offset) {
  let v = 0n
  for (let i = 0; i < 4; i++) {
    v |= BigInt(buf[offset + i] || 0) << BigInt(i * 8)
  }
  return v
}

function wyr3(buf, offset, k) {
  return BigInt.asUintN(64,
    (BigInt(buf[offset]) << 16n) |
    (BigInt(buf[offset + (k >> 1)]) << 8n) |
    BigInt(buf[offset + k - 1])
  )
}

function wyhash(buf, seed = 0n) {
  seed = BigInt.asUintN(64, seed)
  const s0 = 0xa0761d6478bd642fn
  const s1 = 0xe7037ed1a0b428dbn
  const s2 = 0x8ebc6af09c88c6e3n
  const s3 = 0x589965cc75374cc3n
  const len = BigInt(buf.length)
  let a, b

  seed ^= wymix(seed ^ s0, s1)

  if (buf.length <= 16) {
    if (buf.length >= 4) {
      const half = (buf.length >> 3) << 2
      a = BigInt.asUintN(64, (wyr4(buf, 0) << 32n) | wyr4(buf, half))
      b = BigInt.asUintN(64, (wyr4(buf, buf.length - 4) << 32n) | wyr4(buf, buf.length - 4 - half))
    } else if (buf.length > 0) {
      a = wyr3(buf, 0, buf.length)
      b = 0n
    } else {
      a = 0n
      b = 0n
    }
  } else {
    let i = buf.length
    let offset = 0
    if (i > 48) {
      let see1 = seed
      let see2 = seed
      do {
        seed = wymix(wyr8(buf, offset) ^ s1, wyr8(buf, offset + 8) ^ seed)
        see1 = wymix(wyr8(buf, offset + 16) ^ s2, wyr8(buf, offset + 24) ^ see1)
        see2 = wymix(wyr8(buf, offset + 32) ^ s3, wyr8(buf, offset + 40) ^ see2)
        offset += 48
        i -= 48
      } while (i > 48)
      seed = BigInt.asUintN(64, seed ^ see1 ^ see2)
    }
    while (i > 16) {
      seed = wymix(wyr8(buf, offset) ^ s1, wyr8(buf, offset + 8) ^ seed)
      offset += 16
      i -= 16
    }
    a = wyr8(buf, offset + i - 16)
    b = wyr8(buf, offset + i - 8)
  }

  a ^= s1
  b ^= seed
  const result = wymix(a, b)
  return BigInt.asUintN(64, wymix(result ^ s0 ^ len, result ^ s1))
}

function hashStringWyhash(s) {
  const buf = Buffer.from(s, 'utf-8')
  const h = wyhash(buf, 0n)
  return Number(h & 0xFFFFFFFFn)
}

// FNV-1a fallback (what Claude Code uses when Bun is not available)
function hashStringFnv(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function hashString(s) {
  if (bunHashFn) {
    const h = bunHashFn(s)
    return Number(BigInt(h) & 0xFFFFFFFFn)
  }
  // Fall back to our wyhash implementation
  return hashStringWyhash(s)
}

// --- Constants from buddy/types.ts ---
const SALT = 'friend-2026-401'

const SPECIES = [
  'duck', 'goose', 'blob', 'cat', 'dragon', 'octopus', 'owl', 'penguin',
  'turtle', 'snail', 'ghost', 'axolotl', 'capybara', 'cactus', 'robot',
  'rabbit', 'mushroom', 'chonk',
]

const EYES = ['·', '✦', '×', '◉', '@', '°']

const HATS = ['none', 'crown', 'tophat', 'propeller', 'halo', 'wizard', 'beanie', 'tinyduck']

const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary']

const RARITY_WEIGHTS = { common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1 }

const STAT_NAMES = ['DEBUGGING', 'PATIENCE', 'CHAOS', 'WISDOM', 'SNARK']

const RARITY_FLOOR = { common: 5, uncommon: 15, rare: 25, epic: 35, legendary: 50 }

const RARITY_STARS = { common: '★', uncommon: '★★', rare: '★★★', epic: '★★★★', legendary: '★★★★★' }

// --- Roll logic from buddy/companion.ts ---
function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)]
}

function rollRarity(rng) {
  const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0)
  let roll = rng() * total
  for (const rarity of RARITIES) {
    roll -= RARITY_WEIGHTS[rarity]
    if (roll < 0) return rarity
  }
  return 'common'
}

function rollStats(rng, rarity) {
  const floor = RARITY_FLOOR[rarity]
  const peak = pick(rng, STAT_NAMES)
  let dump = pick(rng, STAT_NAMES)
  while (dump === peak) dump = pick(rng, STAT_NAMES)

  const stats = {}
  for (const name of STAT_NAMES) {
    if (name === peak) {
      stats[name] = Math.min(100, floor + 50 + Math.floor(rng() * 30))
    } else if (name === dump) {
      stats[name] = Math.max(1, floor - 10 + Math.floor(rng() * 15))
    } else {
      stats[name] = floor + Math.floor(rng() * 40)
    }
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
  const key = userId + SALT
  return rollFrom(mulberry32(hashString(key)))
}

// --- ASCII sprites (frame 0 only) ---
const SPRITES = {
  duck:     ['    __      ', '  <({E} )___  ', '   (  ._>   ', '    `--´    '],
  goose:    ['     ({E}>    ', '     ||     ', '   _(__)_   ', '    ^^^^    '],
  blob:     ['   .----.   ', '  ( {E}  {E} )  ', '  (      )  ', '   `----´   '],
  cat:      ['   /\\_/\\    ', '  ( {E}   {E})  ', '  (  ω  )   ', '  (")_(")   '],
  dragon:   ['  /^\\  /^\\  ', ' <  {E}  {E}  > ', ' (   ~~   ) ', '  `-vvvv-´  '],
  octopus:  ['   .----.   ', '  ( {E}  {E} )  ', '  (______)  ', '  /\\/\\/\\/\\  '],
  owl:      ['   /\\  /\\   ', '  (({E})({E}))  ', '  (  ><  )  ', '   `----´   '],
  penguin:  ['  .---.     ', '  ({E}>{E})     ', ' /(   )\\    ', '  `---´     '],
  turtle:   ['   _,--._   ', '  ( {E}  {E} )  ', ' /[______]\\ ', '  ``    ``  '],
  snail:    [' {E}    .--.  ', '  \\  ( @ )  ', '   \\_`--´   ', '  ~~~~~~~   '],
  ghost:    ['   .----.   ', '  / {E}  {E} \\  ', '  |      |  ', '  ~`~``~`~  '],
  axolotl:  ['}~(______)~{', '}~({E} .. {E})~{', '  ( .--. )  ', '  (_/  \\_)  '],
  capybara: ['  n______n  ', ' ( {E}    {E} ) ', ' (   oo   ) ', '  `------´  '],
  cactus:   [' n  ____  n ', ' | |{E}  {E}| | ', ' |_|    |_| ', '   |    |   '],
  robot:    ['   .[||].   ', '  [ {E}  {E} ]  ', '  [ ==== ]  ', '  `------´  '],
  rabbit:   ['   (\\__/)   ', '  ( {E}  {E} )  ', ' =(  ..  )= ', '  (")__(")  '],
  mushroom: [' .-o-OO-o-. ', '(__________)', '   |{E}  {E}|   ', '   |____|   '],
  chonk:    ['  /\\    /\\  ', ' ( {E}    {E} ) ', ' (   ..   ) ', '  `------´  '],
}

const HAT_LINES = {
  none: '',
  crown:    '   \\^^^/    ',
  tophat:   '   [___]    ',
  propeller:'    -+-     ',
  halo:     '   (   )    ',
  wizard:   '    /^\\     ',
  beanie:   '   (___)    ',
  tinyduck: '    ,>      ',
}

function renderSprite(bones) {
  const body = SPRITES[bones.species].map(l => l.replaceAll('{E}', bones.eye))
  const lines = [...body]
  if (bones.hat !== 'none') {
    lines.unshift(HAT_LINES[bones.hat])
  }
  return lines
}

function renderBuddy(bones, userId) {
  const shinyTag = bones.shiny ? ' ✨ SHINY ✨' : ''
  const lines = [
    `┌──────────────────────────────────────────┐`,
    `│  ${RARITY_STARS[bones.rarity]} ${bones.rarity.toUpperCase()} ${bones.species.toUpperCase()}${shinyTag}`,
    `│`,
  ]
  for (const sl of renderSprite(bones)) {
    lines.push(`│  ${sl}`)
  }
  lines.push(`│`)
  lines.push(`│  Stats:`)
  for (const [stat, val] of Object.entries(bones.stats)) {
    const bar = '█'.repeat(Math.floor(val / 5)) + '░'.repeat(20 - Math.floor(val / 5))
    lines.push(`│    ${stat.padEnd(10)} ${bar} ${val}`)
  }
  lines.push(`│`)
  lines.push(`│  Eyes: ${bones.eye}  Hat: ${bones.hat}`)
  lines.push(`│  Seed: ${userId}`)
  lines.push(`└──────────────────────────────────────────┘`)
  return lines.join('\n')
}

// --- Generate random UUID v4 ---
function randomUUID() {
  return crypto.randomUUID()
}

// --- Main ---
// --- Main (async for bun-wyhash dynamic import) ---
async function main() {
await initHash()

const args = process.argv.slice(2)
const mode = args[0] || 'hunt'

if (mode === 'check') {
  const userId = args[1] || 'example-uuid-here'
  const bones = roll(userId)
  console.log(renderBuddy(bones, userId))
  process.exit(0)
}

if (mode === 'hunt') {
  const target = args[1] || 'legendary'
  const wantShiny = args.includes('--shiny')
  const maxAttempts = parseInt(args.find(a => a.startsWith('--max='))?.split('=')[1] || '10000000')

  console.log(`\n🎲 Hunting for ${wantShiny ? 'SHINY ' : ''}${target.toUpperCase()} buddies...`)
  console.log(`   Max attempts: ${maxAttempts.toLocaleString()}\n`)

  const validTargets = ['uncommon', 'rare', 'epic', 'legendary', 'any']
  if (!validTargets.includes(target) && target !== 'shiny') {
    console.log(`Valid targets: ${validTargets.join(', ')}, shiny`)
    process.exit(1)
  }

  const counts = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0, shiny: 0 }
  let found = 0
  const startTime = Date.now()

  for (let i = 0; i < maxAttempts; i++) {
    const uuid = randomUUID()
    const bones = roll(uuid)
    counts[bones.rarity]++
    if (bones.shiny) counts.shiny++

    let match = false
    if (target === 'shiny' || wantShiny) {
      match = bones.shiny && (target === 'shiny' || bones.rarity === target)
    } else if (target === 'any') {
      match = bones.rarity !== 'common'
    } else {
      match = bones.rarity === target
    }

    if (match) {
      found++
      console.log(renderBuddy(bones, uuid))
      console.log()

      if (target === 'legendary' && bones.shiny) {
        console.log('🏆 SHINY LEGENDARY — THE HOLY GRAIL! Stopping.\n')
        break
      }
      if (found >= 5 && target !== 'legendary') break
      if (found >= 3 && target === 'legendary') break
    }

    if (i > 0 && i % 1000000 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(`  ... ${(i / 1000000).toFixed(0)}M attempts in ${elapsed}s | ${JSON.stringify(counts)}`)
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)
  console.log(`\n📊 Results after ${counts.common + counts.uncommon + counts.rare + counts.epic + counts.legendary} rolls in ${elapsed}s:`)
  console.log(`   Common:    ${counts.common} (${(counts.common / (counts.common + counts.uncommon + counts.rare + counts.epic + counts.legendary) * 100).toFixed(1)}%)`)
  console.log(`   Uncommon:  ${counts.uncommon} (${(counts.uncommon / (counts.common + counts.uncommon + counts.rare + counts.epic + counts.legendary) * 100).toFixed(1)}%)`)
  console.log(`   Rare:      ${counts.rare} (${(counts.rare / (counts.common + counts.uncommon + counts.rare + counts.epic + counts.legendary) * 100).toFixed(1)}%)`)
  console.log(`   Epic:      ${counts.epic} (${(counts.epic / (counts.common + counts.uncommon + counts.rare + counts.epic + counts.legendary) * 100).toFixed(1)}%)`)
  console.log(`   Legendary: ${counts.legendary} (${(counts.legendary / (counts.common + counts.uncommon + counts.rare + counts.epic + counts.legendary) * 100).toFixed(1)}%)`)
  console.log(`   Shiny:     ${counts.shiny}`)
  console.log()
  process.exit(0)
}

if (mode === 'yours') {
  let userId
  try {
    const fs = require('fs')
    const os = require('os')
    const configPaths = [
      os.homedir() + '/.claude.json',
      os.homedir() + '/.claude/.config.json',
    ]
    for (const p of configPaths) {
      if (fs.existsSync(p)) {
        const config = JSON.parse(fs.readFileSync(p, 'utf8'))
        userId = config.oauthAccount?.accountUuid || config.userID || 'anon'
        break
      }
    }
  } catch {}

  if (!userId) {
    console.log('Could not find your Claude config. Pass your userId manually:')
    console.log('  node buddy-bruteforce.js check <your-uuid>')
    process.exit(1)
  }

  console.log(`\nYour userId: ${userId}\n`)
  const bones = roll(userId)
  console.log(renderBuddy(bones, userId))
  process.exit(0)
}

console.log(`
Claude Code Buddy Gacha Brute-Forcer
=====================================

Usage:
  node buddy-bruteforce.js yours              Show YOUR buddy (reads ~/.claude.json)
  node buddy-bruteforce.js check <uuid>       Check what a specific UUID would roll
  node buddy-bruteforce.js hunt legendary      Hunt for legendary rolls
  node buddy-bruteforce.js hunt epic           Hunt for epic rolls
  node buddy-bruteforce.js hunt rare           Hunt for rare rolls
  node buddy-bruteforce.js hunt shiny          Hunt for any shiny roll
  node buddy-bruteforce.js hunt legendary --shiny   Hunt for shiny legendary (0.01%)
  node buddy-bruteforce.js hunt epic --max=50000000 Set max attempts

Algorithm: Exact Mulberry32 PRNG + Wyhash from Claude Code source.
Salt: "${SALT}"
Hash: ${bunHashFn ? 'bun-wyhash (exact match)' : 'JS wyhash (approximate)'}
`)
}

main().catch(console.error)
