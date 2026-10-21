import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findFfmpeg } from '../src/env'
import { toJpeg } from '../src/ffmpeg'
import { createMcpServer } from '../src/mcp'

const dir = mkdtempSync(join(tmpdir(), 'pagereel-test-mcp-'))
// The tools' own temp folders go in here too, out of the shared one render.test.ts watches.
const savedTmp = process.env.TMPDIR
process.env.TMPDIR = dir
afterAll(() => {
  if (savedTmp === undefined) delete process.env.TMPDIR
  else process.env.TMPDIR = savedTmp
})

/** An image's width and height, from ffprobe. */
function size(file: string) {
  const args = ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]
  return execFileSync('ffprobe', args).toString().trim().split(',').map(Number)
}

/** A solid PNG of the given size, `WxH`. */
function png(name: string, wxh: string) {
  const file = join(dir, name)
  execFileSync(process.env.PAGEREEL_FFMPEG ?? 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `color=c=blue:s=${wxh}`,
    '-frames:v',
    '1',
    file,
  ])
  return file
}

describe('toJpeg', () => {
  it('shrinks an image to 1568 px on its long side', async () => {
    const out = join(dir, 'tall.jpg')
    expect(await toJpeg(await findFfmpeg(), png('tall.png', '1080x1920'), out)).toBe(out)
    expect(size(out)).toEqual([882, 1568])
  })

  it('leaves a smaller image at its size', async () => {
    const out = await toJpeg(
      await findFfmpeg(),
      png('small.png', '320x180'),
      join(dir, 'small.jpg'),
    )
    expect(size(out)).toEqual([320, 180])
  })
})

interface Item {
  type: string
  text?: string
  data?: string
  mimeType?: string
}

describe('pagereel mcp', () => {
  let client: Client

  beforeAll(async () => {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    client = new Client({ name: 'test', version: '0' })
    await Promise.all([createMcpServer().connect(serverSide), client.connect(clientSide)])
  })

  afterAll(() => client.close())

  async function call(name: string, args: Record<string, unknown>) {
    const res = await client.callTool({ name, arguments: args })
    const content = res.content as Item[]
    return {
      isError: res.isError,
      text: content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n'),
      images: content.filter((c) => c.type === 'image'),
    }
  }

  /** Writes an image item to a file, to measure it. */
  function save(item: Item | undefined, name: string) {
    const file = join(dir, name)
    writeFileSync(file, Buffer.from(item?.data ?? '', 'base64'))
    return file
  }

  it('lists its tools', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([
      'check',
      'frame',
      'init',
      'render',
      'site_kit',
      'stills',
    ])
  })

  it('check returns a summary line, then the report as JSON', async () => {
    const res = await call('check', { source: 'test/fixtures/check/good.html' })
    expect(res.isError).toBeFalsy()
    expect(res.text.split('\n')[0]).toMatch(/^0 errors, \d+ warnings?$/)
    expect(res.text).toContain('"errors": 0')
  })

  it('frame returns that frame as a JPEG, and leaves nothing beside the scene', async () => {
    const res = await call('frame', { source: 'test/fixtures/check/good.html', t: 1 })
    expect(res.isError).toBeFalsy()
    expect(res.images).toHaveLength(1)
    expect(res.images[0]?.mimeType).toBe('image/jpeg')
    expect(size(save(res.images[0], 'frame.jpg'))).toEqual([882, 1568])
    expect(existsSync('test/fixtures/check/out')).toBe(false)
  })

  it('stills returns the contact sheet as a JPEG and lists the PNGs, saved beside the scene', async () => {
    const scene = join(dir, 'scene')
    mkdirSync(scene)
    copyFileSync('test/fixtures/check/good.html', join(scene, 'index.html'))
    const res = await call('stills', { source: join(scene, 'index.html'), count: 4 })
    expect(res.isError).toBeFalsy()
    expect(res.images).toHaveLength(1)
    expect(res.images[0]?.mimeType).toBe('image/jpeg')
    expect(Math.max(...size(save(res.images[0], 'sheet.jpg')))).toBe(1568)
    const first = join(scene, 'out', 'stills', '000_0.00s.png')
    const last = join(scene, 'out', 'stills', '003_3.00s.png')
    expect(res.text).toContain(first)
    expect(res.text).toContain(last)
    expect(existsSync(last)).toBe(true)
  })

  it("stills clears an earlier call's frames, but nothing else, from out/stills", async () => {
    const scene = join(dir, 'rerun')
    const out = join(scene, 'out', 'stills')
    mkdirSync(out, { recursive: true })
    copyFileSync('test/fixtures/check/good.html', join(scene, 'index.html'))
    writeFileSync(join(out, 'notes.txt'), 'mine')
    await call('stills', { source: join(scene, 'index.html'), at: [1] })
    await call('stills', { source: join(scene, 'index.html'), at: [2] })
    expect(readdirSync(out).sort()).toEqual(['000_2.00s.png', 'contact.png', 'notes.txt'])
  })

  it('init lists the files it wrote', async () => {
    const res = await call('init', { dir: join(dir, 'reel') })
    expect(res.isError).toBeFalsy()
    expect(res.text).toContain(join(dir, 'reel', 'index.html'))
    expect(res.text).toContain(join(dir, 'reel', 'SPEC.md'))
  })

  it('site_kit returns the summary as JSON and the fold as a JPEG', async () => {
    mkdirSync(join(dir, 'site'))
    copyFileSync('test/fixtures/site/index.html', join(dir, 'site', 'index.html'))
    const res = await call('site_kit', {
      url: join(dir, 'site', 'index.html'),
      outDir: join(dir, 'kit'),
    })
    expect(res.isError).toBeFalsy()
    expect(JSON.parse(res.text).title).toBe('Fixture Co')
    expect(res.images[0]?.mimeType).toBe('image/jpeg')
    expect(size(save(res.images[0], 'fold.jpg'))).toEqual([1280, 800])
  })

  it('render reports the output, its duration, size and bytes', async () => {
    const output = join(dir, 'scene.mp4')
    const res = await call('render', { source: 'test/fixtures/scene.html', output })
    expect(res.isError).toBeFalsy()
    expect(res.text).toContain(output)
    expect(res.text).toContain('3.00 s')
    expect(res.text).toContain('480×120')
    expect(res.text).toContain(`${statSync(output).size} bytes`)
  })

  it('returns a missing file as a one-line error and keeps serving', async () => {
    const res = await call('check', { source: 'missing.html' })
    expect(res.isError).toBe(true)
    expect(res.text).toBe('File not found: missing.html')
    const { tools } = await client.listTools()
    expect(tools).toHaveLength(6)
  })

  it('cuts a many-line error to its first line', async () => {
    // Playwright's own error, with its call log below the first line.
    const res = await call('site_kit', { url: 'http://127.0.0.1:9/', outDir: join(dir, 'none') })
    expect(res.isError).toBe(true)
    expect(res.text).toMatch(/^page\.goto: net::ERR_/)
    expect(res.text).not.toContain('\n')
  })
})
