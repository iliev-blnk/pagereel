// Makes one of the gallery's agent reels: runs the reel skill unattended on a one-line brief and
// records the run in site/agent.json.
//
//   pnpm build && node scripts/agent-demo.mjs parlo "Make a 15–20 s vertical reel for parlo (…)"
//
// The run works in .demo/<name>/ with a local copy of the plugin, on Sonnet, capped at 120 turns,
// without the user's own settings, plugins or hooks. A finished reel's project, minus its renders,
// is copied to examples/agent/<name>/.
import { execFileSync, spawn } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const fail = (message) => {
  console.error(`agent-demo: ${message}`)
  process.exit(1)
}

const [name, brief] = process.argv.slice(2)
if (!name || !brief) fail('usage: node scripts/agent-demo.mjs <name> "<brief>"')

const repo = fileURLToPath(new URL('..', import.meta.url))
const demo = join(repo, '.demo', name)
const plugin = join(repo, '.demo', 'plugin')
execFileSync(process.execPath, [join(repo, 'scripts', 'local-plugin.mjs'), plugin], {
  stdio: 'ignore',
})
rmSync(demo, { recursive: true, force: true })
mkdirSync(demo, { recursive: true })

// The pagereel tools, the file tools and the shell commands the skill uses. The claude.ai
// connectors are denied outright, so they never reach the agent's tool list.
const allowed = [
  'mcp__plugin_pagereel_pagereel',
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'Skill',
  'Bash(node:*)',
  'Bash(cp:*)',
  'Bash(ls:*)',
  'Bash(mkdir:*)',
]
const denied = ['mcp__claude_ai_Gmail', 'mcp__claude_ai_Claude_Docs']
const args = [
  '-p',
  brief,
  '--plugin-dir',
  plugin,
  '--model',
  'sonnet',
  '--max-turns',
  '120',
  '--settings',
  JSON.stringify({ disableAllHooks: true }),
  '--setting-sources',
  'project,local',
  '--allowedTools',
  ...allowed,
  '--disallowedTools',
  ...denied,
  '--output-format',
  'stream-json',
  '--verbose',
]

const log = join(demo, 'run.jsonl')
console.log(`agent-demo: ${name} running in ${demo}`)
const started = Date.now()
const code = await new Promise((done) => {
  const child = spawn('claude', args, {
    cwd: demo,
    stdio: ['ignore', openSync(log, 'w'), openSync(join(demo, 'run.err'), 'w')],
    // render can take minutes: give each tool call up to ten
    env: { ...process.env, MCP_TOOL_TIMEOUT: '600000' },
  })
  child.on('error', (error) => fail(`could not start claude: ${error.message}`))
  child.on('close', done)
})

const events = readFileSync(log, 'utf8')
  .split('\n')
  .flatMap((line) => {
    try {
      return [JSON.parse(line)]
    } catch {
      return []
    }
  })
const init = events.find((e) => e.type === 'system' && e.subtype === 'init')
const result = events.findLast((e) => e.type === 'result')

const reels = readdirSync(demo)
  .filter((dir) => dir.startsWith('reel-'))
  .map((dir) => join(demo, dir))
const reel = reels.find((dir) => existsSync(join(dir, 'REVIEW.md'))) ?? reels[0]
const reviewFile = reel && join(reel, 'REVIEW.md')
const review = reviewFile && existsSync(reviewFile) ? readFileSync(reviewFile, 'utf8') : ''
const checks = [...review.matchAll(/^check: (.+)$/gm)].map((m) => m[1].trim())

// 'claude-sonnet-5-5' → 'Sonnet 5.5'
const modelName = (id = '') => {
  const [family, ...version] = id.replace(/^claude-/, '').split('-')
  if (!family) return 'unknown'
  const number = version.filter((part) => part.length < 4).join('.')
  return `${family[0].toUpperCase()}${family.slice(1)} ${number}`.trim()
}

const cause = () => {
  if (!result) return `claude exited with ${code} and no result`
  if (result.is_error || result.subtype !== 'success') return result.subtype ?? 'error'
  if (!reel) return 'no reel-<slug>/ folder'
  if (!existsSync(join(reel, 'reel.mp4'))) return 'no reel.mp4'
  return null
}
const note = cause()
const entry = {
  name,
  brief,
  model: modelName(init?.model),
  turns: result?.num_turns ?? 0,
  minutes: Math.round((result?.duration_ms ?? Date.now() - started) / 6000) / 10,
  rounds: review.match(/^## Round \d+/gm)?.length ?? 0,
  firstCheck: checks[0] ?? null,
  lastCheck: checks.at(-1) ?? null,
  ok: note === null,
}
if (note) entry.note = note

const statsFile = join(repo, 'site', 'agent.json')
const stats = existsSync(statsFile) ? JSON.parse(readFileSync(statsFile, 'utf8')) : []
const earlier = stats.findIndex((s) => s.name === name)
// A re-run keeps what went wrong the first time.
if (earlier !== -1 && !stats[earlier].ok) entry.firstRun = stats[earlier].note
if (earlier === -1) stats.push(entry)
else stats[earlier] = entry
writeFileSync(statsFile, `${JSON.stringify(stats, null, 2)}\n`)

if (entry.ok) {
  const dest = join(repo, 'examples', 'agent', name)
  const skip = new Set(['out', 'reel.mp4', 'audio.wav'])
  rmSync(dest, { recursive: true, force: true })
  cpSync(reel, dest, { recursive: true, filter: (src) => !skip.has(relative(reel, src)) })
}
console.log(JSON.stringify(entry, null, 2))
if (!entry.ok) process.exit(1)
