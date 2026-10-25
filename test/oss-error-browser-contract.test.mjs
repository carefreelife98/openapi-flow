import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import process from 'node:process';
import { build } from 'esbuild';
import { OpenApiFlowError } from '@openapi-flow/core';
import { OpenApiFlowError as BrowserError } from '@openapi-flow/core/errors';

test('the public error subpath shares class identity and bundles/runs without Node APIs or polyfills', async () => {
  assert.equal(BrowserError, OpenApiFlowError);
  const result = await build({
    stdin: {
      contents: `import { openApiFlowDiagnosticSchema } from '@openapi-flow/core/errors';
        globalThis.readDiagnostic = value => openApiFlowDiagnosticSchema.parse(value);`,
      resolveDir: process.cwd(),
      loader: 'js',
    },
    bundle: true,
    platform: 'browser',
    format: 'iife',
    write: false,
    metafile: true,
  });
  assert.ok(
    Object.values(result.metafile.outputs).every(
      (output) => output.imports.length === 0,
    ),
  );
  assert.equal(
    Object.keys(result.metafile.inputs).some((path) =>
      path.includes('openapi/common/validate-spec'),
    ),
    false,
  );
  const sandbox = {};
  vm.runInNewContext(result.outputFiles[0].text, sandbox);
  const diagnostic = {
    code: 'API_BINDING_CALL_COVERAGE_MISMATCH',
    owner: 'core',
    operation: 'validateApiBindingAssignments',
    stage: 'contract-validation',
    expectedCount: 2,
    actualCount: 1,
    distinctCount: 1,
  };
  assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox.readDiagnostic(diagnostic))),
    diagnostic,
  );
  assert.throws(() =>
    sandbox.readDiagnostic({ ...diagnostic, cause: 'private' }),
  );
});
