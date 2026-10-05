import { Ajv } from 'ajv';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { createApiRequestSchema } from '@openapi-flow/core';
import type { RequestMaterializationConfig } from '../../../types/request-materialization.js';
import { bundledLicenseBanner } from '../../../utils/bundled-license-banner.js';

/** Compile OAS schemas on the host; n8n receives no schema compiler/eval. */
export function compileRequestValidator(
  config: RequestMaterializationConfig,
): string {
  const schema = createApiRequestSchema({
    operation: config.contract,
    requestMediaType: config.arguments.requestMediaType,
  });
  const AjvClass = config.contract.openapiVersion.startsWith('3.0.')
    ? Ajv
    : Ajv2020;
  const ajv = new AjvClass({
    strict: false,
    allErrors: true,
    discriminator: true,
    code: { source: true },
  });
  addFormats.default(ajv);
  const validate = ajv.compile(schema);
  const compiled = standaloneCode.default(ajv, validate);
  const built = buildSync({
    stdin: { contents: compiled, resolveDir: import.meta.dirname },
    bundle: true,
    platform: 'browser',
    format: 'iife',
    globalName: 'OpenApiFlowRequestValidator',
    target: 'es2022',
    minify: true,
    write: false,
    legalComments: 'inline',
    metafile: true,
  });
  const require = createRequire(import.meta.url);
  return (
    bundledLicenseBanner(built.metafile, [
      dirname(require.resolve('ajv/package.json')),
    ]) + built.outputFiles[0].text
  );
}
