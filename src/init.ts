import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { PagereelError } from './errors.js'
import { AUDIO_JS, MOTION_JS, SCENE_TEMPLATE, VERSION } from './page/generated.js'

/**
 * Starts a scene project in `dir`, which must be empty or not exist yet: the template from
 * templates/scene, copies of pagereel/motion and pagereel/audio that the page and audio.mjs
 * import with no bundler, and a package.json that makes its .js files ES modules.
 * Returns the absolute paths it wrote.
 */
export async function init(dir: string): Promise<string[]> {
  const root = resolve(dir)
  const entries = await readdir(root).catch((err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT') return []
    if (err.code === 'ENOTDIR') throw new PagereelError(`${dir} is a file, not a folder`)
    throw err
  })
  if (entries.length) throw new PagereelError(`${dir} is not empty`)
  await mkdir(root, { recursive: true })

  const copied = `// Copied from pagereel ${VERSION} by pagereel init.\n`
  const files: Record<string, string> = {
    ...SCENE_TEMPLATE,
    'motion.js': copied + MOTION_JS,
    'audio.js': copied + AUDIO_JS,
    'package.json': `${JSON.stringify({ type: 'module', private: true }, null, 2)}\n`,
  }
  const written: string[] = []
  for (const [name, text] of Object.entries(files)) {
    const path = join(root, name)
    // 'wx': never overwrite a file that appeared since the folder was found empty.
    await writeFile(path, text, { flag: 'wx' })
    written.push(path)
  }
  return written
}
