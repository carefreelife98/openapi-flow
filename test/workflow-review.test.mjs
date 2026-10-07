import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {
  createReviewableWorkflowGraphPlan,
  validateApiBindingAssignments,
  validateApiBindingGaps,
} from '@openapi-flow/core';
import { planReviewableWorkflowGraph } from '@openapi-flow/langchain';
import {
  compileReviewableN8nWorkflow,
  createN8nNativeCapabilities,
} from '@openapi-flow/n8n';
import {
  createPlannedWorkflowGenerationGraph,
  createReviewableWorkflowGenerationGraph,
} from '@openapi-flow/example-langgraph-workflow';
import {
  compilationInput,
  generationInput,
  edge,
  scriptedReviewModel,
} from './fixtures/workflow-review-fixture.mjs';
import {
  graphMaterials,
  graphPlan,
  bindingPlan,
  materials as bindingMaterials,
  names,
  spec as bindingSpec,
} from './fixtures/request-binding-fixture.mjs';
import { createHttpRequestNode } from '@openapi-flow/n8n';
import { toJsonSchema } from '@langchain/core/utils/json_schema';

function assertDetached(result) {
  assert.equal(result.status, 'needs-review');
  assert.equal(result.workflow.active, false);
  assert.equal(result.workflow.connections.Start, undefined);
  assert.equal(result.preview, undefined);
  assert.equal(result.previewWorkflow, undefined);
  assert.ok(result.diagnostics.length);
  assert.equal(
    result.workflow.nodes.filter(
      (node) => node.type === 'n8n-nodes-base.manualTrigger',
    ).length,
    1,
  );
  assert.ok(
    result.workflow.nodes.some((node) => node.type === 'n8n-nodes-base.code'),
  );
  assert.ok(
    result.workflow.nodes.some(
      (node) => node.type === 'n8n-nodes-base.stickyNote',
    ),
  );
}

