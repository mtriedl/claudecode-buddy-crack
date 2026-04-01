#!/usr/bin/env node

// Claude Code Buddy Showcase
// Enumerates ALL valid companion combinations with ASCII art display.
// Filters let you narrow down, then pick one to inject into config.
//
// Usage:
//   node buddy-showcase.js                          Browse all (interactive wizard)
//   node buddy-showcase.js --species dragon          Filter by species
//   node buddy-showcase.js --rarity legendary        Filter by rarity
//   node buddy-showcase.js --hat crown               Filter by hat
//   node buddy-showcase.js --eye 1                   Filter by eye index (0-5)
//   node buddy-showcase.js --shiny                   Only shiny variants
//   node buddy-showcase.js --no-shiny                Only non-shiny
//   Combine: --rarity epic --species ghost --shiny

const fs = require('fs')
const path = require('path')
const os = require('os')
const readline = require('readline')

// --- Constants ---
const SPECIES = [
  'duck', 'goose', 'blob', 'cat', 'dragon', 'octopus', 'owl', 'penguin',
  'turtle', 'snail', 'ghost', 'axolotl', 'capybara', 'cactus', 'robot',
  'rabbit', 'mushroom', 'chonk',
]

const EYES = ['·', '✦', '×', '◉', '@', '°']
const EYE_LABELS = ['· (dot)', '✦ (star)', '× (cross)', '◉ (bullseye)', '@ (at)', '° (degree)']

const HATS = ['none', 'crown', 'tophat', 'propeller', 'halo', 'wizard', 'beanie', 'tinyduck']

const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary']

const STAT_NAMES = ['DEBUGGING', 'PATIENCE', 'CHAOS', 'WISDOM', 'SNARK']

const RARITY_STARS = { common: '★', uncommon: '★★', rare: '★★★', epic: '★★★★', legendary: '★★★★★' }

const RARITY_FLOOR = { common: 5, uncommon: 15, rare: 25, epic: 35, legendary: 50 }

// ANSI color codes matching Claude's rarity theme
const RARITY_ANSI = {
  common:    '\x1b[90m',   // gray
  uncommon:  '\x1b[32m',   // green
  rare:      '\x1b[34m',   // blue
  epic:      '\x1b[35m',   // purple/magenta
  legendary: '\x1b[33m',   // gold/yellow
}
const SHINY_ANSI = '\x1b[96m'  // bright cyan
const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'

// --- ASCII Sprites (frame 0) ---
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
  none:      '',
  crown:     '   \\^^^/    ',
  tophat:    '   [___]    ',
  propeller: '    -+-     ',
  halo:      '   (   )    ',
  wizard:    '    /^\\     ',
  beanie:    '   (___)    ',
  tinyduck:  '    ,>      ',
}

// --- Rendering ---
function renderSprite(species, eye, hat) {
  const body = SPRITES[species].map(l => l.replaceAll('{E}', eye))
  const lines = [...body]
  if (hat !== 'none') {
    lines.unshift(HAT_LINES[hat])
  }
  return lines
}

function renderCard(combo, index) {
  const { rarity, species, eye, hat, shiny } = combo
  const color = RARITY_ANSI[rarity]
  const shinyTag = shiny ? ` ${SHINY_ANSI}✨ SHINY ✨${color}` : ''
  const sprite = renderSprite(species, eye, hat)

  const lines = []
  lines.push(`${DIM}#${index}${RESET}`)
  lines.push(`${color}${BOLD}${RARITY_STARS[rarity]} ${rarity.toUpperCase()} ${species.toUpperCase()}${shinyTag}${RESET}`)
  lines.push('')
  for (const sl of sprite) {
    lines.push(`${color}  ${sl}${RESET}`)
  }
  lines.push('')
  lines.push(`${DIM}  Eyes: ${eye}  Hat: ${hat}${RESET}`)
  return lines
}

