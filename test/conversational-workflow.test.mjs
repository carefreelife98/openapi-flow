import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { MemorySaver, Command } from '@langchain/langgraph';
import { createConversationalWorkflowGenerationGraph } from '@openapi-flow/example-langgraph-workflow';
import {
  clarificationModel,
  clarificationSpec,
} from './fixtures/api-clarification-fixture.mjs';

const initial = {
  workflowId: 'conversation',
  workflowName: 'Member lookup',
  scenario: '회원 간단 정보를 조회하는 테스트 워크플로우를 만들어줘.',
  sources: [{ id: 'members', spec: clarificationSpec }],
  trace: [],
};

function setup(options = {}) {
  const model = clarificationModel(options);
  const graph = createConversationalWorkflowGenerationGraph({
    model,
    checkpointer: new MemorySaver(),
  });
  return {
    model,
    graph,
    config: { configurable: { thread_id: randomUUID() } },
  };
}

test('short request pauses for an OAS-required value, then typed input compiles without replanning', async () => {
  const { model, graph, config } = setup();
  const paused = await graph.invoke(initial, config);
  assert.equal(paused.conversationStatus, 'awaiting-input');
  assert.equal(paused.workflow, undefined);
  const question = paused.__interrupt__[0].value.questions[0];
  assert.equal(question.targetPointer, '/path/id');
  const callsBefore = model.calls.length;
  const complete = await graph.invoke(
    new Command({
      resume: {
        action: 'answer',
        answers: [{ requirementId: question.id, value: 'member-01' }],
      },
    }),
    config,
  );
  assert.equal(complete.conversationStatus, 'complete');
  assert.equal(
    complete.workflow.nodes.filter(
      (node) => node.type === 'n8n-nodes-base.httpRequest',
    ).length,
    1,
  );
  assert.equal(model.calls.length, callsBefore + 1); // only final connection planning
  assert.equal(
    model.calls.filter((call) => call.name === 'generate_api_arguments').length,
    0,
  );
  assert.equal(
    model.calls.filter((call) => call.name === 'analyze_api_selection').length,
    1,
  );
  assert.equal(
    model.calls.some((call) => call.name === 'extract_api_input_answers'),
    false,
  );
  assert.equal(
    complete.reviewMaterials[0].arguments.values.path.id,
    'member-01',
  );
});

test('wrong input type asks again without replaying earlier model calls; a corrected answer succeeds', async () => {
  const { model, graph, config } = setup();
  const first = await graph.invoke(initial, config);
  const question = first.__interrupt__[0].value.questions[0];
  const count = model.calls.length;
  const invalid = await graph.invoke(
    new Command({
      resume: {
        action: 'answer',
        answers: [{ requirementId: question.id, value: 123 }],
      },
    }),
    config,
  );
  assert.equal(invalid.workflow, undefined);
  assert.equal(invalid.conversationStatus, 'awaiting-input');
  assert.ok(invalid.__interrupt__[0].value.issues.length);
  assert.equal(model.calls.length, count);
  const result = await graph.invoke(
    new Command({
      resume: {
        action: 'answer',
        answers: [{ requirementId: question.id, value: 'member-02' }],
      },
    }),
    config,
  );
  assert.equal(result.conversationStatus, 'complete');
  assert.equal(result.reviewMaterials[0].arguments.values.path.id, 'member-02');
});

test('natural-language reply invokes only answer extraction before final connection planning', async () => {
  const { model, graph, config } = setup();
  const first = await graph.invoke(initial, config);
  const before = model.calls.length;
  const result = await graph.invoke(
    new Command({
      resume: { action: 'reply', text: '회원번호는 member-01이야.' },
    }),
    config,
  );
  assert.equal(result.conversationStatus, 'complete');
  assert.deepEqual(
    model.calls.slice(before).map((call) => call.name),
    ['extract_api_input_answers', 'plan_workflow_connections'],
  );
  assert.equal(
    model.calls.find((call) => call.name === 'analyze_api_selection').payload
      .scenario,
    initial.scenario,
  );
  assert.equal(first.workflow, undefined);
});

