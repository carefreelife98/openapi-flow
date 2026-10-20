import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';
import {
  planWorkflowConnections,
  ReviewableWorkflowGraphPlanningError,
} from '@openapi-flow/langchain';
import { validateWorkflowConnectionPlanningRecord } from '@openapi-flow/core';
import {
  createHttpRequestNode,
  compileReviewableN8nWorkflow,
} from '@openapi-flow/n8n';
import { connectionPlanningFixture } from '../test/fixtures/connection-planning-record-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

/** Actual connection proposals; API selection/bindings and native instances are explicit fixture inputs. */
export async function verifyConnectionPlanningRecords({ model, label }) {
  assert.equal(typeof model?.withStructuredOutput, 'function');
  assert.ok(typeof label === 'string' && label.trim());
  const runId = `${Date.now()}-${process.pid}`,
    image = 'n8nio/n8n:2.37.10',
    volume = `openapi-flow-connection-records-${runId}`;
  const directory = new URL(
    `../.local-artifacts/connection-planning-records/${runId}/`,
    import.meta.url,
  );
  const requests = [],
    failures = [];
  let source,
    created = false,
    phase = 'graph-planning';
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    try {
      const url = new URL(request.url, 'http://fixture.local');
      const received = {
        method: request.method,
        path: url.pathname,
        query: [...url.searchParams],
        ...(raw ? { body: JSON.parse(raw) } : {}),
      };
      requests.push(received);
      let body;
      if (url.pathname === '/source') body = source;
      else if (url.pathname.startsWith('/detail/')) {
        assert.equal(decodeURIComponent(url.pathname.slice(8)), source.id);
        body = { id: source.id };
      } else if (url.pathname === '/price') {
        assert.equal(url.searchParams.get('id'), source.id);
        assert.equal(url.searchParams.get('labels'), source.labels.join('|'));
        assert.equal(
          url.searchParams.get('filter[R]'),
          String(source.filter.R),
        );
        body = { price: 12.5 };
      } else if (url.pathname === '/stock') {
        assert.equal(url.searchParams.get('id'), source.id);
        body = { stock: 0 };
      } else if (url.pathname === '/summary') {
        assert.equal(request.method, 'POST');
        assert.deepEqual(received.body, {
          id: source.id,
          price: 12.5,
          stock: 0,
          labels: source.labels,
          filter: source.filter,
        });
        body = received.body;
      } else throw new Error('Unexpected contract path ' + url.pathname);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    } catch (error) {
      failures.push(error.message);
      response.writeHead(422, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  await mkdir(directory, { recursive: true });
  try {
    await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
    const { input, plan: expected } = connectionPlanningFixture();
    const plan = await planWorkflowConnections({
      ...input,
      model,
      includeExplanations: true,
    });
    await writeFile(
      new URL('plan.json', directory),
      JSON.stringify(plan, null, 2),
    );
    assert.deepEqual(
      plan.gaps,
      [],
      'Model gaps are visible failures, not repaired outputs',
    );
    assert.deepEqual(plan.blockedCalls, []);
    assert.deepEqual(
      [...plan.edges].sort((a, b) =>
        JSON.stringify(a).localeCompare(JSON.stringify(b)),
      ),
      [...expected.edges].sort((a, b) =>
        JSON.stringify(a).localeCompare(JSON.stringify(b)),
      ),
    );
    validateWorkflowConnectionPlanningRecord({
      ...input,
      plan,
      record: JSON.parse(JSON.stringify(plan.connectionPlanning)),
    });
    phase = 'fixed-edges-planning';
    const fixedInput = { ...input, edges: plan.edges };
    const fixed = await planWorkflowConnections({
      ...fixedInput,
      model,
      includeExplanations: true,
    });
    await writeFile(
      new URL('fixed-plan.json', directory),
      JSON.stringify(fixed, null, 2),
    );
    assert.deepEqual(fixed.connectionPlanning.decision.edges, []);
    assert.deepEqual(fixed.edges, plan.edges);
    validateWorkflowConnectionPlanningRecord({
      ...fixedInput,
      plan: fixed,
      record: fixed.connectionPlanning,
    });
    phase = 'sdk-compilation';
    const names = Object.fromEntries(
      input.materials.map((m) => [
        m.arguments.callId,
        'Request ' + m.arguments.callId,
      ]),
    );
    const compiled = compileReviewableN8nWorkflow({
      id: `connection-reasons-${runId}`,
      name: 'Actual connection DAG with original API inputs',
      plan,
      materials: input.materials,
      capabilities: input.capabilities,
      apiNodes: input.materials.map((material, index) =>
        createHttpRequestNode({
          ...material,
          baseUrl: `http://host.docker.internal:${server.address().port}`,
          credentialBindings: {},
          apiNodeNames: names,
          position: [300, index * 250],
        }),
      ),
    });
    assert.equal(compiled.status, 'complete');
    assert.equal(
      JSON.stringify(compiled.workflow).includes('connectionPlanning'),
      false,
    );
    await writeFile(
      new URL('workflow.json', directory),
      JSON.stringify(compiled.workflow, null, 2),
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
      JSON.stringify([compiled.workflow]),
    );
    assert.equal(imported.code, 0, imported.stderr);
    for (let iteration = 0; iteration < 2; iteration++) {
      phase = `execution-${iteration + 1}`;
      source = {
        id: randomUUID(),
        labels: ['=literal-data', '雪', 'plain'],
        filter: { R: 0 },
      };
      const offset = requests.length;
      const raw = await runDocker([
        ...runtime,
        'execute',
        `--id=${compiled.workflow.id}`,
        '--rawOutput',
      ]);
      assert.equal(raw.code, 0, raw.stderr);
      const execution = readN8nExecution(raw.stdout);
      assert.equal(
        execution.status,
        'success',
        JSON.stringify(execution.data.resultData.error),
      );
      assert.equal(requests.length - offset, 5);
      assert.deepEqual(failures, []);
      assert.equal(
        requests.slice(offset).filter((r) => r.path === '/summary').length,
        1,
      );
      await writeFile(
        new URL(`execution-${iteration + 1}.json`, directory),
        JSON.stringify({ source, execution }, null, 2),
      );
    }
    await writeFile(
      new URL('report.json', directory),
      JSON.stringify(
        {
          status: 'passed',
          label,
          image,
          requests,
          businessApiCalls: 0,
          scope:
            'Two actual model connection decisions: new parallel/fan-in edges and fixed-edge no-additions. API selection, request bindings and native join parameters are explicit fixture inputs. One SDK workflow runs twice with distinct runtime source IDs; each run executes five APIs and an actual native Merge. No output repair, automatic model retry or business API calls.',
        },
        null,
        2,
      ),
    );
    return directory;
  } catch (error) {
    await writeFile(
      new URL('failure.json', directory),
      JSON.stringify(
        {
          status: 'failed',
          phase,
          errorType: error.name,
          ...(error instanceof ReviewableWorkflowGraphPlanningError
            ? { planningFailure: error.failure, cause: error.cause?.message }
            : {}),
          ...(error instanceof assert.AssertionError
            ? { message: error.message }
            : {}),
          requests,
          failures,
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
