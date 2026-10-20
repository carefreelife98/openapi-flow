import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { URL, fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import {
  pendingRequirementScopeFixture,
  pendingRequirementScopeModel,
  runPendingRequirementScope,
} from '../test/fixtures/workflow-draft-requirement-scope-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

/** Explicit synthetic human scope/value/approval actions exercise the public host, not output repair. */
export async function verifyRequirementScope({ model, label }) {
  assert.equal(typeof model?.withStructuredOutput, 'function');
  assert.ok(typeof label === 'string' && label.trim());
  const runId = `${Date.now()}-${process.pid}`;
  const directory = new URL(
    `../.local-artifacts/requirement-scope/${runId}/`,
    import.meta.url,
  );
  const volume = `openapi-flow-requirement-scope-${runId}`;
  const image = 'n8nio/n8n:2.37.10';
  const checkpoints = [],
    requests = [],
    serverErrors = [];
  let created = false;
  const server = createServer((request, response) => {
    requests.push({ method: request.method, path: request.url });
    try {
      assert.equal(request.method, 'GET');
      assert.equal(request.url, '/records/fixture-record');
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ id: 'fixture-record' }));
    } catch (error) {
      serverErrors.push(error.message);
      response.writeHead(422, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  await mkdir(directory, { recursive: true });
  try {
    await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
    const f = await pendingRequirementScopeFixture({
      model,
      deployments: [
        {
          documentId: 'pending-requirement-scope',
          baseUrl: `http://host.docker.internal:${server.address().port}`,
        },
      ],
    });
    const { state } = await runPendingRequirementScope(f, (entry) =>
      checkpoints.push(entry),
    );
    assert.equal(state.artifact.triggerConnected, true);
    const workflow = {
      ...state.artifact.workflow,
      id: `requirement-scope-${runId}`,
    };
    await writeFile(
      new URL('workflow.json', directory),
      JSON.stringify(workflow, null, 2),
    );
    await writeFile(
      new URL('checkpoints.json', directory),
      JSON.stringify(checkpoints, null, 2),
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
      JSON.stringify([workflow]),
    );
    assert.equal(imported.code, 0, imported.stderr);
    const raw = await runDocker([
      ...runtime,
      'execute',
      `--id=${workflow.id}`,
      '--rawOutput',
    ]);
    assert.equal(raw.code, 0, raw.stderr);
    const execution = readN8nExecution(raw.stdout);
    await writeFile(
      new URL('execution.json', directory),
      JSON.stringify(execution, null, 2),
    );
    assert.equal(
      execution.status,
      'success',
      JSON.stringify(execution.data.resultData.error),
    );
    assert.deepEqual(serverErrors, []);
    assert.deepEqual(requests, [
      { method: 'GET', path: '/records/fixture-record' },
    ]);
    for (const mapping of state.artifact.nodeMappings)
      assert.ok(execution.data.resultData.runData[mapping.exitNodeName]);
    const report = {
      status: 'passed',
      label,
      image,
      localHttpRequests: requests,
      businessApiCalls: 0,
      checkpoints: checkpoints.map((entry) => entry.label),
      samePlan:
        new Set(checkpoints.map((entry) => entry.state.plan.id)).size === 1,
      clarificationOwners: state.plan.steps
        .filter((step) => step.decision.kind === 'needs-clarification')
        .map((step) => step.decision.owner),
      scope:
        'Selected API identity accepted while input pending, explicit typed human scope and API value, unchanged original native root and edges, same plan -> SDK -> isolated n8n. No semantic/binding/argument replay, generated user answers, output repair or model retry.',
    };
    await writeFile(
      new URL('report.json', directory),
      JSON.stringify(report, null, 2),
    );
    console.log(
      `requirement-scope: PASSED (1 actual local HTTP request; ${directory.pathname})`,
    );
    return directory;
  } catch (error) {
    await writeFile(
      new URL('checkpoints.json', directory),
      JSON.stringify(checkpoints, null, 2),
    );
    await writeFile(
      new URL('failure.json', directory),
      JSON.stringify(
        {
          status: 'failed',
          label,
          errorType: error.name,
          ...(error.failure === undefined ? {} : { failure: error.failure }),
          ...(error instanceof assert.AssertionError
            ? { message: error.message }
            : {}),
          requests,
          serverErrors,
          businessApiCalls: 0,
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    if (created) {
      const removed = await runDocker(['volume', 'rm', volume]);
      assert.equal(removed.code, 0, removed.stderr);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  await verifyRequirementScope({
    model: pendingRequirementScopeModel(),
    label:
      'Deterministic model and explicit synthetic UI; no external model or business API calls',
  });