test('operation choice and required value are distinct turns; cancellation creates no workflow', async () => {
  const { model, graph, config } = setup({ ambiguous: true });
  const first = await graph.invoke(initial, config);
  const choice = first.__interrupt__[0].value.questions[0];
  assert.equal(choice.kind, 'operation-choice');
  assert.equal(model.calls.length, 1);
  const next = await graph.invoke(
    new Command({
      resume: {
        action: 'choose',
        answers: [
          { questionId: choice.id, operation: choice.candidates[0].key },
        ],
      },
    }),
    config,
  );
  assert.equal(next.__interrupt__[0].value.kind, 'request-input');
  const count = model.calls.length;
  const cancelled = await graph.invoke(
    new Command({ resume: { action: 'cancel' } }),
    config,
  );
  assert.equal(cancelled.conversationStatus, 'cancelled');
  assert.equal(cancelled.workflow, undefined);
  assert.equal(model.calls.length, count);
});

test('independent threads do not share confirmed inputs', async () => {
  const { graph, config } = setup();
  const first = await graph.invoke(initial, config);
  const secondConfig = { configurable: { thread_id: randomUUID() } };
  const second = await graph.invoke(initial, secondConfig);
  const question = first.__interrupt__[0].value.questions[0];
  await graph.invoke(
    new Command({
      resume: {
        action: 'answer',
        answers: [{ requirementId: question.id, value: 'member-01' }],
      },
    }),
    config,
  );
  assert.equal(second.workflow, undefined);
  const stored = await graph.getState(secondConfig);
  assert.deepEqual(stored.values.confirmedInputs, []);
});

test('missing capability remains a detached review workflow, not a request-input question', async () => {
  const { graph, config } = setup({ missing: true });
  const result = await graph.invoke(
    { ...initial, scenario: 'Refund member payment' },
    config,
  );
  assert.equal(result.conversationStatus, 'needs-review');
  assert.equal(result.__interrupt__, undefined);
  assert.equal(
    result.workflow.nodes.some(
      (node) => node.type === 'n8n-nodes-base.httpRequest',
    ),
    false,
  );
  assert.equal(result.workflow.connections.Start, undefined);
});

test('partial answers retain earlier confirmed values and ask only the unresolved input', async () => {
  const spec = globalThis.structuredClone(clarificationSpec);
  spec.paths['/members/{id}'].get.parameters.push({
    in: 'header',
    name: 'tenant',
    required: true,
    schema: { type: 'string' },
  });
  const { model, graph, config } = setup();
  const first = await graph.invoke(
    { ...initial, sources: [{ id: 'members', spec }] },
    config,
  );
  const id = first.__interrupt__[0].value.questions.find(
    (question) => question.targetPointer === '/path/id',
  );
  const next = await graph.invoke(
    new Command({
      resume: {
        action: 'answer',
        answers: [{ requirementId: id.id, value: 'member-01' }],
      },
    }),
    config,
  );
  const remaining = next.__interrupt__[0].value.questions;
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].targetPointer, '/header/tenant');
  const final = await graph.invoke(
    new Command({
      resume: {
        action: 'answer',
        answers: [{ requirementId: remaining[0].id, value: 'tenant-01' }],
      },
    }),
    config,
  );
  assert.equal(final.conversationStatus, 'complete');
  assert.equal(final.confirmedInputs.length, 2);
  assert.equal(final.reviewMaterials[0].arguments.values.path.id, 'member-01');
  assert.equal(
    model.calls.filter((item) => item.name === 'generate_api_arguments').length,
    0,
  );
});

test('invalid operation choice is displayed for correction rather than mapped to another candidate', async () => {
  const { model, graph, config } = setup({ ambiguous: true });
  const first = await graph.invoke(initial, config);
  const choice = first.__interrupt__[0].value.questions[0];
  const invalid = await graph.invoke(
    new Command({
      resume: {
        action: 'choose',
        answers: [
          {
            questionId: choice.id,
            operation: { ...choice.candidates[0].key, snapshotId: 'stale' },
          },
        ],
      },
    }),
    config,
  );
  assert.equal(invalid.workflow, undefined);
  assert.ok(invalid.__interrupt__[0].value.errors.length);
  assert.equal(model.calls.length, 1);
  const cancelled = await graph.invoke(
    new Command({ resume: { action: 'cancel' } }),
    config,
  );
  assert.equal(cancelled.conversationStatus, 'cancelled');
});
