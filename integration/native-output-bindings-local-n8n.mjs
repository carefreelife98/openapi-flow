import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { z } from 'zod';
import {
  createApiCatalog,
  resolveApiOperations,
  validateApiArguments,
} from '@openapi-flow/core';
import {
  createJsonOutputCapability,
  createN8nNativeCapabilities,
} from '@openapi-flow/n8n';
import { createReviewableWorkflowGenerationGraph } from '@openapi-flow/example-langgraph-workflow';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

function docker(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [],
      stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (exitCode) =>
      resolve({
        exitCode,
        stdout: Buffer.concat(stdout).toString(),
        stderr: Buffer.concat(stderr).toString(),
      }),
    );
    child.stdin.end(input);
  });
}

/** Scripted baseline is explicit: live callers inject their real LangChain model. */
export function createScriptedNativeBindingModel() {
  return {
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          const input = JSON.parse(messages[1].content);
          if (options.name === 'select_api_operations')
            return schema.parse({
              operations: [
                {
                  candidateId: input.candidates.find(
                    (item) =>
                      item.path === '/mongotest/core/getKey' &&
                      item.method === 'GET',
                  ).candidateId,
                  purpose: 'Read the declared product key',
                },
              ],
              gaps: [],
            });
          if (options.name === 'plan_api_bindings')
            return schema.parse({
              calls: [
                {
                  callId: input.materials[0].callId,
                  bindings: [
                    {
                      kind: 'node-output',
                      sourceNodeId: 'scenario-context',
                      sourcePointer: '/gdNo',
                      targetPointer: '/query/gdNo',
                    },
                  ],
                },
              ],
              gaps: [],
            });
          if (options.name === 'plan_reviewable_workflow_graph')
            return schema.parse({
              nativeNodes: [],
              edges: [
                {
                  from: 'scenario-context',
                  output: 'main',
                  to: input.materials[0].arguments.callId,
                  input: 'main',
                },
              ],
              blockedCalls: [],
              additionalGaps: [],
            });
          throw new Error(`Unexpected model call: ${options.name}`);
        },
      };
    },
  };
}

