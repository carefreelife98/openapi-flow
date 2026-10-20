import assert from 'node:assert/strict';
import test from 'node:test';
import {
  planWorkflowGraph,
  planReviewableWorkflowGraph,
} from '@openapi-flow/langchain';
import {
  describeWorkflowGraphPlanning,
  createWorkflowGraphPlanningResult,
  createWorkflowGraphPlanningRecord,
  validateWorkflowGraphPlanningRecord,
} from '@openapi-flow/core';
import {
  compilePlannedN8nWorkflow,
  compileReviewableN8nWorkflow,
  createHttpRequestNode,
} from '@openapi-flow/n8n';
import {
  graphPlanningFixture,
  explainGraphOutput,
  graphModelAssessment,
  graphPlannerInput,
  graphPlanningModel,
} from './fixtures/graph-planning-record-fixture.mjs';
import { nativePlanningRecordFixture } from './fixtures/native-planning-record-fixture.mjs';
import {
  graphMaterial,
  nativeNodes,
  capabilities,
  plan as nativePlan,
} from './fixtures/native-output-binding-fixture.mjs';

const invoke = (input, model, enabled) =>
  (input.mode === 'reviewable'
    ? planReviewableWorkflowGraph
    : planWorkflowGraph)({
    ...graphPlannerInput(input),
    model,
    includeExplanations: enabled,
  });

test('both combined planners optionally explain each actual native instance and edge without regenerating fixed data or source evidence', async () => {
  for (const mode of ['executable', 'reviewable'])
    for (const enabled of [false, true]) {
      const { input, output, plan } = graphPlanningFixture(mode);
      const model = graphPlanningModel(
        enabled ? explainGraphOutput(output) : output,
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
          assert.deepEqual(
            context.materials.map((m) => m.purpose),
            input.materials.map((m) => m.purpose),
          );
          assert.equal(
            Object.hasOwn(context.materials[0].operation, 'pathItem'),
            false,
          );
          assert.equal(Object.hasOwn(context, 'graphPlanning'), false);
        },
      );
      const result = await invoke(input, model, enabled),
        { graphPlanning, ...actual } = result;
      assert.deepEqual(actual, plan);
      assert.equal(model.calls, 1);
      assert.equal(Object.hasOwn(result, 'graphPlanning'), enabled);
      if (enabled) {
        assert.equal(graphPlanning.kind, mode);
        assert.deepEqual(
          graphPlanning.proposal,
          input.mode === 'executable'
            ? { mode, ...output }
            : { mode, ...output },
        );
        assert.deepEqual(
          graphPlanning.assessment,
          graphModelAssessment(explainGraphOutput(output)),
        );
        assert.equal(graphPlanning.verification.status, 'validated');
        validateWorkflowGraphPlanningRecord({
          ...input,
          plan: result,
          record: JSON.parse(JSON.stringify(graphPlanning)),
        });
      }
    }
});

test('native producers that will be generated are not rejected by the prepared-only connection boundary', async () => {
  for (const mode of ['executable', 'reviewable']) {
    const input = {
      mode,
      scenario: '명시한 native ID를 상세 API에 그대로 전달합니다.',
      materials: [{ ...graphMaterial, status: 'ready' }],
      capabilities,
      preparedNativeNodes: [],
      gaps: [],
    };
    const output = {
      additionalNativeNodes: nativeNodes,
      edges: nativePlan.edges,
      ...(mode === 'reviewable'
        ? { additionalGaps: [], blockedCalls: [] }
        : { gaps: [] }),
    };
    const result = await invoke(
      input,
      graphPlanningModel(explainGraphOutput(output)),
      true,
    );
    assert.deepEqual(result.nativeNodes, nativeNodes);
    assert.deepEqual(result.edges, nativePlan.edges);
    assert.deepEqual(result.starts, ['context']);
    validateWorkflowGraphPlanningRecord({
      ...input,
      plan: result,
      record: result.graphPlanning,
    });
  }
});

test('prepared native identities and values remain fixed while only real additions receive reasons', async () => {
  for (const mode of ['executable', 'reviewable']) {
    const input = {
      mode,
      scenario: '기존 context를 바꾸지 않고 detail을 호출합니다.',
      materials: [{ ...graphMaterial, status: 'ready' }],
      capabilities,
      preparedNativeNodes: nativeNodes,
      gaps: [],
    };
    const output = {
      additionalNativeNodes: [],
      edges: nativePlan.edges,
      ...(mode === 'reviewable'
        ? { additionalGaps: [], blockedCalls: [] }
        : { gaps: [] }),
    };
    const result = await invoke(
      input,
      graphPlanningModel(explainGraphOutput(output)),
      true,
    );
    assert.deepEqual(result.graphPlanning.assessment.nodes, []);
    assert.deepEqual(result.nativeNodes, nativeNodes);
    const duplicate = explainGraphOutput({
      ...output,
      additionalNativeNodes: nativeNodes,
    });
    await assert.rejects(
      invoke(input, graphPlanningModel(duplicate), true),
      (error) =>
        error.failure.stage === 'graph-validation' &&
        /duplicates preparedNativeNodes/.test(error.cause.message),
    );
  }
});

