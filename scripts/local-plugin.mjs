// Copies plugin/ to <outDir> with its MCP server pointed at this checkout's dist/cli.js instead of
// the published package, so the plugin can be tried before a release:
//
//   pnpm build && node scripts/local-plugin.mjs .demo/plugin
//   claude --plugin-dir .demo/plugin
import { cpSync, existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const fail = (message) => {
  console.error(`local-plugin: ${message}`)
  process.exit(1)
}

const [outDir] = process.argv.slice(2)
if (!outDir) fail('usage: node scripts/local-plugin.mjs <outDir>')

const repo = fileURLToPath(new URL('..', import.meta.url))
const cli = join(repo, 'dist', 'cli.js')
if (!existsSync(cli)) fail('dist/cli.js is missing; run pnpm build first')

const out = resolve(outDir)
// Replace an earlier copy whole, so files removed from plugin/ go too, but never empty a folder
// that holds anything else.
if (existsSync(out) && readdirSync(out).length) {
  if (!existsSync(join(out, '.claude-plugin', 'plugin.json'))) fail(`${outDir} is not empty`)
  rmSync(out, { recursive: true })
}
cpSync(join(repo, 'plugin'), out, { recursive: true })
const servers = { pagereel: { command: process.execPath, args: [cli, 'mcp'] } }
writeFileSync(join(out, '.mcp.json'), `${JSON.stringify(servers, null, 2)}\n`)
console.log(out)
