import { request } from 'node:http'
import { describe, expect, it } from 'vitest'
import { PagereelError } from '../src/errors'
import { resolveSource } from '../src/serve'

const rawGet = (url: string, path: string) =>
  new Promise<number>((resolve, reject) => {
    const u = new URL(url)
    const req = request({ host: u.hostname, port: u.port, path, method: 'GET' }, (res) => {
      res.resume()
      resolve(res.statusCode ?? 0)
    })
    req.on('error', reject)
    req.end()
  })

describe('resolveSource', () => {
  it('passes URLs through', async () => {
    const s = await resolveSource('https://example.com/a.html')
    expect(s.url).toBe('https://example.com/a.html')
    await s.close()
  })

  it('serves a local file with its MIME type', async () => {
    const s = await resolveSource('test/fixtures/hello.html')
    try {
      expect(s.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/hello\.html$/)
      const res = await fetch(s.url)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/html')
      expect(await res.text()).toContain('hello')
      expect((await fetch(new URL('missing.png', s.url))).status).toBe(404)
      expect(await rawGet(s.url, '/../package.json')).toBe(403)
    } finally {
      await s.close()
    }
  })

  it('answers range requests so media can be seeked', async () => {
    const s = await resolveSource('test/fixtures/hello.html')
    try {
      const res = await fetch(s.url, { headers: { range: 'bytes=0-4' } })
      expect(res.status).toBe(206)
      expect(res.headers.get('accept-ranges')).toBe('bytes')
      expect(res.headers.get('content-range')).toMatch(/^bytes 0-4\/\d+$/)
      expect(await res.text()).toBe('<!doc')
      const open = await fetch(s.url, { headers: { range: 'bytes=10-' } })
      expect(open.status).toBe(206)
      expect((await open.text()).startsWith('<!doctype'.slice(10))).toBe(true)
      const bad = await fetch(s.url, { headers: { range: 'bytes=99999-' } })
      expect(bad.status).toBe(416)
    } finally {
      await s.close()
    }
  })

  it('rejects a missing file', async () => {
    await expect(resolveSource('test/fixtures/missing.html')).rejects.toThrow(PagereelError)
    await expect(resolveSource('test/fixtures/missing.html')).rejects.toThrow(/File not found/)
  })
})