test('an explicitly empty native registry supports API-only graph planning and omits the impossible addition field', async () => {
  for (const mode of ['executable', 'reviewable']) {
    const { input } = graphPlanningFixture(mode);
    input.materials = input.materials.slice(0, 1);
    input.capabilities = [];
    const output = {
      edges: [],
      ...(mode === 'reviewable'
        ? { additionalGaps: [], blockedCalls: [] }
        : { gaps: [] }),
    };
    const model = graphPlanningModel(explainGraphOutput(output), ({ schema }) =>
      assert.equal(
        Object.hasOwn(schema.properties, 'additionalNativeNodes'),
        false,
      ),
    );
    const result = await invoke(input, model, true);
    assert.deepEqual(result.nativeNodes, []);
    assert.deepEqual(result.starts, ['source']);
    assert.deepEqual(result.graphPlanning.assessment.nodes, []);
    await assert.rejects(
      invoke(
        input,
        graphPlanningModel({
          ...explainGraphOutput(output),
          additionalNativeNodes: [],
        }),
        true,
      ),
      (error) => error.failure.stage === 'proposal-schema',
    );
  }
});

test('native-only combined graph planning derives independent roots and retains typed values without fake OAS', async () => {
  for (const mode of ['executable', 'reviewable']) {
    const { input: native, nodes } = nativePlanningRecordFixture();
    const input = {
      mode,
      scenario: native.scenario,
      materials: [],
      capabilities: native.capabilities,
      gaps: [],
    };
    const output = {
      additionalNativeNodes: nodes,
      edges: [],
      ...(mode === 'reviewable' ? { additionalGaps: [] } : { gaps: [] }),
    };
    const result = await invoke(
      input,
      graphPlanningModel(explainGraphOutput(output)),
      true,
    );
    assert.deepEqual(
      result.starts,
      nodes.map((n) => n.id),
    );
    assert.deepEqual(result.nativeNodes, nodes);
    validateWorkflowGraphPlanningRecord({
      ...input,
      plan: result,
      record: JSON.parse(JSON.stringify(result.graphPlanning)),
    });
  }
});

test('missing/whitespace reasons and extra model-owned roots/metadata fail unchanged without retry or repair', async () => {
  for (const mode of ['executable', 'reviewable'])
    for (const change of [
      (o) => {
        delete o.reason;
      },
      (o) => {
        o.reason = ' ';
      },
      (o) => {
        delete o.additionalNativeNodes[0].reason;
      },
      (o) => {
        delete o.edges[0].reason;
      },
      (o) => {
        o.starts = ['source'];
      },
      (o) => {
        o.evidence = {};
      },
    ]) {
      const { input, output } = graphPlanningFixture(mode),
        wrong = explainGraphOutput(output);
      change(wrong);
      const model = graphPlanningModel(wrong);
      await assert.rejects(invoke(input, model, true), (error) => {
        assert.equal(error.failure.stage, 'proposal-schema');
        assert.deepEqual(error.failure.output, wrong);
        return true;
      });
      assert.equal(model.calls, 1);
    }
});

test('DAG failures retain original reason-bearing model outputs and never become successful explanations', async () => {
  for (const mode of ['executable', 'reviewable'])
    for (const change of [
      (o) => {
        o.edges[0].output = 'invented';
      },
      (o) => {
        o.edges = [];
      },
      (o) => {
        o.edges.push({ ...o.edges[0] });
      },
      (o) => {
        o.edges.push({
          from: 'summary',
          output: 'main',
          to: 'source',
          input: 'main',
          reason: 'cycle',
        });
      },
    ]) {
      const { input, output } = graphPlanningFixture(mode),
        wrong = explainGraphOutput(output);
      change(wrong);
      await assert.rejects(
        invoke(input, graphPlanningModel(wrong), true),
        (error) => {
          assert.equal(error.failure.stage, 'graph-validation');
          assert.deepEqual(error.failure.output, wrong);
          assert.ok(error.cause);
          return true;
        },
      );
    }
});

test('caller mutation during a combined invocation cannot replace original OAS, roles, values or prepared parameters', async () => {
  for (const mode of ['executable', 'reviewable']) {
    const { input, output, plan } = graphPlanningFixture(mode),
      snapshot = describeWorkflowGraphPlanning(input).input;
    const model = graphPlanningModel(explainGraphOutput(output), () => {
      input.materials[0].purpose = 'changed';
      input.materials[0].operation.operation.summary = 'changed';
      input.materials[0].arguments.values.body = { changed: true };
    });
    const result = await invoke(input, model, true);
    assert.deepEqual(result.graphPlanning.plan, plan);
    validateWorkflowGraphPlanningRecord({
      ...snapshot,
      plan: result,
      record: result.graphPlanning,
    });
    assert.throws(() =>
      validateWorkflowGraphPlanningRecord({
        ...input,
        plan: result,
        record: result.graphPlanning,
      }),
    );
  }
});

