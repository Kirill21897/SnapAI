import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: [
    'src/background.ts',
    'src/content.ts',
    'src/options.ts',
  ],
  bundle: true,
  outdir: 'dist',
  format: 'iife',
  target: 'chrome120',
  sourcemap: false,
  minify: false,
});

console.log('Build complete → dist/');