// Side-by-side rendering: place multiple cards in columns
function renderRow(combos, startIndex, cols = 3) {
  const cards = combos.map((c, i) => renderCard(c, startIndex + i))
  const colWidth = 44
  const maxLines = Math.max(...cards.map(c => c.length))

  const output = []
  for (let line = 0; line < maxLines; line++) {
    let row = ''
    for (let col = 0; col < cards.length; col++) {
      const text = cards[col][line] || ''
      // Strip ANSI for padding calculation
      const plainLen = text.replace(/\x1b\[[0-9;]*m/g, '').length
      const pad = Math.max(0, colWidth - plainLen)
      row += text + ' '.repeat(pad)
    }
    output.push(row)
  }
  return output.join('\n')
}

// --- Combination Generator ---
function generateAll(filters = {}) {
  const combos = []

  const rarityList = filters.rarity ? [filters.rarity] : RARITIES
  const speciesList = filters.species ? [filters.species] : SPECIES
  const eyeList = filters.eyeIdx !== undefined ? [EYES[filters.eyeIdx]] : EYES
  const shinyList = filters.shiny === true ? [true] : filters.shiny === false ? [false] : [false, true]

  for (const rarity of rarityList) {
    const hatList = rarity === 'common'
      ? ['none']
      : (filters.hat ? [filters.hat] : HATS)

    for (const species of speciesList) {
      for (const eye of eyeList) {
        for (const hat of hatList) {
          for (const shiny of shinyList) {
            combos.push({ rarity, species, eye, hat, shiny })
          }
        }
      }
    }
  }

  return combos
}

// --- Default stats for a rarity ---
function defaultStats(rarity) {
  const floor = RARITY_FLOOR[rarity]
  const stats = {}
  if (rarity === 'legendary') {
    stats.DEBUGGING = 100; stats.PATIENCE = 85; stats.CHAOS = 90; stats.WISDOM = 95; stats.SNARK = 80
  } else if (rarity === 'epic') {
    stats.DEBUGGING = 90; stats.PATIENCE = 70; stats.CHAOS = 75; stats.WISDOM = 85; stats.SNARK = 65
  } else if (rarity === 'rare') {
    stats.DEBUGGING = 80; stats.PATIENCE = 55; stats.CHAOS = 60; stats.WISDOM = 75; stats.SNARK = 50
  } else if (rarity === 'uncommon') {
    stats.DEBUGGING = 65; stats.PATIENCE = 40; stats.CHAOS = 45; stats.WISDOM = 55; stats.SNARK = 35
  } else {
    stats.DEBUGGING = 40; stats.PATIENCE = 25; stats.CHAOS = 30; stats.WISDOM = 35; stats.SNARK = 20
  }
  return stats
}

// --- Config I/O ---
const CONFIG_PATH = path.join(os.homedir(), '.claude.json')

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {}
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n')
}

