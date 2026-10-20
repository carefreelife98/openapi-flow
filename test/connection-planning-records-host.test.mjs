import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { MemorySaver, Command } from '@langchain/langgraph';
import {
  createOrchestratedWorkflowGenerationGraph,
  createConversationalWorkflowGenerationGraph,
} from '@openapi-flow/example-langgraph-workflow';
import { nativePlanningRecordFixture } from './fixtures/native-planning-record-fixture.mjs';
import {
  clarificationSpec,
  clarificationModel,
} from './fixtures/api-clarification-fixture.mjs';
import { explainConnections } from './fixtures/connection-planning-record-fixture.mjs';

test('both canonical host factories expose connection explanations only when requested, without leaking them to SDK JSON or changing execution plans', async () => {
  for (const enabled of [false, true])
    for (const factory of [
      createOrchestratedWorkflowGenerationGraph,
      createConversationalWorkflowGenerationGraph,
    ]) {
      const { input, nodes } = nativePlanningRecordFixture();
      const calls = [],
        reviews = [];
      const model = {
        withStructuredOutput(schema, options) {
          return {
            async invoke() {
              calls.push(options.name);
              if (options.name === 'plan_native_nodes')
                return { nativeNodes: nodes, gaps: [] };
              assert.equal(options.name, 'plan_workflow_connections');
              const proposal = { edges: [], additionalGaps: [] };
              return enabled ? explainConnections(proposal) : proposal;
            },
          };
        },
      };
      const state = await factory({
        model,
        capabilities: input.capabilities,
        connectionOptions: { includeExplanations: enabled },
        reviewPlan(plan) {
          reviews.push(plan);
        },
        ...(factory === createConversationalWorkflowGenerationGraph
          ? { checkpointer: new MemorySaver() }
          : {}),
      }).invoke(
        {
          workflowId: 'explained-host',
          workflowName: 'Connection review',
          scenario: input.scenario,
          sources: [],
          trace: [],
        },
        { configurable: { thread_id: randomUUID() } },
      );
      assert.equal(state.status, 'complete');
      assert.deepEqual(calls, [
        'plan_native_nodes',
        'plan_workflow_connections',
      ]);
      assert.equal(reviews.length, 1);
      assert.equal(Object.hasOwn(reviews[0], 'connectionPlanning'), enabled);
      assert.equal(
        Object.hasOwn(state.reviewPlan, 'connectionPlanning'),
        enabled,
      );
      assert.equal(
        JSON.stringify(state.workflow).includes('connectionPlanning'),
        false,
      );
      if (enabled) {
        assert.equal(
          JSON.stringify(state.workflow).includes(
            state.reviewPlan.connectionPlanning.decision.reason,
          ),
          false,
        );
        assert.deepEqual(
          state.reviewPlan.connectionPlanning.plan.starts,
          nodes.map((n) => n.id),
        );
      }
    }
});

test('checkpointed request-input answers reach connection planning once with actual confirmed inputs, without rewriting earlier native decisions', async () => {
  const original = clarificationModel(),
    calls = [];
  const model = {
    withStructuredOutput(schema, options) {
      const handler = original.withStructuredOutput(schema, options);
      return {
        async invoke(messages) {
          calls.push(options.name);
          const result = await handler.invoke(messages);
          return options.name === 'plan_workflow_connections'
            ? explainConnections(result)
            : result;
        },
      };
    },
  };
  const config = { configurable: { thread_id: randomUUID() } };
  const graph = createConversationalWorkflowGenerationGraph({
    model,
    checkpointer: new MemorySaver(),
    connectionOptions: { includeExplanations: true },
  });
  const paused = await graph.invoke(
    {
      workflowId: 'explained-request-resume',
      workflowName: 'Member read',
      scenario: '회원 간단 정보를 조회합니다.',
      sources: [{ id: 'members', spec: clarificationSpec }],
      trace: [],
    },
    config,
  );
  assert.equal(paused.conversationStatus, 'awaiting-input');
  assert.equal(calls.includes('plan_workflow_connections'), false);
  const result = await graph.invoke(
    new Command({
      resume: {
        action: 'answer',
        answers: [
          { requirementId: paused.requirements[0].id, value: 'member-01' },
        ],
      },
    }),
    config,
  );
  assert.equal(result.status, 'complete');
  assert.equal(
    calls.filter((x) => x === 'plan_workflow_connections').length,
    1,
  );
  assert.equal(
    result.reviewPlan.connectionPlanning.evidence.sources.materials[0].arguments
      .values.path.id,
    'member-01',
  );
  assert.equal(
    JSON.stringify(result.workflow).includes('connectionPlanning'),
    false,
  );
});
