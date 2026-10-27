import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import console from 'node:console';
import process from 'node:process';
import { URL } from 'node:url';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';
import { nativeValueCollectionWorkflow } from '../test/fixtures/native-value-collection-fixture.mjs';

const image = 'n8nio/n8n:2.37.10';
const volume = `openapi-flow-native-collection-${process.pid}-${randomUUID()}`;
const directory = new URL(
  `../.local-artifacts/native-value-collection/${randomUUID()}/`,
  import.meta.url,
);
let expected;
const requests = [],
  failures = [];
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/echo');
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    assert.deepEqual(body, expected);
    requests.push(body);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  } catch (error) {
    failures.push(error.message);
    response.writeHead(422, { 'content-type': 'application/json' });
    response.end('{}');
  }
});
let created = false;
try {
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  const baseUrl = `http://host.docker.internal:${server.address().port}`;
  const cases = [
    'whole-rows',
    'nested-arrays',
    'numbers',
    'duplicates',
    'empty',
    'invalid',
    'missing',
    'missing-collector',
    'invalid-collector',
  ];
  const fixtures = [];
  for (const name of cases)
    fixtures.push({
      name,
      ...(await nativeValueCollectionWorkflow(baseUrl, name)),
    });
  await mkdir(directory, { recursive: true });
  await writeFile(
    new URL('workflows.import.json', directory),
    JSON.stringify(
      fixtures.map((item) => item.workflow),
      null,
      2,
    ),
  );
  const inspected = await runDocker([
    'image',
    'inspect',
    image,
    '--format',
    '{{.Id}}',
  ]);
  assert.equal(inspected.code, 0, inspected.stderr);
  const createdVolume = await runDocker(['volume', 'create', volume]);
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
  const imported = await runDocker(
    [...runtime, 'import:workflow', '--input=/dev/stdin'],
    JSON.stringify(fixtures.map((item) => item.workflow)),
  );
  assert.equal(imported.code, 0, imported.stderr);
  const results = [];
  for (const fixture of fixtures) {
    expected = fixture.expected;
    requests.length = 0;
    const output = await runDocker([
      ...runtime,
      'execute',
      '--id=' + fixture.workflow.id,
      '--rawOutput',
    ]);
    const execution = readN8nExecution(output.stdout);
    await writeFile(
      new URL(fixture.name + '.execution.json', directory),
      JSON.stringify(execution, null, 2),
    );
    const data = execution.data.resultData;
    const blocked = [
      'invalid',
      'missing',
      'missing-collector',
      'invalid-collector',
    ].includes(fixture.name);
    assert.equal(
      execution.status,
      blocked ? 'error' : 'success',
      JSON.stringify(data.error),
    );
    assert.deepEqual(failures, []);
    if (blocked) {
      assert.equal(requests.length, 0);
      assert.equal(data.runData.collected, undefined);
      assert.match(
        data.error.stack,
        /Native output does not match declared schema|Missing native pointer each\/item\/optional|Missing native output pointer each\/item\/optional/,
      );
      if (fixture.name.endsWith('-collector'))
        assert.equal(data.lastNodeExecuted, 'Read values collected');
    } else if (fixture.name === 'empty') {
      assert.equal(requests.length, 0);
      assert.equal(data.runData.collected, undefined);
    } else {
      assert.deepEqual(requests, [expected]);
      const collected = data.runData.collected[0].data.main[0];
      assert.equal(collected.length, 1);
      assert.deepEqual(collected[0].json, expected);
      assert.deepEqual(collected[0].pairedItem, [{ item: 0 }, { item: 1 }]);
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
    imageId: inspected.stdout.trim(),
    scope:
      'Explicit synthetic projection, official Aggregate, downstream REST binding; not real model or original-five full generation',
    modelCalls: 0,
    businessApiCalls: 0,
    results,
  };
  await writeFile(
    new URL('report.json', directory),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({ artifactDirectory: directory.pathname, ...report }),
  );
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  if (created) {
    const cleanup = await runDocker(['volume', 'rm', volume]);
    assert.equal(cleanup.code, 0, cleanup.stderr);
  }
}
