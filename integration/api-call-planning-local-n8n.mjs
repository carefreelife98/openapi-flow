import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import {
  createWorkflowDraft,
  describeWorkflowDraftApiCallPlanning,
  resolveWorkflowDraftApiCallBindings,
  describeWorkflowDraftApiCallArguments,
  resolveWorkflowDraftApiCallArguments,
  describeWorkflowDraftConnectionEdit,
  resolveWorkflowDraftConnectionEdit,
} from '@openapi-flow/core';
import { compileN8nWorkflowTemplate } from '@openapi-flow/n8n';
import {
  WorkflowDraftApiCallPlanningError,
  WorkflowDraftConnectionEditPlanningError,
} from '@openapi-flow/langchain';
import {
  apiCallPlanningFixture,
  apiCallBindingProposal,
  apiCallArgumentsProposal,
  sourceIdMapping,
} from '../test/fixtures/workflow-draft-api-call-planning-fixture.mjs';
import {
  connectionEditPlan,
  connectionEditProposal,
  addConnection,
} from '../test/fixtures/workflow-draft-connection-edit-fixture.mjs';
import { assemblyBodyValue } from '../test/fixtures/workflow-draft-edit-assembly-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

/** Verification-only planner injection; the library does not impose this composition or adoption policy. */
export async function verifyApiCallPlanning({
  planBindings,
  generateArguments,
  planConnections,
  label,
  literalRoot = false,
}) {
  for (const planner of [planBindings, generateArguments, planConnections])
    assert.equal(typeof planner, 'function');
  assert.ok(label);
  assert.equal(typeof literalRoot, 'boolean');
  const runId = `${Date.now()}-${process.pid}`;
  const directory = new URL(
    `../.local-artifacts/api-call-planning/${runId}/`,
    import.meta.url,
  );
  const volume = `openapi-flow-api-call-planning-${runId}`;
  const image = 'n8nio/n8n:2.37.10';
  const requests = [],
    serverErrors = [],
    results = [];
  let created = false,
    phase = 'planning';
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
      if (request.method === 'POST') {
        assert.equal(request.url, '/items/original-id');
        assert.deepEqual(body, assemblyBodyValue);
      } else {
        assert.equal(request.method, 'GET');
        assert.ok(
          [
            '/lookup/expected',
            '/lookup/independent-id',
            '/replacement/expected',
            '/replacement/literal-id',
          ].includes(request.url),
        );
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify(
          request.url.startsWith('/replacement/')
            ? { renamed: 'replacement-output' }
            : { value: 'expected' },
        ),
      );
    } catch (error) {
      serverErrors.push(error.message);
      response.writeHead(422, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  try {
    await mkdir(directory, { recursive: true });
    await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
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
    for (const kind of literalRoot
      ? ['add-api-call']
      : ['add-api-call', 'replace-api-operation']) {
      phase = kind;
      const input = await apiCallPlanningFixture(kind);
      if (literalRoot)
        input.draft = createWorkflowDraft({
          context: input.context,
          content: {
            id: 'literal-root',
            requirements: [],
            apiCalls: [],
            nativeNodes: [],
            edges: [],
          },
        });
      const scenario = literalRoot
        ? 'Add one independent GET /replacement/{id} API call. Set the path id to the exact user-provided string "literal-id". No predecessor API or native output exists. Keep the call as a workflow root, with no internal edges.'
        : kind === 'add-api-call'
          ? 'Add a separate GET /replacement/{id} call. Its id must come unchanged from the source API response body value. Connect source to the new call. Preserve every existing API value, binding, native setting and route.'
          : 'Replace only the independent API instance with GET /replacement/{id}. Its id must now come unchanged from the source API response body value, not the previous independent-id literal. Connect source to independent. Preserve all other API values, bindings, native settings and routes.';
      input.context.messages[1].text = scenario;
      input.plan = connectionEditPlan(input, [
        {
          kind,
          operation: input.replacement.key,
          ...(kind === 'replace-api-operation'
            ? { nodeId: 'independent' }
            : {}),
        },
      ]);
      input.stepId = input.plan.steps[0].id;
      const original = globalThis.structuredClone(input.draft);
      const description = describeWorkflowDraftApiCallPlanning(input);
      const bindingPlan = await planBindings(input);
      await writeFile(
        new URL(`${kind}-bindings.json`, directory),
        JSON.stringify(bindingPlan, null, 2),
      );
      assert.equal(
        bindingPlan.status,
        'ready',
        'Unresolved mappings must not be fabricated or auto-retried',
      );
      const argumentsResult = await generateArguments({
        ...input,
        bindingPlan,
      });
      await writeFile(
        new URL(`${kind}-arguments.json`, directory),
        JSON.stringify(argumentsResult, null, 2),
      );
      assert.equal(argumentsResult.status, 'ready');
      assert.equal(argumentsResult.inputMode, 'provided');
      assert.deepEqual(
        argumentsResult.arguments.values,
        literalRoot ? { path: { id: 'literal-id' } } : {},
      );
      assert.deepEqual(
        argumentsResult.arguments.bindings,
        literalRoot ? [] : [{ kind: 'node-output', ...sourceIdMapping }],
      );
      const connection = await planConnections({
        ...input,
        resolutions: [argumentsResult.resolution],
      });
      await writeFile(
        new URL(`${kind}-connections.json`, directory),
        JSON.stringify(connection, null, 2),
      );
      assert.equal(connection.status, 'ready');
      const draft = connection.candidate.draft;
      assert.deepEqual(
        draft.apiCalls.filter((call) => call.id !== description.nodeId),
        original.apiCalls.filter((call) => call.id !== description.nodeId),
      );
      assert.deepEqual(draft.nativeNodes, original.nativeNodes);
      assert.deepEqual(
        draft.edges.filter((edge) => edge.to !== description.nodeId),
        original.edges,
      );
      assert.deepEqual(input.draft, original);
      const template = compileN8nWorkflowTemplate({
        draft,
        context: input.context,
        name: `Selected API ${kind} and explicit dependency`,
        deployments: [
          {
            documentId: input.producer.key.documentId,
            baseUrl: `http://host.docker.internal:${server.address().port}`,
          },
        ],
      });
      assert.equal(template.triggerConnected, true);
      assert.equal(template.inputSlots.length, 0);
      template.workflow.id = `api-planning-${kind}-${runId}`;
      await writeFile(
        new URL(`${kind}-workflow.json`, directory),
        JSON.stringify(template.workflow, null, 2),
      );
      await writeFile(
        new URL(`${kind}-drafts.json`, directory),
        JSON.stringify(
          {
            scenario,
            plan: input.plan,
            before: original,
            after: draft,
            mappings: template.nodeMappings,
          },
          null,
          2,
        ),
      );
      const imported = await runDocker(
        [...runtime, 'import:workflow', '--input=/dev/stdin'],
        JSON.stringify([template.workflow]),
      );
      assert.equal(imported.code, 0, imported.stderr);
      const start = requests.length;
      const raw = await runDocker([
        ...runtime,
        'execute',
        `--id=${template.workflow.id}`,
        '--rawOutput',
      ]);
      const execution = readN8nExecution(raw.stdout);
      await writeFile(
        new URL(`${kind}-execution.json`, directory),
        JSON.stringify(execution, null, 2),
      );
      const observed = requests.slice(start);
      results.push({
        kind,
        literalRoot,
        status: execution.status,
        requests: observed,
      });
      assert.equal(
        execution.status,
        'success',
        JSON.stringify(execution.data.resultData.error),
      );
      assert.deepEqual(serverErrors, []);
      assert.equal(
        observed.length,
        literalRoot ? 1 : kind === 'add-api-call' ? 4 : 3,
      );
      assert.equal(
        observed.filter(
          (request) =>
            request.path ===
            (literalRoot ? '/replacement/literal-id' : '/replacement/expected'),
        ).length,
        1,
      );
      assert.equal(
        observed.filter((request) => request.path === '/lookup/expected')
          .length,
        literalRoot ? 0 : 1,
      );
      assert.equal(
        observed.some((request) => request.path === '/lookup/independent-id'),
        !literalRoot && kind === 'add-api-call',
      );
      const exitName = template.nodeMappings.find(
        (mapping) => mapping.nodeId === description.nodeId,
      ).exitNodeName;
      assert.ok(
        execution.data.resultData.runData[exitName],
        'The newly configured API instance must actually execute',
      );
      console.log(
        `${literalRoot ? 'literal-root' : kind}: PASSED (${observed.length} requests; ${literalRoot ? 'OAS-typed supplied literal' : 'response-bound new request'} and unchanged siblings)`,
      );
    }
    await writeFile(
      new URL('report.json', directory),
      JSON.stringify(
        {
          status: 'passed',
          label,
          image,
          results,
          businessApiCalls: 0,
          scope:
            'Selected API binding and typed literals -> explicit connections -> SDK import -> isolated n8n. No proposal repair, model retry, source inference or auto adoption.',
        },
        null,
        2,
      ),
    );
    console.log(`api-call-planning: PASSED (${directory.pathname})`);
    return directory;
  } catch (error) {
    await writeFile(
      new URL('failure.json', directory),
      JSON.stringify(
        {
          label,
          phase,
          errorType: error.name,
          ...(error instanceof assert.AssertionError
            ? { message: error.message }
            : {}),
          results,
          requests,
          serverErrors,
          ...(error instanceof WorkflowDraftApiCallPlanningError ||
          error instanceof WorkflowDraftConnectionEditPlanningError
            ? { failure: error.failure }
            : {}),
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    if (created) {
      const removed = await runDocker(['volume', 'rm', volume]);
      assert.equal(removed.code, 0, removed.stderr);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  await verifyApiCallPlanning({
    label: 'deterministic public structured decisions; zero model calls',
    planBindings: (input) =>
      resolveWorkflowDraftApiCallBindings({
        ...input,
        fingerprint: describeWorkflowDraftApiCallPlanning(input).fingerprint,
        proposal: apiCallBindingProposal(input, [sourceIdMapping]),
      }),
    generateArguments: (input) =>
      resolveWorkflowDraftApiCallArguments({
        ...input,
        fingerprint: describeWorkflowDraftApiCallArguments(input).fingerprint,
        proposal: apiCallArgumentsProposal(input),
      }),
    planConnections: (input) => {
      const description = describeWorkflowDraftConnectionEdit(input);
      assert.equal(description.status, 'ready');
      const nodeId = describeWorkflowDraftApiCallPlanning({
        ...input,
        resolutions: [],
      }).nodeId;
      return resolveWorkflowDraftConnectionEdit({
        ...input,
        fingerprint: description.fingerprint,
        proposal: connectionEditProposal(input, [
          addConnection('source', nodeId),
        ]),
      });
    },
  });
