import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { PagereelError } from './errors.js'

function systemChromes(): string[] {
  const pf = process.env.PROGRAMFILES ?? 'C:\\Program Files'
  const pf86 = process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)'
  const local = process.env.LOCALAPPDATA ?? ''
  return [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/snap/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ]
}

/** Path to a Chrome or Chromium binary. */
export function findChrome(): string {
  const env = process.env.PAGEREEL_CHROME
  if (env) {
    if (existsSync(env)) return env
    throw new PagereelError(`PAGEREEL_CHROME points to ${env}, which does not exist.`)
  }
  try {
    const bundled = chromium.executablePath()
    if (bundled && existsSync(bundled)) return bundled
  } catch {
    // Playwright has no browser downloaded.
  }
  const found = systemChromes().find((p) => existsSync(p))
  if (found) return found
  throw new PagereelError(
    'No Chrome or Chromium found. Install Chrome, run `npx playwright install chromium`, or set PAGEREEL_CHROME.',
  )
}

const checked = new Map<string, Promise<string>>()

/** Command for a working ffmpeg. */
export function findFfmpeg(): Promise<string> {
  const cmd = process.env.PAGEREEL_FFMPEG || 'ffmpeg'
  let result = checked.get(cmd)
  if (!result) {
    result = new Promise((resolve, reject) => {
      execFile(cmd, ['-version'], (err) => {
        if (!err) return resolve(cmd)
        checked.delete(cmd)
        reject(
          new PagereelError(
            `Cannot run ${cmd}. Install ffmpeg (brew install ffmpeg, apt install ffmpeg, or ffmpeg.org) or set PAGEREEL_FFMPEG.`,
          ),
        )
      })
    })
    checked.set(cmd, result)
  }
  return result
}
