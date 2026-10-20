import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyPackageMetadata } from '../scripts/release/verify-package-metadata.mjs';
import { assessTestResult } from '../scripts/release/assess-test-result.mjs';
import { reconnectFixtureStart } from '../integration/utils/reconnect-fixture-start.mjs';

function fixture() {
  return {
    manifest: {
      name: '@openapi-flow/langchain',
      version: '0.3.0',
      type: 'module',
      license: 'MIT',
      engines: { node: '>=24' },
      publishConfig: {
        registry: 'https://registry.npmjs.org/',
        access: 'public',
      },
      dependencies: { '@openapi-flow/core': '0.3.0' },
      peerDependencies: { zod: '^4.6.5' },
      exports: {
        '.': {
          types: './dist/public-api.d.ts',
          default: './dist/public-api.js',
        },
      },
    },
    packed: {
      name: '@openapi-flow/langchain',
      version: '0.3.0',
      filename: 'fixture.tgz',
      integrity: 'fixture-only',
      files: [
        'package.json',
        'README.md',
        'LICENSE',
        'THIRD_PARTY_NOTICES.md',
        'dist/public-api.d.ts',
        'dist/public-api.js',
      ].map((path) => ({ path })),
    },
  };
}
test('release preparation verifies package version, exports, notices and dependency boundaries', () => {
  const { manifest, packed } = fixture();
  assert.equal(
    verifyPackageMetadata(manifest, packed, '0.3.0').version,
    '0.3.0',
  );
  assert.throws(
    () => verifyPackageMetadata(manifest, packed),
    /version is required/,
  );
  assert.throws(() => verifyPackageMetadata(manifest, packed, '0.2.0'));
});
test('release preparation refuses stale dependencies, missing exports and private artifacts', () => {
  for (const mutate of [
    (x) => {
      x.manifest.dependencies.zod = '4.6.5';
    },
    (x) => {
      delete x.manifest.peerDependencies.zod;
    },
    (x) => {
      x.manifest.dependencies['@openapi-flow/core'] = '0.1.0';
    },
    (x) => {
      x.manifest.dependencies.extra = 'file:../../private';
    },
    (x) => {
      x.packed.files.pop();
    },
    (x) => {
      x.packed.files.push({ path: '.env' });
    },
    (x) => {
      x.packed.files.push({ path: 'dist/private.openapi.json' });
    },
    (x) => {
      x.packed.files = x.packed.files.filter(
        (file) => file.path !== 'THIRD_PARTY_NOTICES.md',
      );
    },
  ]) {
    const input = fixture();
    mutate(input);
    assert.throws(() =>
      verifyPackageMetadata(input.manifest, input.packed, '0.3.0'),
    );
  }
});

function testOutput(failureNames, skipped = 0) {
  return [
    'TAP version 13',
    'ok 1 - ordinary success',
    ...failureNames.map((name, index) => `not ok ${index + 2} - ${name}`),
    `# tests ${1 + failureNames.length + skipped}`,
    '# pass 1',
    `# fail ${failureNames.length}`,
    '# cancelled 0',
    `# skipped ${skipped}`,
    '# todo 0',
  ].join('\n');
}

test('release assessment preserves a named accepted failure without calling the tests passed', () => {
  const result = assessTestResult({
    exitCode: 1,
    output: testOutput(['approved limitation']),
    acceptedFailureNames: ['approved limitation'],
  });
  assert.equal(result.passed, false);
  assert.equal(result.decision, 'accepted-limitation');
  assert.equal(result.counts.fail, 1);
  assert.deepEqual(result.failureNames, ['approved limitation']);
});

test('release assessment rejects extra failures, skipped tests and missing summaries', () => {
  for (const output of [
    testOutput(['approved limitation', 'new failure']),
    testOutput(['approved limitation'], 1),
    'TAP version 13\nnot ok 1 - approved limitation',
  ]) {
    const result = assessTestResult({
      exitCode: 1,
      output,
      acceptedFailureNames: ['approved limitation'],
    });
    assert.equal(result.decision, 'blocked');
    assert.equal(result.passed, false);
  }
});

test('release assessment accepts an actual passing run without preserving an obsolete failure', () => {
  const result = assessTestResult({
    exitCode: 0,
    output: testOutput([]),
    acceptedFailureNames: ['approved limitation'],
  });
  assert.equal(result.decision, 'passed');
  assert.deepEqual(result.failureNames, []);
});

test('review probe reconnects the actual fragment entry without bypassing transport or materialization', () => {
  const workflow = {
    nodes: [
      { id: 'start', name: 'Start', type: 'n8n-nodes-base.manualTrigger' },
      { id: 'request-transport', name: 'Receive request' },
      { id: 'request', name: 'Request request' },
    ],
    connections: {},
  };
  const result = reconnectFixtureStart(workflow, {
    entry: { id: 'request-transport', name: 'Receive request' },
  });
  assert.equal(result.connections.Start.main[0][0].node, 'Receive request');
  assert.deepEqual(workflow.connections, {});
  assert.throws(() =>
    reconnectFixtureStart(workflow, {
      entry: { id: 'missing', name: 'Missing' },
    }),
  );
});
