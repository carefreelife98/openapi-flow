import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Annotation,
  Command,
  END,
  MemorySaver,
  START,
  StateGraph,
  interrupt,
} from '@langchain/langgraph';
import { z } from 'zod';
import {
  createWorkflowReviewFeedbackSchema,
  createWorkflowReviewFeedback,
  isWorkflowReviewFeedback,
} from '@openapi-flow/core';

function target(key) {
  return {
    key,
    revision: 3,
    kind: 'selection-review',
    questions: [{ id: 'which-api', message: '어떤 API인가요?' }],
    data: {},
  };
}

function fixture() {
  let planningCalls = 0;
  const schema = Annotation.Root({
    boundary: Annotation(),
    selected: Annotation(),
    feedback: Annotation(),
  });
  const graph = new StateGraph(schema)
    .addNode('review', (state) => {
      const answerSchema = z.strictObject({
        kind: z.literal('choice'),
        boundaryKey: z.literal(state.boundary.key),
        candidateId: z.enum(['original', 'cached']),
      });
      const answer = interrupt(state.boundary, {
        responseSchema: z.union([
          answerSchema,
          createWorkflowReviewFeedbackSchema(state.boundary),
        ]),
      });
      if (isWorkflowReviewFeedback(answer))
        return {
          feedback: createWorkflowReviewFeedback({
            boundary: state.boundary,
            feedback: answer,
            messageId: 'explicit-human-text',
          }),
          selected: null,
        };
      return { selected: answer.candidateId, feedback: null };
    })
    .addNode('reselect', (state) => {
      planningCalls++;
      assert.equal(
        state.feedback.message.text,
        '  캐시 대신 원본으로 바꿔줘. "0007"  ',
      );
      return { boundary: target('new-review'), feedback: null };
    })
    .addEdge(START, 'review')
    .addConditionalEdges(
      'review',
      (state) => (state.feedback === null ? END : 'reselect'),
      [END, 'reselect'],
    )
    .addEdge('reselect', 'review')
    .compile({ checkpointer: new MemorySaver() });
  return { graph, calls: () => planningCalls };
}

test('an explicit API choice resumes deterministically without a selection planner call', async () => {
  const { graph, calls } = fixture();
  const config = { configurable: { thread_id: 'feedback-choice' } };
  await graph.invoke(
    { boundary: target('old-review'), feedback: null },
    config,
  );
  const result = await graph.invoke(
    new Command({
      resume: {
        kind: 'choice',
        boundaryKey: 'old-review',
        candidateId: 'original',
      },
    }),
    config,
  );
  assert.equal(result.selected, 'original');
  assert.equal(calls(), 0);
});

test('invalid feedback does not consume an interrupt; valid text reselects once and requires a new explicit choice', async () => {
  const { graph, calls } = fixture();
  const config = { configurable: { thread_id: 'feedback-text' } };
  await graph.invoke(
    { boundary: target('old-review'), feedback: null },
    config,
  );
  const feedback = {
    kind: 'review-feedback',
    boundaryKey: 'old-review',
    expectedRevision: 3,
    scope: { kind: 'question', questionId: 'which-api' },
    text: '  キャッシュではなく元のデータを取得して。  ',
  };
  await assert.rejects(
    graph.invoke(
      new Command({ resume: { ...feedback, boundaryKey: 'stale' } }),
      config,
    ),
  );
  assert.equal(calls(), 0);
  const text = '  캐시 대신 원본으로 바꿔줘. "0007"  ';
  const next = await graph.invoke(
    new Command({ resume: { ...feedback, text } }),
    config,
  );
  assert.equal(calls(), 1);
  assert.equal(next.selected, null);
  assert.equal(next.__interrupt__[0].value.key, 'new-review');
  await assert.rejects(
    graph.invoke(
      new Command({
        resume: {
          kind: 'choice',
          boundaryKey: 'old-review',
          candidateId: 'cached',
        },
      }),
      config,
    ),
  );
  assert.equal(calls(), 1);
  const result = await graph.invoke(
    new Command({
      resume: {
        kind: 'choice',
        boundaryKey: 'new-review',
        candidateId: 'original',
      },
    }),
    config,
  );
  assert.equal(result.selected, 'original');
  assert.equal(calls(), 1);
});
