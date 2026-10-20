import { build } from 'esbuild';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

const license = readFileSync(
  new URL('../packages/n8n/LICENSE', import.meta.url),
  'utf8',
);
await build({
  stdin: {
    contents:
      "import { materializeNativeRuntimeParameters } from '@openapi-flow/core/runtime'; OpenApiFlowNativeInputRuntime = { materializeNativeRuntimeParameters };",
    resolveDir: fileURLToPath(new URL('../packages/n8n/', import.meta.url)),
    loader: 'ts',
  },
  outfile: fileURLToPath(
    new URL(
      '../packages/n8n/dist/nodes/native/inputs/native-input-runtime.bundle.js',
      import.meta.url,
    ),
  ),
  bundle: true,
  format: 'iife',
  banner: {
    js: `/*! ${license.replaceAll('*/', '* /')} */\nvar OpenApiFlowNativeInputRuntime;`,
  },
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'inline',
});
