# Claude Code Buddy Crack

Customize your [Claude Code](https://docs.anthropic.com/en/docs/claude-code) companion pet. Pick your species, rarity, hat, eyes, and shiny status — then patch the binary to make it stick.

Claude Code has a hidden gacha companion system (the Buddy system) that assigns you a deterministic pet based on your account UUID. Your rarity, species, and stats are locked to your identity. This toolkit lets you override that and choose your own.

## How It Works

The Buddy system stores only the companion's name and personality in `~/.claude.json`. The visual traits (rarity, species, eyes, hat, stats) are **recomputed from your account hash on every read** — editing the config does nothing because the recomputed values always overwrite stored ones.

The patcher flips a single spread operation in the compiled binary:

```
// Original — bones (recomputed) win:
return { ...stored, ...bones }

// Patched — stored (your config) wins:
return { ...bones, ...stored }
```

Same length, same structure, zero offset shift. Clean binary swap with automatic backup.

## Quick Start

```bash
# 1. Close Claude Code first

# 2. Patch the binary (creates backup automatically)
node buddy-crack.js patch

# 3. Pick your companion (interactive)
node buddy-showcase.js

# 4. Or inject directly
node buddy-crack.js inject '{"rarity":"legendary","species":"cat","eye":"✦","hat":"tophat","shiny":true}'

# 5. Restart Claude Code
```

## Tools

### `buddy-crack.js` — Patcher + Injector

The main tool. Patches the Claude Code binary and writes companion data to config.

```bash
node buddy-crack.js patch              # Patch binary (creates backup)
node buddy-crack.js unpatch            # Restore original binary
node buddy-crack.js status             # Show patch state + companion info
node buddy-crack.js inject -i          # Interactive companion builder
node buddy-crack.js inject '<json>'    # Write companion JSON to config
node buddy-crack.js roll [uuid]        # Preview what a userId rolls
```

### `buddy-showcase.js` — Visual Catalog

Browse all 3,672 valid companion combinations with ASCII art, filters, and pick-to-inject.

```bash
node buddy-showcase.js                           # Interactive wizard
node buddy-showcase.js --rarity legendary        # Filter by rarity
node buddy-showcase.js --species dragon          # Filter by species
node buddy-showcase.js --hat crown --shiny       # Combine filters
node buddy-showcase.js --eye 1                   # Filter by eye (0-5)
```

**Eyes:** `0:·` `1:✦` `2:×` `3:◉` `4:@` `5:°`

### `buddy-bruteforce.js` — Gacha Roller

Brute-force random UUIDs through the exact gacha algorithm to find rare rolls. Useful for statistics and discovery.

```bash
node buddy-bruteforce.js hunt legendary            # Find legendary rolls
node buddy-bruteforce.js hunt legendary --shiny    # Find shiny legendaries
node buddy-bruteforce.js hunt epic --max=50000000  # Custom attempt limit
node buddy-bruteforce.js check <uuid>              # Check a specific UUID
node buddy-bruteforce.js yours                     # Show your current roll
```

### `buddy-web/` — Web Creator

A web app for designing companions visually with live ASCII preview, soul generation, and step-by-step install instructions.

```bash
cd buddy-web
node server.js
# Open http://localhost:3000
```

Features:
- Visual picker for all species, rarities, eyes, hats, and shiny
- Three ways to generate name/personality:
  - **Auto:** Paste an Anthropic API key, Claude Haiku generates it
  - **DIY:** Copy a ready-made prompt to paste into any chatbot
  - **Manual:** Type your own name and personality
- Exports config JSON ready to paste into `~/.claude.json`
- Built-in install guide with platform-specific instructions

## Companion Options

| Category | Options |
|----------|---------|
| **Rarity** | common, uncommon, rare, epic, legendary |
| **Species** | duck, goose, blob, cat, dragon, octopus, owl, penguin, turtle, snail, ghost, axolotl, capybara, cactus, robot, rabbit, mushroom, chonk |
| **Eyes** | `·` `✦` `×` `◉` `@` `°` |
| **Hats** | none, crown, tophat, propeller, halo, wizard, beanie, tinyduck |
| **Shiny** | 1% chance normally — or just toggle it on |
| **Stats** | DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK (scaled by rarity) |

## Reversibility

The patcher always creates a backup before modifying anything. To restore:

```bash
node buddy-crack.js unpatch
```

The patch is **entirely local** — no data is sent to Anthropic's servers. The buddy system has no server-side state; all rendering happens client-side.

## Version Compatibility

The binary patch targets specific minified variable names in Claude Code **v2.1.89**. Different versions may use different variable names, which would require re-deriving the patch pattern. The `status` command will tell you if the pattern is found.

## Requirements

- Node.js 18+
- Claude Code installed (`~/.local/bin/claude.exe` on Windows)
- The `BUDDY` feature flag must be active (available during April 2026 teaser window and after May 2026 launch)

## Technical Details

See [BUDDY_SYSTEM.md](BUDDY_SYSTEM.md) for the full reverse-engineering documentation of the gacha algorithm, PRNG implementation, hash functions, tamper protection, and attack surface analysis.
