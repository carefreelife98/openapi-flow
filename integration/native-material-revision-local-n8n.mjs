import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { compileN8nWorkflowTemplate } from '@openapi-flow/n8n';
import {
  nativeMaterialRevisionFixture,
  repairNativeMaterialRevision,
} from '../test/fixtures/native-material-revision-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

const runId = `${Date.now()}-${process.pid}`;
const directory = new URL(
  `../.local-artifacts/native-material-revision/${runId}/`,
  import.meta.url,
);
const volume = `openapi-flow-native-material-${runId}`;
const image = 'n8nio/n8n:2.37.10';
const requests = [];
const errors = [];
let phase = 'configuration';
let created = false;
const server = createServer(async (request, response) => {
  try {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    requests.push({
      method: request.method,
      path: request.url,
      ...(body === undefined ? {} : { body }),
    });
    let value;
    if (request.method === 'GET') {
      assert.ok(['/before', '/same-path', '/after'].includes(request.url));
      const items =
        request.url === '/before'
          ? [{ values: ['same', 'same'] }, { values: ['other'] }]
          : [{ values: [7, 7] }, { values: [11] }];
      value = { [request.url === '/after' ? 'entries' : 'rows']: items };
    } else {
      assert.equal(request.method, 'POST');
      assert.equal(request.url, '/follow');
      assert.deepEqual(Object.keys(body), ['value']);
      assert.equal(
        typeof body.value,
        phase === 'before' ? 'string' : 'number',
        'Scenario requires unchanged source value types',
      );
      value = body;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(value));
  } catch (error) {
    errors.push(error.message);
    response.writeHead(422, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: error.message }));
  }
});
function nodeItems(data, name) {
  assert.ok(data.runData[name], `Missing actual execution of ${name}`);
  return data.runData[name].flatMap((run) => run.data.main[0]);
}
const results = [];
try {
  await mkdir(directory, { recursive: true });
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  const renamed = await nativeMaterialRevisionFixture('/after');
  const samePath = await nativeMaterialRevisionFixture('/same-path');
  const renamedResult = repairNativeMaterialRevision(renamed);
  const samePathResult = repairNativeMaterialRevision(samePath);
  const cases = [
    {
      name: 'before',
      draft: renamed.draft,
      context: renamed.context,
      values: ['same', 'same', 'other'],
      path: '/before',
    },
    {
      name: 'same-path',
      draft: samePathResult.candidate.draft,
      context: samePath.context,
      values: [7, 7, 11],
      path: '/same-path',
    },
    {
      name: 'renamed',
      draft: renamedResult.candidate.draft,
      context: renamed.context,
      values: [7, 7, 11],
      path: '/after',
    },
  ].map((entry) => {
    const template = compileN8nWorkflowTemplate({
      draft: entry.draft,
      context: entry.context,
      name: `Native material revision ${entry.name}`,
      itemMode: 'linked',
      deployments: [
        {
          documentId: renamed.before.key.documentId,
          baseUrl: `http://host.docker.internal:${server.address().port}`,
        },
      ],
    });
    assert.equal(template.triggerConnected, true);
    assert.equal(template.inputSlots.length, 0);
    template.workflow.id = `native-material-${runId}-${entry.name}`;
    return { ...entry, template };
  });
  await writeFile(
    new URL('workflows.json', directory),
    JSON.stringify(
      cases.map((entry) => entry.template.workflow),
      null,
      2,
    ),
  );
  await writeFile(
    new URL('workflow.json', directory),
    JSON.stringify(cases[2].template.workflow, null, 2),
  );
  await writeFile(
    new URL('repairs-and-candidates.json', directory),
    JSON.stringify(
      {
        renamed: { plan: renamed.plan, ...renamedResult },
        samePath: { plan: samePath.plan, ...samePathResult },
      },
      null,
      2,
    ),
  );
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
    JSON.stringify(cases.map((entry) => entry.template.workflow)),
  );
  assert.equal(imported.code, 0, imported.stderr);
  for (const entry of cases) {
    phase = entry.name;
    const start = requests.length;
    const output = await runDocker([
      ...runtime,
      'execute',
      `--id=${entry.template.workflow.id}`,
      '--rawOutput',
    ]);
    const execution = readN8nExecution(output.stdout);
    await writeFile(
      new URL(`execution-${entry.name}.json`, directory),
      JSON.stringify(execution, null, 2),
    );
    const observed = requests.slice(start);
    results.push({
      name: entry.name,
      status: execution.status,
      observedRequests: observed,
    });
    await writeFile(
      new URL('observed-results.json', directory),
      JSON.stringify(results, null, 2),
    );
    assert.equal(
      execution.status,
      'success',
      JSON.stringify(execution.data.resultData.error),
    );
    assert.deepEqual(errors, []);
    assert.equal(observed.length, 7);
    assert.equal(observed[0].path, entry.path);
    const bodies = observed
      .filter((request) => request.method === 'POST')
      .map((request) => request.body.value);
    assert.deepEqual(
      bodies.toSorted(),
      [...entry.values, ...entry.values].toSorted(),
    );
    const data = execution.data.resultData;
    const mappings = entry.template.nodeMappings;
    for (const id of ['first', 'second', 'joined'])
      assert.equal(
        nodeItems(
          data,
          mappings.find((mapping) => mapping.nodeId === id).exitNodeName,
        ).length,
        3,
      );
    const joined = nodeItems(
      data,
      mappings.find((mapping) => mapping.nodeId === 'joined').exitNodeName,
    );
    assert.deepEqual(
      joined.map((item) => item.json.responses.first.value),
      entry.values,
    );
    assert.deepEqual(
      joined.map((item) => item.json.responses.second.value),
      entry.values,
    );
    const collected = nodeItems(
      data,
      mappings.find((mapping) => mapping.nodeId === 'collected').exitNodeName,
    );
    assert.equal(collected.length, 1);
    assert.deepEqual(
      collected[0].json.items.map((item) => item.value),
      entry.values,
    );
    console.log(
      `${entry.name}: PASSED (${observed.length} requests, unchanged types/duplicates, two actual API roles and ancestry join)`,
    );
  }
  await writeFile(
    new URL('report.json', directory),
    JSON.stringify(
      {
        status: 'passed',
        image,
        results,
        modelCalls: 0,
        businessApiCalls: 0,
        scope:
          'Actual public edit staging and explicit cascading repairs across API array, native array, item join and collection. Synthetic contract services, not model quality.',
      },
      null,
      2,
    ),
  );
  console.log(`native-material-revision: PASSED (${directory.pathname})`);
} catch (error) {
  await writeFile(
    new URL('failure.json', directory),
    JSON.stringify(
      { phase, message: error.message, results, requests, errors },
      null,
      2,
    ),
  );
  console.error(
    `native-material-revision: FAILED (${directory.pathname}): ${error.message}`,
  );
  process.exitCode = 1;
} finally {
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  if (created) {
    const removed = await runDocker(['volume', 'rm', volume]);
    assert.equal(removed.code, 0, removed.stderr);
  }
}
