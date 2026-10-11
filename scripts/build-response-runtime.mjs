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
      "import { decodeHttpResponse } from './decode-http-response.ts'; OpenApiFlowResponseRuntime = { decodeHttpResponse };",
    resolveDir: fileURLToPath(
      new URL('../packages/n8n/src/nodes/request/response/', import.meta.url),
    ),
    loader: 'ts',
  },
  outfile: fileURLToPath(
    new URL(
      '../packages/n8n/dist/nodes/request/response/response-runtime.bundle.js',
      import.meta.url,
    ),
  ),
  bundle: true,
  format: 'iife',
  banner: {
    js: `/*! ${license.replaceAll('*/', '* /')} */\nvar OpenApiFlowResponseRuntime;`,
  },
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'inline',
});
