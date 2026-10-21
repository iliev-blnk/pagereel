import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { check } from '../src/check'
import { init } from '../src/init'

const FILES = [
  'index.html',
  'scene.js',
  'timeline.js',
  'audio.mjs',
  'SPEC.md',
  'motion.js',
  'audio.js',
  'package.json',
]

describe('init', () => {
  // A folder that does not exist yet: init makes it.
  const dir = join(mkdtempSync(join(tmpdir(), 'pagereel-init-')), 'reel')
  let written: string[] = []
  let audio: Promise<void> | undefined
  /** Runs the scaffold's audio.mjs once, from another folder: audio.wav still lands beside it. */
  const makeAudio = () => {
    audio ??= Promise.resolve().then(() => {
      execFileSync(process.execPath, [join(dir, 'audio.mjs')], { cwd: tmpdir(), stdio: 'pipe' })
    })
    return audio
  }

  beforeAll(async () => {
    written = await init(dir)
  })

  it('writes the scene template, the motion and audio modules and a package.json', () => {
    expect(written.map((f) => basename(f)).sort()).toEqual([...FILES].sort())
    expect(written).toEqual(written.map((f) => join(dir, basename(f))))
    for (const f of written) expect(existsSync(f)).toBe(true)
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))).toEqual({
      type: 'module',
      private: true,
    })
  })

  it('marks the copied modules with the pagereel version', () => {
    const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
    for (const name of ['motion.js', 'audio.js']) {
      const text = readFileSync(join(dir, name), 'utf8')
      expect(text.startsWith(`// Copied from pagereel ${version} by pagereel init.\n`)).toBe(true)
    }
  })

  it('refuses a folder that is not empty', async () => {
    await expect(init(dir)).rejects.toThrow(`${dir} is not empty`)
  })

  it('refuses a path that is a file', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'pagereel-init-')), 'notes.txt')
    writeFileSync(file, 'hi')
    await expect(init(file)).rejects.toThrow(`${file} is a file, not a folder`)
  })

  it('makes audio.wav beside audio.mjs', async () => {
    await makeAudio()
    expect(existsSync(join(dir, 'audio.wav'))).toBe(true)
  })

  it('passes check as it is, with its audio', async () => {
    await makeAudio()
    const r = await check({ source: join(dir, 'index.html') })
    expect(r).toMatchObject({ width: 1080, height: 1920, duration: 16, fps: 30, errors: 0 })
    expect(r.findings.filter((f) => f.id === 'hook' || f.id === 'flash')).toEqual([])
    // The starting point an agent edits from: nothing for it to fix before it begins.
    expect(r.findings.map((f) => `${f.id}: ${f.message}`)).toEqual([])
  })
})
