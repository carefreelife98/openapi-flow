import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { validateWorkflowPlanningEvidence } from '@openapi-flow/core';
import {
  planWorkflowDraftConnectionEdit,
  WorkflowDraftConnectionEditPlanningError,
} from '@openapi-flow/langchain';
import { createWorkflowMessageEvidenceSelectionSchema } from '../packages/langchain/dist/schemas/create-workflow-message-evidence-selection-schema.js';
import { serializeStructuredOutputSchema } from '../packages/langchain/dist/schemas/serialize-structured-output-schema.js';
import {
  workflowDraftConnectionEditFixture,
  connectionEditPlan,
  addConnection,
} from './fixtures/workflow-draft-connection-edit-fixture.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const Ajv = require('ajv').default;
const { Ajv2020 } = require('ajv/dist/2020.js');

test('ID-only evidence uses the captured source verbatim, including JSON escapes, and rejects invented IDs/quotes without repair', () => {
  const messages = [
    {
      id: 'reply-1',
      text: JSON.stringify({
        reply: { choiceId: 'choice-2' },
        confirmedFact: {
          text: '원본 조회 후 주소 조회\n답변: ["주소 조회를 포함함"]',
        },
      }),
    },
  ];
  const original = globalThis.structuredClone(messages);
  const schema = createWorkflowMessageEvidenceSelectionSchema(messages);
  const output = { kind: 'message', messageId: 'reply-1' };
  for (const [dialect, Validator] of [
    ['draft-7', Ajv],
    ['draft-2020-12', Ajv2020],
  ]) {
    const wire = serializeStructuredOutputSchema(schema, dialect, 'input');
    const validate = new Validator({ strict: false }).compile(wire);
    assert.deepEqual(Object.keys(wire.properties), ['kind', 'messageId']);
    assert.equal(validate(output), true);
    for (const invalid of [
      { ...output, quote: JSON.parse(original[0].text).confirmedFact.text },
      { ...output, quote: original[0].text },
      { ...output, messageId: 'not-supplied' },
      { kind: 'message' },
    ]) {
      assert.equal(validate(invalid), false);
      assert.equal(schema.safeParse(invalid).success, false);
    }
  }
  messages[0].text = 'Changed after the model schema was created';
  const parsed = schema.parse(output);
  assert.equal(parsed.quote, original[0].text);
  assert.equal(
    original[0].text.includes(JSON.parse(original[0].text).confirmedFact.text),
    false,
  );
  assert.doesNotThrow(() =>
    validateWorkflowPlanningEvidence({
      context: { messages: original },
      evidence: [parsed],
    }),
  );
  for (const invalid of [
    [],
    [{ id: '', text: 'x' }],
    [original[0], original[0]],
  ])
    assert.throws(() => createWorkflowMessageEvidenceSelectionSchema(invalid));
});

test('final connection planning selects a reply receipt ID and preserves the exact original canonical evidence; legacy/fabricated quote fields fail once', async () => {
  const input = await workflowDraftConnectionEditFixture(true);
  const receipt = {
    id: 'reply-1',
    text: JSON.stringify({
      confirmedFact: { text: '주소 조회\n답변: ["포함"]' },
    }),
  };
  input.context.messages.push(receipt);
  input.requestMessageIds.push(receipt.id);
  input.plan = connectionEditPlan(
    input,
    [{ kind: 'revise-connections', nodeIds: ['independent'] }],
    true,
  );
  const selection = { kind: 'message', messageId: receipt.id };
  const valid = {
    decisions: [
      {
        ...addConnection('follow', 'independent'),
        sources: [selection],
        explanation: {
          reason: 'The explicit reply confirms the requested connection.',
          evidence: [selection],
        },
      },
    ],
  };
  const before = globalThis.structuredClone(input.draft);
  for (const quote of [
    undefined,
    JSON.parse(receipt.text).confirmedFact.text,
  ]) {
    const output = globalThis.structuredClone(valid);
    if (quote !== undefined) output.decisions[0].sources[0].quote = quote;
    let calls = 0;
    const model = {
      withStructuredOutput(schema, options) {
        assert.equal(options.name, 'plan_draft_connection_edit');
        assert.equal(JSON.stringify(schema).includes('"quote"'), false);
        return {
          async invoke() {
            calls++;
            return output;
          },
        };
      },
    };
    if (quote === undefined) {
      const result = await planWorkflowDraftConnectionEdit({ ...input, model });
      assert.equal(result.status, 'ready');
      assert.deepEqual(result.proposal.decisions[0].sources, [
        { ...selection, quote: receipt.text },
      ]);
      assert.deepEqual(
        result.proposal.decisions[0].explanation.evidence,
        result.proposal.decisions[0].sources,
      );
    } else
      await assert.rejects(
        planWorkflowDraftConnectionEdit({ ...input, model }),
        (error) => {
          assert.ok(error instanceof WorkflowDraftConnectionEditPlanningError);
          assert.equal(error.failure.stage, 'proposal-schema');
          assert.deepEqual(error.failure.output, output);
          return true;
        },
      );
    assert.equal(calls, 1);
    assert.deepEqual(input.draft, before);
  }
});
