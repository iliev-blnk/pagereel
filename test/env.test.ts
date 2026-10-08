import { afterEach, describe, expect, it } from 'vitest'
import { findChrome, findFfmpeg } from '../src/env'
import { PagereelError } from '../src/errors'

const saved = { ...process.env }
afterEach(() => {
  process.env = { ...saved }
})

describe('findChrome', () => {
  it('uses PAGEREEL_CHROME when it points to a file', () => {
    process.env.PAGEREEL_CHROME = process.execPath
    expect(findChrome()).toBe(process.execPath)
  })

  it('names the variable when PAGEREEL_CHROME is wrong', () => {
    process.env.PAGEREEL_CHROME = '/nope/chrome'
    expect(() => findChrome()).toThrow(PagereelError)
    expect(() => findChrome()).toThrow(/PAGEREEL_CHROME/)
  })
})

describe('findFfmpeg', () => {
  it('explains how to install ffmpeg when it cannot run', async () => {
    process.env.PAGEREEL_FFMPEG = '/nope/ffmpeg'
    await expect(findFfmpeg()).rejects.toThrow(PagereelError)
    await expect(findFfmpeg()).rejects.toThrow(/install ffmpeg/i)
  })

  it('returns a working ffmpeg', async () => {
    delete process.env.PAGEREEL_FFMPEG
    expect(await findFfmpeg()).toBe('ffmpeg')
  })
})