test('invalid supplied inventories and required OAS request data fail before paying for a combined graph call', async () => {
  for (const mode of ['executable', 'reviewable'])
    for (const mutate of [
      (i) => {
        i.capabilities = null;
      },
      (i) => {
        i.materials = null;
      },
      (i) => {
        i.scenario = ' ';
      },
      (i) => {
        i.materials[0].arguments.values.body = 42;
      },
      (i) => {
        delete i.materials[0].arguments.values;
      },
      (i) => {
        i.materials[0].operation = {};
      },
    ]) {
      const { input, output } = graphPlanningFixture(mode);
      mutate(input);
      const model = graphPlanningModel(output);
      const args =
        input.materials === null
          ? { ...input, model }
          : { ...graphPlannerInput(input), model };
      await assert.rejects(
        (mode === 'reviewable'
          ? planReviewableWorkflowGraph
          : planWorkflowGraph)(args),
      );
      assert.equal(model.calls, 0);
    }
});

test('record reconstruction validates exact reason coverage, source receipts, mode and derived graph without authenticating model prose', () => {
  for (const mode of ['executable', 'reviewable']) {
    const { input, proposal, output } = graphPlanningFixture(mode),
      plan = createWorkflowGraphPlanningResult({ ...input, proposal });
    const record = createWorkflowGraphPlanningRecord({
      ...input,
      proposal,
      plan,
      assessment: graphModelAssessment(explainGraphOutput(output)),
    });
    validateWorkflowGraphPlanningRecord({
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
        r.proposal.edges.pop();
      },
      (r) => {
        r.plan.starts = [];
      },
      (r) => {
        r.assessment.nodes = [];
      },
      (r) => {
        r.verification.contracts = [];
      },
    ]) {
      const wrong = globalThis.structuredClone(record);
      change(wrong);
      assert.throws(() =>
        validateWorkflowGraphPlanningRecord({ ...input, plan, record: wrong }),
      );
    }
  }
});

test('legacy executable gap reports remain visibly unvalidated rather than receiving false DAG receipts', async () => {
  const { input, output } = graphPlanningFixture();
  output.gaps = [{ description: '요청한 추가 API가 없습니다.' }];
  const result = await invoke(
    input,
    graphPlanningModel(explainGraphOutput(output)),
    true,
  );
  assert.deepEqual(result.starts, []);
  assert.deepEqual(result.graphPlanning.verification, {
    status: 'needs-review',
  });
  validateWorkflowGraphPlanningRecord({
    ...input,
    plan: result,
    record: result.graphPlanning,
  });
});

test('reviewable graph reasons retain new blocked calls and supplied/additional gap identities', async () => {
  const { input } = graphPlanningFixture('reviewable');
  input.materials = input.materials.slice(0, 1);
  input.capabilities = [];
  input.gaps = [
    { id: 'missing', stage: 'api-selection', description: '선행 API 없음' },
  ];
  const output = {
    edges: [{ from: 'missing', output: 'main', to: 'source', input: 'main' }],
    additionalGaps: [],
    blockedCalls: [{ callId: 'source', gapIds: ['missing'] }],
  };
  const result = await invoke(
    input,
    graphPlanningModel(explainGraphOutput(output)),
    true,
  );
  assert.deepEqual(result.blockedCalls, output.blockedCalls);
  assert.equal(result.graphPlanning.verification.status, 'validated');
  assert.equal(result.graphPlanning.assessment.blockedCalls.length, 1);
});

test('SDK compilation keeps reasons/receipts separate and cannot mutate historical model decisions', async () => {
  for (const mode of ['executable', 'reviewable']) {
    const { input, output } = graphPlanningFixture(mode),
      plan = await invoke(
        input,
        graphPlanningModel(explainGraphOutput(output)),
        true,
      );
    const names = Object.fromEntries(
      input.materials.map((m) => [
        m.arguments.callId,
        'Request ' + m.arguments.callId,
      ]),
    );
    const material = input.materials.map(({ status, ...m }) => {
      assert.equal(status, 'ready');
      return m;
    });
    const compiled = (
      mode === 'reviewable'
        ? compileReviewableN8nWorkflow
        : compilePlannedN8nWorkflow
    )({
      id: 'graph-reasons',
      name: 'Graph reasons',
      plan,
      materials: mode === 'reviewable' ? input.materials : material,
      capabilities: input.capabilities,
      apiNodes: material.map((m, index) =>
        createHttpRequestNode({
          ...m,
          baseUrl: 'http://contract.invalid',
          credentialBindings: {},
          apiNodeNames: names,
          position: [300, index * 300],
        }),
      ),
    });
    assert.equal(
      JSON.stringify(compiled.workflow).includes('graphPlanning'),
      false,
    );
    assert.equal(
      JSON.stringify(compiled.workflow).includes(
        plan.graphPlanning.assessment.reason,
      ),
      false,
    );
    const before = globalThis.structuredClone(plan.graphPlanning);
    plan.nativeNodes[0].parameters.numberInputs = 99;
    assert.deepEqual(plan.graphPlanning, before);
  }
});
