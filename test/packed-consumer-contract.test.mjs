import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { test } from 'node:test';
import ts from 'typescript';

test('n8n adapter installs the public declaration dependencies of its pinned SDK', async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL('../packages/n8n/package.json', import.meta.url),
      'utf8',
    ),
  );
  const declarationDependencies = {
    '@n8n/config': '2.38.0',
    '@types/express': '5.0.1',
    '@types/json-schema': '7.0.15',
    '@types/luxon': '3.2.0',
    '@types/ssh2': '1.15.0',
    nock: '14.0.14',
  };
  assert.equal(manifest.dependencies['@n8n/workflow-sdk'], '0.33.1');
  for (const [name, version] of Object.entries(declarationDependencies)) {
    assert.equal(manifest.dependencies[name], version, name);
    assert.equal(manifest.devDependencies?.[name], undefined, name);
  }
  for (const name of ['preinstall', 'install', 'postinstall']) {
    assert.equal(manifest.scripts[name], undefined, name);
  }
  for (const adapter of ['core', 'langchain']) {
    const other = JSON.parse(
      await readFile(
        new URL(`../packages/${adapter}/package.json`, import.meta.url),
        'utf8',
      ),
    );
    for (const name of Object.keys(declarationDependencies)) {
      assert.equal(other.dependencies[name], undefined, `${adapter}: ${name}`);
    }
  }
});

test('credential binding emits its named return contract, not a local-variable-dependent declaration', async () => {
  const text = await readFile(
    new URL(
      '../packages/n8n/dist/legacy/workflow/request/credential-binding.d.ts',
      import.meta.url,
    ),
    'utf8',
  );
  const file = ts.createSourceFile(
    'credential-binding.d.ts',
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  const declaration = file.statements.find(
    (entry) =>
      ts.isFunctionDeclaration(entry) &&
      entry.name?.text === 'resolveCredentialBinding',
  );
  assert.ok(declaration?.type && ts.isUnionTypeNode(declaration.type));
  assert.equal(declaration.type.types.length, 2);
  assert.ok(
    declaration.type.types.some(
      (entry) =>
        ts.isTypeReferenceNode(entry) &&
        entry.typeName.getText(file) === 'ResolvedAuthentication',
    ),
  );
  assert.ok(
    declaration.type.types.some(
      (entry) => entry.kind === ts.SyntaxKind.UndefinedKeyword,
    ),
  );
});

test('packed consumer requires explicit OAS and input before packing or creating an installation', () => {
  const env = { ...process.env };
  delete env.OPENAPI_FLOW_PACKED_CONSUMER_OAS;
  delete env.OPENAPI_FLOW_PACKED_CONSUMER_INPUT;
  const script = fileURLToPath(
    new URL('../integration/packed-consumer-smoke.mjs', import.meta.url),
  );
  const absentOas = spawnSync(process.execPath, [script], {
    env,
    encoding: 'utf8',
  });
  assert.equal(absentOas.status, 1);
  assert.match(absentOas.stderr, /OPENAPI_FLOW_PACKED_CONSUMER_OAS/);
  assert.equal(absentOas.stdout.includes('Independent consumer:'), false);
  env.OPENAPI_FLOW_PACKED_CONSUMER_OAS = '/explicit-but-unread-oas.json';
  const absentInput = spawnSync(process.execPath, [script], {
    env,
    encoding: 'utf8',
  });
  assert.equal(absentInput.status, 1);
  assert.match(absentInput.stderr, /OPENAPI_FLOW_PACKED_CONSUMER_INPUT/);
  assert.equal(absentInput.stdout.includes('Independent consumer:'), false);
});
