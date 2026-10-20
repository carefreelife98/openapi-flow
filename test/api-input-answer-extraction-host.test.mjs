import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { MemorySaver, Command } from '@langchain/langgraph';
import { createConversationalWorkflowGenerationGraph } from '@openapi-flow/example-langgraph-workflow';
import { validateApiInputAnswerExtractionRecord } from '@openapi-flow/core';
import {
  clarificationModel,
  clarificationSpec,
} from './fixtures/api-clarification-fixture.mjs';
import { jsonInputSource } from './fixtures/api-input-source-selection-fixture.mjs';

test('official conversation host retains same-call evidence across empty/partial replies and direct typed completion without replay', async () => {
  const spec = globalThis.structuredClone(clarificationSpec);
  spec.paths['/members/{id}'].get.parameters.push({
    in: 'header',
    name: 'tenant',
    required: true,
    schema: { type: 'string' },
  });
  const model = clarificationModel();
  const original = model.withStructuredOutput.bind(model);
  let extractions = 0;
  model.withStructuredOutput = (schema, config) => {
    if (config.name !== 'extract_api_input_answers')
      return original(schema, config);
    return {
      async invoke(messages) {
        extractions++;
        const payload = JSON.parse(messages[1].content);
        return {
          reason: '明示された入力だけを使用します。',
          answers:
            payload.reply === '없어요.'
              ? []
              : [
                  {
                    requirementId: payload.questions.find(
                      (q) => q.targetPointer === '/path/id',
                    ).id,
                    source: jsonInputSource(payload, '"member-01"'),
                    reason: '회원번호를 명시했습니다.',
                  },
                ],
        };
      },
    };
  };
  const graph = createConversationalWorkflowGenerationGraph({
    model,
    checkpointer: new MemorySaver(),
    answerOptions: { includeExplanations: true },
  });
  const config = { configurable: { thread_id: randomUUID() } };
  const initial = {
    workflowId: 'answer-history',
    workflowName: 'Member lookup',
    scenario: '회원 정보를 조회해줘.',
    sources: [{ id: 'members', spec }],
    trace: [],
  };
  const first = await graph.invoke(initial, config);
  const pending = first.requirements;
  const empty = await graph.invoke(
    new Command({ resume: { action: 'reply', text: '없어요.' } }),
    config,
  );
  assert.equal(empty.conversationStatus, 'awaiting-input');
  assert.equal(empty.apiInputAnswerExtractions.length, 1);
  validateApiInputAnswerExtractionRecord({
    reply: '없어요.',
    requirements: pending,
    record: empty.apiInputAnswerExtractions[0],
  });
  const partial = await graph.invoke(
    new Command({
      resume: { action: 'reply', text: '회원번호는 "member-01"입니다.' },
    }),
    config,
  );
  assert.equal(partial.conversationStatus, 'awaiting-input');
  assert.equal(partial.apiInputAnswerExtractions.length, 2);
  assert.deepEqual(
    partial.apiInputAnswerExtractions[0],
    empty.apiInputAnswerExtractions[0],
  );
  validateApiInputAnswerExtractionRecord({
    reply: '회원번호는 "member-01"입니다.',
    requirements: pending,
    record: partial.apiInputAnswerExtractions[1],
  });
  assert.equal(partial.requirements.length, 1);
  assert.equal(partial.requirements[0].targetPointer, '/header/tenant');
  const count = model.calls.length;
  const complete = await graph.invoke(
    new Command({
      resume: {
        action: 'answer',
        answers: [
          { requirementId: partial.requirements[0].id, value: 'tenant-01' },
        ],
      },
    }),
    config,
  );
  assert.equal(complete.conversationStatus, 'complete');
  assert.equal(extractions, 2);
  assert.deepEqual(
    complete.apiInputAnswerExtractions,
    partial.apiInputAnswerExtractions,
  );
  assert.equal(model.calls.length, count + 1);
  assert.equal(
    complete.reviewMaterials[0].arguments.values.path.id,
    'member-01',
  );
  assert.equal(
    complete.reviewMaterials[0].arguments.values.header.tenant,
    'tenant-01',
  );
  assert.equal(
    JSON.stringify(complete.workflow).includes(
      'model-extracted-api-input-answers',
    ),
    false,
  );
});
