# Claude Code Buddy System: Complete Technical Documentation

## Overview

Buddy is a deterministic gacha companion pet system hidden inside Claude Code. A 5-line ASCII creature sits beside your terminal input and occasionally comments in a speech bubble. Your buddy is permanently bound to your Anthropic account — same user, same buddy, every session.

Gated behind the `BUDDY` compile-time feature flag. Absent from external builds as of March 2026.

---

## File Inventory

| File | Lines | Purpose |
|------|-------|---------|
| `buddy/types.ts` | ~133 | Species, rarities, eyes, hats, stats, weights, type definitions |
| `buddy/companion.ts` | ~134 | Mulberry32 PRNG, hash function, roll algorithm, tamper protection |
| `buddy/sprites.ts` | ~474 | ASCII art for all 18 species (3 frames each), hat overlays, render functions |
| `buddy/prompt.ts` | ~12 | System prompt for soul generation (Claude writes the personality) |

---

## The Gacha Algorithm

### Seed Chain

```
accountUuid (from OAuth)  or  userID (local fallback)  or  'anon'
        |
        v
    concatenate with SALT = 'friend-2026-401'
        |
        v
    hashString() → 32-bit integer
        |
        v
    mulberry32(seed) → deterministic PRNG
        |
        v
    rollFrom(rng) → bones (rarity, species, eye, hat, shiny, stats)
```

### Hash Function

Claude Code runs in Bun, so it uses `Bun.hash()` (wyhash, native C). The Node.js fallback is FNV-1a:

```javascript
// Bun path (actual production)
Number(BigInt(Bun.hash(s)) & 0xFFFFFFFFn)

// Node.js fallback
let h = 2166136261
for (let i = 0; i < s.length; i++) {
  h ^= s.charCodeAt(i)
  h = Math.imul(h, 16777619)
}
return h >>> 0
```

The two produce different values for the same input. Any tooling that replicates the roll outside Bun will get the wrong result unless it uses Bun's native hash.

### Mulberry32 PRNG

```javascript
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
```

Tiny, fast, deterministic. Same seed produces same sequence every time. The PRNG is called in strict order — rarity first, then species, then eye, then hat, then shiny, then stats. Changing any earlier roll changes all subsequent ones.

### Roll Sequence

The `rollFrom(rng)` function calls the PRNG in this exact order:

1. **Rarity** — one `rng()` call, weighted selection:

| Rarity | Weight | Probability |
|--------|--------|-------------|
| common | 60 | 60% |
| uncommon | 25 | 25% |
| rare | 10 | 10% |
| epic | 4 | 4% |
| legendary | 1 | 1% |

2. **Species** — one `rng()` call, uniform pick from 18 species
3. **Eye** — one `rng()` call, uniform pick from 6 styles
4. **Hat** — if common: forced to `'none'` (no rng call). Otherwise one `rng()` call from 8 hats
5. **Shiny** — one `rng()` call, `rng() < 0.01` (1% chance, independent of rarity)
6. **Stats** — multiple `rng()` calls:
   - Pick peak stat (one call)
   - Pick dump stat (one+ calls, rerolls if same as peak)
   - Roll 5 stat values (one call each)

### Stat Generation

Stats are shaped by rarity via a floor value:

| Rarity | Floor | Peak Range | Dump Range | Normal Range |
|--------|-------|------------|------------|--------------|
| common | 5 | 55-84 | 1-19 | 5-44 |
| uncommon | 15 | 65-94 | 5-29 | 15-54 |
| rare | 25 | 75-100 | 15-39 | 25-64 |
| epic | 35 | 85-100 | 25-49 | 35-74 |
| legendary | 50 | 100 | 40-64 | 50-89 |

One stat is the "peak" (floor + 50 + random 0-29, capped at 100). One stat is the "dump" (floor - 10 + random 0-14, min 1). The rest are floor + random 0-39.

---

## Species (18 total)

All species names are encoded via `String.fromCharCode()` arrays in the source to avoid grep detection (one species name collides with a model codename in `excluded-strings.txt`).

