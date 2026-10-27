import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import console from 'node:console';
import {
  responseSelectionFields,
  compileResponseFieldSelectionWorkflow,
} from '../test/fixtures/api-response-field-selection-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

// Fixed plans and synthetic OAS contracts, not full model generation or business service calls.
const id = randomUUID();
const directory = new URL(
  `../.local-artifacts/api-response-field-selection/${id}/`,
  import.meta.url,
);
const volume = `openapi-flow-field-selection-${id}`;
const image = 'n8nio/n8n:2.37.10';
const originalBodies = {
  text: { text: '0007', 'a/b~c': false },
  list: { alternatives: ['={{ literal text }}', '0009'] },
  dictionary: { groups: { selection: 'unchanged' } },
  scalar: 0,
};
const originalOutput = {
  text: '0007',
  candidates: originalBodies.list.alternatives,
  flag: false,
  dictionary: 'unchanged',
  number: 0,
  element: '0009',
};
const cases = [
  {
    name: 'original-typed-values',
    fields: responseSelectionFields,
    bodies: originalBodies,
    output: originalOutput,
  },
  {
    name: 'empty-values',
    fields: responseSelectionFields.filter((entry) => entry.name !== 'element'),
    bodies: {
      ...originalBodies,
      text: { text: '', 'a/b~c': false },
      list: { alternatives: [] },
      dictionary: { groups: { selection: '' } },
    },
    output: {
      text: '',
      candidates: [],
      flag: false,
      dictionary: '',
      number: 0,
    },
  },
  {
    name: 'missing-selected-value',
    fields: responseSelectionFields,
    bodies: { ...originalBodies, dictionary: { groups: {} } },
    error: /Missing response pointer dictionary\/groups\/selection/,
  },
  {
    name: 'invalid-unselected-value',
    fields: responseSelectionFields.filter((entry) => entry.name !== 'flag'),
    bodies: { ...originalBodies, text: { text: '0007', 'a/b~c': 'false' } },
    error: /Response text does not match its OAS contract/,
  },
];
let current;
let created = false;
const requests = [],
  serverErrors = [],
  results = [];
const server = createServer(async (request, response) => {
  try {
    assert.ok(current, 'Current test case is required');
    requests.push(request.url);
    response.writeHead(200, { 'content-type': 'application/json' });
    if (request.url === '/echo') {
      assert.equal(request.method, 'POST');
      assert.equal(
        current.error,
        undefined,
        'An invalid case must stop before the consumer API',
      );
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      assert.deepEqual(body, current.output);
      response.end(JSON.stringify(body));
      return;
    }
    assert.equal(request.method, 'GET');
    const key = request.url.slice(1);
    assert.ok(Object.hasOwn(current.bodies, key));
    response.end(JSON.stringify(current.bodies[key]));
  } catch (error) {
    serverErrors.push(error.message);
    response.end(JSON.stringify({ testError: error.message }));
  }
});
try {
  await mkdir(directory, { recursive: true });
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  const baseUrl = `http://host.docker.internal:${server.address().port}`;
  const workflows = [];
  for (const [index, entry] of cases.entries()) {
    const json = await compileResponseFieldSelectionWorkflow(
      baseUrl,
      entry.fields,
    );
    json.id = `field-selection-${id}-${index}`;
    workflows.push(json);
    await writeFile(
      new URL(`${entry.name}.workflow.json`, directory),
      JSON.stringify(json, null, 2),
    );
  }
  const made = await runDocker(['volume', 'create', volume]);
  assert.equal(made.code, 0, made.stderr);
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
    JSON.stringify(workflows),
  );
  assert.equal(imported.code, 0, imported.stderr);
  for (const [index, entry] of cases.entries()) {
    current = entry;
    const offset = requests.length;
    const executed = await runDocker([
      ...runtime,
      'execute',
      `--id=${workflows[index].id}`,
      '--rawOutput',
    ]);
    const result = readN8nExecution(executed.stdout);
    await writeFile(
      new URL(`${entry.name}.execution.json`, directory),
      JSON.stringify(result, null, 2),
    );
    assert.equal(
      result.status,
      entry.error ? 'error' : 'success',
      JSON.stringify(result.data.resultData.error),
    );
    if (entry.error) {
      assert.equal(typeof result.data.resultData.error?.stack, 'string');
      // n8n shortens message at embedded JSON colons; the preserved stack contains the original thrown error.
      assert.match(result.data.resultData.error.stack, entry.error);
      assert.equal(requests.length - offset, 4);
      assert.equal(
        Object.hasOwn(result.data.resultData.runData, 'echo'),
        false,
      );
    } else {
      const output = result.data.resultData.runData[
        'selected-fields'
      ][0].data.main[0].map((item) => item.json);
      assert.deepEqual(output, [entry.output]);
      assert.equal(requests.length - offset, 5);
    }
    assert.deepEqual(serverErrors, []);
    results.push({
      name: entry.name,
      status: result.status,
      requests: requests.slice(offset),
    });
  }
  const report = {
    status: 'passed',
    image,
    actualModelCalls: 0,
    businessApiCalls: 0,
    localRequests: requests.length,
    results,
    scope:
      'Synthetic OAS, explicit source-specific field plans, full-response validation, official SDK Merge/Set, unchanged typed values into a downstream REST body. Not full original-five generation, derived output measurements or Qoopilot UI.',
  };
  await writeFile(
    new URL('report.json', directory),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      status: report.status,
      directory: directory.pathname,
      cases: results.length,
      localRequests: requests.length,
    }),
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
  if (created) {
    const removed = await runDocker(['volume', 'rm', volume]);
    assert.equal(removed.code, 0, removed.stderr);
  }
}
