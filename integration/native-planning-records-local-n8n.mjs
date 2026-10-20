import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';
import { planNativeNodes, generateApiArguments } from '@openapi-flow/langchain';
import {
  createWorkflowGraphPlan,
  createWorkflowDraft,
  validateNativeNodePlanningRecord,
  validateApiBindingAssignments,
} from '@openapi-flow/core';
import {
  createHttpRequestNode,
  createN8nNativeOutputSources,
  compilePlannedN8nWorkflow,
  compileN8nWorkflowTemplate,
} from '@openapi-flow/n8n';
import { nativePlanningRecordFixture } from '../test/fixtures/native-planning-record-fixture.mjs';
import {
  nativeRuntimeInputFixture,
  runtimeNativeValue,
  runtimeNativeSchema,
} from '../test/fixtures/native-runtime-input-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

/** Native proposals are actual model output; API bindings, topology and execution inputs are explicit fixture composition. */
export async function verifyNativePlanningRecords({ model, label }) {
  assert.equal(typeof model?.withStructuredOutput, 'function');
  assert.ok(typeof label === 'string' && label.trim());
  const runId = `${Date.now()}-${process.pid}`,
    image = 'n8nio/n8n:2.37.10',
    volume = `openapi-flow-native-records-${runId}`;
  const directory = new URL(
    `../.local-artifacts/native-planning-records/${runId}/`,
    import.meta.url,
  );
  const requests = [],
    serverErrors = [];
  let created = false,
    phase = 'native-additions',
    expected = [];
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    try {
      assert.equal(request.method, 'POST');
      assert.equal(request.url, '/echo');
      const body = JSON.parse(raw);
      requests.push({ method: request.method, path: request.url, body });
      assert.deepEqual(runtimeNativeSchema.parse(body), body);
      const value = expected.find((value) => value.id === body.id);
      assert.ok(value);
      assert.deepEqual(body, value);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    } catch (error) {
      serverErrors.push(error.message);
      response.writeHead(422, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  await mkdir(directory, { recursive: true });
  try {
    await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
    const baseUrl = `http://host.docker.internal:${server.address().port}`;
    const fixture = nativePlanningRecordFixture(),
      api = await nativeRuntimeInputFixture();
    const operation = api.context.operations.find(
      (operation) => operation.path === '/echo',
    );
    assert.ok(operation);
    const apiMaterials = fixture.nodes.map((node, index) => ({
      callId: `echo-${index + 1}`,
      operation,
      purpose: `명시된 ${node.parameters.id} JSON을 그대로 전송하는 선택된 API`,
    }));
    const input = {
      ...fixture.input,
      planId: `native-explained-${runId}`,
      apiMaterials,
    };
    const planned = await planNativeNodes({
      ...input,
      model,
      includeExplanations: true,
    });
    assert.deepEqual(
      planned.gaps,
      [],
      'Reported model gaps remain failures; never repair them',
    );
    assert.equal(planned.nativeNodes.length, 2);
    assert.equal(planned.nativePlanning.assessment.kind, 'additions');
    validateNativeNodePlanningRecord({
      ...input,
      plan: planned,
      record: JSON.parse(JSON.stringify(planned.nativePlanning)),
    });
    const expectedNodes = fixture.nodes.map((node) => node.parameters);
    assert.deepEqual(
      planned.nativeNodes
        .map((node) => node.parameters)
        .sort((a, b) => a.id.localeCompare(b.id)),
      [...expectedNodes].sort((a, b) => a.id.localeCompare(b.id)),
    );
    assert.equal(new Set(planned.nativeNodes.map((node) => node.id)).size, 2);
    await writeFile(
      new URL('additions-plan.json', directory),
      JSON.stringify(planned, null, 2),
    );
    const materialNodes = apiMaterials.map((material, index) => {
      const node = planned.nativeNodes.find(
        (node) => node.parameters.id === expectedNodes[index].id,
      );
      assert.ok(node);
      return { material, node };
    });
    const calls = materialNodes.map(({ material, node }) => ({
      callId: material.callId,
      bindings: [
        {
          kind: 'node-output',
          targetPointer: '/body',
          sourceNodeId: node.id,
          sourcePointer: '',
        },
      ],
    }));
    validateApiBindingAssignments({
      calls,
      materials: apiMaterials,
      nativeOutputs: planned.nativePlanning.verification.outputs,
    });
    const materials = [];
    for (const material of apiMaterials) {
      const call = calls.find((call) => call.callId === material.callId);
      assert.ok(call);
      const args = await generateApiArguments({
        ...material,
        scenario: input.scenario,
        bindings: call.bindings,
        requestMediaType: 'application/json',
      });
      assert.deepEqual(args.values, {});
      assert.deepEqual(args.unresolvedInputs, []);
      materials.push({ operation, arguments: args });
    }
    const names = Object.fromEntries(
      materials.map((material) => [
        material.arguments.callId,
        `Request ${material.arguments.callId}`,
      ]),
    );
    const nativeSources = createN8nNativeOutputSources({
      nativeNodes: planned.nativeNodes,
      capabilities: input.capabilities,
      apiNodeNames: names,
    });
    const topology = createWorkflowGraphPlan({
      capabilities: input.capabilities,
      materials,
      proposal: {
        nativeNodes: planned.nativeNodes,
        edges: materialNodes.map(({ material, node }) => ({
          from: node.id,
          output: 'main',
          to: material.callId,
          input: 'main',
        })),
        gaps: [],
      },
    });
    const compiled = compilePlannedN8nWorkflow({
      id: `native-reasons-${runId}`,
      name: 'Actual native proposal with explicit test topology',
      plan: topology,
      materials,
      capabilities: input.capabilities,
      apiNodes: materials.map((material, index) =>
        createHttpRequestNode({
          ...material,
          baseUrl,
          credentialBindings: {},
          apiNodeNames: names,
          nativeOutputSources: nativeSources,
          position: [500, index * 300],
        }),
      ),
    });
    assert.equal(
      JSON.stringify(compiled.workflow).includes('nativePlanning'),
      false,
    );
    await writeFile(
      new URL('workflow.json', directory),
      JSON.stringify(compiled.workflow, null, 2),
    );
    phase = 'literal-native-n8n';
    expected = expectedNodes;
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
    const execute = async (workflow, file) => {
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
      assert.equal(
        execution.status,
        'success',
        JSON.stringify(execution.data.resultData.error),
      );
      await writeFile(
        new URL(file, directory),
        JSON.stringify(execution, null, 2),
      );
    };
    await execute(compiled.workflow, 'execution.json');
    assert.equal(requests.length, 2);
    assert.deepEqual(serverErrors, []);
    assert.deepEqual(requests.map((request) => request.body.id).sort(), [
      'first',
      'second',
    ]);

    phase = 'prepared-no-additions';
    const preparedInput = {
      ...input,
      planId: `prepared-native-${runId}`,
      scenario:
        '현재 preparedNativeNodes의 두 JSON 출력 인스턴스가 이미 모두 준비되어 있습니다. 값과 ID를 그대로 유지하고 새 native 인스턴스는 추가하지 마세요. 새로 요청된 동작은 없습니다.',
      preparedNativeNodes: planned.nativeNodes,
    };
    const prepared = await planNativeNodes({
      ...preparedInput,
      model,
      includeExplanations: true,
    });
    assert.deepEqual(prepared.nativeNodes, []);
    assert.deepEqual(prepared.gaps, []);
    assert.equal(prepared.nativePlanning.assessment.kind, 'no-additions');
    assert.equal(prepared.nativePlanning.verification.contracts.length, 2);
    validateNativeNodePlanningRecord({
      ...preparedInput,
      plan: prepared,
      record: JSON.parse(JSON.stringify(prepared.nativePlanning)),
    });
    await writeFile(
      new URL('prepared-plan.json', directory),
      JSON.stringify(prepared, null, 2),
    );

    phase = 'runtime-native-planning';
    const runtimeInput = {
      planId: `runtime-native-${runId}`,
      scenario:
        'typed-context 인스턴스 하나를 새로 만들어줘. 전체 JSON 입력값은 실행할 때 사용자가 제공할 예정이므로 지금 값은 하나도 정하지 말고, 제공된 workflow-input 방식으로 전체 파라미터를 받도록 계획해줘. 포트나 연결, API 요청을 만들지 마.',
      capabilities: input.capabilities,
      allowRuntimeParameters: true,
    };
    const runtimePlan = await planNativeNodes({
      ...runtimeInput,
      model,
      includeExplanations: true,
    });
    await writeFile(
      new URL('runtime-plan.json', directory),
      JSON.stringify(runtimePlan, null, 2),
    );
    assert.deepEqual(runtimePlan.gaps, []);
    assert.equal(runtimePlan.nativeNodes.length, 1);
    assert.equal(
      runtimePlan.nativeNodes[0].runtimeParameters,
      true,
      'The model did not select requested runtime ownership; preserve its literal proposal for human review',
    );
    assert.deepEqual(runtimePlan.nativeNodes[0].parameters, {});
    validateNativeNodePlanningRecord({
      ...runtimeInput,
      plan: runtimePlan,
      record: runtimePlan.nativePlanning,
    });
    const node = runtimePlan.nativeNodes[0],
      context = {
        operations: [operation],
        capabilities: input.capabilities,
        messages: [],
      };
    const draft = createWorkflowDraft({
      context,
      content: {
        id: `runtime-native-${runId}`,
        requirements: [],
        nativeNodes: runtimePlan.nativeNodes,
        apiCalls: [
          {
            id: 'echo-runtime',
            operation: operation.key,
            values: {},
            bindings: [
              {
                kind: 'node-output',
                targetPointer: '/body',
                sourceNodeId: node.id,
                sourcePointer: '',
              },
            ],
            requestMediaType: 'application/json',
          },
        ],
        edges: [
          { from: node.id, output: 'main', to: 'echo-runtime', input: 'main' },
        ],
      },
    });
    const templateInput = {
      draft,
      context,
      name: 'Model runtime ownership with explicit actual execution input',
      deployments: [
        {
          documentId: operation.key.documentId,
          baseUrl,
          credentialBindings: {},
        },
      ],
    };
    const unresolved = compileN8nWorkflowTemplate(templateInput);
    assert.equal(unresolved.inputSlots.length, 1);
    const [slot] = unresolved.inputSlots;
    assert.equal(slot.kind, 'native-parameters-input');
    const resolved = compileN8nWorkflowTemplate({
      ...templateInput,
      inputValues: { [slot.id]: runtimeNativeValue },
    });
    assert.equal(resolved.runtimeInputsReady, true);
    assert.equal(resolved.triggerConnected, true);
    assert.equal(
      JSON.stringify(resolved.workflow).includes('nativePlanning'),
      false,
    );
    await writeFile(
      new URL('runtime-template.json', directory),
      JSON.stringify(unresolved, null, 2),
    );
    await writeFile(
      new URL('runtime-workflow.json', directory),
      JSON.stringify(resolved.workflow, null, 2),
    );
    phase = 'runtime-native-n8n';
    expected = [runtimeNativeValue];
    const offset = requests.length;
    await execute(resolved.workflow, 'runtime-execution.json');
    assert.equal(requests.length - offset, 1);
    assert.deepEqual(requests.at(-1).body, runtimeNativeValue);
    assert.deepEqual(serverErrors, []);
    const codeOnly = await planNativeNodes({
      planId: 'explicit-empty-native',
      scenario: '제공된 빈 native 목록을 사용합니다.',
      capabilities: [],
      includeExplanations: true,
    });
    assert.equal(codeOnly.nativePlanning.kind, 'no-capabilities');
    await writeFile(
      new URL('code-only-plan.json', directory),
      JSON.stringify(codeOnly, null, 2),
    );
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
            'Three actual native planning calls: two explained instances of the same implementation, prepared no-additions, and explicit whole-object runtime parameter ownership. Code-only empty registry uses no model. API selection, body bindings, topology and supplied runtime values are explicit fixture inputs. SDK JSON executes two literal native -> POST branches and one typed runtime-input -> POST branch. No model output repair or automatic retry.',
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
