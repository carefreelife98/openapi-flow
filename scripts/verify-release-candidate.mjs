import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, mkdtemp, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { verifyPackageMetadata } from './release/verify-package-metadata.mjs';
import { assessTestResult } from './release/assess-test-result.mjs';

const { values } = parseArgs({
  options: {
    version: { type: 'string' },
    'accept-test-failure': { type: 'string', multiple: true },
    'oas-dir': { type: 'string' },
    'consumer-oas': { type: 'string' },
    'consumer-input': { type: 'string' },
    'icl-oas': { type: 'string' },
  },
});
for (const name of [
  'version',
  'oas-dir',
  'consumer-oas',
  'consumer-input',
  'icl-oas',
])
  assert.ok(values[name], `--${name} is required`);
const root = fileURLToPath(new URL('../', import.meta.url));
for (const name of ['core', 'langchain', 'n8n']) {
  const manifest = JSON.parse(
    await readFile(join(root, 'packages', name, 'package.json'), 'utf8'),
  );
  assert.equal(manifest.version, values.version, `${name} release version`);
}
await readdir(resolve(values['oas-dir']));
await readFile(resolve(values['consumer-oas']));
await readFile(resolve(values['consumer-input']));
await readFile(resolve(values['icl-oas']));
const parent = join(root, '.local-artifacts/release-candidate');
await mkdir(parent, { recursive: true });
const directory = await mkdtemp(join(parent, values.version + '-'));
const env = {
  ...process.env,
  OPENAPI_FLOW_REAL_OAS_DIR: resolve(values['oas-dir']),
  OPENAPI_FLOW_PACKED_CONSUMER_OAS: resolve(values['consumer-oas']),
  OPENAPI_FLOW_PACKED_CONSUMER_INPUT: resolve(values['consumer-input']),
  OPENAPI_FLOW_ICL_OAS_PATH: resolve(values['icl-oas']),
};
const report = {
  startedAt: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim(),
  trackedDiffSha256: createHash('sha256')
    .update(execFileSync('git', ['diff', 'HEAD'], { cwd: root }))
    .digest('hex'),
  releaseToolSha256: createHash('sha256')
    .update(await readFile(fileURLToPath(import.meta.url)))
    .digest('hex'),
  packageVerifierSha256: createHash('sha256')
    .update(
      await readFile(
        new URL('./release/verify-package-metadata.mjs', import.meta.url),
      ),
    )
    .digest('hex'),
  endedAt: null,
  version: values.version,
  acceptedTestFailures: values['accept-test-failure'] ?? [],
  publication: 'not-requested',
  modelQualityApproval: 'pending-owner-review',
  checks: [],
  packages: [],
  readyForOwnerReview: false,
};
const save = () =>
  writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2));
