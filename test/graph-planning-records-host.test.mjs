import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPlannedWorkflowGenerationGraph,
  createReviewableWorkflowGenerationGraph,
} from '@openapi-flow/example-langgraph-workflow';
import {
  capabilities,
  nativeNodes,
  bindings,
  spec,
} from './fixtures/native-output-binding-fixture.mjs';
import { explainGraphOutput } from './fixtures/graph-planning-record-fixture.mjs';

test('both combined host factories retain graph explanation options in state and review callbacks while excluding them from SDK workflow JSON', async () => {
  for (const factory of [
    createPlannedWorkflowGenerationGraph,
    createReviewableWorkflowGenerationGraph,
  ])
    for (const enabled of [false, true]) {
      const calls = [],
        reviews = [];
      const model = {
        withStructuredOutput(schema, options) {
          return {
            async invoke(messages) {
              calls.push(options.name);
              const input = JSON.parse(messages[1].content);
              if (options.name === 'select_api_operations')
                return {
                  operations: [
                    {
                      candidateId: input.candidates.find(
                        (c) => c.path === '/detail/{id}',
                      ).candidateId,
                      purpose: '주어진 native ID로 상세를 조회합니다.',
                    },
                  ],
                  gaps: [],
                };
              if (options.name === 'plan_api_bindings')
                return {
                  calls: [{ callId: input.materials[0].callId, bindings }],
                  gaps: [],
                };
              const output = {
                additionalNativeNodes: [],
                edges: [
                  {
                    from: 'context',
                    output: 'main',
                    to: input.materials[0].arguments.callId,
                    input: 'main',
                  },
                ],
                ...(options.name === 'plan_workflow_graph'
                  ? { gaps: [] }
                  : { additionalGaps: [], blockedCalls: [] }),
              };
              assert.ok(
                [
                  'plan_workflow_graph',
                  'plan_reviewable_workflow_graph',
                ].includes(options.name),
              );
              return enabled ? explainGraphOutput(output) : output;
            },
          };
        },
      };
      const state = await factory({
        model,
        capabilities,
        preparedNativeNodes: nativeNodes,
        graphOptions: { includeExplanations: enabled },
        reviewPlan(plan) {
          reviews.push(plan);
        },
        deployments: [
          { documentId: 'fixture', baseUrl: 'http://contract.invalid' },
        ],
      }).invoke({
        workflowId: 'combined-reasons-host',
        workflowName: 'Combined graph review',
        scenario: '기존 context ID로 상세를 조회합니다.',
        sources: [{ id: 'fixture', spec }],
        trace: [],
      });
      assert.equal(calls.length, 3);
      assert.equal(calls.includes('generate_api_arguments'), false);
      assert.equal(reviews.length, 1);
      const plan =
        state.graphPlan === undefined ? state.reviewPlan : state.graphPlan;
      assert.equal(Object.hasOwn(plan, 'graphPlanning'), enabled);
      assert.equal(Object.hasOwn(reviews[0], 'graphPlanning'), enabled);
      assert.equal(
        JSON.stringify(state.workflow).includes('graphPlanning'),
        false,
      );
      if (enabled) {
        assert.deepEqual(plan.graphPlanning.assessment.nodes, []);
        assert.equal(
          JSON.stringify(state.workflow).includes(
            plan.graphPlanning.assessment.reason,
          ),
          false,
        );
      }
    }
});

test('observable implementation contract drift during either combined invocation fails instead of certifying replacement ports', async () => {
  const { planWorkflowGraph, planReviewableWorkflowGraph } =
    await import('@openapi-flow/langchain');
  for (const reviewable of [false, true]) {
    let changed = false;
    const registered = capabilities.map((c) =>
      c.name === 'request-context'
        ? {
            ...c,
            outputPorts() {
              return changed ? ['changed'] : ['main'];
            },
          }
        : c,
    );
    const model = {
      withStructuredOutput() {
        return {
          async invoke() {
            changed = true;
            return {
              reason: '기존 context를 연결합니다.',
              additionalNativeNodes: [],
              edges: [],
              ...(reviewable
                ? { additionalGaps: [], blockedCalls: [] }
                : { gaps: [] }),
            };
          },
        };
      },
    };
    const { graphMaterial } =
      await import('./fixtures/native-output-binding-fixture.mjs');
    await assert.rejects(
      (reviewable ? planReviewableWorkflowGraph : planWorkflowGraph)({
        scenario: 'context 사용',
        model,
        includeExplanations: true,
        capabilities: registered,
        preparedNativeNodes: nativeNodes,
        materials: [
          { ...graphMaterial, ...(reviewable ? { status: 'ready' } : {}) },
        ],
        ...(reviewable ? { gaps: [] } : {}),
      }),
      (error) =>
        error.failure.stage === 'graph-validation' &&
        /source contracts changed/.test(error.cause.message),
    );
  }
});
