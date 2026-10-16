import assert from 'node:assert/strict';

export function verifyPackageMetadata(manifest, packed) {
  assert.ok(
    ['core', 'langchain', 'n8n'].some(
      (name) => manifest.name === `@openapi-flow/${name}`,
    ),
  );
  assert.equal(manifest.version, '0.2.0');
  assert.equal(manifest.type, 'module');
  assert.equal(manifest.license, 'MIT');
  assert.equal(manifest.publishConfig?.registry, 'https://registry.npmjs.org/');
  assert.equal(manifest.publishConfig?.access, 'public');
  assert.equal(manifest.engines?.node, '>=24');
  assert.equal(packed.name, manifest.name);
  assert.equal(packed.version, manifest.version);
  assert.ok(packed.integrity && packed.filename);
  const paths = new Set(packed.files.map((file) => file.path));
  for (const required of [
    'package.json',
    'README.md',
    'LICENSE',
    'THIRD_PARTY_NOTICES.md',
  ])
    assert.ok(paths.has(required), required);
  for (const entry of Object.values(manifest.exports)) {
    for (const target of Object.values(entry)) {
      assert.ok(target.startsWith('./dist/'), target);
      assert.ok(paths.has(target.slice(2)), `Missing exported file ${target}`);
    }
  }
  for (const name of paths) {
    assert.ok(
      name.startsWith('dist/') ||
        [
          'package.json',
          'README.md',
          'LICENSE',
          'THIRD_PARTY_NOTICES.md',
        ].includes(name),
      `Unintended package file ${name}`,
    );
    assert.ok(
      !/(^|\/)\.env|\.local-artifacts|artifacts\/|\.oas\.json|\.openapi\.json/.test(
        name,
      ),
      `Private artifact ${name}`,
    );
  }
  for (const [name, version] of Object.entries({
    ...manifest.dependencies,
    ...manifest.peerDependencies,
  })) {
    assert.ok(
      !/^(file:|workspace:|link:)/.test(version),
      `Local dependency ${name}`,
    );
    if (name === '@openapi-flow/core') assert.equal(version, '0.2.0');
  }
  if (manifest.name !== '@openapi-flow/core')
    assert.equal(manifest.dependencies?.['@openapi-flow/core'], '0.2.0');
  if (manifest.name === '@openapi-flow/n8n') {
    for (const file of [
      'dist/nodes/request/runtime/request-runtime.bundle.js',
      'dist/nodes/request/response/response-runtime.bundle.js',
      'dist/nodes/native/item-join/runtime/item-join-runtime.bundle.js',
    ])
      assert.ok(paths.has(file), file);
  }
  return {
    name: manifest.name,
    version: manifest.version,
    files: paths.size,
    integrity: packed.integrity,
    filename: packed.filename,
  };
}
