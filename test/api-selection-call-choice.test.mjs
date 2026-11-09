import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createApiCatalog,
  resolveApiSelectionAnswers,
} from '@openapi-flow/core';
import { analyzeApiSelection } from '@openapi-flow/langchain';

async function fixture() {
  const catalog = await createApiCatalog([
    {
      id: 'inventory',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Inventory', version: '1' },
        paths: Object.fromEntries(
          ['stock', 'detail'].map((name) => [
            `/${name}/{id}`,
            {
              get: {
                parameters: [
                  {
                    name: 'id',
                    in: 'path',
                    required: true,
                    schema: { type: 'string' },
                  },
                ],
                responses: { 200: { description: 'OK' } },
              },
            },
          ]),
        ),
      },
    },
  ]);
  const question = {
    kind: 'operation-call-choice',
    id: 'inventory-variant',
    message: 'Which inventory representation should all three lookups use?',
    purpose: 'Look up inventory for three explicitly requested items',
    callPurposes: [
      'Inventory for item A',
      'Inventory for item B',
      'Inventory for item C',
    ],
    candidates: catalog.operations,
  };
  return {
    catalog,
    question,
    analysis: {
      selection: { operations: [], gaps: [] },
      questions: [question],
    },
  };
}

test('one alternative choice preserves three explicit call instances of the same API', async () => {
  const { catalog, question, analysis } = await fixture();
  const answer = {
    questionId: question.id,
    operation: question.candidates[0].key,
  };
  const before = globalThis.structuredClone({ analysis, answer });
  const resolved = await resolveApiSelectionAnswers({
    catalog,
    analysis,
    answers: [answer],
  });
  assert.deepEqual(
    resolved.selection.operations,
    question.callPurposes.map((purpose) => ({
      key: answer.operation,
      purpose,
    })),
  );
  assert.deepEqual(resolved.questions, []);
  assert.deepEqual({ analysis, answer }, before);
  assert.notEqual(
    resolved.selection.operations[0].key,
    resolved.selection.operations[1].key,
  );
});

test('shared call choice rejects missing call roles and stale or multiple selections without inference from prose', async () => {
  const { catalog, question, analysis } = await fixture();
  const answer = {
    questionId: question.id,
    operation: question.candidates[0].key,
  };
  for (const callPurposes of [undefined, [], [''], ['valid', '   ']]) {
    await assert.rejects(
      resolveApiSelectionAnswers({
        catalog,
        analysis: { ...analysis, questions: [{ ...question, callPurposes }] },
        answers: [answer],
      }),
      /inventory-variant\.callPurposes/,
    );
  }
  for (const invalid of [
    { questionId: question.id, operations: [answer.operation] },
    { ...answer, operation: { ...answer.operation, snapshotId: 'stale' } },
  ])
    await assert.rejects(
      resolveApiSelectionAnswers({ catalog, analysis, answers: [invalid] }),
    );
});

test('model schema, public question and answer expansion retain call roles and bind them into question identity', async () => {
  const { catalog, question } = await fixture();
  let calls = 0;
  async function analyze(callPurposes) {
    return analyzeApiSelection({
      operations: catalog.operations,
      scenario: question.purpose,
      model: {
        withStructuredOutput() {
          return {
            async invoke(messages) {
              calls++;
              const payload = JSON.parse(messages[1].content);
              return {
                operations: [],
                gaps: [],
                questions: [
                  {
                    kind: 'call-choice',
                    message: question.message,
                    purpose: question.purpose,
                    candidateIds: payload.candidates.map(
                      (candidate) => candidate.candidateId,
                    ),
                    callPurposes,
                  },
                ],
              };
            },
          };
        },
      },
    });
  }
  const three = await analyze(question.callPurposes);
  const two = await analyze(question.callPurposes.slice(0, 2));
  assert.equal(three.questions[0].kind, 'operation-call-choice');
  assert.deepEqual(three.questions[0].callPurposes, question.callPurposes);
  assert.notEqual(three.questions[0].id, two.questions[0].id);
  assert.equal(calls, 2);
  const resolved = await resolveApiSelectionAnswers({
    catalog,
    analysis: three,
    answers: [
      {
        questionId: three.questions[0].id,
        operation: three.questions[0].candidates[1].key,
      },
    ],
  });
  assert.equal(resolved.selection.operations.length, 3);
});
