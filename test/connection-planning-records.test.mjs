import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeWorkflowConnectionPlanning,
  createWorkflowConnectionPlan,
  createWorkflowConnectionPlanningRecord,
  validateWorkflowConnectionPlanningRecord,
  projectWorkflowConnectionDecision,
} from '@openapi-flow/core';
import {
  planWorkflowConnections,
  orchestrateWorkflow,
} from '@openapi-flow/langchain';
import {
  createHttpRequestNode,
  compileReviewableN8nWorkflow,
} from '@openapi-flow/n8n';
import {
  connectionPlanningFixture,
  explainConnections,
  connectionPlanningModel,
} from './fixtures/connection-planning-record-fixture.mjs';
import { nativePlanningRecordFixture } from './fixtures/native-planning-record-fixture.mjs';

test('connection reasons are opt-in, paired with new edges and separate from immutable API/native source receipts and execution fields', async () => {
  for (const enabled of [false, true]) {
    const { input, proposal, plan } = connectionPlanningFixture();
    const model = connectionPlanningModel(
      enabled ? explainConnections(proposal) : proposal,
      ({ schema, context }) => {
        assert.equal(
          schema.$schema,
          'https://json-schema.org/draft/2020-12/schema',
        );
        assert.equal(Object.hasOwn(schema.properties, 'reason'), enabled);
        assert.equal(
          Object.hasOwn(schema.properties.edges.items.properties, 'reason'),
          enabled,
        );
        assert.equal(
          Object.hasOwn(schema.properties, 'additionalNativeNodes'),
          false,
        );
        assert.deepEqual(context.edges, input.edges);
        assert.deepEqual(
          context.apiRoles.map((x) => x.purpose),
          input.materials.map((x) => x.purpose),
        );
        assert.equal(Object.hasOwn(context, 'materials'), false);
        assert.equal(Object.hasOwn(context, 'connectionPlanning'), false);
      },
    );
    const result = await planWorkflowConnections({
      ...input,
      model,
      includeExplanations: enabled,
    });
    const { connectionPlanning, ...execution } = result;
    assert.deepEqual(execution, plan);
    assert.equal(model.calls, 1);
    assert.equal(Object.hasOwn(result, 'connectionPlanning'), enabled);
    if (enabled) {
      assert.deepEqual(
        connectionPlanning.decision,
        explainConnections(proposal),
      );
      assert.deepEqual(
        connectionPlanning.evidence.sources.materials,
        input.materials,
      );
      assert.deepEqual(connectionPlanning.plan, plan);
      assert.equal(
        connectionPlanning.decision.edges.some((e) =>
          input.edges.some(
            (f) =>
              e.from === f.from &&
              e.output === f.output &&
              e.to === f.to &&
              e.input === f.input,
          ),
        ),
        false,
      );
      validateWorkflowConnectionPlanningRecord({
        ...input,
        plan: result,
        record: JSON.parse(JSON.stringify(connectionPlanning)),
      });
      result.edges[0].from = 'later-change';
      assert.equal(connectionPlanning.plan.edges[0].from, 'source');
    }
  }
});

test('all supplied edges can remain fixed: an overall reason explains no additions and no model-generated roots', async () => {
  const { input, plan } = connectionPlanningFixture();
  input.edges = plan.edges;
  const proposal = { edges: [], additionalGaps: [], blockedCalls: [] };
  const model = connectionPlanningModel(explainConnections(proposal));
  const result = await planWorkflowConnections({
    ...input,
    model,
    includeExplanations: true,
  });
  assert.deepEqual(result.starts, ['source']);
  assert.deepEqual(result.edges, plan.edges);
  assert.deepEqual(result.connectionPlanning.decision.edges, []);
  assert.ok(result.connectionPlanning.decision.reason.length);
});

test('native-only independent roots omit unavailable blocked-call fields and retain the true empty decision', async () => {
  const { input: native, nodes } = nativePlanningRecordFixture();
  const input = {
    scenario: '제공된 두 JSON 출력을 독립적으로 실행합니다.',
    capabilities: native.capabilities,
    nativeNodes: nodes,
  };
  const model = connectionPlanningModel(
    explainConnections({ edges: [], additionalGaps: [] }),
    ({ schema }) => {
      assert.equal(Object.hasOwn(schema.properties, 'blockedCalls'), false);
    },
  );
  const result = await planWorkflowConnections({
    ...input,
    model,
    includeExplanations: true,
  });
  assert.deepEqual(
    result.starts,
    nodes.map((n) => n.id),
  );
  assert.deepEqual(result.connectionPlanning.decision.blockedCalls, []);
  validateWorkflowConnectionPlanningRecord({
    ...input,
    plan: result,
    record: result.connectionPlanning,
  });
});