async function execute(name, command, args, cwd = root) {
  const started = Date.now();
  const stdout = [],
    stderr = [];
  console.log(`START ${name}`);
  const code = await new Promise((close, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => close(code));
  });
  const output = Buffer.concat(stdout).toString();
  await writeFile(
    join(directory, `${name}.log`),
    output + '\nSTDERR\n' + Buffer.concat(stderr).toString(),
  );
  report.checks.push({
    name,
    command: [command, ...args],
    passed: code === 0,
    exitCode: code,
    elapsedMs: Date.now() - started,
  });
  await save();
  console.log(`RESULT ${name}: ${code}`);
  return { code, output };
}
console.log(`Release artifacts: ${directory}`);
await save();
try {
  const build = await execute('typecheck', 'npm', ['run', 'typecheck']);
  assert.equal(build.code, 0, 'Build/typecheck must pass before runtime tests');
  for (const name of ['lint', 'format:check'])
    await execute(name.replace(':', '-'), 'npm', ['run', name]);
  const testFiles = (await readdir(join(root, 'test')))
    .filter((file) => file.endsWith('.test.mjs'))
    .map((file) => 'test/' + file);
  const legacyTests = (await readdir(join(root, 'test/legacy')))
    .filter((file) => file.endsWith('.test.mjs'))
    .map((file) => 'test/legacy/' + file);
  await execute('unit', process.execPath, [
    '--test',
    '--test-reporter=tap',
    '--test-concurrency=4',
    ...legacyTests,
    ...testFiles,
  ]);
  const unit = report.checks.find((check) => check.name === 'unit');
  Object.assign(
    unit,
    assessTestResult({
      exitCode: unit.exitCode,
      output: await readFile(join(directory, 'unit.log'), 'utf8'),
      acceptedFailureNames: report.acceptedTestFailures,
    }),
  );
  await save();
  await execute('real-oas', process.execPath, [
    '--test',
    'integration/real-oas.mjs',
  ]);
  for (const [name, args] of [
    ['request-bindings', ['request-bindings-local-n8n.mjs']],
    ['incremental-connections', ['incremental-connection-local-n8n.mjs']],
    [
      'incremental-native',
      ['incremental-connection-local-n8n.mjs', '--augment-native'],
    ],
    ['http-response-decoding', ['http-response-decoding-local-n8n.mjs']],
    ['http-authentication', ['http-authentication-local-n8n.mjs']],
    ['array-iteration', ['array-iteration-local-n8n.mjs']],
    ['nested-array-iteration', ['nested-array-iteration-local-n8n.mjs']],
    ['native-array-iteration', ['native-array-iteration-local-n8n.mjs']],
    ['item-join', ['item-join-local-n8n.mjs']],
    ['batch-item-join', ['item-join-local-n8n.mjs', '--batch']],
    ['batch-iteration', ['batch-iteration-local-n8n.mjs']],
    ['conditional-batch', ['batch-iteration-local-n8n.mjs', '--conditional']],
    ['native-output-bindings', ['native-output-bindings-local-n8n.mjs']],
    ['api-response-object', ['api-response-object-local-n8n.mjs']],
    ['api-response-results', ['api-response-results-local-n8n.mjs']],
    [
      'orchestration',
      ['native-output-bindings-local-n8n.mjs', '--orchestrated'],
    ],
    ['deployment-template', ['deployment-template-local-n8n.mjs']],
    ['workflow-review', ['workflow-review-local-n8n.mjs']],
    ['workflow-template', ['workflow-template-local-n8n.mjs']],
    ['schema-projection', ['schema-projection-local-n8n.mjs']],
    ['native-schema-references', ['native-schema-reference-repro.mjs']],
    ['connection-revision', ['connection-revision-local-n8n.mjs']],
    ['initial-material-recovery', ['initial-material-recovery-local-n8n.mjs']],
    [
      'initial-goal-review',
      ['initial-material-recovery-local-n8n.mjs', '--with-goal-review'],
    ],
    ['accepted-material-recovery', ['accepted-revision-local-n8n.mjs']],
    [
      'accepted-goal-review',
      ['accepted-revision-local-n8n.mjs', '--with-goal-review'],
    ],
    ['native-selection-review', ['native-selection-planning-local-n8n.mjs']],
    [
      'response-field-selection',
      ['api-response-field-selection-local-n8n.mjs'],
    ],
    ['response-key-join', ['api-response-key-join-local-n8n.mjs']],
    ['response-map-entry', ['api-response-map-entry-local-n8n.mjs']],
    ['native-output-comparisons', ['native-output-comparisons-local-n8n.mjs']],
    ['native-output-projection', ['native-output-projection-local-n8n.mjs']],
    ['native-value-collection', ['native-value-collection-local-n8n.mjs']],
  ])
    await execute(name, process.execPath, [
      join('integration', args[0]),
      ...args.slice(1),
    ]);
  await execute('packed-consumer', process.execPath, [
    'integration/packed-consumer-smoke.mjs',
  ]);
  await execute('audit', 'npm', ['audit', '--json']);
  const tarballs = join(directory, 'tarballs');
  await mkdir(tarballs);
  for (const name of ['core', 'langchain', 'n8n']) {
    const cwd = join(root, 'packages', name);
    const manifest = JSON.parse(
      await readFile(join(cwd, 'package.json'), 'utf8'),
    );
    const packed = await execute(
      `pack-${name}`,
      'npm',
      ['pack', '--json', '--pack-destination', tarballs],
      cwd,
    );
    assert.equal(packed.code, 0);
    const [metadata] = JSON.parse(packed.output);
    const verified = verifyPackageMetadata(manifest, metadata, values.version);
    const bytes = await readFile(join(tarballs, metadata.filename));
    assert.equal(
      'sha512-' + createHash('sha512').update(bytes).digest('base64'),
      metadata.integrity,
    );
    report.packages.push(verified);
    await save();
  }
  report.readyForOwnerReview =
    report.checks.every(
      (check) => check.passed || check.decision === 'accepted-limitation',
    ) && report.packages.length === 3;
} finally {
  report.endedAt = new Date().toISOString();
  await save();
}
console.log(
  `Release check: ${report.readyForOwnerReview ? 'technical checks assessed; inspect accepted limitations and owner approval' : 'blocked; inspect report'} — ${directory}`,
);
if (!report.readyForOwnerReview) process.exitCode = 1;