/** Real OAS + official example + isolated n8n. Never calls the business service. */
export async function runNativeOutputValidation({
  oasPath,
  model,
  plannerLabel,
}) {
  assert.ok(
    oasPath && model && plannerLabel,
    'oasPath, model and plannerLabel are required',
  );
  assert.match(
    plannerLabel,
    /^[a-zA-Z0-9-]+$/,
    'plannerLabel must be a safe artifact label',
  );
  const spec = JSON.parse(await readFile(oasPath, 'utf8'));
  const source = { id: 'icl', spec };
  const catalog = await createApiCatalog([source]);
  const key = catalog.operations.find(
    (item) => item.path === '/mongotest/core/getKey' && item.method === 'GET',
  )?.key;
  assert.ok(key, 'ICL OAS lacks GET /mongotest/core/getKey');
  const [operation] = await resolveApiOperations(catalog, [key]);
  assert.equal(operation.effective.security.length, 1);
  const securityNames = Object.keys(operation.effective.security[0]);
  assert.equal(securityNames.length, 1);
  const credentialId = 'native-output-fixture-bearer';
  // Artificial local test credential; not a business JWT or platform access key.
  const fixtureToken = 'local-native-output-fixture';
  const expected = {
    gdNo: '{{ $json.neverEvaluate }}',
    'dot.key': 'literal-key',
    count: 8,
    flag: false,
    labels: ['a', 'b'],
    nested: { id: 'unchanged' },
  };
  const capability = createJsonOutputCapability({
    name: 'scenario-context',
    description:
      'User supplied product context, copied unchanged as a native JSON item.',
    parametersSchema: z.strictObject({
      gdNo: z.string(),
      'dot.key': z.string(),
      count: z.number(),
      flag: z.boolean(),
      labels: z.array(z.string()),
      nested: z.strictObject({ id: z.string() }),
    }),
  });
  const capabilities = [...createN8nNativeCapabilities(), capability];
  const preparedNativeNodes = [
    {
      id: 'scenario-context',
      capability: 'scenario-context',
      parameters: expected,
    },
  ];
  const image = 'n8nio/n8n:2.37.10';
  const volume = `openapi-flow-native-output-${process.pid}-${Date.now()}`;
  const requests = [],
    failures = [];
  const server = createServer(async (request, response) => {
    try {
      assert.equal(request.headers.authorization, `Bearer ${fixtureToken}`);
      const url = new URL(request.url, 'http://contract.local');
      assert.equal(url.pathname, operation.path);
      const values = { query: Object.fromEntries(url.searchParams) };
      const validation = validateApiArguments({
        operation,
        values,
        bindings: [],
      });
      assert.equal(validation.valid, true);
      assert.deepEqual(values, { query: { gdNo: expected.gdNo } });
      requests.push({ path: url.pathname, values, authenticated: true });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{}');
    } catch (error) {
      failures.push(error.message);
      response.writeHead(422);
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  let volumeCreated = false;
  const directory = new URL(
    `../.local-artifacts/native-output-bindings/${plannerLabel}/`,
    import.meta.url,
  );
  const runtimeArgs = [
    'run',
    '--rm',
    '-i',
    '--mount',
    `source=${volume},target=/home/node/.n8n`,
    '-e',
    'N8N_DIAGNOSTICS_ENABLED=false',
    image,
  ];
  try {
    await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
    const state = await createReviewableWorkflowGenerationGraph({
      model,
      capabilities,
      preparedNativeNodes,
      deployments: [
        {
          documentId: 'icl',
          baseUrl: `http://host.docker.internal:${server.address().port}`,
          credentialBindings: {
            [securityNames[0]]: {
              id: credentialId,
              name: 'Local fixture Bearer',
            },
          },
        },
      ],
    }).invoke({
      workflowId: 'native-output-icl',
      workflowName: 'ICL native output binding',
      sources: [source],
      trace: [],
      scenario:
        'Create a workflow that uses the existing scenario-context native node unchanged. Read its gdNo field and pass it directly as query.gdNo to GET /mongotest/core/getKey. Call that API exactly once. Do not calculate, convert types, add other APIs, assertions or native nodes, or treat the literal gdNo text as an expression. The prepared context is authoritative. Connect the native producer before the API.',
    });
    assert.equal(state.status, 'complete');
    assert.equal(state.reviewPlan.nativeNodes.length, 1);
    assert.equal(state.reviewMaterials.length, 1);
    assert.equal(
      state.reviewMaterials[0].operation.key.operationRef,
      operation.key.operationRef,
    );
    assert.deepEqual(state.reviewMaterials[0].arguments.bindings, [
      {
        kind: 'node-output',
        sourceNodeId: 'scenario-context',
        sourcePointer: '/gdNo',
        targetPointer: '/query/gdNo',
      },
    ]);
    await mkdir(directory, { recursive: true });
    await writeFile(
      new URL('workflow.json', directory),
      JSON.stringify(state.workflow, null, 2),
    );
    assert.equal((await docker(['volume', 'create', volume])).exitCode, 0);
    volumeCreated = true;
    assert.equal(
      (
        await docker(
          [...runtimeArgs, 'import:credentials', '--input=/dev/stdin'],
          JSON.stringify([
            {
              id: credentialId,
              name: 'Local fixture Bearer',
              type: 'httpBearerAuth',
              data: { token: fixtureToken },
            },
          ]),
        )
      ).exitCode,
      0,
    );
    const results = [];
    for (const mode of [
      'unchanged-native-json',
      'missing-field',
      'wrong-type',
      'ambiguous-items',
    ]) {
      const workflow = globalThis.structuredClone(state.workflow);
      const context = workflow.nodes.find(
        (item) => item.id === 'scenario-context',
      );
      if (mode !== 'unchanged-native-json') {
        // Deliberate producer corruption tests guards, never repairs model output.
        const corrupted = globalThis.structuredClone(expected);
        if (mode === 'missing-field') delete corrupted.gdNo;
        if (mode === 'wrong-type') corrupted.gdNo = 8;
        if (mode === 'ambiguous-items') {
          context.type = 'n8n-nodes-base.code';
          context.typeVersion = 2;
          context.parameters = {
            mode: 'runOnceForAllItems',
            jsCode: `return [{json:${JSON.stringify(corrupted)}},{json:${JSON.stringify(corrupted)}}];`,
          };
        } else context.parameters.jsonOutput = JSON.stringify(corrupted);
      }
      assert.equal(
        (
          await docker(
            [...runtimeArgs, 'import:workflow', '--input=/dev/stdin'],
            JSON.stringify(workflow),
          )
        ).exitCode,
        0,
      );
      const before = requests.length;
      const output = await docker([
        ...runtimeArgs,
        'execute',
        '--id=native-output-icl',
        '--rawOutput',
      ]);
      const execution = readN8nExecution(output.stdout);
      if (mode === 'unchanged-native-json') {
        assert.equal(
          output.exitCode,
          0,
          'isolated native output execution failed',
        );
        assert.equal(execution.status, 'success');
        const nativeJson =
          execution.data.resultData.runData['scenario-context'][0].data
            .main[0][0].json;
        assert.deepEqual(nativeJson, expected);
        assert.equal(requests.length - before, 1);
      } else {
        assert.notEqual(output.exitCode, 0);
        assert.equal(execution.status, 'error');
        assert.equal(requests.length - before, 0);
      }
      assert.deepEqual(failures, []);
      results.push({
        mode,
        status: execution.status,
        requests: requests.length - before,
      });
      console.log(`${mode}: PASSED (${requests.length - before} requests)`);
    }
    const report = {
      planner: plannerLabel,
      image,
      results,
      actualBusinessCalls: 0,
      remoteN8nWrites: 0,
      responseBusinessSemanticsValidated: false,
      repaired: false,
      trace: state.trace,
    };
    await writeFile(
      new URL('report.json', directory),
      JSON.stringify(report, null, 2),
    );
    // Restore the intact importable result, not the intentionally corrupted test cases.
    return report;
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (volumeCreated)
      assert.equal((await docker(['volume', 'rm', volume])).exitCode, 0);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.ok(
    process.env.OPENAPI_FLOW_ICL_OAS_PATH,
    'OPENAPI_FLOW_ICL_OAS_PATH is required',
  );
  await runNativeOutputValidation({
    oasPath: process.env.OPENAPI_FLOW_ICL_OAS_PATH,
    model: createScriptedNativeBindingModel(),
    plannerLabel: 'scripted-baseline-no-LLM',
  });
}