test('common workflow preserves HTTP nodes, both gap connections and a detached Start', async () => {
  const input = await compilationInput();
  const before = globalThis.structuredClone(input.plan);
  const result = compileReviewableN8nWorkflow(input);
  assertDetached(result);
  assert.deepEqual(input.plan, before);
  assert.equal(
    result.workflow.nodes.filter(
      (node) => node.type === 'n8n-nodes-base.httpRequest',
    ).length,
    2,
  );
  assert.equal(
    result.workflow.connections['Request call-1'].main[0][0].node,
    '확인 필요 · refund',
  );
  assert.equal(
    result.workflow.connections['확인 필요 · refund'].main[0][0].node,
    'Request call-2',
  );
  assert.deepEqual(input.plan.starts, ['call-1']);
  const code = result.workflow.nodes.find((node) => node.id === 'refund');
  assert.equal(code.onError, 'stopWorkflow');
  assert.throws(
    () => vm.runInNewContext(code.parameters.jsCode),
    /OPENAPI_FLOW_UNRESOLVED_STEP refund/,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test('gap-only workflow invents no method, request or response', async () => {
  const input = await compilationInput();
  input.materials = [];
  input.apiNodes = [];
  input.plan = createReviewableWorkflowGraphPlan({
    materials: [],
    gaps: input.plan.gaps,
    capabilities: input.capabilities,
    proposal: {
      nativeNodes: [],
      edges: [],
      additionalGaps: [],
      blockedCalls: [],
    },
  });
  const result = compileReviewableN8nWorkflow(input);
  assertDetached(result);
  assert.deepEqual(input.plan.starts, ['refund']);
  assert.equal(
    result.workflow.nodes.some(
      (node) => node.type === 'n8n-nodes-base.httpRequest',
    ),
    false,
  );
});

test('Korean warning region contains its failing node and keeps its explanation above the node', async () => {
  const input = await compilationInput();
  const result = compileReviewableN8nWorkflow(input);
  const code = result.workflow.nodes.find((node) => node.id === 'refund');
  const note = result.workflow.nodes.find(
    (node) => node.id === 'openapi-flow-gap-note-refund',
  );
  assert.equal(code.name, '확인 필요 · refund');
  assert.equal(code.notesInFlow, true);
  assert.match(code.notes, /실행하면 오류로 중단/);
  assert.equal(note.parameters.color, 3);
  assert.match(note.parameters.content, /^# 확인 필요/);
  assert.match(note.parameters.content, /API 선택/);
  assert.match(note.parameters.content, /Start의 연결을 끊어/);
  assert.match(note.parameters.content, /실제 API를 호출하거나 응답을 만들지/);
  assert.ok(code.position[0] > note.position[0]);
  assert.ok(code.position[1] > note.position[1] + 96);
  assert.ok(code.position[0] + 96 < note.position[0] + note.parameters.width);
  assert.ok(code.position[1] + 192 < note.position[1] + note.parameters.height);
  assert.equal(result.workflow.connections.Start, undefined);
  assert.throws(() => vm.runInNewContext(code.parameters.jsCode));
});

test('long and multiline gap descriptions enlarge the region without truncation or translation', async () => {
  const input = await compilationInput();
  const initial = compileReviewableN8nWorkflow(input);
  const description =
    '누락된 환불 API와 요청 계약을 확인하세요. '.repeat(30) +
    '\nOriginal supplied diagnostic remains unchanged.';
  input.plan.gaps[0].description = description;
  const result = compileReviewableN8nWorkflow(input);
  const note = result.workflow.nodes.find(
    (node) => node.id === 'openapi-flow-gap-note-refund',
  );
  const code = result.workflow.nodes.find((node) => node.id === 'refund');
  const previousNote = initial.workflow.nodes.find(
    (node) => node.id === note.id,
  );
  assert.ok(note.parameters.height > previousNote.parameters.height);
  assert.ok(note.parameters.content.includes('누락된 환불 API와 요청 계약'));
  assert.ok(note.parameters.content.includes('Original supplied diagnostic'));
  assert.equal(result.diagnostics[0].description, description);
  assert.throws(
    () => vm.runInNewContext(code.parameters.jsCode),
    (error) => error.message.endsWith(description),
  );
  assert.ok(
    code.position[1] >
      initial.workflow.nodes.find((node) => node.id === code.id).position[1],
  );
});

test('gap and blocked-call warning regions do not overlap and retain declared DAG edges', async () => {
  const input = await compilationInput();
  input.plan.blockedCalls = [{ callId: 'call-2', gapIds: ['refund'] }];
  input.apiNodes.pop();
  const result = compileReviewableN8nWorkflow(input);
  const notes = result.workflow.nodes.filter(
    (node) => node.type === 'n8n-nodes-base.stickyNote',
  );
  assert.equal(notes.length, 2);
  assert.ok(
    notes[0].position[0] + notes[0].parameters.width < notes[1].position[0],
  );
  assert.equal(
    result.workflow.connections['확인 필요 · refund'].main[0][0].node,
    '확인 필요 · call-2',
  );
  assert.match(notes[1].parameters.content, /대상 OAS 작업/);
  assert.equal(
    result.workflow.nodes.some(
      (node) =>
        node.id === 'call-2' && node.type === 'n8n-nodes-base.httpRequest',
    ),
    false,
  );
});

test('independent roots are preserved in plan but none is connected to Start', async () => {
  const input = await compilationInput();
  input.plan = createReviewableWorkflowGraphPlan({
    ...input,
    gaps: input.plan.gaps,
    proposal: {
      nativeNodes: [],
      edges: [],
      additionalGaps: [],
      blockedCalls: [],
    },
  });
  assert.deepEqual(input.plan.starts, ['call-1', 'call-2', 'refund']);
  assertDetached(compileReviewableN8nWorkflow(input));
});

test('gap descriptions are encoded as data in static failure code and escaped in notes', async () => {
  const input = await compilationInput();
  const description =
    '# heading <script>bad()</script> ![image](https://example.test) ={{ dangerous }}';
  input.plan.gaps[0].description = description;
  const result = compileReviewableN8nWorkflow(input);
  const code = result.workflow.nodes.find((node) => node.id === 'refund');
  assert.equal(code.parameters.jsCode.includes('={{'), false);
  assert.throws(
    () => vm.runInNewContext(code.parameters.jsCode),
    (error) => error.message.endsWith(description),
  );
  const note = result.workflow.nodes.find(
    (node) => node.type === 'n8n-nodes-base.stickyNote',
  );
  assert.ok(note.parameters.content.includes('&lt;script&gt;'));
  assert.equal(note.parameters.content.includes('![image]'), false);
  assert.equal(result.diagnostics[0].description, description);
});

test('gaps never bypass graph identities, ports, cycles or native schemas', async () => {
  for (const mutation of [
    (plan) => {
      plan.edges[0].from = 'unknown';
    },
    (plan) => {
      plan.edges[0].output = 'absent';
    },
    (plan) => {
      plan.edges.push(edge('call-2', 'call-1'));
    },
    (plan) => {
      plan.edges.push(plan.edges[0]);
    },
    (plan) => {
      plan.gaps.push(plan.gaps[0]);
    },
    (plan) => {
      plan.starts = ['refund'];
    },
    (plan) => {
      plan.nativeNodes = [
        { id: 'native', capability: 'unknown', parameters: {} },
      ];
    },
    (plan) => {
      plan.blockedCalls = [{ callId: 'call-1', gapIds: ['absent'] }];
    },
  ]) {
    const input = await compilationInput();
    mutation(input.plan);
    assert.throws(() => compileReviewableN8nWorkflow(input));
  }
});

test('missing or extra ready fragments cannot be hidden by a gap', async () => {
  const input = await compilationInput();
  input.apiNodes.pop();
  assert.throws(() => compileReviewableN8nWorkflow(input), /exactly match/);
});

test('a blocked API is a placeholder, not a response-producing HTTP node', async () => {
  const input = await compilationInput();
  input.plan.blockedCalls = [{ callId: 'call-2', gapIds: ['refund'] }];
  input.apiNodes.pop();
  const result = compileReviewableN8nWorkflow(input);
  assertDetached(result);
  assert.equal(
    result.workflow.nodes.some(
      (node) =>
        node.id === 'call-2' && node.type === 'n8n-nodes-base.httpRequest',
    ),
    false,
  );
  assert.equal(
    result.workflow.nodes.find((node) => node.id === 'call-2').type,
    'n8n-nodes-base.code',
  );
});

const dependencies = (model) => ({
  model,
  capabilities: createN8nNativeCapabilities(),
});
for (const [mode, stage, expectedRequests] of [
  ['selection-gap', 'api-selection', 2],
  ['binding-gap', 'api-bindings', 1],
  ['graph-gap', 'workflow-graph', 2],
]) {
  test(`reviewable generation continues ${mode} to a connected internal DAG`, async () => {
    const model = scriptedReviewModel(mode);
    const result = await createReviewableWorkflowGenerationGraph(
      dependencies(model),
    ).invoke(generationInput);
    assertDetached(result);
    assert.equal(result.diagnostics[0].stage, stage);
    assert.equal(
      result.workflow.nodes.filter(
        (node) => node.type === 'n8n-nodes-base.httpRequest',
      ).length,
      expectedRequests,
    );
    assert.ok(model.calls.includes('plan_reviewable_workflow_graph'));
    assert.equal(result.trace.at(-1), 'compile');
    assert.ok(Object.keys(result.workflow.connections).length);
    if (mode === 'graph-gap')
      assert.equal(
        result.workflow.nodes.find((node) => node.id === 'review-stop')
          .parameters.errorMessage,
        'Explicit scenario failure',
      );
    if (mode === 'binding-gap') {
      assert.equal(model.calls.includes('generate_api_arguments'), true);
      assert.equal(result.diagnostics[0].targetPointer, '/query/mode');
      assert.equal(
        result.reviewPlan.blockedCalls[0].callId,
        result.diagnostics[0].callId,
      );
    }
  });
}

test('strict generation retains fail-fast policy on selection, bindings and graph gaps', async () => {
  for (const mode of ['selection-gap', 'binding-gap', 'graph-gap'])
    await assert.rejects(
      createPlannedWorkflowGenerationGraph(
        dependencies(scriptedReviewModel(mode)),
      ).invoke(generationInput),
      /needs? review/,
    );
});

test('complete reviewable and strict results return identical workflows and traces', async () => {
  const result = await createReviewableWorkflowGenerationGraph(
    dependencies(scriptedReviewModel('complete')),
  ).invoke(generationInput);
  const strict = await createPlannedWorkflowGenerationGraph(
    dependencies(scriptedReviewModel('complete')),
  ).invoke(generationInput);
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.workflow, strict.workflow);
  assert.deepEqual(result.trace, strict.trace);
  assert.ok(result.workflow.connections.Start);
});

test('invalid outputs are errors, not placeholders or repair attempts', async () => {
  for (const mode of ['invalid-selection', 'invalid-graph']) {
    const model = scriptedReviewModel(mode);
    await assert.rejects(
      createReviewableWorkflowGenerationGraph(dependencies(model)).invoke(
        generationInput,
      ),
    );
    assert.equal(
      model.calls.filter((name) => name === 'select_api_operations').length,
      1,
    );
  }
});

test('invalid OAS and stale output fail before model invocation', async () => {
  for (const fields of [
    { sources: [{ id: 'bad', spec: { openapi: 'invalid' } }] },
    { status: 'needs-review' },
    { workflow: { name: 'stale', nodes: [], connections: {} } },
  ]) {
    const model = scriptedReviewModel('complete');
    await assert.rejects(
      createReviewableWorkflowGenerationGraph(dependencies(model)).invoke({
        ...generationInput,
        ...fields,
      }),
    );
    assert.deepEqual(model.calls, []);
  }
});

test('a standard-valid empty REST catalog returns a gap workflow without any model call', async () => {
  const model = scriptedReviewModel('complete');
  const result = await createReviewableWorkflowGenerationGraph(
    dependencies(model),
  ).invoke({
    ...generationInput,
    sources: [
      {
        id: 'empty',
        spec: {
          openapi: '3.1.0',
          info: { title: 'Empty', version: '1' },
          paths: {},
        },
      },
    ],
  });
  assertDetached(result);
  assert.match(
    result.diagnostics[0].description,
    /no REST operation candidates/,
  );
  assert.deepEqual(model.calls, []);
});

test('missing required literals remain clarification errors', async () => {
  const sources = globalThis.structuredClone(generationInput.sources);
  sources[0].spec.paths['/items'].get.parameters[0].required = true;
  await assert.rejects(
    createReviewableWorkflowGenerationGraph(
      dependencies(scriptedReviewModel('complete')),
    ).invoke({ ...generationInput, sources }),
    /clarification/,
  );
});

test('unsupported authentication in an unblocked call remains a compiler error', async () => {
  const sources = globalThis.structuredClone(generationInput.sources);
  sources[0].spec.components = {
    securitySchemes: {
      oauth: {
        type: 'oauth2',
        flows: {
          clientCredentials: {
            tokenUrl: 'https://auth.example.test/token',
            scopes: {},
          },
        },
      },
    },
  };
  sources[0].spec.security = [{ oauth: [] }];
  await assert.rejects(
    createReviewableWorkflowGenerationGraph(
      dependencies(scriptedReviewModel('complete')),
    ).invoke({ ...generationInput, sources }),
    /security|auth/i,
  );
});

test('binding gaps must name a known call and an OAS-declared request pointer', () => {
  for (const gap of [
    { callId: 'unknown', targetPointer: '/query/id', description: 'missing' },
    {
      callId: 'price',
      targetPointer: '/query/unknown',
      description: 'missing',
    },
    { callId: 'price', targetPointer: '/query/id', description: ' ' },
  ])
    assert.throws(() =>
      validateApiBindingGaps({
        materials: bindingMaterials,
        plan: { calls: bindingPlan.calls, gaps: [gap] },
      }),
    );
  assert.doesNotThrow(() =>
    validateApiBindingGaps({
      materials: bindingMaterials,
      plan: {
        calls: bindingPlan.calls,
        gaps: [
          {
            callId: 'price',
            targetPointer: '/query/id',
            description: 'needs input review',
          },
        ],
      },
    }),
  );
});

test('reported gaps never admit invalid OAS bindings', () => {
  const calls = globalThis.structuredClone(bindingPlan.calls);
  calls[1].bindings[0].sourcePointer = '/absent';
  assert.throws(
    () => validateApiBindingAssignments({ materials: bindingMaterials, calls }),
    /not declared by the response OAS/,
  );
});

test('review compilation preserves materialization edges and Merge joins', async () => {
  const base = await compilationInput();
  const ready = graphMaterials.map((item) => ({ ...item, status: 'ready' }));
  const plan = createReviewableWorkflowGraphPlan({
    materials: ready,
    gaps: base.plan.gaps,
    capabilities: base.capabilities,
    proposal: {
      nativeNodes: graphPlan.nativeNodes,
      edges: graphPlan.edges,
      blockedCalls: [],
      additionalGaps: [],
    },
  });
  const apiNodes = ready.map((item) =>
    createHttpRequestNode({
      ...item,
      baseUrl: 'https://example.test',
      apiNodeNames: names,
      position: [300, 0],
    }),
  );
  const result = compileReviewableN8nWorkflow({
    ...base,
    materials: ready,
    plan,
    apiNodes,
  });
  assertDetached(result);
  assert.equal(
    result.workflow.nodes.filter(
      (node) => node.type === 'n8n-nodes-base.httpRequest',
    ).length,
    5,
  );
  assert.equal(
    result.workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.merge')
      .length,
    1,
  );
  for (const fragment of apiNodes)
    for (const internal of fragment.internalEdges ?? []) {
      const from = fragment.nodes.find((node) => node.id === internal.from);
      const to = fragment.nodes.find((node) => node.id === internal.to);
      assert.ok(
        result.workflow.connections[from.name].main[internal.output].some(
          (edge) => edge.node === to.name && edge.index === internal.input,
        ),
      );
    }
});

test('an unblocked API cannot consume a placeholder response', async () => {
  const base = await compilationInput();
  const ready = graphMaterials.map((item) => ({ ...item, status: 'ready' }));
  assert.throws(
    () =>
      createReviewableWorkflowGraphPlan({
        materials: ready,
        gaps: base.plan.gaps,
        capabilities: base.capabilities,
        proposal: {
          nativeNodes: graphPlan.nativeNodes,
          edges: graphPlan.edges,
          blockedCalls: [{ callId: 'source', gapIds: ['refund'] }],
          additionalGaps: [],
        },
      }),
    /response|unavailable|source/i,
  );
});

test('all blocked API materials have no fabricated literal arguments or HTTP fragments', async () => {
  const base = await compilationInput();
  const blocked = graphMaterials.map((item) => ({
    status: 'blocked',
    callId: item.arguments.callId,
    operation: item.operation,
    bindings: item.arguments.bindings,
    gapIds: ['refund'],
  }));
  const plan = createReviewableWorkflowGraphPlan({
    materials: blocked,
    gaps: base.plan.gaps,
    capabilities: base.capabilities,
    proposal: {
      nativeNodes: graphPlan.nativeNodes,
      edges: graphPlan.edges,
      blockedCalls: [],
      additionalGaps: [],
    },
  });
  const result = compileReviewableN8nWorkflow({
    ...base,
    materials: blocked,
    plan,
    apiNodes: [],
  });
  assertDetached(result);
  assert.equal(
    result.workflow.nodes.some(
      (node) => node.type === 'n8n-nodes-base.httpRequest',
    ),
    false,
  );
  assert.equal(
    result.workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.code')
      .length,
    6,
  );
});

test('all-blocked graph schema has an explicitly empty blockedCalls, not an invalid empty enum', async () => {
  const input = await compilationInput();
  let wire;
  const model = {
    withStructuredOutput(schema) {
      wire = toJsonSchema(schema);
      return {
        async invoke() {
          return {
            nativeNodes: [],
            edges: [],
            additionalGaps: [],
            blockedCalls: [],
          };
        },
      };
    },
  };
  const materials = input.materials.map((item) => ({
    status: 'blocked',
    callId: item.arguments.callId,
    operation: item.operation,
    bindings: [],
    gapIds: ['refund'],
  }));
  const plan = await planReviewableWorkflowGraph({
    materials,
    capabilities: input.capabilities,
    gaps: input.plan.gaps,
    scenario: 'Review known calls',
    model,
  });
  assert.equal(plan.blockedCalls.length, 2);
  assert.equal(wire.properties.blockedCalls.maxItems, 0);
  assert.equal(JSON.stringify(wire).includes('"enum":[]'), false);
});

test('a confirmed binding dependency inherits the gap and never invokes argument generation', async () => {
  const calls = [];
  const model = {
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          calls.push(options.name);
          const payload = JSON.parse(messages[1].content);
          let output;
          if (options.name === 'select_api_operations') {
            const source = payload.candidates.find(
              (candidate) => candidate.path === '/source',
            );
            output = {
              operations: payload.candidates.map((candidate) => ({
                candidateId: candidate.candidateId,
                purpose: 'Use the OAS contract',
              })),
              gaps: [
                {
                  kind: 'insufficient_contract',
                  candidateId: source.candidateId,
                  description: 'Required source behavior needs review',
                },
              ],
            };
          } else if (options.name === 'plan_api_bindings') {
            const ids = Object.fromEntries(
              payload.materials.map((item) => [
                item.operation.path === '/detail/{id}'
                  ? 'detail'
                  : item.operation.path.slice(1),
                item.callId,
              ]),
            );
            output = {
              calls: bindingPlan.calls.map((call) => ({
                callId: ids[call.callId],
                bindings: call.bindings.map((binding) => ({
                  ...binding,
                  sourceNodeId: ids[binding.sourceNodeId],
                })),
              })),
              gaps: [],
            };
          } else if (options.name === 'plan_reviewable_workflow_graph') {
            assert.ok(
              payload.materials.every(
                (item) =>
                  item.status === 'blocked' &&
                  !Object.hasOwn(item, 'arguments'),
              ),
            );
            const ids = Object.fromEntries(
              payload.materials.map((item) => [
                item.operation.path === '/detail/{id}'
                  ? 'detail'
                  : item.operation.path.slice(1),
                item.callId,
              ]),
            );
            const mapped = graphPlan.edges.map((connection) => ({
              ...connection,
              from: connection.from === 'join' ? 'join' : ids[connection.from],
              to: connection.to === 'join' ? 'join' : ids[connection.to],
            }));
            output = {
              nativeNodes: graphPlan.nativeNodes,
              edges: [edge(payload.gaps[0].id, ids.source), ...mapped],
              additionalGaps: [],
              blockedCalls: [],
            };
          } else
            throw new Error(
              'Argument generation must not run for a blocked call',
            );
          return schema.parse(output);
        },
      };
    },
  };
  const result = await createReviewableWorkflowGenerationGraph(
    dependencies(model),
  ).invoke({
    ...generationInput,
    sources: [{ id: 'binding-fixture', spec: bindingSpec }],
  });
  assertDetached(result);
  assert.deepEqual(calls, [
    'select_api_operations',
    'plan_api_bindings',
    'plan_reviewable_workflow_graph',
  ]);
  assert.equal(result.reviewMaterials.length, 5);
  assert.ok(
    result.reviewMaterials.every(
      (item) =>
        item.status === 'blocked' &&
        item.gapIds.includes(result.diagnostics[0].id),
    ),
  );
  assert.equal(
    result.workflow.nodes.some(
      (node) => node.type === 'n8n-nodes-base.httpRequest',
    ),
    false,
  );
});

test('annotation identities cannot silently replace an executable SDK node', async () => {
  const input = await compilationInput();
  input.apiNodes[0].entry.id = 'openapi-flow-gap-note-refund';
  assert.throws(
    () => compileReviewableN8nWorkflow(input),
    /IDs and names must be unique/,
  );
});

test('blocked placeholders still retain declared logical binding dependencies in the DAG', async () => {
  const base = await compilationInput();
  const blocked = graphMaterials.map((item) => ({
    status: 'blocked',
    callId: item.arguments.callId,
    operation: item.operation,
    bindings: item.arguments.bindings,
    gapIds: ['refund'],
  }));
  assert.throws(
    () =>
      createReviewableWorkflowGraphPlan({
        materials: blocked,
        gaps: base.plan.gaps,
        capabilities: base.capabilities,
        proposal: {
          nativeNodes: graphPlan.nativeNodes,
          edges: graphPlan.edges.filter(
            (connection) => connection.to !== 'summary',
          ),
          blockedCalls: [],
          additionalGaps: [],
        },
      }),
    /planned dependency.*not available/,
  );
});