// --- Interactive wizard ---
async function interactiveWizard() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ask = (q) => new Promise(resolve => rl.question(q, resolve))

  console.log(`\n${BOLD}╔══════════════════════════════════════════╗${RESET}`)
  console.log(`${BOLD}║     BUDDY COMPANION SHOWCASE             ║${RESET}`)
  console.log(`${BOLD}║     3,672 possible combinations          ║${RESET}`)
  console.log(`${BOLD}╚══════════════════════════════════════════╝${RESET}\n`)

  // Step 1: Rarity
  console.log(`${BOLD}Step 1: Choose rarity${RESET}\n`)
  for (let i = 0; i < RARITIES.length; i++) {
    const r = RARITIES[i]
    console.log(`  ${RARITY_ANSI[r]}${BOLD}[${i}] ${RARITY_STARS[r]} ${r.toUpperCase()}${RESET}`)
  }
  console.log(`  ${DIM}[a] Show all rarities${RESET}`)
  const rarityInput = (await ask('\nPick: ')).trim().toLowerCase()
  const rarity = rarityInput === 'a' ? null : RARITIES[parseInt(rarityInput)]
  if (rarityInput !== 'a' && !rarity) { console.log('Invalid. Using all.'); }

  // Step 2: Species
  console.log(`\n${BOLD}Step 2: Choose species${RESET}\n`)
  for (let i = 0; i < SPECIES.length; i++) {
    const s = SPECIES[i]
    const sprite = SPRITES[s][1].replaceAll('{E}', '·')
    process.stdout.write(`  [${String(i).padStart(2)}] ${s.padEnd(10)} ${DIM}${sprite}${RESET}\n`)
  }
  console.log(`  ${DIM}[ a] Show all species${RESET}`)
  const speciesInput = (await ask('\nPick: ')).trim().toLowerCase()
  const species = speciesInput === 'a' ? null : SPECIES[parseInt(speciesInput)]

  // Step 3: Eyes
  console.log(`\n${BOLD}Step 3: Choose eyes${RESET}\n`)
  for (let i = 0; i < EYES.length; i++) {
    console.log(`  [${i}] ${EYE_LABELS[i]}`)
  }
  console.log(`  ${DIM}[a] Show all eyes${RESET}`)
  const eyeInput = (await ask('\nPick: ')).trim().toLowerCase()
  const eyeIdx = eyeInput === 'a' ? undefined : parseInt(eyeInput)

  // Step 4: Hat (skip if common-only)
  let hat = null
  if (!rarity || rarity !== 'common') {
    console.log(`\n${BOLD}Step 4: Choose hat${RESET}\n`)
    for (let i = 0; i < HATS.length; i++) {
      const h = HATS[i]
      const preview = h === 'none' ? '(bare)' : HAT_LINES[h].trim()
      console.log(`  [${i}] ${h.padEnd(10)} ${DIM}${preview}${RESET}`)
    }
    console.log(`  ${DIM}[a] Show all hats${RESET}`)
    const hatInput = (await ask('\nPick: ')).trim().toLowerCase()
    hat = hatInput === 'a' ? null : HATS[parseInt(hatInput)]
  }

  // Step 5: Shiny
  console.log(`\n${BOLD}Step 5: Shiny?${RESET}`)
  console.log(`  [0] No`)
  console.log(`  [1] ${SHINY_ANSI}✨ Yes${RESET}`)
  console.log(`  ${DIM}[a] Show both${RESET}`)
  const shinyInput = (await ask('\nPick: ')).trim().toLowerCase()
  const shiny = shinyInput === 'a' ? undefined : shinyInput === '1'

  // Generate filtered combos
  const filters = {}
  if (rarity) filters.rarity = rarity
  if (species) filters.species = species
  if (eyeIdx !== undefined && !isNaN(eyeIdx)) filters.eyeIdx = eyeIdx
  if (hat) filters.hat = hat
  if (shiny !== undefined) filters.shiny = shiny

  const combos = generateAll(filters)
  console.log(`\n${BOLD}Generated ${combos.length} combination(s)${RESET}\n`)

  if (combos.length === 0) {
    console.log('No valid combinations with these filters.')
    rl.close()
    return
  }

  // Display in pages
  const PAGE_SIZE = 12
  const COLS = 3
  let page = 0
  const totalPages = Math.ceil(combos.length / PAGE_SIZE)

  while (true) {
    const start = page * PAGE_SIZE
    const end = Math.min(start + PAGE_SIZE, combos.length)
    const pageCombos = combos.slice(start, end)

    console.log(`${DIM}─── Page ${page + 1}/${totalPages} (${combos.length} total) ───${RESET}\n`)

    // Render in rows of COLS
    for (let i = 0; i < pageCombos.length; i += COLS) {
      const rowCombos = pageCombos.slice(i, i + COLS)
      console.log(renderRow(rowCombos, start + i, COLS))
      console.log()
    }

    console.log(`${DIM}Commands: [n]ext  [p]rev  [#] pick by number  [q]uit${RESET}`)
    const input = (await ask('\n> ')).trim().toLowerCase()

    if (input === 'q') { rl.close(); return }
    if (input === 'n') { page = Math.min(page + 1, totalPages - 1); continue }
    if (input === 'p') { page = Math.max(page - 1, 0); continue }

    const pickNum = parseInt(input)
    if (!isNaN(pickNum) && pickNum >= 0 && pickNum < combos.length) {
      const picked = combos[pickNum]
      console.log(`\n${BOLD}═══ SELECTED ═══${RESET}\n`)
      console.log(renderRow([picked], pickNum, 1))

      // Ask for name and personality
      const config = readConfig()
      const existingName = config.companion?.name || ''
      const existingPersonality = config.companion?.personality || ''

      console.log(`\n${DIM}Current name: ${existingName || '(none)'}${RESET}`)
      const nameInput = (await ask(`Name (enter to keep${existingName ? ` "${existingName}"` : ''}): `)).trim()
      const name = nameInput || existingName || 'Buddy'

      console.log(`${DIM}Current personality: ${existingPersonality ? existingPersonality.slice(0, 60) + '...' : '(none)'}${RESET}`)
      const persInput = (await ask(`Personality (enter to keep): `)).trim()
      const personality = persInput || existingPersonality || 'A loyal companion.'

      const stats = defaultStats(picked.rarity)

      const companion = {
        name,
        personality,
        hatchedAt: config.companion?.hatchedAt || Date.now(),
        rarity: picked.rarity,
        species: picked.species,
        eye: picked.eye,
        hat: picked.hat,
        shiny: picked.shiny,
        stats,
      }

      // Final preview
      console.log(`\n${BOLD}═══ FINAL PREVIEW ═══${RESET}\n`)
      const color = RARITY_ANSI[picked.rarity]
      const shinyTag = picked.shiny ? ` ${SHINY_ANSI}✨ SHINY ✨${RESET}` : ''
      console.log(`${color}${BOLD}${RARITY_STARS[picked.rarity]} ${picked.rarity.toUpperCase()} ${picked.species.toUpperCase()}${shinyTag}${RESET}`)
      console.log()
      for (const sl of renderSprite(picked.species, picked.eye, picked.hat)) {
        console.log(`${color}  ${sl}${RESET}`)
      }
      console.log()
      console.log(`  Name: ${BOLD}${name}${RESET}`)
      console.log(`  Personality: ${personality}`)
      console.log()
      console.log(`  ${BOLD}Stats:${RESET}`)
      for (const [stat, val] of Object.entries(stats)) {
        const bar = `${color}${'█'.repeat(Math.floor(val / 5))}${RESET}${DIM}${'░'.repeat(20 - Math.floor(val / 5))}${RESET}`
        console.log(`    ${stat.padEnd(10)} ${bar} ${val}`)
      }

      const confirm = (await ask(`\nInject into config? (y/n): `)).trim().toLowerCase()
      if (confirm === 'y' || confirm === 'yes') {
        config.companion = companion
        writeConfig(config)
        console.log(`\n${BOLD}Written to ${CONFIG_PATH}${RESET}`)
        console.log(`${DIM}Remember: run apply-patch.bat to patch the binary, then restart Claude Code.${RESET}\n`)
      }

      rl.close()
      return
    }

    console.log(`${DIM}Invalid input. Enter a number (0-${combos.length - 1}), n, p, or q.${RESET}`)
  }
}