test('newly blocked calls retain their own reason while supplied and additional gap descriptions are not regenerated as evidence', async () => {
  const { input: original } = connectionPlanningFixture();
  const input = {
    scenario: '없는 승인 API 뒤 원본을 조회하고 없는 알림을 수행합니다.',
    materials: [original.materials[0]],
    gaps: [
      {
        id: 'approval',
        stage: 'api-selection',
        description: '승인 API가 제공되지 않았습니다.',
      },
    ],
  };
  const proposal = {
    edges: [
      { from: 'approval', output: 'main', to: 'source', input: 'main' },
      { from: 'source', output: 'main', to: 'notification', input: 'main' },
    ],
    additionalGaps: [
      { id: 'notification', description: '알림 기능이 제공되지 않았습니다.' },
    ],
    blockedCalls: [{ callId: 'source', gapIds: ['approval'] }],
  };
  const result = await planWorkflowConnections({
    ...input,
    model: connectionPlanningModel(explainConnections(proposal)),
    includeExplanations: true,
  });
  assert.equal(result.gaps.length, 2);
  assert.deepEqual(result.blockedCalls, proposal.blockedCalls);
  assert.ok(result.connectionPlanning.decision.blockedCalls[0].reason);
  assert.equal(result.connectionPlanning.verification.contracts.length, 3);
  validateWorkflowConnectionPlanningRecord({
    ...input,
    plan: result,
    record: result.connectionPlanning,
  });
});

test('wrong/missing reasons and extra execution fields fail without a second call or output repair', async () => {
  const { input, proposal } = connectionPlanningFixture();
  const samples = [];
  for (const change of [
    (o) => {
      delete o.reason;
    },
    (o) => {
      o.reason = ' ';
    },
    (o) => {
      delete o.edges[0].reason;
    },
    (o) => {
      o.edges[0].reason = 42;
    },
    (o) => {
      o.starts = ['source'];
    },
    (o) => {
      o.nativeNodes = [];
    },
    (o) => {
      o.evidence = {};
    },
  ]) {
    const output = explainConnections(proposal);
    change(output);
    samples.push(output);
  }
  for (const output of samples) {
    const model = connectionPlanningModel(output);
    await assert.rejects(
      planWorkflowConnections({ ...input, model, includeExplanations: true }),
      (e) => {
        assert.equal(e.failure.stage, 'proposal-schema');
        assert.deepEqual(e.failure.output, output);
        return true;
      },
    );
    assert.equal(model.calls, 1);
  }
  await assert.rejects(
    planWorkflowConnections({
      ...input,
      model: connectionPlanningModel(explainConnections(proposal)),
    }),
    (e) => e.failure.stage === 'proposal-schema',
  );
});

test('duplicate fixed edges, undeclared ports and missing mandatory producers still fail the full DAG checks with original model output', async () => {
  const { input, proposal } = connectionPlanningFixture();
  for (const change of [
    (o) => o.edges.push({ ...input.edges[0], reason: '고정 연결 중복' }),
    (o) => {
      o.edges[0].output = 'invented';
    },
    (o) => {
      o.edges = [];
    },
    (o) =>
      o.edges.push({
        from: 'summary',
        output: 'main',
        to: 'source',
        input: 'main',
        reason: 'cycle',
      }),
  ]) {
    const output = explainConnections(proposal);
    change(output);
    await assert.rejects(
      planWorkflowConnections({
        ...input,
        model: connectionPlanningModel(output),
        includeExplanations: true,
      }),
      (e) => {
        assert.equal(e.failure.stage, 'graph-validation');
        assert.deepEqual(e.failure.output, output);
        assert.ok(e.cause);
        return true;
      },
    );
  }
});

test('malformed required source data fails before a model call, never becoming a default inventory or value', async () => {
  for (const mutate of [
    (i) => {
      i.scenario = ' ';
    },
    (i) => {
      i.materials = null;
    },
    (i) => {
      i.capabilities = null;
    },
    (i) => {
      i.materials[0].status = 'other';
    },
    (i) => {
      delete i.materials[0].arguments.values;
    },
    (i) => {
      i.materials[0].operation = {};
    },
    (i) => {
      i.materials[0] = {
        status: 'blocked',
        callId: 'source',
        operation: i.materials[0].operation,
        bindings: [],
        gapIds: ['missing'],
      };
    },
    (i) => {
      i.includeExplanations = 'yes';
    },
  ]) {
    const { input, proposal } = connectionPlanningFixture();
    mutate(input);
    const model = connectionPlanningModel(proposal);
    await assert.rejects(planWorkflowConnections({ ...input, model }));
    assert.equal(model.calls, 0);
  }
});

test('caller mutations while awaiting a model cannot replace captured roles, OAS, arguments, fixed edges or native parameters', async () => {
  const { input, proposal, plan } = connectionPlanningFixture();
  const snapshot = describeWorkflowConnectionPlanning(input).input;
  const model = connectionPlanningModel(explainConnections(proposal), () => {
    input.materials[0].purpose = 'changed';
    input.materials[0].operation.operation.summary = 'changed';
    input.materials[0].arguments.values.body = { changed: true };
    input.nativeNodes[0].parameters.numberInputs = 99;
    input.edges[0].from = 'changed';
  });
  const result = await planWorkflowConnections({
    ...input,
    model,
    includeExplanations: true,
  });
  assert.deepEqual(result.connectionPlanning.plan, plan);
  validateWorkflowConnectionPlanningRecord({
    ...snapshot,
    plan: result,
    record: result.connectionPlanning,
  });
  assert.throws(() =>
    validateWorkflowConnectionPlanningRecord({
      ...input,
      plan: result,
      record: result.connectionPlanning,
    }),
  );
});

