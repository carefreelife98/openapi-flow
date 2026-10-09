import { Ajv2020 } from 'ajv/dist/2020.js';
import { _ } from 'ajv/dist/compile/codegen/index.js';
import addFormats from 'ajv-formats';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CompileStandaloneValidatorInput } from '../../../types/schema-compilation.js';
import { bundledLicenseBanner } from '../../../utils/bundled-license-banner.js';

/** Compile on the host; generated n8n nodes receive validators, not eval. */
export function compileStandaloneValidator({
  schema,
  globalName,
}: CompileStandaloneValidatorInput): string {
  const ajv = new Ajv2020({
    strict: false,
    allErrors: true,
    discriminator: true,
    code: {
      source: true,
      // Own the standalone format expression with this compiler's Code class.
      formats: _`require("ajv-formats/dist/formats").fullFormats`,
    },
  });
  addFormats.default(ajv);
  const compiled = standaloneCode.default(ajv, ajv.compile(schema));
  const built = buildSync({
    stdin: { contents: compiled, resolveDir: import.meta.dirname },
    bundle: true,
    platform: 'browser',
    format: 'iife',
    globalName,
    target: 'es2022',
    minify: true,
    write: false,
    legalComments: 'inline',
    metafile: true,
    // Standard keywords stay intact. JSON equality must not inspect constructors.
    alias: {
      'ajv/dist/runtime/equal': fileURLToPath(
        new URL('../../../utils/json-values-equal.cjs', import.meta.url),
      ),
    },
  });
  const require = createRequire(import.meta.url);
  return (
    bundledLicenseBanner(built.metafile, [
      dirname(require.resolve('ajv/package.json')),
    ]) + built.outputFiles[0].text
  );
}
