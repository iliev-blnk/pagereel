import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
    motion: 'src/motion.ts',
    audio: 'src/audio.ts',
  },
  format: 'esm',
  dts: { entry: { index: 'src/index.ts', motion: 'src/motion.ts', audio: 'src/audio.ts' } },
  clean: true,
  target: 'node20',
  external: ['playwright-core'],
})
