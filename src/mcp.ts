// The MCP server behind `pagereel mcp`: the library as tools an agent calls over stdio.
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { check } from './check/index.js'
import { findFfmpeg } from './env.js'
import { toJpeg } from './ffmpeg.js'
import { init } from './init.js'
import { VERSION } from './page/generated.js'
import { render } from './render.js'
import { siteKit } from './site-kit.js'
import { stills } from './stills.js'

type Content = CallToolResult['content']

const isUrl = (source: string) => /^https?:\/\//i.test(source)

const text = (text: string) => ({ type: 'text' as const, text })

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Runs `fn` with a temp folder of its own, removed afterwards. */
async function inTemp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'pagereel-mcp-'))
  try {
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** An image file as image content: a JPEG no more than 1568 px on its long side. */
async function image(file: string): Promise<Content[number]> {
  const ffmpeg = await findFfmpeg()
  return inTemp(async (dir) => {
    const jpeg = await toJpeg(ffmpeg, file, join(dir, 'image.jpg'))
    return {
      type: 'image',
      mimeType: 'image/jpeg',
      data: (await readFile(jpeg)).toString('base64'),
    }
  })
}

/** Runs a tool, returning anything it throws as a one-line error the agent can act on. */
function safe<A>(run: (args: A) => Promise<Content>) {
  return async (args: A): Promise<CallToolResult> => {
    try {
      return { content: await run(args) }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { isError: true, content: [text(message.split('\n')[0] ?? '')] }
    }
  }
}

const source = z
  .string()
  .describe(
    "The scene: the path to its HTML file (absolute, or relative to the server's working directory), or a URL.",
  )

/** The pagereel tools on a server not yet connected to a transport. */
export function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'pagereel', version: VERSION })

  server.registerTool(
    'site_kit',
    {
      title: 'Read a site',
      description:
        'Read a website to make a reel about it. Returns, as JSON: its title, description, h1 and h2 ' +
        'headings, paragraphs, palette (hex colours ranked by the area they paint), fonts (CSS font ' +
        'stacks ranked by the area of their text), and the paths of the files saved in outDir: ' +
        'fold.png (the first 1280×800 of the page), full.png (the page, down to 6000 px) and, when ' +
        'the page has them, its logo and og:image. The fold screenshot comes back as an image too. ' +
        "Borrow the site's real copy, colours, type and logo rather than inventing them.",
      inputSchema: {
        url: z.string().describe("The site's URL, or the path to a local HTML file."),
        outDir: z
          .string()
          .describe('Folder to save the screenshots, logo and og:image in. Created if missing.'),
      },
    },
    safe(async ({ url, outDir }) => {
      const kit = await siteKit(url, outDir)
      return [text(JSON.stringify(kit, null, 2)), await image(kit.files.fold)]
    }),
  )

  server.registerTool(
    'init',
    {
      title: 'Start a reel',
      description:
        'Start a new reel in dir, which must be empty or not exist yet. Writes a 1080×1920 scene ' +
        'pagereel can seek frame by frame (index.html, scene.js, timeline.js), audio.mjs, which ' +
        'writes the music track when run with `node audio.mjs`, SPEC.md to plan the reel in, and ' +
        'the motion and audio helpers they import. Returns the paths it wrote.',
      inputSchema: {
        dir: z.string().describe('Folder for the new reel: empty, or not there yet.'),
      },
    },
    safe(async ({ dir }) => {
      const files = await init(dir)
      return [text([`Wrote ${files.length} files in ${resolve(dir)}:`, ...files].join('\n'))]
    }),
  )

  server.registerTool(
    'stills',
    {
      title: 'Contact sheet',
      description:
        'Capture frames of a scene without rendering it, and return them tiled into one contact ' +
        'sheet to review layout, type and pacing at a glance: count frames spread evenly over ' +
        'the reel, or frames at the exact times in at. The PNGs are saved in out/stills beside the ' +
        "scene's HTML file (a temp folder for a URL) and listed in the text, which also says, for " +
        'a scene with loop: true, whether its last frame meets its first.',
      inputSchema: {
        source,
        count: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('How many frames, spread evenly over the reel. Default 16.'),
        at: z
          .array(z.number().min(0))
          .min(1)
          .optional()
          .describe('Exact times to capture, in seconds, instead of count.'),
      },
    },
    safe(async ({ source, count, at }) => {
      const outDir = isUrl(source)
        ? await mkdtemp(join(tmpdir(), 'pagereel-stills-'))
        : join(dirname(resolve(source)), 'out', 'stills')
      const res = await stills({ source, count, at, outDir })
      const lines = [`Contact sheet: ${res.contactSheet}`, ...res.files]
      if (res.loop) {
        const db = Number.isFinite(res.loop.psnr) ? `${res.loop.psnr.toFixed(1)} dB` : 'identical'
        lines.push(`Loop: ${res.loop.seamless ? 'seamless' : 'visible jump'} (${db})`)
      }
      return [await image(res.contactSheet), text(lines.join('\n'))]
    }),
  )

  server.registerTool(
    'frame',
    {
      title: 'One frame',
      description:
        'Capture one frame of a scene at t seconds and return it as an image. Use it for what a ' +
        'contact sheet is too small to show: a cut or a transition 0.1 s and 0.3 s after it ' +
        'starts, a line of small text.',
      inputSchema: { source, t: z.number().min(0).describe('Time in seconds.') },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ source, t }) =>
      inTemp(async (dir) => {
        const { files } = await stills({ source, at: [t], outDir: dir })
        return [await image(files[0] ?? '')]
      }),
    ),
  )

  server.registerTool(
    'check',
    {
      title: 'Check a reel',
      description:
        'Lint a reel before rendering it. Steps through the scene and reports what would go wrong ' +
        "on a phone: the format and length, text under Instagram's buttons and captions, text too " +
        'small, clipped, or not on screen long enough to read, low contrast, a slow hook, dead ' +
        "air, flashing, and the audio's loudness and true peak. Returns a summary line, then the " +
        'report as JSON; each finding has a rule id, a severity (error or warn), the seconds it ' +
        'spans, a message and a hint for the fix. Fix every error before rendering.',
      inputSchema: {
        source,
        audio: z
          .string()
          .optional()
          .describe('Audio file to measure instead of the track the scene declares.'),
        target: z
          .enum(['ig-reel', 'none'])
          .optional()
          .describe(
            "ig-reel (the default) adds Instagram's 9:16 format and safe-zone checks; none leaves them out.",
          ),
      },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ source, audio, target }) => {
      const report = await check({ source, audio, target })
      const summary = `${plural(report.errors, 'error')}, ${plural(report.warnings, 'warning')}`
      return [text(`${summary}\n\n${JSON.stringify(report, null, 2)}`)]
    }),
  )

  server.registerTool(
    'render',
    {
      title: 'Render a reel',
      description:
        'Render a scene to a video file: MP4, WebM or GIF, by the extension of output. Muxes in ' +
        'audio, or else the track the scene declares. Returns the path, the duration, the size in ' +
        'pixels and the file size. Check the scene first: a render takes longer than a check.',
      inputSchema: {
        source,
        output: z
          .string()
          .describe(
            'Path of the video to write, e.g. out/reel.mp4; its extension picks the format.',
          ),
        audio: z
          .string()
          .optional()
          .describe('Audio file to mux in instead of the track the scene declares.'),
      },
    },
    safe(async ({ source, output, audio }) => {
      const res = await render({ source, output: resolve(output), audio })
      const { size } = await stat(res.output)
      const seconds = (res.frames / res.fps).toFixed(2)
      const about = `${seconds} s at ${res.fps} fps, ${res.width}×${res.height}, ${size} bytes`
      return [text(`${res.output}\n${about}`)]
    }),
  )

  return server
}

/** Serves the tools over stdin and stdout until stdin closes. */
export async function startMcpServer(): Promise<void> {
  await createMcpServer().connect(new StdioServerTransport())
}
