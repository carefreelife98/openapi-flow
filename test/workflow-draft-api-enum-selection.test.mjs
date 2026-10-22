import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  createApiCatalog,
  resolveApiOperations,
  describeWorkflowDraftApiCallArguments,
  describeWorkflowDraftApiEnumChoices,
  createWorkflowDraftApiEnumSelectionSchema,
  resolveWorkflowDraftApiCallArguments,
} from '@openapi-flow/core';
import {
  generateWorkflowDraftApiCallArguments,
  WorkflowDraftApiCallPlanningError,
} from '@openapi-flow/langchain';
import {
  apiCallPlanningFixture,
  apiCallBindingPlan,
  apiCallArgumentsProposal,
  apiCallPlanningModel,
} from './fixtures/workflow-draft-api-call-planning-fixture.mjs';
import { connectionEditPlan } from './fixtures/workflow-draft-connection-edit-fixture.mjs';

async function fixture(
  schema = {
    type: 'string',
    enum: ['NEW', 'VIEWS', 'PURCHASES'],
    default: 'NEW',
  },
  kind = 'add-api-call',
) {
  const input = await apiCallPlanningFixture(kind);
  const catalog = await createApiCatalog([
    {
      id: 'enum-fixture',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Enum choices', version: '1' },
        paths: {
          '/rank/{id}': {
            get: {
              parameters: [{ in: 'path', name: 'id', required: true, schema }],
              responses: { 200: { description: 'Fixture response' } },
            },
          },
        },
      },
    },
  ]);
  const [replacement] = await resolveApiOperations(
    catalog,
    catalog.operations.map((entry) => entry.key),
  );
  input.replacement = replacement;
  input.context.operations.push(replacement);
  const message = input.context.messages.find(
    (entry) => entry.id === input.requestMessageIds[0],
  );
  message.text += ' 조회수 순으로 조회해줘.';
  input.plan = connectionEditPlan(input, [
    {
      kind,
      operation: replacement.key,
      ...(kind === 'replace-api-operation' ? { nodeId: 'independent' } : {}),
    },
  ]);
  input.stepId = input.plan.steps[0].id;
  const bindingPlan = apiCallBindingPlan(input, []);
  const proposal = apiCallArgumentsProposal(input);
  return { ...input, bindingPlan, proposal };
}

function selection(input, value) {
  const candidate = describeWorkflowDraftApiEnumChoices(input).candidates.find(
    (item) => Object.is(item.value, value),
  );
  assert.ok(candidate, `missing fixture enum ${JSON.stringify(value)}`);
  return {
    candidateId: candidate.id,
    messageId: input.requestMessageIds[0],
    sourceText: '조회수 순으로 조회해줘.',
    reason: '요청한 정렬 의미에 맞는 OAS enum을 선택했습니다.',
  };
}

function resolve(input, enumSelections) {
  return resolveWorkflowDraftApiCallArguments({
    ...input,
    fingerprint: describeWorkflowDraftApiCallArguments(input).fingerprint,
    enumSelections,
  });
}

test('code copies the exact OAS value with independent semantic attribution, including replacement roles', async () => {
  for (const kind of ['add-api-call', 'replace-api-operation']) {
    const input = await fixture(undefined, kind);
    const original = JSON.stringify(input);
    const result = resolve(input, [selection(input, 'VIEWS')]);
    assert.equal(result.status, 'ready');
    assert.deepEqual(result.arguments.values, { path: { id: 'VIEWS' } });
    assert.deepEqual(result.proposal.values, {});
    assert.deepEqual(result.literalSources, []);
    assert.equal(result.enumSelections[0].value, 'VIEWS');
    assert.equal(
      result.enumSelections[0].sourceText,
      '조회수 순으로 조회해줘.',
    );
    assert.ok(result.enumSelections[0].occurrences.length);
    assert.ok(result.enumSelections[0].schemaPointer.endsWith('/enum/1'));
    assert.equal(JSON.stringify(input), original);
  }
});

test('numeric, Boolean, null and composite enum values retain their original JSON types', async () => {
  for (const value of [0, false, null, '0', ['x', 1], { a: false }]) {
    const input = await fixture({ enum: [value] });
    const candidate = describeWorkflowDraftApiEnumChoices(input).candidates[0];
    const picked = {
      candidateId: candidate.id,
      messageId: input.requestMessageIds[0],
      sourceText: '조회수 순으로 조회해줘.',
      reason: 'Fixture semantic choice.',
    };
    const result = resolve(input, [picked]);
    assert.deepEqual(result.arguments.values.path.id, value);
  }
});