| Species | Decoded From |
|---------|-------------|
| duck | `0x64,0x75,0x63,0x6b` |
| goose | `0x67,0x6f,0x6f,0x73,0x65` |
| blob | `0x62,0x6c,0x6f,0x62` |
| cat | `0x63,0x61,0x74` |
| dragon | `0x64,0x72,0x61,0x67,0x6f,0x6e` |
| octopus | `0x6f,0x63,0x74,0x6f,0x70,0x75,0x73` |
| owl | `0x6f,0x77,0x6c` |
| penguin | `0x70,0x65,0x6e,0x67,0x75,0x69,0x6e` |
| turtle | `0x74,0x75,0x72,0x74,0x6c,0x65` |
| snail | `0x73,0x6e,0x61,0x69,0x6c` |
| ghost | `0x67,0x68,0x6f,0x73,0x74` |
| axolotl | `0x61,0x78,0x6f,0x6c,0x6f,0x74,0x6c` |
| capybara | `0x63,0x61,0x70,0x79,0x62,0x61,0x72,0x61` |
| cactus | `0x63,0x61,0x63,0x74,0x75,0x73` |
| robot | `0x72,0x6f,0x62,0x6f,0x74` |
| rabbit | `0x72,0x61,0x62,0x62,0x69,0x74` |
| mushroom | `0x6d,0x75,0x73,0x68,0x72,0x6f,0x6f,0x6d` |
| chonk | `0x63,0x68,0x6f,0x6e,0x6b` |

The obfuscated species is **capybara** — it collides with the internal model codename "Capybara" which is flagged in `scripts/excluded-strings.txt`.

---

## Eyes, Hats, Stats

**Eyes** (6 styles): `·` `✦` `×` `◉` `@` `°`

**Hats** (8 styles, common gets none):

