import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeApiValueAnswers } from '../packages/langchain/dist/public-api.js';
import {
  resolveApiValueAnswers,
  validateApiInputAnswerAnalysis,
} from '../packages/core/dist/public-api.js';
import {
  describeApiInputSources,
  describeApiInputJsonSources,
} from '../packages/core/dist/arguments/sources/describe-api-input-sources.js';

const requirement = (id, schema) => ({
  id,
  callId: 'call',
  kind: 'missing-input',
  targetPointer: '/query/' + id,
  schema,
  openapiVersion: '3.1.0',
  operation: {
    documentId: 'doc',
    snapshotId: 'snapshot',
    operationRef: '#/paths/~1read/get',
  },
  message: 'Provide ' + id,
});
function model(proposal, capture) {
  return {
    withStructuredOutput(schema, options) {
      return {
        invoke: async (messages) => {
          capture?.({ schema, options, messages });
          return proposal;
        },
      };
    },
  };
}
test('one answer call returns actual typed values without lexical choices and replays old answer contracts', async () => {
  const context = {
    reply: '상품 102를 조회하고 필터 없이 확인해 줘.',
    requirements: [
      requirement('id', { type: 'string' }),
      requirement('mode', { type: 'string', enum: ['NONE', 'ACTIVE'] }),
    ],
    selectOasEnums: true,
  };
  let calls = 0;
  const analysis = await analyzeApiValueAnswers({
    ...context,
    model: model(
      {
        answers: [
          { requirementId: 'id', value: '102' },
          { requirementId: 'mode', value: 'NONE' },
        ],
      },
      (wire) => {
        calls++;
        assert.doesNotMatch(
          JSON.stringify(wire),
          /startTokenId|endTokenId|sourceId/,
        );
        assert.match(JSON.stringify(wire.schema), /NONE/);
      },
    ),
  });
  assert.equal(calls, 1);
  assert.deepEqual(analysis.answers, [
    { requirementId: 'id', value: '102' },
    { requirementId: 'mode', value: 'NONE' },
  ]);
  assert.equal(analysis.sources[0].sourceText, '102');
  assert.equal(analysis.enumSelections[0].intent.sourceText, context.reply);
  validateApiInputAnswerAnalysis({ ...context, analysis });
});
test('unanswered questions remain unanswered and empty work makes no model call', async () => {
  const context = {
    reply: '아직 몰라요.',
    requirements: [requirement('id', { type: 'string' })],
  };
  const result = await analyzeApiValueAnswers({
    ...context,
    model: model({ answers: [] }),
  });
  assert.deepEqual(result.unansweredRequirementIds, ['id']);
  assert.equal(
    (
      await analyzeApiValueAnswers({
        reply: '',
        requirements: context.requirements,
      })
    ).status,
    'empty-reply',
  );
  assert.equal(
    (await analyzeApiValueAnswers({ reply: '답변', requirements: [] })).status,
    'no-pending-inputs',
  );
});
test('invented values, duplicate answers, invalid enums and JSON type conversion fail without repair', async () => {
  const context = {
    reply: '{"id":102}',
    requirements: [
      requirement('id', { type: 'string' }),
      requirement('mode', { type: 'string', enum: ['NONE'] }),
    ],
    selectOasEnums: true,
  };
  assert.throws(
    () =>
      resolveApiValueAnswers({
        ...context,
        proposal: { answers: [{ requirementId: 'id', value: '102' }] },
      }),
    /no exact original/,
  );
  assert.throws(() =>
    resolveApiValueAnswers({
      ...context,
      proposal: { answers: [{ requirementId: 'mode', value: 'other' }] },
    }),
  );
  const literal = { ...context, reply: 'ID actual' };
  assert.throws(
    () =>
      resolveApiValueAnswers({
        ...literal,
        proposal: { answers: [{ requirementId: 'id', value: 'invented' }] },
      }),
    /no exact original/,
  );
  assert.throws(
    () =>
      resolveApiValueAnswers({
        ...literal,
        proposal: {
          answers: [
            { requirementId: 'id', value: 'actual' },
            { requirementId: 'id', value: 'actual' },
          ],
        },
      }),
    /Duplicate|duplicate/,
  );
});
test('single-reply contracts reject a joined multi-message source instead of guessing one owner', async () => {
  const context = {
    reply: '요약',
    sourceMessages: [{ id: 'request', text: 'actual' }],
    requirements: [requirement('id', { type: 'string' })],
  };
  await assert.rejects(analyzeApiValueAnswers(context), /one original reply/);
});
test('JSON-only source enumeration matches the existing JSON projection without text catalogs', () => {
  for (const reply of [
    '상품 101, 102와 true를 확인해 줘.',
    '{"nested":[{"id":"00123"},-1.2e3,null]}',
    '[1,2,3]',
    'a=42, b=false.',
    '잘못된 00123과 "문자열"',
    '{"recursive":{"recursive":{}}}',
    '빈 문장',
    '',
  ])
    assert.deepEqual(
      describeApiInputJsonSources(reply),
      describeApiInputSources(reply).json,
    );
});
