import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const license = readFileSync(
  new URL('../packages/n8n/LICENSE', import.meta.url),
  'utf8',
);
await build({
  stdin: {
    contents:
      "import { joinApiItems } from './join-api-items.ts'; OpenApiFlowItemJoinRuntime = { joinApiItems };",
    resolveDir: fileURLToPath(
      new URL(
        '../packages/n8n/src/nodes/native/item-join/runtime/',
        import.meta.url,
      ),
    ),
    loader: 'ts',
  },
  outfile: fileURLToPath(
    new URL(
      '../packages/n8n/dist/nodes/native/item-join/runtime/item-join-runtime.bundle.js',
      import.meta.url,
    ),
  ),
  bundle: true,
  format: 'iife',
  banner: {
    js: `/*! ${license.replaceAll('*/', '* /')} */\nvar OpenApiFlowItemJoinRuntime;`,
  },
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'inline',
});
