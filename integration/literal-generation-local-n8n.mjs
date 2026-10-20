import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import process from 'node:process';
import { createReviewableWorkflowGenerationGraph } from '@openapi-flow/example-langgraph-workflow';
import { validateApiLiteralGenerationRecord } from '@openapi-flow/core';
import { generateApiArguments } from '@openapi-flow/langchain';
import { createHttpRequestNode, assembleN8nWorkflow } from '@openapi-flow/n8n';
import { repeatedCallLiteralFixture } from '../test/fixtures/repeated-call-literal-fixture.mjs';
import { literalGenerationFixture } from '../test/fixtures/literal-generation-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

/** Public OSS composition plus an explicit confirmed-input fixture; no model output repair. */
export async function verifyLiteralGeneration({ model, label }) {
  assert.equal(typeof model?.withStructuredOutput, 'function');
  assert.ok(typeof label === 'string' && label.trim());
  const runId = `${Date.now()}-${process.pid}`;
  const directory = new URL(
    `../.local-artifacts/literal-generation/${runId}/`,
    import.meta.url,
  );
  const volume = `openapi-flow-literal-generation-${runId}`;
  const image = 'n8nio/n8n:2.37.10';
  const requests = [],
    serverErrors = [];
  let created = false,
    phase = 'planning';
  const server = createServer(async (request, response) => {
    const received = { method: request.method, path: request.url };
    requests.push(received);
    try {
      if (request.method === 'POST') {
        assert.equal(request.url, '/consumer');
        let raw = '';
        for await (const chunk of request) raw += chunk;
        received.body = JSON.parse(raw);
        assert.deepEqual(received.body, {
          id: 'confirmed-original',
          quantity: 2,
        });
      } else {
        assert.equal(request.method, 'GET');
        assert.ok(
          ['/records/fixture-first', '/records/fixture-second'].includes(
            request.url,
          ),
        );
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ id: request.url.split('/').at(-1) }));
    } catch (error) {
      serverErrors.push(error.message);
      response.writeHead(422, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  await mkdir(directory, { recursive: true });
  try {
    await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
    const fixture = await repeatedCallLiteralFixture();
    const state = await createReviewableWorkflowGenerationGraph({
      model,
      capabilities: [],
      argumentOptions: { includeExplanations: true },
      deployments: [
        {
          documentId: 'repeated-lookup',
          baseUrl: `http://host.docker.internal:${server.address().port}`,
        },
      ],
    }).invoke({
      workflowId: `two-roles-${runId}`,
      workflowName: 'Separate API roles and literal provenance',
      scenario: fixture.scenario,
      sources: fixture.sources,
      trace: [],
    });
    await writeFile(
      new URL('state.json', directory),
      JSON.stringify(state, null, 2),
    );
    assert.equal(
      state.status,
      'complete',
      'Model questions/gaps must remain visible rather than be repaired',
    );
    assert.equal(state.selection.operations.length, 2);
    assert.deepEqual(
      state.selection.operations[0].key,
      state.selection.operations[1].key,
    );
    assert.equal(state.reviewMaterials.length, 2);
    assert.deepEqual(
      state.reviewMaterials
        .map((material) => material.arguments.values.path.id)
        .sort(),
      ['fixture-first', 'fixture-second'],
    );
    for (const material of state.reviewMaterials) {
      const args = material.arguments;
      assert.equal(args.literalGeneration.kind, 'proposed-literals');
      assert.equal(args.literalGeneration.callId, args.callId);
      assert.ok(args.literalGeneration.explanation.reason.trim());
      validateApiLiteralGenerationRecord({
        callId: args.callId,
        operation: material.operation,
        bindings: args.bindings,
        scenario: fixture.scenario,
        purpose: material.purpose,
        record: args.literalGeneration,
      });
    }
    assert.deepEqual(state.reviewPlan.edges, []);
    assert.equal(state.reviewPlan.starts.length, 2);
    assert.equal(state.reviewPlan.nativeNodes.length, 0);
    const workflow = state.workflow;
    assert.equal(JSON.stringify(workflow).includes('literalGeneration'), false);
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
    assert.equal(requests.length, 2);
    assert.deepEqual(requests.map((request) => request.path).sort(), [
      '/records/fixture-first',
      '/records/fixture-second',
    ]);
    phase = 'mixed-ownership-arguments';
    const mixedInput = await literalGenerationFixture();
    const mixedArgs = await generateApiArguments({
      ...mixedInput,
      model,
      includeExplanations: true,
    });
    await writeFile(
      new URL('mixed-ownership-arguments.json', directory),
      JSON.stringify(mixedArgs, null, 2),
    );
    assert.deepEqual(mixedArgs.values, {
      body: { id: 'confirmed-original', quantity: 2 },
    });
    assert.deepEqual(mixedArgs.literalGeneration.proposedValues, {
      body: { quantity: 2 },
    });
    validateApiLiteralGenerationRecord({
      ...mixedInput,
      record: mixedArgs.literalGeneration,
    });
    const mixedFragment = createHttpRequestNode({
      operation: mixedInput.operation,
      arguments: mixedArgs,
      baseUrl: `http://host.docker.internal:${server.address().port}`,
      credentialBindings: {},
      position: [300, 0],
    });
    const mixedCompiled = assembleN8nWorkflow({
      id: `mixed-ownership-${runId}`,
      name: 'Confirmed versus generated literals',
      nodes: [mixedFragment],
      starts: [mixedArgs.callId],
      edges: [],
    });
    assert.equal(mixedCompiled.status, 'complete');
    const mixedWorkflow = mixedCompiled.workflow;
    assert.equal(
      JSON.stringify(mixedWorkflow).includes('literalGeneration'),
      false,
    );
    await writeFile(
      new URL('mixed-ownership-workflow.json', directory),
      JSON.stringify(mixedWorkflow, null, 2),
    );
    phase = 'mixed-ownership-n8n';
    const mixedImported = await runDocker(
      [...runtime, 'import:workflow', '--input=/dev/stdin'],
      JSON.stringify([mixedWorkflow]),
    );
    assert.equal(mixedImported.code, 0, mixedImported.stderr);
    const mixedRaw = await runDocker([
      ...runtime,
      'execute',
      `--id=${mixedWorkflow.id}`,
      '--rawOutput',
    ]);
    assert.equal(mixedRaw.code, 0, mixedRaw.stderr);
    const mixedExecution = readN8nExecution(mixedRaw.stdout);
    await writeFile(
      new URL('mixed-ownership-execution.json', directory),
      JSON.stringify(mixedExecution, null, 2),
    );
    assert.equal(
      mixedExecution.status,
      'success',
      JSON.stringify(mixedExecution.data.resultData.error),
    );
    assert.equal(requests.length, 3);
    assert.deepEqual(serverErrors, []);
    await writeFile(
      new URL('report.json', directory),
      JSON.stringify(
        {
          status: 'passed',
          label,
          image,
          scenario: fixture.scenario,
          roles: state.reviewMaterials.map((material) => ({
            purpose: material.purpose,
            callId: material.arguments.callId,
            id: material.arguments.values.path.id,
            literalGeneration: material.arguments.literalGeneration,
          })),
          starts: state.reviewPlan.starts,
          edges: state.reviewPlan.edges,
          mixedOwnership: {
            confirmedInputs: mixedInput.confirmedInputs,
            literalGeneration: mixedArgs.literalGeneration,
          },
          requests,
          businessApiCalls: 0,
          scope:
            'Repeated API roles chosen by model, distinct role-scoped literal values and same-call reasons, code-owned projection evidence and model-planned independent roots; separate explicit confirmed-input fixture with only remaining quantity generated. SDK JSON and isolated n8n execute two GETs plus one POST. No model-output repair, injected model values/edges, automatic model retry or business calls.',
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
