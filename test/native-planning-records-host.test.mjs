import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { MemorySaver, Command } from '@langchain/langgraph';
import {
  createApiCatalog,
  listApiOperations,
  resolveApiOperations,
} from '@openapi-flow/core';
import {
  createOrchestratedWorkflowGenerationGraph,
  createConversationalWorkflowGenerationGraph,
} from '@openapi-flow/example-langgraph-workflow';
import { nativePlanningRecordFixture } from './fixtures/native-planning-record-fixture.mjs';
import {
  clarificationSpec,
  clarificationModel,
} from './fixtures/api-clarification-fixture.mjs';

test('an explicit empty OAS inventory is a real empty catalog, while missing/malformed source data still fails', async () => {
  const catalog = await createApiCatalog([]);
  assert.deepEqual(catalog, { documents: [], operations: [] });
  assert.deepEqual(listApiOperations(catalog), []);
  assert.deepEqual(await resolveApiOperations(catalog, []), []);
  await assert.rejects(createApiCatalog(undefined), /sources must be an array/);
  await assert.rejects(
    createApiCatalog([{ id: 'missing-spec' }]),
    /spec is invalid/,
  );
});

test('native-only host factories propagate explanation options and retain records without leaking them into connection planning or SDK JSON', async () => {
  for (const enabled of [false, true])
    for (const preparedCount of [0, 1, 2])
      for (const factory of [
        createOrchestratedWorkflowGenerationGraph,
        createConversationalWorkflowGenerationGraph,
      ]) {
        const { input, nodes } = nativePlanningRecordFixture();
        const calls = [];
        const model = {
          withStructuredOutput(schema, options) {
            return {
              async invoke(messages) {
                calls.push(options.name);
                const payload = JSON.parse(messages[1].content);
                if (options.name === 'plan_native_nodes')
                  return enabled
                    ? {
                        decision:
                          preparedCount === 2
                            ? {
                                noAdditionalNodesReason:
                                  'native-audit-only-reason',
                                gaps: [],
                              }
                            : {
                                additions: nodes
                                  .slice(preparedCount)
                                  .map((node) => ({
                                    node,
                                    reason: 'native-audit-only-reason',
                                  })),
                                gaps: [],
                              },
                      }
                    : { nativeNodes: nodes.slice(preparedCount), gaps: [] };
                assert.equal(
                  JSON.stringify(payload).includes('native-audit-only-reason'),
                  false,
                );
                assert.equal(
                  JSON.stringify(payload).includes('nativePlanning'),
                  false,
                );
                if (options.name === 'plan_workflow_connections')
                  return { edges: [], additionalGaps: [] };
                throw new Error('Unexpected model stage ' + options.name);
              },
            };
          },
        };
        const deps = {
          model,
          capabilities: input.capabilities,
          preparedNativeNodes: nodes.slice(0, preparedCount),
          nativeOptions: { includeExplanations: enabled },
          ...(factory === createConversationalWorkflowGenerationGraph
            ? { checkpointer: new MemorySaver() }
            : {}),
        };
        const state = await factory(deps).invoke(
          {
            workflowId: 'native-record-host',
            workflowName: 'Native-only records',
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
        assert.equal(
          Object.hasOwn(state.nativePlan.proposal, 'nativePlanning'),
          enabled,
        );
        assert.deepEqual(state.nativePlan.nativeNodes, nodes);
        assert.deepEqual(
          state.nativePlan.proposal.nativeNodes,
          nodes.slice(preparedCount),
        );
        assert.equal(
          JSON.stringify(state.workflow).includes('native-audit-only-reason'),
          false,
        );
        const originalProposal = globalThis.structuredClone(
          state.nativePlan.proposal,
        );
        state.nativePlan.nativeNodes[0].parameters.count = 99;
        assert.deepEqual(state.nativePlan.proposal, originalProposal);
        assert.equal(
          JSON.stringify(state.workflow).includes('nativePlanning'),
          false,
        );
      }
});

test('a request-input interrupt preserves native provenance and never replays native selection on a human answer', async () => {
  const { input, nodes } = nativePlanningRecordFixture();
  const base = clarificationModel();
  const nativeCalls = [];
  const model = {
    withStructuredOutput(schema, options) {
      if (options.name === 'plan_native_nodes')
        return {
          async invoke() {
            nativeCalls.push(options.name);
            return {
              decision: {
                additions: [
                  { node: nodes[0], reason: 'native-audit-only-reason' },
                ],
                gaps: [],
              },
            };
          },
        };
      const handler = base.withStructuredOutput(schema, options);
      return {
        async invoke(messages) {
          assert.equal(
            JSON.stringify(messages).includes('native-audit-only-reason'),
            false,
          );
          return handler.invoke(messages);
        },
      };
    },
  };
  const graph = createConversationalWorkflowGenerationGraph({
    model,
    checkpointer: new MemorySaver(),
    capabilities: input.capabilities,
    nativeOptions: { includeExplanations: true },
  });
  const config = { configurable: { thread_id: randomUUID() } };
  const paused = await graph.invoke(
    {
      workflowId: 'native-record-conversation',
      workflowName: 'Member plus explicit native material',
      scenario:
        '회원 간단 정보를 조회하고 명시한 JSON도 별도로 출력해줘. ' +
        JSON.stringify(nodes[0].parameters),
      sources: [{ id: 'members', spec: clarificationSpec }],
      trace: [],
    },
    config,
  );
  assert.equal(paused.conversationStatus, 'awaiting-input');
  const before = globalThis.structuredClone(paused.nativePlan),
    count = base.calls.length;
  const requirement = paused.__interrupt__[0].value.questions[0];
  const complete = await graph.invoke(
    new Command({
      resume: {
        action: 'answer',
        answers: [{ requirementId: requirement.id, value: 'human-member-id' }],
      },
    }),
    config,
  );
  assert.equal(complete.conversationStatus, 'complete');
  assert.deepEqual(complete.nativePlan, before);
  assert.equal(nativeCalls.length, 1);
  assert.equal(base.calls.length, count + 1);
  assert.equal(
    JSON.stringify(complete.nativePlan).includes('human-member-id'),
    false,
  );
  assert.equal(
    complete.reviewMaterials[0].arguments.values.path.id,
    'human-member-id',
  );
  assert.equal(
    JSON.stringify(complete.workflow).includes('native-audit-only-reason'),
    false,
  );
});
