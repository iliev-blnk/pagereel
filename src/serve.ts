import { existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { basename, dirname, extname, relative, resolve, sep } from 'node:path'
import { PagereelError } from './errors.js'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
}

export interface Source {
  url: string
  close(): Promise<void>
}

/** A URL passes through. A local file is served from its folder (or `root`) on 127.0.0.1. */
export async function resolveSource(source: string, root?: string): Promise<Source> {
  if (/^https?:\/\//i.test(source)) return { url: source, close: async () => {} }

  const file = resolve(source)
  if (!existsSync(file) || !statSync(file).isFile()) {
    throw new PagereelError(`File not found: ${source}`)
  }
  const base = resolve(root ?? dirname(file))
  const rel = relative(base, file)
  if (rel.startsWith('..')) throw new PagereelError(`${source} is outside --root ${base}`)

  const server = createServer(async (req, res) => {
    let path: string
    try {
      path = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/')
    } catch {
      return res.writeHead(400).end()
    }
    const target = resolve(base, `.${path}`)
    if (target !== base && !target.startsWith(base + sep)) return res.writeHead(403).end()
    if (path.split('/').includes('..')) return res.writeHead(403).end()
    try {
      const body = await readFile(target)
      const type = MIME[extname(target).toLowerCase()] ?? 'application/octet-stream'
      const headers = {
        'content-type': type,
        'cache-control': 'no-store',
        'accept-ranges': 'bytes',
      }
      // Range requests let ffmpeg and <video>/<audio> seek inside media files.
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
      if (range) {
        const size = body.length
        let start = range[1] ? Number(range[1]) : size - Number(range[2])
        let end = range[1] && range[2] ? Number(range[2]) : size - 1
        if (!range[1]) start = Math.max(0, start)
        end = Math.min(end, size - 1)
        if (start >= size || start > end) {
          res.writeHead(416, { 'content-range': `bytes */${size}` }).end()
          return
        }
        res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${size}` })
        res.end(body.subarray(start, end + 1))
        return
      }
      res.writeHead(200, headers)
      res.end(body)
    } catch {
      res.writeHead(404).end()
    }
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  const { port } = server.address() as AddressInfo
  const urlPath = rel.split(sep).map(encodeURIComponent).join('/') || basename(file)
  return {
    url: `http://127.0.0.1:${port}/${urlPath}`,
    close: () =>
      new Promise<void>((ok) => {
        server.close(() => ok())
        server.closeAllConnections()
      }),
  }
}
