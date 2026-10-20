import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import {
  compileSingletonResponseWorkflow,
  singletonResponseBody,
} from '../test/fixtures/native-singleton-response-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

const runId = `${Date.now()}-${process.pid}`;
const directory = new URL(
  `../.local-artifacts/native-singleton-responses/${runId}/`,
  import.meta.url,
);
const volume = `openapi-flow-singleton-responses-${runId}`;
const image = 'n8nio/n8n:2.37.10';
const reports = [],
  requests = [],
  errors = [];
let negative = false,
  created = false;
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/details');
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    assert.deepEqual(body, singletonResponseBody.input);
    requests.push(body);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        ...singletonResponseBody,
        input: { ...body, amount: negative ? 3 : 2 },
      }),
    );
  } catch (error) {
    errors.push(error.message);
    response.writeHead(422, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'Fixture contract mismatch' }));
  }
});
try {
  await mkdir(directory, { recursive: true });
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
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
  for (const capability of ['assert-responses', 'if']) {
    const workflow = compileSingletonResponseWorkflow(
      capability,
      `http://host.docker.internal:${server.address().port}`,
    );
    workflow.id = `singleton-${runId}-${capability}`;
    await writeFile(
      new URL(`${capability}.workflow.json`, directory),
      JSON.stringify(workflow, null, 2),
    );
    assert.equal(
      (
        await runDocker(
          [...runtime, 'import:workflow', '--input=/dev/stdin'],
          JSON.stringify([workflow]),
        )
      ).code,
      0,
    );
    for (const failure of [false, true]) {
      negative = failure;
      const before = requests.length;
      const execution = readN8nExecution(
        (
          await runDocker([
            ...runtime,
            'execute',
            `--id=${workflow.id}`,
            '--rawOutput',
          ])
        ).stdout,
      );
      assert.deepEqual(errors, []);
      assert.equal(requests.length - before, 2);
      const check = execution.data.resultData.runData.check[0];
      if (capability === 'assert-responses') {
        assert.equal(execution.status, failure ? 'error' : 'success');
        if (failure)
          assert.match(
            execution.data.resultData.error.message,
            /Amount must match/,
          );
        else
          assert.deepEqual(
            check.data.main[0].map((item) => item.json),
            [
              { pass: true, assertionCount: 2 },
              { pass: true, assertionCount: 2 },
            ],
          );
      } else {
        assert.equal(execution.status, 'success');
        assert.equal(check.data.main[failure ? 1 : 0].length, 2);
        assert.equal(check.data.main[failure ? 0 : 1]?.length ?? 0, 0);
      }
      reports.push({
        capability,
        negative: failure,
        status: execution.status,
        localRequests: requests.length - before,
      });
    }
  }
  await writeFile(
    new URL('report.json', directory),
    JSON.stringify(
      { image, reports, businessApiCalls: 0, modelCalls: 0 },
      null,
      2,
    ),
  );
  console.log(`native-singleton-responses: PASSED (${directory.pathname})`);
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  if (created) {
    assert.equal((await runDocker(['volume', 'rm', volume])).code, 0);
    assert.notEqual((await runDocker(['volume', 'inspect', volume])).code, 0);
    console.log('Owned singleton response volume removed; absence verified');
  }
}