test('actual implementation callback drift during the model call fails instead of certifying a different contract', async () => {
  const { input: native, nodes } = nativePlanningRecordFixture();
  let drift = false;
  const capability = {
    ...native.capabilities[0],
    outputPorts() {
      return drift ? ['changed'] : ['main'];
    },
  };
  const output = explainConnections({ edges: [], additionalGaps: [] });
  const model = connectionPlanningModel(output, () => {
    drift = true;
  });
  await assert.rejects(
    planWorkflowConnections({
      scenario: '독립 출력',
      capabilities: [capability],
      nativeNodes: [nodes[0]],
      model,
      includeExplanations: true,
    }),
    (e) =>
      e.failure.stage === 'graph-validation' &&
      /source contracts changed/.test(e.cause.message),
  );
});

test('Core records round-trip, reject tampered original sources/receipts/plans and require exact explained edge coverage', () => {
  const { input, proposal } = connectionPlanningFixture();
  const decision = explainConnections(proposal),
    plan = createWorkflowConnectionPlan({ ...input, proposal });
  const record = createWorkflowConnectionPlanningRecord({
    ...input,
    plan,
    decision,
  });
  validateWorkflowConnectionPlanningRecord({
    ...input,
    plan,
    record: JSON.parse(JSON.stringify(record)),
  });
  for (const change of [
    (r) => {
      r.evidence.context.scenario = 'changed';
    },
    (r) => {
      r.evidence.sources.materials[0].purpose = 'changed';
    },
    (r) => {
      r.evidence.sources.materials[0].operation.operation.summary = 'changed';
    },
    (r) => {
      r.verification.contracts[0].outputs = ['changed'];
    },
    (r) => {
      r.plan.starts = [];
    },
    (r) => {
      r.decision.edges.pop();
    },
  ]) {
    const wrong = globalThis.structuredClone(record);
    change(wrong);
    assert.throws(() =>
      validateWorkflowConnectionPlanningRecord({
        ...input,
        plan,
        record: wrong,
      }),
    );
  }
  assert.deepEqual(projectWorkflowConnectionDecision(decision), proposal);
  assert.throws(() =>
    createWorkflowConnectionPlan({ ...input, proposal: decision }),
  );
});

test('OAS/source audit metadata is not forwarded to the model or compiled into official SDK workflow JSON', async () => {
  const { input, proposal } = connectionPlanningFixture();
  for (const m of input.materials)
    m.arguments.literalGeneration = { privateMarker: 'audit-only-marker' };
  const model = connectionPlanningModel(
    explainConnections(proposal),
    ({ context }) =>
      assert.equal(
        JSON.stringify(context).includes('audit-only-marker'),
        false,
      ),
  );
  const plan = await planWorkflowConnections({
    ...input,
    model,
    includeExplanations: true,
  });
  assert.equal(
    JSON.stringify(plan.connectionPlanning.evidence).includes(
      'audit-only-marker',
    ),
    false,
  );
  const names = Object.fromEntries(
    input.materials.map((m) => [
      m.arguments.callId,
      'Request ' + m.arguments.callId,
    ]),
  );
  const compiled = compileReviewableN8nWorkflow({
    id: 'explained-dag',
    name: 'Explained DAG',
    materials: input.materials,
    capabilities: input.capabilities,
    plan,
    apiNodes: input.materials.map((m, index) =>
      createHttpRequestNode({
        ...m,
        baseUrl: 'http://contract.invalid',
        credentialBindings: {},
        apiNodeNames: names,
        position: [300, index * 300],
      }),
    ),
  });
  assert.equal(compiled.status, 'complete');
  assert.equal(
    JSON.stringify(compiled.workflow).includes('connectionPlanning'),
    false,
  );
  assert.equal(
    JSON.stringify(compiled.workflow).includes(
      plan.connectionPlanning.decision.reason,
    ),
    false,
  );
});

test('orchestrateWorkflow forwards the explicit connection explanation option without creating an implicit native registry', async () => {
  const { input } = connectionPlanningFixture();
  const model = connectionPlanningModel(
    explainConnections({ edges: [], additionalGaps: [], blockedCalls: [] }),
  );
  const result = await orchestrateWorkflow({
    workflowId: 'api-only-record',
    scenario: '조회 한 건',
    materials: [input.materials[0]],
    model,
    includeExplanations: true,
  });
  assert.equal(result.connectionPlanning.kind, 'proposed-connections');
  assert.deepEqual(result.starts, ['source']);
  assert.equal(model.calls, 1);
});
