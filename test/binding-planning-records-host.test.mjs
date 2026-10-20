import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { MemorySaver, Command } from '@langchain/langgraph';
import {
  createPlannedWorkflowGenerationGraph,
  createReviewableWorkflowGenerationGraph,
  createConversationalWorkflowGenerationGraph,
} from '@openapi-flow/example-langgraph-workflow';
import {
  clarificationModel,
  clarificationSpec,
} from './fixtures/api-clarification-fixture.mjs';
import {
  bindings,
  capabilities,
  nativeNodes,
  spec,
} from './fixtures/native-output-binding-fixture.mjs';

test('official host factories retain optional binding provenance for review without forwarding it to graph planning or SDK JSON', async () => {
  for (const factory of [
    createPlannedWorkflowGenerationGraph,
    createReviewableWorkflowGenerationGraph,
  ]) {
    for (const enabled of [false, true]) {
      const calls = [];
      let reviewed;
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
                        (x) => x.path === '/detail/{id}',
                      ).candidateId,
                      purpose: '명시된 native id로 상세 조회',
                    },
                  ],
                  gaps: [],
                };
              if (options.name === 'plan_api_bindings') {
                assert.equal(
                  schema.safeParse({
                    calls: [{ callId: input.materials[0].callId, bindings }],
                    gaps: [],
                  }).success,
                  !enabled,
                );
                return {
                  calls: [
                    {
                      callId: input.materials[0].callId,
                      bindings,
                      ...(enabled
                        ? { reason: 'audit-only-reason-marker' }
                        : {}),
                    },
                  ],
                  gaps: [],
                };
              }
              assert.equal(
                JSON.stringify(input).includes('audit-only-reason-marker'),
                false,
              );
              assert.equal(Object.hasOwn(input, 'bindingPlanning'), false);
              const edges = [
                {
                  from: 'context',
                  output: 'main',
                  to: input.materials[0].arguments.callId,
                  input: 'main',
                },
              ];
              if (options.name === 'plan_workflow_graph')
                return {
                  additionalNativeNodes: [],
                  edges,
                  gaps: [],
                };
              if (options.name === 'plan_reviewable_workflow_graph')
                return {
                  additionalNativeNodes: [],
                  edges,
                  additionalGaps: [],
                  blockedCalls: [],
                };
              throw new Error('Unexpected model stage ' + options.name);
            },
          };
        },
      };
      const result = await factory({
        model,
        capabilities,
        preparedNativeNodes: nativeNodes,
        bindingOptions: { includeExplanations: enabled },
        reviewBindings: (p) => {
          reviewed = p;
        },
        deployments: [
          { documentId: 'fixture', baseUrl: 'https://fixture.test' },
        ],
      }).invoke({
        workflowId: 'binding-audit-host',
        workflowName: 'Binding provenance host',
        scenario: '원래 native context id로 상세를 조회해줘.',
        sources: [{ id: 'fixture', spec }],
        trace: [],
      });
      assert.equal(calls.length, 3);
      assert.equal(calls.includes('generate_api_arguments'), false);
      assert.equal(Object.hasOwn(reviewed, 'bindingPlanning'), enabled);
      assert.deepEqual(result.bindingPlan, reviewed);
      assert.equal(
        JSON.stringify(result.workflow).includes('bindingPlanning'),
        false,
      );
      assert.equal(
        JSON.stringify(result.workflow).includes('audit-only-reason-marker'),
        false,
      );
    }
  }
});

test('a checkpointed request-input conversation retains the original binding decision without replay or attributing a later human value to it', async () => {
  for (const enabled of [false, true]) {
    const fixture = clarificationModel();
    const model = {
      withStructuredOutput(schema, config) {
        const handler = fixture.withStructuredOutput(schema, config);
        return {
          async invoke(messages) {
            const proposal = await handler.invoke(messages);
            if (config.name === 'plan_api_bindings' && enabled)
              return {
                ...proposal,
                calls: proposal.calls.map((call) => ({
                  ...call,
                  reason: 'audit-only-conversation-reason',
                })),
              };
            if (config.name === 'plan_workflow_connections')
              assert.equal(
                JSON.stringify(messages).includes(
                  'audit-only-conversation-reason',
                ),
                false,
              );
            return proposal;
          },
        };
      },
    };
    const graph = createConversationalWorkflowGenerationGraph({
      model,
      checkpointer: new MemorySaver(),
      bindingOptions: { includeExplanations: enabled },
    });
    const config = { configurable: { thread_id: randomUUID() } };
    const paused = await graph.invoke(
      {
        workflowId: 'binding-conversation',
        workflowName: 'Member workflow',
        scenario: '회원 간단 정보를 조회해줘.',
        sources: [{ id: 'members', spec: clarificationSpec }],
        trace: [],
      },
      config,
    );
    assert.equal(paused.conversationStatus, 'awaiting-input');
    assert.equal(Object.hasOwn(paused.bindingPlan, 'bindingPlanning'), enabled);
    const original = globalThis.structuredClone(paused.bindingPlan),
      count = fixture.calls.length;
    const requirement = paused.__interrupt__[0].value.questions[0];
    const complete = await graph.invoke(
      new Command({
        resume: {
          action: 'answer',
          answers: [
            { requirementId: requirement.id, value: 'human-member-value' },
          ],
        },
      }),
      config,
    );
    assert.equal(complete.conversationStatus, 'complete');
    assert.deepEqual(complete.bindingPlan, original);
    assert.equal(fixture.calls.length, count + 1);
    assert.equal(
      fixture.calls.filter((x) => x.name === 'plan_api_bindings').length,
      1,
    );
    assert.equal(
      JSON.stringify(complete.bindingPlan).includes('human-member-value'),
      false,
    );
    assert.equal(
      complete.reviewMaterials[0].arguments.values.path.id,
      'human-member-value',
    );
    assert.equal(
      JSON.stringify(complete.workflow).includes(
        'audit-only-conversation-reason',
      ),
      false,
    );
  }
});
