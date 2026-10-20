import assert from 'node:assert/strict';
import test from 'node:test';
import { MemorySaver, Command } from '@langchain/langgraph';
import { createConversationalWorkflowGenerationGraph } from '@openapi-flow/example-langgraph-workflow';
import {
  apiSelectionExplanationsFixture,
  apiSelectionExplanationModel,
} from './fixtures/api-selection-explanations-fixture.mjs';

test('the reference host forwards the optional selector setting and exposes exact reasons at the real API-choice interrupt', async () => {
  const { catalog, context } = await apiSelectionExplanationsFixture();
  const model = apiSelectionExplanationModel({
    operations: [],
    gaps: [],
    questions: [
      {
        message: '간단 정보와 상세 정보 중 어떤 범위가 필요한가요?',
        purpose: '회원 조회',
        candidateIds: ['candidate-1', 'candidate-2'],
        explanation: { reason: '조회 범위를 구분할 정보가 없습니다.' },
      },
    ],
  });
  const graph = createConversationalWorkflowGenerationGraph({
    model,
    checkpointer: new MemorySaver(),
    selectionOptions: { includeExplanations: true },
  });
  const config = { configurable: { thread_id: 'discovery-explanation-ui' } };
  const paused = await graph.invoke(
    {
      workflowId: 'discovery-explanation-ui',
      workflowName: '회원 조회',
      scenario: context.scenario,
      sources: catalog.documents.map(({ id, spec }) => ({ id, spec })),
      trace: [],
    },
    config,
  );
  const interrupt = paused.__interrupt__[0].value;
  assert.equal(interrupt.kind, 'operation-choice');
  assert.equal(model.calls.length, 1);
  assert.equal(
    interrupt.questions[0].explanation.reason,
    '조회 범위를 구분할 정보가 없습니다.',
  );
  assert.equal(
    interrupt.questions[0].explanation.evidence[0].text,
    context.scenario,
  );
  assert.deepEqual(
    interrupt.questions[0].explanation.evidence[1].candidates.map(
      (candidate) => candidate.key,
    ),
    context.operations.slice(0, 2).map((candidate) => candidate.key),
  );
  const cancelled = await graph.invoke(
    new Command({ resume: { action: 'cancel' } }),
    config,
  );
  assert.equal(cancelled.conversationStatus, 'cancelled');
  assert.equal(model.calls.length, 1);
});
