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
    const path = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/')
    const target = resolve(base, `.${path}`)
    if (target !== base && !target.startsWith(base + sep)) return res.writeHead(403).end()
    if (path.split('/').includes('..')) return res.writeHead(403).end()
    try {
      const body = await readFile(target)
      res.writeHead(200, {
        'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      })
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