test('unknown/default-only inputs stay unresolved, with no automatic enum or default selection', async () => {
  const input = await fixture();
  assert.equal(resolve(input, []).status, 'needs-input');
  assert.deepEqual(resolve(input, []).arguments.values, {});
  const defaultOnly = await fixture({
    type: 'string',
    default: 'VIEWS',
    example: 'VIEWS',
  });
  assert.deepEqual(
    describeWorkflowDraftApiEnumChoices(defaultOnly).candidates,
    [],
  );
  assert.deepEqual(
    z.toJSONSchema(createWorkflowDraftApiEnumSelectionSchema(defaultOnly))
      .properties.selections.items,
    { not: {} },
  );
});

test('no fabricated values, foreign candidate IDs, duplicate targets, invented sources or stale OAS choices', async () => {
  const input = await fixture();
  const picked = selection(input, 'VIEWS');
  assert.throws(
    () => resolve(input, [{ ...picked, value: 'PURCHASES' }]),
    /unrecognized|value/i,
  );
  assert.throws(
    () => resolve(input, [{ ...picked, candidateId: 'invented' }]),
    /invalid|enum/i,
  );
  assert.throws(() => resolve(input, [picked, picked]), /overlap/i);
  assert.throws(
    () =>
      resolve(input, [{ ...picked, sourceText: 'not in the human request' }]),
    /sourceText/i,
  );
  assert.throws(
    () => resolve(input, [{ ...picked, messageId: 'invented-message' }]),
    /invalid/i,
  );
  const changed = await fixture({ type: 'string', enum: ['OTHER'] });
  assert.throws(() => resolve(changed, [picked]), /invalid/i);
});

test('bound/confirmed inputs and explicit literals cannot be overwritten or relabeled as semantic choices', async () => {
  const input = await fixture();
  const picked = selection(input, 'VIEWS');
  const bound = { ...input, bindingPlan: apiCallBindingPlan(input) };
  assert.deepEqual(describeWorkflowDraftApiEnumChoices(bound).candidates, []);
  assert.throws(() => resolve(bound, [picked]));
  const confirmed = {
    ...input,
    confirmedInputs: [
      {
        callId: input.plan.steps[0].newNodeId,
        operation: input.replacement.key,
        targetPointer: '/path/id',
        value: 'NEW',
      },
    ],
  };
  assert.deepEqual(
    describeWorkflowDraftApiEnumChoices(confirmed).candidates,
    [],
  );
  const literal = {
    ...input,
    proposal: { ...input.proposal, values: { path: { id: 'VIEWS' } } },
  };
  assert.throws(() => resolve(literal, []), /literalSources/);
});

test('LangChain performs a distinct optional enum selection, not a repair or generated-value retry', async () => {
  const input = await fixture();
  const model = apiCallPlanningModel([
    input.proposal,
    { selections: [selection(input, 'VIEWS')] },
  ]);
  const result = await generateWorkflowDraftApiCallArguments({
    ...input,
    model,
    selectOasEnums: true,
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(
    model.requests.map((request) => request.options.name),
    ['generate_draft_api_call_arguments', 'select_draft_api_enum_choices'],
  );
  assert.equal(model.requests[1].messages[0].getType(), 'system');
  assert.deepEqual(
    Object.keys(
      model.requests[1].schema.properties.selections.items.properties,
    ).sort(),
    ['candidateId', 'messageId', 'reason', 'sourceText'],
  );
  const optedOut = apiCallPlanningModel([input.proposal]);
  assert.equal(
    (await generateWorkflowDraftApiCallArguments({ ...input, model: optedOut }))
      .status,
    'needs-input',
  );
  assert.equal(optedOut.requests.length, 1);
  const failed = apiCallPlanningModel([
    input.proposal,
    { selections: [{ ...selection(input, 'VIEWS'), candidateId: 'foreign' }] },
  ]);
  await assert.rejects(
    generateWorkflowDraftApiCallArguments({
      ...input,
      model: failed,
      selectOasEnums: true,
    }),
    (error) =>
      error instanceof WorkflowDraftApiCallPlanningError &&
      error.failure.stage === 'enum-selection',
  );
  assert.equal(failed.requests.length, 2);
});
