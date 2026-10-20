import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeWorkflowDraftEdit,
  WorkflowDraftEditPlanningError,
} from '@openapi-flow/langchain';
import { capabilityGapFixture } from './fixtures/workflow-draft-capability-gap-fixture.mjs';

test('the same bounded semantic call selects a real contract-gap candidate; IDs, inventory and source text stay code-owned', async () => {
  const f = await capabilityGapFixture();
  const calls = [];
  const model = {
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          const payload = JSON.parse(messages[1].content);
          calls.push({ payload, schema, options, messages });
          const candidate = payload.candidates.find(
            (candidate) => candidate.operation.path === f.operation.path,
          );
          return {
            decisions: [
              {
                kind: 'report-capability-gap',
                finding: {
                  kind: 'api-contract-gap',
                  operation: candidate.candidateId,
                  reason:
                    '제공된 작업의 응답 계약에 요청한 이력 정보가 없습니다.',
                },
                instruction: '변경 이력 조회',
                sources: [{ kind: 'message', messageId: 'gap-request' }],
              },
            ],
          };
        },
      };
    },
  };
  const plan = await analyzeWorkflowDraftEdit({
    draft: f.draft,
    context: f.context,
    requestMessageIds: ['gap-request'],
    options: { includeExplanations: false },
    model,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.name, 'analyze_workflow_draft_edit');
  assert.equal(calls[0].options.strict, true);
  assert.equal(calls[0].messages[0].getType(), 'system');
  assert.equal(calls[0].messages[1].getType(), 'human');
  assert.deepEqual(plan.steps[0].decision.finding.operation, f.operation.key);
  assert.deepEqual(plan.steps[0].decision.sources, [
    {
      kind: 'message',
      messageId: 'gap-request',
      quote: f.context.messages[0].text,
    },
  ]);
  assert.ok(plan.steps[0].newNodeId);
});

test('unknown contract-gap candidates and model-generated inventory or output schemas fail without another call', async () => {
  for (const mode of ['candidate', 'inventory', 'schema']) {
    const f = await capabilityGapFixture();
    let calls = 0;
    const model = {
      withStructuredOutput() {
        return {
          async invoke() {
            calls++;
            return {
              decisions: [
                {
                  kind: 'report-capability-gap',
                  instruction: '이력 조회',
                  sources: [{ kind: 'message', messageId: 'gap-request' }],
                  finding:
                    mode === 'candidate'
                      ? {
                          kind: 'api-contract-gap',
                          operation: 'invented-candidate',
                          reason: '실제 후보가 아님',
                        }
                      : {
                          ...f.finding,
                          ...(mode === 'inventory'
                            ? { inventory: [] }
                            : { responseSchema: { type: 'object' } }),
                        },
                },
              ],
            };
          },
        };
      },
    };
    await assert.rejects(
      analyzeWorkflowDraftEdit({
        draft: f.draft,
        context: f.context,
        requestMessageIds: ['gap-request'],
        options: { includeExplanations: false },
        model,
      }),
      (error) =>
        error instanceof WorkflowDraftEditPlanningError &&
        error.failure.stage === 'proposal-schema',
    );
    assert.equal(calls, 1);
    assert.equal(f.draft.gapNodes, undefined);
  }
});
