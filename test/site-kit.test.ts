import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { type SiteKit, siteKit } from '../src/site-kit'

const dir = mkdtempSync(join(tmpdir(), 'pagereel-test-site-'))

/** A PNG's width and height, read from its IHDR chunk. */
function pngSize(file: string) {
  const png = readFileSync(file)
  return [png.readUInt32BE(16), png.readUInt32BE(20)]
}

describe('siteKit', () => {
  let kit: SiteKit

  beforeAll(async () => {
    // The page's og:image is generated rather than committed: a 1200×630 red PNG beside a copy.
    copyFileSync('test/fixtures/site/index.html', join(dir, 'index.html'))
    execFileSync(process.env.PAGEREEL_FFMPEG ?? 'ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=red:s=1200x630',
      '-frames:v',
      '1',
      join(dir, 'og.png'),
    ])
    kit = await siteKit(join(dir, 'index.html'), join(dir, 'kit'))
  })

  it('reads the title and the description', () => {
    expect(kit.title).toBe('Fixture Co')
    expect(kit.description).toBe('Fixture Co turns any web page into a short vertical film.')
  })

  it('lists the h1, then the h2s', () => {
    expect(kit.headings).toEqual(['Ship reels fast', 'Any page in', 'One reel out'])
  })

  it('keeps the paragraphs in order', () => {
    expect(kit.paragraphs).toHaveLength(3)
    expect(kit.paragraphs[0]).toMatch(/^Point it at a URL/)
  })

  it('ranks colours by the area they paint', () => {
    expect(kit.palette[0]?.hex).toBe('#0a7cff')
    expect(kit.palette[0]?.share).toBeGreaterThan(0.5)
    expect(kit.palette.map((c) => c.hex)).toContain('#ffffff')
  })

  it('ranks fonts by the area of their text', () => {
    expect(kit.fonts[0]?.family).toContain('Georgia')
  })

  it('saves the header logo as an SVG that renders on its own, in its own colour', () => {
    expect(kit.files.logo).toMatch(/logo\.svg$/)
    const svg = readFileSync(kit.files.logo ?? '', 'utf8')
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toMatch(/fill: rgb\(255, 255, 255\)/)
  })

  it('saves the og:image', () => {
    expect(kit.files.og).toMatch(/og\.png$/)
    expect(pngSize(kit.files.og ?? '')).toEqual([1200, 630])
  })

  it('screenshots the fold at 1280×800', () => {
    expect(pngSize(kit.files.fold)).toEqual([1280, 800])
    expect(pngSize(kit.files.full)[0]).toBe(1280)
  })
})

describe('siteKit on a long page', () => {
  let kit: SiteKit

  beforeAll(async () => {
    const sections = Array.from(
      { length: 15 },
      (_, i) =>
        `<h2>Section ${i + 1}</h2><p>${i + 1}. ${'Words that go on. '.repeat(i ? 2 : 30)}</p>`,
    ).join('')
    writeFileSync(
      join(dir, 'long.html'),
      `<!doctype html><title>Long</title><body style="margin:0;min-height:9000px">${sections}`,
    )
    kit = await siteKit(join(dir, 'long.html'), join(dir, 'long'))
  })

  it('stops the full-page screenshot at 6000 px', () => {
    expect(pngSize(kit.files.full)).toEqual([1280, 6000])
  })

  it('keeps at most 10 headings and 12 paragraphs of up to 200 characters', () => {
    expect(kit.headings).toHaveLength(10)
    expect(kit.paragraphs).toHaveLength(12)
    expect(kit.paragraphs[0]?.length).toBeLessThanOrEqual(200)
    expect(kit.paragraphs[0]).toMatch(/…$/)
  })

  it('has no logo or og:image to save when the page links none', () => {
    expect(kit.files.logo).toBeUndefined()
    expect(kit.files.og).toBeUndefined()
  })
})

describe('siteKit under a canvas', () => {
  it('counts the background a transparent canvas lets show through', async () => {
    writeFileSync(
      join(dir, 'canvas.html'),
      `<!doctype html><body style="margin:0;background:#123456;color:#fff">
      <canvas style="position:absolute;top:0;left:0;width:100%;height:100%"></canvas>
      <p style="position:relative">Text over the canvas.</p>`,
    )
    const kit = await siteKit(join(dir, 'canvas.html'), join(dir, 'canvas'))
    expect(kit.palette[0]?.hex).toBe('#123456')
  })
})
