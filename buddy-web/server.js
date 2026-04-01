const http = require('http')
const fs = require('fs')
const path = require('path')

const PORT = 3000

// --- Soul generation prompt ---
// Reconstructed from the buddy system architecture.
// Species + rarity + stats go in, name + personality come out.
function buildSoulPrompt(bones) {
  const statSummary = Object.entries(bones.stats)
    .sort(([,a], [,b]) => b - a)
    .map(([name, val]) => `${name}: ${val}/100`)
    .join(', ')

  const peakStat = Object.entries(bones.stats).sort(([,a],[,b]) => b - a)[0][0]
  const dumpStat = Object.entries(bones.stats).sort(([,a],[,b]) => a - b)[0][0]

  return {
    system: `You are a creative naming engine for small ASCII companion pets that live beside a developer's terminal. Each companion is a tiny creature with a unique personality.

Rules:
- The name should be 1-2 words, memorable, slightly absurd, and feel like a pet name a programmer would give. Examples of the vibe: "Neckflap", "Biscuit", "Turbo", "Wobbles", "Sir Chomps", "Glitch", "Dumpling".
- The personality should be exactly ONE sentence describing how this creature behaves as a coding companion. It should reference their species traits, their peak stat (${peakStat}), and have a comedic edge.
- Do NOT use generic descriptions. Be specific and opinionated.
- Shiny companions should have slightly more dramatic or mythic personalities.
- Higher rarity companions should feel more powerful/wise/chaotic.

Respond with valid JSON only: {"name": "...", "personality": "..."}`,

    user: `Generate a name and personality for this companion:
- Species: ${bones.species}
- Rarity: ${bones.rarity}
- Shiny: ${bones.shiny ? 'YES (rare sparkly variant)' : 'no'}
- Stats: ${statSummary}
- Peak stat: ${peakStat}
- Dump stat: ${dumpStat}
- Hat: ${bones.hat}
- Eyes: ${bones.eye}`
  }
}

// --- Anthropic API call ---
async function generateSoul(bones, apiKey) {
  const prompt = buildSoulPrompt(bones)

  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [
      { role: 'user', content: prompt.user }
    ],
    system: prompt.system,
  })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic API ${res.status}: ${err}`)
  }

  const data = await res.json()
  const text = data.content[0].text.trim()

  // Parse JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON in response: ' + text)

  const soul = JSON.parse(jsonMatch[0])
  if (!soul.name || !soul.personality) throw new Error('Missing fields: ' + JSON.stringify(soul))

  return soul
}

// --- Static file server + API ---
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  // API: generate soul
  if (req.method === 'POST' && req.url === '/api/generate-soul') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', async () => {
      try {
        const { bones, apiKey } = JSON.parse(body)
        if (!apiKey) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'API key required' }))
          return
        }
        const soul = await generateSoul(bones, apiKey)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(soul))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // Static files
  let filePath = req.url === '/' ? '/index.html' : req.url
  filePath = path.join(__dirname, filePath)

  const ext = path.extname(filePath)
  const mime = MIME[ext] || 'application/octet-stream'

  try {
    const data = fs.readFileSync(filePath)
    res.writeHead(200, { 'Content-Type': mime })
    res.end(data)
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
})

server.listen(PORT, () => {
  console.log(`\n  Buddy Creator running at http://localhost:${PORT}\n`)
})
