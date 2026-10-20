import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, cp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const oas = process.env.OPENAPI_FLOW_PACKED_CONSUMER_OAS;
const input = process.env.OPENAPI_FLOW_PACKED_CONSUMER_INPUT;
assert.ok(
  oas,
  'OPENAPI_FLOW_PACKED_CONSUMER_OAS must point to an actual OAS snapshot',
);
assert.ok(
  input,
  'OPENAPI_FLOW_PACKED_CONSUMER_INPUT must point to explicit operation/input JSON',
);
await readFile(oas);
await readFile(input);
const directory = await mkdtemp(
  join(tmpdir(), 'openapi-flow-packed-consumer-'),
);
const tarballDirectory = join(directory, 'tarballs');
const consumer = join(directory, 'consumer');
await mkdir(tarballDirectory);
await cp(new URL('./fixtures/packed-consumer/', import.meta.url), consumer, {
  recursive: true,
});
console.log(`Independent consumer: ${consumer}`);
const manifests = [];
for (const name of ['core', 'langchain', 'n8n']) {
  const result = await execute(
    'npm',
    ['pack', '--json', '--pack-destination', tarballDirectory],
    { cwd: join(root, 'packages', name), maxBuffer: 8 * 1024 * 1024 },
  );
  const [packed] = JSON.parse(result.stdout);
  assert.ok(packed.filename && packed.integrity && packed.files.length);
  assert.ok(
    packed.files.every(
      (entry) =>
        !entry.path.includes('.local-artifacts') &&
        !entry.path.includes('.env'),
    ),
  );
  manifests.push(packed);
}
await writeFile(
  join(directory, 'pack-manifests.json'),
  JSON.stringify(manifests, null, 2),
);
const reportDirectory = join(root, '.local-artifacts/packed-consumer');
await mkdir(reportDirectory, { recursive: true });
const reportPath = join(
  reportDirectory,
  `${new Date().toISOString().replaceAll(/[:.]/g, '-')}.json`,
);
let phase = 'installation';
try {
  const installed = await execute(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--omit=dev',
      '--no-audit',
      '--no-fund',
      '--registry=https://registry.npmjs.org',
      ...manifests.map((entry) => join(tarballDirectory, entry.filename)),
      '@langchain/core@1.2.18',
      'typescript@6.0.3',
      '@types/node@24.19.2',
      'zod@4.6.7',
    ],
    { cwd: consumer, maxBuffer: 8 * 1024 * 1024, timeout: 300_000 },
  );
  console.log(installed.stdout);
  phase = 'dependency-contract';
  const tsconfig = JSON.parse(
    await readFile(join(consumer, 'tsconfig.json'), 'utf8'),
  );
  assert.equal(tsconfig.compilerOptions.strict, true);
  assert.equal(tsconfig.compilerOptions.skipLibCheck, false);
  const consumerManifest = JSON.parse(
    await readFile(join(consumer, 'package.json'), 'utf8'),
  );
  const consumerDependencies = Object.keys(
    consumerManifest.dependencies,
  ).sort();
  assert.deepEqual(consumerDependencies, [
    '@langchain/core',
    '@openapi-flow/core',
    '@openapi-flow/langchain',
    '@openapi-flow/n8n',
    '@types/node',
    'typescript',
    'zod',
  ]);
  const adapterManifest = JSON.parse(
    await readFile(
      join(consumer, 'node_modules/@openapi-flow/n8n/package.json'),
      'utf8',
    ),
  );
  phase = 'typecheck';
  await execute(
    process.execPath,
    [join(consumer, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'],
    { cwd: consumer, maxBuffer: 8 * 1024 * 1024 },
  );
  phase = 'runtime-compilation';
  const result = await execute(process.execPath, ['dist/packed-consumer.js'], {
    cwd: consumer,
    env: {
      ...process.env,
      OPENAPI_FLOW_PACKED_CONSUMER_OAS: resolve(oas),
      OPENAPI_FLOW_PACKED_CONSUMER_INPUT: resolve(input),
    },
    maxBuffer: 8 * 1024 * 1024,
  });
  console.log(result.stdout);
  const output = JSON.parse(result.stdout.trim());
  const report = {
    timestamp: new Date().toISOString(),
    consumer,
    packManifests: manifests.map(({ name, version, integrity }) => ({
      name,
      version,
      integrity,
    })),
    typecheck: 'passed',
    skippedLibraryChecks: false,
    omittedDevelopmentDependencies: true,
    consumerDependencies,
    adapterDependencies: adapterManifest.dependencies,
    ...output,
    limitations: [
      'Compilation and isolated installation only; no new model quality, n8n execution, business API access or npm publication. The supplied OAS stays outside package tarballs.',
    ],
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`PACKED CONSUMER PASS: ${reportPath}`);
} catch (error) {
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        consumer,
        outcome: 'failed',
        failureStage: phase,
        packManifests: manifests.map(({ name, version, integrity }) => ({
          name,
          version,
          integrity,
        })),
        typeDiagnostics:
          phase === 'typecheck' && typeof error.stdout === 'string'
            ? error.stdout
            : undefined,
        skippedLibraryChecks: false,
        repaired: false,
        published: false,
      },
      null,
      2,
    ),
  );
  console.error(`PACKED CONSUMER FAILED (${phase}): ${reportPath}`);
  throw error;
}
