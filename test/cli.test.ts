import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { formatTime } from '../src/page/format'

const dir = mkdtempSync(join(tmpdir(), 'pagereel-test-cli-'))
const cli = (...args: string[]) =>
  spawnSync(process.execPath, ['dist/cli.js', ...args], { encoding: 'utf8', env: process.env })

beforeAll(() => {
  execFileSync('pnpm', ['-s', 'build'], { stdio: 'ignore' })
}, 120_000)

describe('cli', () => {
  it('prints its version', () => {
    const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
    const r = cli('--version')
    expect(r.status).toBe(0)
    expect(r.stdout.trim()).toBe(version)
  })

  it('asks for a source', () => {
    const r = cli('render')
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('pagereel render <url|file>')
  })

  it('renders a file', () => {
    const output = join(dir, 'out.mp4')
    const r = cli(
      'render',
      'test/fixtures/css.html',
      '--duration',
      '0.5',
      '--size',
      '160x90',
      '-o',
      output,
    )
    expect(r.status, r.stderr).toBe(0)
    expect(existsSync(output)).toBe(true)
    expect(r.stdout).toContain(output)
  })

  it('prints one line, no stack trace, for expected errors', () => {
    const r = cli(
      'render',
      'test/fixtures/css.html',
      '--duration',
      '1',
      '--size',
      '161x90',
      '-o',
      join(dir, 'odd.mp4'),
    )
    expect(r.status).toBe(1)
    const lines = r.stderr.trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^pagereel: .*even/)
  })

  it('rejects a flag that is not a number', () => {
    const r = cli('render', 'test/fixtures/css.html', '--fps', 'fast')
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('--fps')
  })

  it('writes stills and a contact sheet', () => {
    const out = join(dir, 'stills')
    const r = cli(
      'stills',
      'test/fixtures/css.html',
      '--duration',
      '1',
      '--count',
      '2',
      '--size',
      '160x90',
      '-o',
      out,
    )
    expect(r.status, r.stderr).toBe(0)
    expect(existsSync(join(out, 'contact.png'))).toBe(true)
  })
  it('fails a reel with check errors and names the rule', () => {
    const r = cli('check', 'test/fixtures/check/safe-zone.html')
    expect(r.status, r.stderr).toBe(1)
    expect(r.stdout).toContain('safe-zone')
  })

  it('prints the check report as JSON', () => {
    const r = cli('check', 'test/fixtures/check/good.html', '--json')
    expect(r.status, r.stderr).toBe(0)
    expect(JSON.parse(r.stdout)).toMatchObject({ errors: 0 })
  })
})

describe('preview player', () => {
  it('formats time with the frame number', () => {
    expect(formatTime(1.5, 30)).toBe('1.50s  f45')
    expect(formatTime(0, 60)).toBe('0.00s  f0')
  })
})
