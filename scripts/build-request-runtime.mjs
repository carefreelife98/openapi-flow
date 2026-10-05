import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const license = readFileSync(
  new URL('../packages/n8n/LICENSE', import.meta.url),
  'utf8',
);

// Bundle the actual library validators/serializers, not a handwritten subset.
// Generated code runs offline in n8n without external module permissions.
await build({
  stdin: {
    contents:
      "import { materializeHttpRequest } from './materialize-http-request.ts'; OpenApiFlowRequestRuntime = { materializeHttpRequest };",
    resolveDir: fileURLToPath(
      new URL('../packages/n8n/src/nodes/request/runtime/', import.meta.url),
    ),
    loader: 'ts',
  },
  outfile: fileURLToPath(
    new URL(
      '../packages/n8n/dist/nodes/request/runtime/request-runtime.bundle.js',
      import.meta.url,
    ),
  ),
  bundle: true,
  format: 'iife',
  banner: {
    js: `/*! ${license.replaceAll('*/', '* /')} */\nvar OpenApiFlowRequestRuntime;`,
  },
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'inline',
});
