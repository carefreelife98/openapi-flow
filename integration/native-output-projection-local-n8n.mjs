import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import console from 'node:console';
import process from 'node:process';
import { URL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';
import {
  projectionContext,
  projectionFields,
  expectedProjection,
  projectionMeasurementFields,
  expectedMeasuredProjection,
  compileNativeOutputProjectionWorkflow,
} from '../test/fixtures/native-output-projection-fixture.mjs';

const image = 'n8nio/n8n:2.37.10';
const volume = `openapi-flow-native-projection-${process.pid}-${randomUUID()}`;
const directory = new URL(
  `../.local-artifacts/native-output-projection/${randomUUID()}/`,
  import.meta.url,
);
const requests = [];
const contractFailures = [];
let expected;
let remainingExpected;
function docker(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [],
      err = [];
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => err.push(chunk));
    child.on('error', reject);
    child.on('close', (code) =>
      resolve({
        code,
        stdout: Buffer.concat(out).toString(),
        stderr: Buffer.concat(err).toString(),
      }),
    );
    child.stdin.end(input);
  });
}
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/echo');
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const match = remainingExpected.findIndex((row) =>
      isDeepStrictEqual(row, body),
    );
    assert.notEqual(
      match,
      -1,
      'The request must exactly match one remaining original item',
    );
    remainingExpected.splice(match, 1);
    requests.push(body);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  } catch (error) {
    contractFailures.push(error.message);
    response.writeHead(422, { 'content-type': 'application/json' });
    response.end('{}');
  }
});
let created = false;
try {
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  const baseUrl = `http://host.docker.internal:${server.address().port}`;
  const cases = [
    'two-items',
    'empty-items',
    'invalid-unselected-field',
    'missing-optional-value',
    'measured-unicode-items',
    'measured-empty-items',
  ];
  const fixtures = [];
  for (const name of cases) {
    const value = globalThis.structuredClone(projectionContext);
    if (name === 'empty-items') value.rows = [];
    if (name === 'measured-empty-items') value.rows = [];
    if (name === 'measured-unicode-items') {
      value.rows[0].code = '한😀e\u0301';
      value.rows[1].code = '';
    }
    const fields =
      name === 'missing-optional-value'
        ? [...projectionFields, { name: 'optional', pointer: '/item/optional' }]
        : name.startsWith('measured-')
          ? projectionMeasurementFields
          : projectionFields;
    const workflow = await compileNativeOutputProjectionWorkflow(
      baseUrl,
      value,
      fields,
      name !== 'missing-optional-value',
    );
    workflow.id = 'native-projection-' + name;
    if (name === 'invalid-unselected-field') {
      // Corrupt a valid producer after compilation, not the OAS/native contract.
      value.marker = 'corrupted';
      workflow.nodes.find(
        (node) => node.id === 'context',
      ).parameters.jsonOutput = JSON.stringify(value);
    }
    fixtures.push({ name, value, workflow });
  }
  await mkdir(directory, { recursive: true });
  await writeFile(
    new URL('workflow.import.json', directory),
    JSON.stringify(fixtures[0].workflow, null, 2),
  );
  await writeFile(
    new URL('workflows.import.json', directory),
    JSON.stringify(
      fixtures.map((fixture) => fixture.workflow),
      null,
      2,
    ),
  );
  const imageInfo = await docker([
    'image',
    'inspect',
    image,
    '--format',
    '{{.Id}}',
  ]);
  assert.equal(imageInfo.code, 0, imageInfo.stderr);
  const createdVolume = await docker(['volume', 'create', volume]);
  assert.equal(createdVolume.code, 0, createdVolume.stderr);
  created = true;
  const runtime = [
    'run',
    '--rm',
    '-i',
    '--mount',
    `source=${volume},target=/home/node/.n8n`,
    '-e',
    'N8N_DIAGNOSTICS_ENABLED=false',
    image,
  ];
  const imported = await docker(
    [...runtime, 'import:workflow', '--input=/dev/stdin'],
    JSON.stringify(fixtures.map((fixture) => fixture.workflow)),
  );
  assert.equal(imported.code, 0, imported.stderr);
  const results = [];
  for (const fixture of fixtures) {
    requests.length = 0;
    expected = fixture.value.rows.map(
      fixture.name.startsWith('measured-')
        ? expectedMeasuredProjection
        : expectedProjection,
    );
    remainingExpected = globalThis.structuredClone(expected);
    const output = await docker([
      ...runtime,
      'execute',
      '--id=' + fixture.workflow.id,
      '--rawOutput',
    ]);
    const execution = readN8nExecution(output.stdout);
    const data = execution.data.resultData;
    const failed = [
      'invalid-unselected-field',
      'missing-optional-value',
    ].includes(fixture.name);
    assert.equal(
      execution.status,
      failed ? 'error' : 'success',
      JSON.stringify(data.error),
    );
    assert.deepEqual(contractFailures, []);
    if (failed) {
      assert.equal(requests.length, 0);
      assert.match(
        data.error.stack,
        fixture.name === 'invalid-unselected-field'
          ? /Native output does not match declared schema/
          : /Missing native pointer each-row\/item\/optional/,
      );
    } else if (
      fixture.name === 'empty-items' ||
      fixture.name === 'measured-empty-items'
    ) {
      assert.equal(requests.length, 0);
      assert.equal(data.runData['selected-fields'], undefined);
    } else {
      assert.equal(requests.length, expected.length);
      assert.deepEqual(remainingExpected, []);
      const rows = data.runData['selected-fields'][0].data.main[0];
      assert.deepEqual(
        rows.map((row) => row.json),
        expected,
      );
      assert.deepEqual(
        rows.map((row) => row.pairedItem),
        [{ item: 0 }, { item: 1 }],
      );
      if (fixture.name === 'measured-unicode-items') {
        assert.deepEqual(
          rows.map((row) => row.json.textLength),
          [5, 0],
        );
        assert.deepEqual(
          rows.map((row) => row.json.valueCount),
          [1, 0],
        );
      }
    }
    results.push({
      name: fixture.name,
      status: execution.status,
      requests: requests.length,
      lastNode: data.lastNodeExecuted,
    });
    console.log(JSON.stringify(results.at(-1)));
  }
  const report = {
    image,
    imageId: imageInfo.stdout.trim(),
    modelCalls: 0,
    businessApiCalls: 0,
    results,
  };
  await writeFile(
    new URL('report.json', directory),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      { artifactDirectory: directory.pathname, ...report },
      null,
      2,
    ),
  );
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  if (created) {
    const cleanup = await docker(['volume', 'rm', volume]);
    assert.equal(cleanup.code, 0, cleanup.stderr);
  }
}