| Hat | ASCII Line |
|-----|-----------|
| none | (empty) |
| crown | `\^^^/` |
| tophat | `[___]` |
| propeller | `-+-` |
| halo | `(   )` |
| wizard | `/^\` |
| beanie | `(___)` |
| tinyduck | `,>` |

**Stats** (5): DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK

**Rarity Stars**: common ★, uncommon ★★, rare ★★★, epic ★★★★, legendary ★★★★★

**Rarity Colors**: common=inactive, uncommon=success(green), rare=permission(blue), epic=autoAccept(purple), legendary=warning(gold)

---

## ASCII Sprites

Each species has 3 animation frames, each 5 lines tall and 12 characters wide. The `{E}` placeholder is replaced with the rolled eye character. Line 0 is the hat slot — blank in frames 0-1, may be used for smoke/antenna/effects in frame 2.

### All Species (Frame 0)

```
DUCK                    GOOSE                   BLOB
    __                       ({E}>                 .----.
  <({E} )___               ||                  ( {E}  {E} )
   (  ._>                _(__)_               (      )
    `--´                  ^^^^                  `----´

CAT                     DRAGON                  OCTOPUS
   /\_/\                /^\  /^\                .----.
  ( {E}   {E})            <  {E}  {E}  >             ( {E}  {E} )
  (  ω  )              (   ~~   )             (______)
  (")_(")               `-vvvv-´              /\/\/\/\

OWL                     PENGUIN                 TURTLE
   /\  /\               .---.                  _,--._
  (({E})({E}))             ({E}>{E})                ( {E}  {E} )
  (  ><  )              /(   )\              /[______]\
   `----´                `---´                ``    ``

SNAIL                   GHOST                   AXOLOTL
 {E}    .--.              .----.              }~(______)~{
  \  ( @ )             / {E}  {E} \            }~({E} .. {E})~{
   \_`--´              |      |              ( .--. )
  ~~~~~~~              ~`~``~`~              (_/  \_)

CAPYBARA                CACTUS                  ROBOT
  n______n             n  ____  n              .[||].
 ( {E}    {E} )           | |{E}  {E}| |            [ {E}  {E} ]
 (   oo   )           |_|    |_|            [ ==== ]
  `------´               |    |              `------´

RABBIT                  MUSHROOM                CHONK
   (\__/)              .-o-OO-o-.             /\    /\
  ( {E}  {E} )           (__________)           ( {E}    {E} )
 =(  ..  )=              |{E}  {E}|              (   ..   )
  (")__(")               |____|               `------´
```

### Animation

Frame 1: Subtle fidget (tail wag, foot shuffle, breathing). Frame 2: Special action (smoke puff, antenna wiggle, sparkle). The sprite renderer runs on a 500ms tick timer.

### Render Logic

```javascript
function renderSprite(bones, frame = 0) {
  const frames = BODIES[bones.species]
  const body = frames[frame % frames.length].map(line =>
    line.replaceAll('{E}', bones.eye)
  )
  const lines = [...body]
  // Hat replaces line 0 only if line 0 is blank
  if (bones.hat !== 'none' && !lines[0].trim()) {
    lines[0] = HAT_LINES[bones.hat]
  }
  // Drop blank hat slot if ALL frames have blank line 0
  if (!lines[0].trim() && frames.every(f => !f[0].trim())) lines.shift()
  return lines
}
```

### Face Rendering (for inline display)

Each species has a compact face representation:

| Species | Face Format |
|---------|------------|
| duck/goose | `({E}>` |
| blob | `({E}{E})` |
| cat | `={E}ω{E}=` |
| dragon | `<{E}~{E}>` |
| octopus | `~({E}{E})~` |
| owl | `({E})({E})` |
| penguin | `({E}>)` |
| turtle | `[{E}_{E}]` |
| snail | `{E}(@)` |
| ghost | `/{E}{E}\` |
| axolotl | `}({E}{E}){` |
| capybara | `({E}oo{E})` |
| cactus | `|{E}{E}|` |
| robot | `[{E}{E}]` |
| rabbit | `({E}.{E})` |
| mushroom | `|{E}{E}|` |
| chonk | `({E}..{E})` |

---

## Soul Generation

### When It Happens

On first hatch only. The soul (name + personality) is generated by a Claude API call. The result is stored in `config.companion` and never regenerated. Subsequent sessions reuse the stored soul.

### The Prompt

From `buddy/prompt.ts`:

```
A small {species} named {name} sits beside the user's input box and
occasionally comments in a speech bubble. You're not {name} — it's a
separate watcher.

When the user addresses {name} directly (by name), its bubble will answer.
Your job in that moment is to stay out of the way: respond in ONE line or
less, or just answer any part of the message meant for you. Don't explain
that you're not {name} — they know. Don't narrate what {name} might say —
the bubble handles that.
```

This prompt is injected into the main Claude system prompt when buddy is active. It tells Claude to coexist with the buddy — don't impersonate it, don't narrate for it, just stay out of the way when the user talks to their companion.

---

## Config Persistence

### What's Stored (`~/.claude.json` → `config.companion`)

```typescript
type StoredCompanion = {
  name: string        // "Neckflap" — editable
  personality: string // Claude-generated — editable
  hatchedAt: number   // Unix timestamp — editable but meaningless
}
```

### What's Recomputed Every Read

```typescript
type CompanionBones = {
  rarity: Rarity      // ALWAYS recomputed from hash(userId)
  species: Species     // ALWAYS recomputed
  eye: Eye             // ALWAYS recomputed
  hat: Hat             // ALWAYS recomputed
  shiny: boolean       // ALWAYS recomputed
  stats: Record<StatName, number> // ALWAYS recomputed
}
```

### The Tamper Protection

```javascript
export function getCompanion() {
  const stored = getGlobalConfig().companion
  if (!stored) return undefined
  const { bones } = roll(companionUserId())
  // bones LAST so stale bones fields in old configs get overridden
  return { ...stored, ...bones }
}
```

Spread order matters: `{ ...stored, ...bones }` means bones always win. Even if you manually add `rarity: "legendary"` to your config, it gets overwritten by the recomputed value on every read.

### userId Resolution

```javascript
export function companionUserId() {
  const config = getGlobalConfig()
  return config.oauthAccount?.accountUuid  // OAuth users (Max/Pro)
    ?? config.userID                        // API key users (local hash)
    ?? 'anon'                               // fallback
}
```

---

## Feature Gating and Activation

### Compile-Time Gate

```javascript
if (feature('BUDDY')) {
  // Buddy code included in build
}
```

Dead-code-eliminated from external builds. The `BUDDY` feature flag must be true at build time for any buddy code to exist in the binary.

### Activation Flow

1. Feature flag `BUDDY` must be true (compile-time)
2. User invokes `/buddy` command
3. `companionUserId()` resolves the user's identity
4. `roll(userId)` generates deterministic bones
5. If no stored companion: API call generates soul (name + personality)
6. `config.companion` written to disk with soul + hatchedAt
7. Sprite renderer starts (500ms tick timer)
8. Buddy prompt injected into system prompt

### April 1-7, 2026 Teaser Window

The code references April 1-7, 2026 as a teaser window, with full launch gated for May 2026. During the teaser, the buddy may appear briefly to hint at the upcoming feature.

---

## Probability Table

| Outcome | Probability | Expected Rolls |
|---------|-------------|----------------|
| Common | 60% | 1-2 |
| Uncommon | 25% | 4 |
| Rare | 10% | 10 |
| Epic | 4% | 25 |
| Legendary | 1% | 100 |
| Any Shiny | 1% | 100 |
| Shiny Rare | 0.1% | 1,000 |
| Shiny Epic | 0.04% | 2,500 |
| Shiny Legendary | 0.01% | 10,000 |
| Specific Shiny Legendary Species | 0.00056% | ~180,000 |

---

## The Brute-Force Tool

### What We Built

`buddy-bruteforce.js` — a standalone Node.js script that replicates the exact gacha algorithm from `buddy/companion.ts`. It generates random UUIDs, runs them through the PRNG, and finds rolls matching a target rarity.

### Modes

```bash
node buddy-bruteforce.js yours                    # Show YOUR buddy
node buddy-bruteforce.js check <uuid>             # Check a specific UUID
node buddy-bruteforce.js hunt legendary            # Find legendary rolls
node buddy-bruteforce.js hunt legendary --shiny    # Find shiny legendaries
node buddy-bruteforce.js hunt epic --max=50000000  # Custom attempt limit
```

### Hash Mismatch Problem

The script runs in Node.js but Claude Code runs in Bun. The hash function differs:
- **Bun**: `Bun.hash()` — native C wyhash implementation
- **Node.js**: FNV-1a fallback from the source code

This means `buddy-bruteforce.js check <your-uuid>` will show the WRONG buddy for your account. The rarity distribution is correct (same algorithm, different seed values), so hunting mode produces valid statistical results, but per-UUID lookups don't match what Bun would produce.

### How to Get Exact Matching

Install Bun and run the script with `bun` instead of `node`:

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Run with exact Bun.hash matching
bun buddy-bruteforce.js yours
```

When running under Bun, `typeof Bun !== 'undefined'` is true, so the hash function uses `Bun.hash()` natively — identical to production Claude Code.

### Why You Can't Use Found UUIDs

The brute-forcer finds UUIDs that produce legendary rolls, but you can't use them because:

1. `accountUuid` is server-assigned by Anthropic during account creation
2. Changing it in config breaks OAuth authentication
3. `userID` (local fallback) only applies when OAuth is absent
4. You don't control what UUID Anthropic assigns to new accounts

The tool is for discovery, statistics, and sharing — not for actually changing your buddy.

---

## Attack Surface Analysis

| Attack | Target | Works? | Why |
|--------|--------|--------|-----|
| Edit config.companion | Stored soul | Name/personality only | Bones overwritten by getCompanion() |
| Edit config.companion.rarity | Stored bones | No | Overwritten by recomputed bones |
| Remove oauthAccount | userId fallback | Temporarily | Re-populated on next auth |
| Change accountUuid | Hash input | No | Server validates on auth |
| Change userID | Hash input | Only without OAuth | OAuth takes priority |
| Patch compiled bundle | Hash function | Theoretically | Requires binary modification |
| Intercept soul API call | Name/personality | Yes but pointless | Doesn't change rarity |
| Create new account | New UUID | Yes but uncontrolled | Can't choose UUID |
| Change SALT constant | Hash input | Requires source build | Hardcoded in bundle |

---

## Design Insights

**Why deterministic?** Same user, same buddy, every session. No server-side state needed. No database. No "lost my save" complaints. The buddy is a pure function of your identity.

**Why obfuscate species names?** The `capybara` species name collides with an internal model codename. All species are encoded uniformly via `String.fromCharCode()` to keep the codename grep canary working.

**Why separate bones from soul?** Bones (rarity, species, stats) must be tamper-proof. Soul (name, personality) is user-facing and can be customized. By recomputing bones on every read and only persisting soul, the system prevents rarity faking while allowing personalization.

**Why cache the roll?** `roll()` is called from three hot paths: 500ms sprite tick, per-keystroke PromptInput, and per-turn observer. Caching by `userId + SALT` key prevents redundant hash + PRNG computation on every keystroke.

**Why 1% shiny independent of rarity?** A shiny legendary is 0.01% — rare enough to be special, common enough to be findable by brute force. If shiny was weighted by rarity, shiny commons would be boring and shiny legendaries would be astronomically rare.
