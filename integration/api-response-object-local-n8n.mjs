import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import { createApiResponseObjectFixture } from '../test/fixtures/api-response-object-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

const runId = `${Date.now()}-${process.pid}`;
const directory = new URL(
  `../.local-artifacts/api-response-object/${runId}/`,
  import.meta.url,
);
const volume = `openapi-flow-response-object-${runId}`;
const image = 'n8nio/n8n:2.37.10';
const cases = [
  { name: 'strings', bodies: ['0007', '={{ literal text }}', '[false,0]'] },
  { name: 'scalars', bodies: [0, false, null] },
  {
    name: 'nested',
    bodies: [
      { rows: [null, false, 0, []] },
      [[1, null], []],
      { 'a.b': '0007' },
    ],
  },
  { name: 'empty', bodies: [{}, [], ''] },
];
const requests = [],
  errors = [],
  reports = [];
let current,
  created = false;
const server = createServer(async (request, response) => {
  try {
    if (request.url === '/echo') {
      assert.equal(request.method, 'POST');
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      assert.deepEqual(body, {
        'first.result': current.bodies[0],
        second: current.bodies[1],
        third: current.bodies[2],
        firstAgain: current.bodies[0],
      });
      requests.push(request.url);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
      return;
    }
    assert.equal(request.method, 'GET');
    const index = ['/one', '/two', '/three'].indexOf(request.url);
    assert.ok(index >= 0);
    requests.push(request.url);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(current.bodies[index]));
  } catch (error) {
    errors.push(error.message);
    response.writeHead(422, { 'content-type': 'application/json' });
    response.end('{}');
  }
});
try {
  await mkdir(directory, { recursive: true });
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  const workflow = await createApiResponseObjectFixture(
    `http://host.docker.internal:${server.address().port}`,
  );
  const echoNode = workflow.nodes.find((node) => node.id === 'echo');
  assert.ok(echoNode, 'Compiled echo response node is required');
  workflow.id = `response-object-${runId}`;
  await writeFile(
    new URL('workflow.json', directory),
    JSON.stringify(workflow, null, 2),
  );
  assert.equal((await runDocker(['volume', 'create', volume])).code, 0);
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
    JSON.stringify([workflow]),
  );
  assert.equal(imported.code, 0, imported.stderr);
  for (const entry of cases) {
    current = entry;
    const before = requests.length;
    const command = await runDocker([
      ...runtime,
      'execute',
      `--id=${workflow.id}`,
      '--rawOutput',
    ]);
    await writeFile(
      new URL(`${entry.name}.execution.log`, directory),
      command.stdout,
    );
    const execution = readN8nExecution(command.stdout);
    assert.equal(
      execution.status,
      'success',
      JSON.stringify(execution.data.resultData.error),
    );
    const items = execution.data.resultData.runData.result[0].data.main[0];
    assert.equal(items.length, 1);
    assert.deepEqual(items[0].json, {
      'first.result': entry.bodies[0],
      second: entry.bodies[1],
      third: entry.bodies[2],
      firstAgain: entry.bodies[0],
    });
    const echoed =
      execution.data.resultData.runData[echoNode.name][0].data.main[0][0].json
        .body;
    assert.deepEqual(echoed, items[0].json);
    assert.equal(requests.length - before, 4);
    assert.deepEqual(errors, []);
    reports.push({
      case: entry.name,
      status: execution.status,
      localRequests: 4,
      result: items[0].json,
    });
  }
  await writeFile(
    new URL('report.json', directory),
    JSON.stringify(
      { image, reports, businessApiCalls: 0, modelCalls: 0 },
      null,
      2,
    ),
  );
  console.log(`api-response-object: PASSED (${directory.pathname})`);
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  if (created) {
    assert.equal((await runDocker(['volume', 'rm', volume])).code, 0);
    assert.notEqual((await runDocker(['volume', 'inspect', volume])).code, 0);
    console.log('Owned response object volume removed; absence verified');
  }
}