// --- CLI filter mode ---
function cliFilterMode(args) {
  const filters = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--rarity' && args[i + 1]) {
      filters.rarity = args[++i].toLowerCase()
      if (!RARITIES.includes(filters.rarity)) {
        console.error(`Invalid rarity: ${filters.rarity}\nValid: ${RARITIES.join(', ')}`)
        process.exit(1)
      }
    } else if (arg === '--species' && args[i + 1]) {
      filters.species = args[++i].toLowerCase()
      if (!SPECIES.includes(filters.species)) {
        console.error(`Invalid species: ${filters.species}\nValid: ${SPECIES.join(', ')}`)
        process.exit(1)
      }
    } else if (arg === '--hat' && args[i + 1]) {
      filters.hat = args[++i].toLowerCase()
      if (!HATS.includes(filters.hat)) {
        console.error(`Invalid hat: ${filters.hat}\nValid: ${HATS.join(', ')}`)
        process.exit(1)
      }
    } else if (arg === '--eye' && args[i + 1]) {
      filters.eyeIdx = parseInt(args[++i])
      if (isNaN(filters.eyeIdx) || filters.eyeIdx < 0 || filters.eyeIdx > 5) {
        console.error('Invalid eye index. Valid: 0-5')
        process.exit(1)
      }
    } else if (arg === '--shiny') {
      filters.shiny = true
    } else if (arg === '--no-shiny') {
      filters.shiny = false
    }
  }

  const combos = generateAll(filters)
  console.log(`\n${BOLD}${combos.length} combination(s) matching filters${RESET}\n`)

  const COLS = 3
  for (let i = 0; i < combos.length; i += COLS) {
    const row = combos.slice(i, i + COLS)
    console.log(renderRow(row, i, COLS))
    console.log()
  }

  console.log(`${DIM}To pick one: node buddy-showcase.js (interactive wizard)${RESET}`)
  console.log(`${DIM}Or: node buddy-crack.js inject '{"rarity":"legendary","species":"dragon",...}'${RESET}\n`)
}

// --- Main ---
const args = process.argv.slice(2)

if (args.length === 0) {
  interactiveWizard().catch(console.error)
} else if (args[0] === '--help' || args[0] === '-h') {
  console.log(`
Buddy Showcase — Browse all 3,672 companion combinations
=========================================================

Interactive:
  node buddy-showcase.js                     Step-by-step wizard with preview + inject

Filtered:
  node buddy-showcase.js --rarity legendary  Filter by rarity
  node buddy-showcase.js --species dragon    Filter by species
  node buddy-showcase.js --hat crown         Filter by hat
  node buddy-showcase.js --eye 1             Filter by eye (0-5: · ✦ × ◉ @ °)
  node buddy-showcase.js --shiny             Only shiny
  node buddy-showcase.js --no-shiny          Only non-shiny

Combine filters:
  node buddy-showcase.js --rarity epic --species ghost --shiny

Eyes reference:
  0: ·  (dot)        3: ◉  (bullseye)
  1: ✦  (star)       4: @  (at)
  2: ×  (cross)      5: °  (degree)

Species: ${SPECIES.join(', ')}
Hats: ${HATS.join(', ')}
Rarities: ${RARITIES.join(', ')}
`)
} else {
  cliFilterMode(args)
}
