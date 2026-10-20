import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import process from 'node:process';
import {
  resolveApiOperations,
  validateApiSelectionExplanation,
} from '@openapi-flow/core';
import {
  selectApiOperations,
  generateApiArguments,
} from '@openapi-flow/langchain';
import { createHttpRequestNode, assembleN8nWorkflow } from '@openapi-flow/n8n';
import { apiSelectionExplanationsFixture } from '../test/fixtures/api-selection-explanations-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

/** A bounded selector/argument probe, not a general multi-turn or graph-quality benchmark. */
export async function verifyApiSelectionExplanations({ model, label }) {
  assert.equal(typeof model?.withStructuredOutput, 'function');
  assert.ok(typeof label === 'string' && label.trim());
  const runId = `${Date.now()}-${process.pid}`;
  const directory = new URL(
    `../.local-artifacts/api-selection-explanations/${runId}/`,
    import.meta.url,
  );
  const volume = `openapi-flow-selection-explanations-${runId}`;
  const image = 'n8nio/n8n:2.37.10';
  const requests = [],
    serverErrors = [];
  let created = false;
  let phase = 'selection';
  const server = createServer((request, response) => {
    requests.push({ method: request.method, path: request.url });
    try {
      assert.equal(request.method, 'GET');
      assert.equal(request.url, '/members/fixture-member');
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({ contractOnlyField: 'local-fixture-response' }),
      );
    } catch (error) {
      serverErrors.push(error.message);
      response.writeHead(422, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  await mkdir(directory, { recursive: true });
  try {
    await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
    const { catalog, context } = await apiSelectionExplanationsFixture();
    context.scenario =
      '회원번호 "fixture-member"로 회원 간단 정보를 조회하는 테스트 워크플로우를 만들어줘.';
    const selection = await selectApiOperations({
      ...context,
      model,
      includeExplanations: true,
    });
    await writeFile(
      new URL('selection.json', directory),
      JSON.stringify(selection, null, 2),
    );
    assert.equal(selection.operations.length, 1);
    assert.equal(selection.gaps.length, 0);
    const selected = selection.operations[0];
    assert.equal(selected.key.documentId, 'simple-members');
    validateApiSelectionExplanation({
      context,
      basis: { kind: 'candidates', operations: [selected.key] },
      explanation: selected.explanation,
    });
    const [operation] = await resolveApiOperations(catalog, [selected.key]);
    phase = 'arguments';
    const args = await generateApiArguments({
      callId: 'member-read',
      operation,
      bindings: [],
      scenario: context.scenario,
      model,
    });
    await writeFile(
      new URL('arguments.json', directory),
      JSON.stringify(args, null, 2),
    );
    assert.deepEqual(args.values, { path: { id: 'fixture-member' } });
    assert.deepEqual(args.unresolvedInputs, []);
    phase = 'compile';
    const fragment = createHttpRequestNode({
      operation,
      arguments: args,
      credentialBindings: {},
      baseUrl: `http://host.docker.internal:${server.address().port}`,
      position: [300, 0],
    });
    const result = assembleN8nWorkflow({
      id: `selection-explanations-${runId}`,
      name: '회원 간단 조회와 선택 근거',
      nodes: [fragment],
      starts: [args.callId],
      edges: [],
    });
    assert.equal(result.status, 'complete');
    const workflow = result.workflow;
    await writeFile(
      new URL('workflow.json', directory),
      JSON.stringify(workflow, null, 2),
    );
    phase = 'n8n';
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
      { method: 'GET', path: '/members/fixture-member' },
    ]);
    const report = {
      status: 'passed',
      label,
      image,
      scenario: context.scenario,
      localHttpRequests: requests,
      businessApiCalls: 0,
      scope:
        'Discovery selection with same-call reason and code-owned sources, separate OAS-typed argument generation, deterministic single-API SDK composition, actual isolated n8n execution. No full-contract model claims at selection, extra explanation call, output repair or model retry.',
    };
    await writeFile(
      new URL('report.json', directory),
      JSON.stringify(report, null, 2),
    );
    return directory;
  } catch (error) {
    await writeFile(
      new URL('failure.json', directory),
      JSON.stringify(
        {
          status: 'failed',
          phase,
          label,
          errorType: error.name,
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
