import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyPackageMetadata } from '../scripts/release/verify-package-metadata.mjs';
import { reconnectFixtureStart } from '../integration/utils/reconnect-fixture-start.mjs';

function fixture() {
  return {
    manifest: {
      name: '@openapi-flow/langchain',
      version: '0.2.0',
      type: 'module',
      license: 'MIT',
      engines: { node: '>=24' },
      publishConfig: {
        registry: 'https://registry.npmjs.org/',
        access: 'public',
      },
      dependencies: { '@openapi-flow/core': '0.2.0' },
      exports: {
        '.': {
          types: './dist/public-api.d.ts',
          default: './dist/public-api.js',
        },
      },
    },
    packed: {
      name: '@openapi-flow/langchain',
      version: '0.2.0',
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
  assert.equal(verifyPackageMetadata(manifest, packed).version, '0.2.0');
});
test('release preparation refuses stale dependencies, missing exports and private artifacts', () => {
  for (const mutate of [
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
    assert.throws(() => verifyPackageMetadata(input.manifest, input.packed));
  }
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
