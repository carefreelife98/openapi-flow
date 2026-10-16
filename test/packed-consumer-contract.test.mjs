import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { test } from 'node:test';
import ts from 'typescript';

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
