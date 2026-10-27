import assert from 'node:assert/strict';
import test from 'node:test';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import { expandLocalSchemaReferences } from './fixtures/expand-local-schema-references.mjs';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  createWorkflowClarificationRound,
  validateWorkflowClarificationRound,
  resolveWorkflowClarificationReplies,
  readClarificationQuestionLimits,
  resolveWorkflowClarificationOptions,
  describeWorkflowPlanningContext,
  validateWorkflowPlanningEvidence,
} from '@openapi-flow/core';
import { clarifyWorkflowRequirements } from '@openapi-flow/langchain';
import {
  describeN8nManualTrigger,
  compileN8nWorkflowTemplate,
} from '@openapi-flow/n8n';
import { workflowTemplateFixture } from './fixtures/workflow-template-fixture.mjs';
import {
  clarificationLimits,
  workflowClarificationFixture,
  clarificationQuestions,
} from './fixtures/workflow-clarification-fixture.mjs';

test('clarification budgets require explicit valid host configuration; optional flags have approved defaults', () => {
  const env = {
    OPENAPI_FLOW_CLARIFY_MAX_CATEGORIES: '4',
    OPENAPI_FLOW_CLARIFY_MAX_QUESTIONS_PER_CATEGORY: '3',
    OPENAPI_FLOW_CLARIFY_MAX_CHOICES_PER_QUESTION: '5',
    OPENAPI_FLOW_CLARIFY_MAX_QUESTIONS_PER_ROUND: '6',
  };
  assert.deepEqual(readClarificationQuestionLimits(env), clarificationLimits);
  assert.deepEqual(
    readClarificationQuestionLimits({
      ...env,
      OPENAPI_FLOW_CLARIFY_MAX_CHOICES_PER_QUESTION: '1',
    }),
    { ...clarificationLimits, maxChoicesPerQuestion: 1 },
  );
  for (const value of [
    undefined,
    '0',
    '-1',
    '1.5',
    ' 4',
    '04',
    '9007199254740992',
  ])
    assert.throws(
      () =>
        readClarificationQuestionLimits({
          ...env,
          OPENAPI_FLOW_CLARIFY_MAX_CATEGORIES: value,
        }),
      /OPENAPI_FLOW_CLARIFY_MAX_CATEGORIES/,
    );
  assert.throws(
    () =>
      readClarificationQuestionLimits({
        ...env,
        OPENAPI_FLOW_CLARIFY_MAX_QUESTIONS_PER_ROUND: '13',
      }),
    /capacity/,
  );
  assert.deepEqual(resolveWorkflowClarificationOptions(), {
    includeExplanations: true,
    includeSuggestions: true,
  });
  assert.deepEqual(
    resolveWorkflowClarificationOptions({ includeExplanations: false }),
    { includeExplanations: false, includeSuggestions: true },
  );
  assert.throws(() =>
    resolveWorkflowClarificationOptions({ includeSuggestions: null }),
  );
});

test('clear short requests need no questions or invented runtime values; code owns round identities', async () => {
  const input = await workflowClarificationFixture();
  const round = createWorkflowClarificationRound(input);
  assert.deepEqual(round, createWorkflowClarificationRound(input));
  assert.deepEqual(round.categories, []);
  assert.deepEqual(round.sourceMessages, input.context.messages);
  const resolution = resolveWorkflowClarificationReplies({
    round,
    context: input.context,
    replies: [],
  });
  assert.equal(resolution.readyForPlanning, true);
  assert.equal(resolution.facts.length, 1);
  assert.deepEqual(resolution.sourceMessages, input.context.messages);
  assert.equal(Object.hasOwn(resolution, 'values'), false);
  assert.equal(Object.hasOwn(resolution, 'workflow'), false);
  assert.doesNotThrow(() =>
    validateWorkflowClarificationRound({ round, context: input.context }),
  );
  assert.throws(
    () =>
      createWorkflowClarificationRound({
        ...input,
        proposal: { ...input.proposal, id: 'model-owned' },
      }),
    /Unrecognized key/,
  );
});

test('questions, choices and explanations are checked without truncation or source repair', async () => {
  const input = await workflowClarificationFixture();
  const categories = clarificationQuestions(
    input.proposal.statements[0].sources[0],
  );
  const proposal = { ...input.proposal, categories };
  const singleQuestion = categories[0].questions[0];
  const singleChoice = createWorkflowClarificationRound({
    ...input,
    limits: { ...input.limits, maxChoicesPerQuestion: 1 },
    proposal: {
      ...input.proposal,
      categories: [
        {
          ...categories[0],
          questions: [
            {
              ...singleQuestion,
              answer: {
                kind: 'single-choice',
                choices: [singleQuestion.answer.choices[0]],
              },
            },
          ],
        },
      ],
    },
  });
  const question = singleChoice.categories[0].questions[0];
  const selected = resolveWorkflowClarificationReplies({
    round: singleChoice,
    context: input.context,
    replies: [
      {
        kind: 'single-choice',
        questionId: question.id,
        choiceId: question.answer.choices[0].id,
      },
    ],
  });
  assert.equal(selected.readyForPlanning, true);
  const questionsOnly = createWorkflowClarificationRound({
    ...input,
    proposal: { ...proposal, statements: [] },
  });
  const unresolved = resolveWorkflowClarificationReplies({
    round: questionsOnly,
    context: input.context,
    replies: [],
  });
  assert.deepEqual(unresolved.sourceMessages, input.context.messages);
  assert.ok(
    unresolved.requirementsPrompt.includes(input.context.messages[0].text),
  );
  assert.equal(
    createWorkflowClarificationRound({ ...input, proposal }).categories[0]
      .questions.length,
    3,
  );
  assert.throws(
    () =>
      createWorkflowClarificationRound({
        ...input,
        limits: { ...input.limits, maxQuestionsPerRound: 2 },
        proposal,
      }),
    /maxQuestionsPerRound/,
  );
  const duplicate = globalThis.structuredClone(proposal);
  duplicate.categories[0].questions[1].message =
    duplicate.categories[0].questions[0].message;
  assert.throws(
    () => createWorkflowClarificationRound({ ...input, proposal: duplicate }),
    /distinct/,
  );
  const choices = globalThis.structuredClone(proposal);
  choices.categories[0].questions[0].answer.choices[1].label =
    choices.categories[0].questions[0].answer.choices[0].label;
  assert.throws(
    () => createWorkflowClarificationRound({ ...input, proposal: choices }),
    /distinct/,
  );
  assert.throws(() =>
    createWorkflowClarificationRound({
      ...input,
      proposal: {
        ...proposal,
        categories: [{ ...categories[0], questions: [] }],
      },
    }),
  );
  const missingReason = globalThis.structuredClone(proposal);
  delete missingReason.categories[0].questions[0].explanation;
  assert.doesNotThrow(() =>
    createWorkflowClarificationRound({ ...input, proposal: missingReason }),
  );
});

test('clarification presentation omissions and malformed reasons do not invalidate requirements or questions; supplied source references remain strict', async () => {
  const input = await workflowClarificationFixture();
  const source = input.proposal.statements[0].sources[0];
  for (const explanation of [
    undefined,
    null,
    'not an explanation object',
    {},
    { reason: '', evidence: [source] },
    { reason: ' \n ', evidence: [source] },
    { reason: 42, evidence: [source] },
    { reason: 'Display text without invented sources' },
    { reason: 'Display text without invented sources', evidence: [] },
  ]) {
    const proposal = globalThis.structuredClone(input.proposal);
    proposal.categories = clarificationQuestions(source);
    proposal.suggestions = [{ text: '선택한 결과를 확인해줘', explanation }];
    const displayed = [
      ...proposal.statements,
      ...proposal.categories,
      ...proposal.categories.flatMap((category) => category.questions),
      ...proposal.categories.flatMap((category) =>
        category.questions.flatMap((question) => question.answer.choices ?? []),
      ),
      ...proposal.suggestions,
    ];
    for (const item of displayed) item.explanation = explanation;
    const round = createWorkflowClarificationRound({ ...input, proposal });
    assert.equal(round.statements[0].text, input.proposal.statements[0].text);
    assert.deepEqual(round.statements[0].sources, [source]);
    assert.equal(round.categories[0].questions.length, 3);
    for (const item of [
      ...round.statements,
      ...round.categories,
      ...round.categories.flatMap((category) => category.questions),
      ...round.categories.flatMap((category) =>
        category.questions.flatMap((question) => question.answer.choices ?? []),
      ),
      ...round.suggestions,
    ])
      assert.equal(item.explanation, undefined);
    assert.doesNotThrow(() =>
      validateWorkflowClarificationRound({ round, context: input.context }),
    );
  }
  for (const evidence of [
    [{ ...source, messageId: 'unknown-message' }],
    [{ ...source, quote: 'The user did not say this' }],
    [
      {
        kind: 'oas',
        operation: input.context.operations[0].key,
        pointer: '/not-declared',
      },
    ],
    [{ kind: 'native', capability: 'unregistered' }],
  ]) {
    const proposal = globalThis.structuredClone(input.proposal);
    proposal.statements[0].explanation = { reason: null, evidence };
    assert.throws(() =>
      createWorkflowClarificationRound({ ...input, proposal }),
    );
  }
});

test('source checks validate exact quotes, OAS snapshots/pointers and actual native capability names', async () => {
  const input = await workflowClarificationFixture();
  const evidence = [
    {
      kind: 'oas',
      operation: input.context.operations[0].key,
      pointer: '/summary',
    },
  ];
  assert.doesNotThrow(() =>
    validateWorkflowPlanningEvidence({ context: input.context, evidence }),
  );
  assert.doesNotThrow(() =>
    validateWorkflowPlanningEvidence({
      context: input.context,
      evidence: [
        { kind: 'native', capability: input.context.capabilities[0].name },
      ],
    }),
  );
  for (const invalid of [
    [{ kind: 'message', messageId: 'request-1', quote: '환불도 해줘' }],
    [{ ...evidence[0], pointer: '/does-not-exist' }],
    [{ ...evidence[0], pointer: 'summary' }],
    [
      {
        ...evidence[0],
        operation: { ...evidence[0].operation, snapshotId: 'stale' },
      },
    ],
    [{ kind: 'native', capability: 'unregistered' }],
    [...evidence, ...evidence],
  ])
    assert.throws(() =>
      validateWorkflowPlanningEvidence({
        context: input.context,
        evidence: invalid,
      }),
    );
  const proposal = globalThis.structuredClone(input.proposal);
  proposal.statements[0].sources[0].quote = '모델이 지어낸 인용';
  assert.throws(
    () => createWorkflowClarificationRound({ ...input, proposal }),
    /fabricated quote/,
  );
});

test('typed partial replies preserve confirmed answers and distinguish deferral from missing answers', async () => {
  const input = await workflowClarificationFixture();
  input.proposal.categories = clarificationQuestions(
    input.proposal.statements[0].sources[0],
  );
  const round = createWorkflowClarificationRound(input);
  const [single, multiple, text] = round.categories[0].questions;
  const initial = resolveWorkflowClarificationReplies({
    round,
    context: input.context,
    replies: [
      { kind: 'defer', questionId: text.id },
      {
        kind: 'single-choice',
        questionId: single.id,
        choiceId: single.answer.choices[0].id,
      },
    ],
  });
  assert.deepEqual(initial.pendingQuestionIds, [multiple.id]);
  assert.deepEqual(initial.deferredQuestionIds, [text.id]);
  assert.equal(initial.readyForPlanning, false);
  assert.equal(initial.facts.length, 2);
  const before = globalThis.structuredClone(initial);
  const resolved = resolveWorkflowClarificationReplies({
    round,
    context: input.context,
    previous: initial,
    replies: [
      {
        kind: 'text',
        questionId: text.id,
        text: '문자열 "0"을 숫자로 바꾸지 마세요.',
      },
      {
        kind: 'multiple-choice',
        questionId: multiple.id,
        choiceIds: [
          multiple.answer.choices[1].id,
          multiple.answer.choices[0].id,
        ],
      },
    ],
  });
  assert.deepEqual(initial, before);
  assert.equal(resolved.readyForPlanning, true);
  assert.equal(resolved.facts.length, 4);
  assert.deepEqual(resolved.replies[0], initial.replies[0]);
  assert.equal(resolved.facts[3].sources[0].kind, 'clarification-answer');
  assert.match(resolved.requirementsPrompt, /문자열 "0"/);
  assert.doesNotThrow(() =>
    resolveWorkflowClarificationReplies({
      round,
      context: input.context,
      previous: resolved,
      replies: [],
    }),
  );
  assert.throws(
    () =>
      resolveWorkflowClarificationReplies({
        round,
        context: input.context,
        previous: initial,
        replies: [
          {
            kind: 'single-choice',
            questionId: single.id,
            choiceId: single.answer.choices[1].id,
          },
        ],
      }),
    /already answered/,
  );
});

test('wrong answer kinds, unknown IDs, duplicate answers and edited derived facts fail explicitly', async () => {
  const input = await workflowClarificationFixture();
  input.proposal.categories = clarificationQuestions(
    input.proposal.statements[0].sources[0],
  );
  const round = createWorkflowClarificationRound(input);
  const [single, multiple] = round.categories[0].questions;
  const answer = {
    kind: 'single-choice',
    questionId: single.id,
    choiceId: single.answer.choices[0].id,
  };
  for (const replies of [
    [
      {
        kind: 'multiple-choice',
        questionId: single.id,
        choiceIds: [single.answer.choices[0].id],
      },
    ],
    [{ ...answer, choiceId: multiple.answer.choices[0].id }],
    [{ ...answer, questionId: 'unknown' }],
    [answer, answer],
    [
      {
        kind: 'multiple-choice',
        questionId: multiple.id,
        choiceIds: [
          multiple.answer.choices[0].id,
          multiple.answer.choices[0].id,
        ],
      },
    ],
    [
      {
        kind: 'text',
        questionId: round.categories[0].questions[2].id,
        text: ' ',
      },
    ],
  ])
    assert.throws(() =>
      resolveWorkflowClarificationReplies({
        round,
        context: input.context,
        replies,
      }),
    );
  const previous = resolveWorkflowClarificationReplies({
    round,
    context: input.context,
    replies: [answer],
  });
  previous.facts[0].text = '임의로 바꾼 요구사항';
  assert.throws(
    () =>
      resolveWorkflowClarificationReplies({
        round,
        context: input.context,
        previous,
        replies: [],
      }),
    /modified facts/,
  );
});

test('changed context and modified question identities are not accepted as the same round', async () => {
  const input = await workflowClarificationFixture();
  const round = createWorkflowClarificationRound(input);
  const context = globalThis.structuredClone({
    ...input.context,
    capabilities: [],
  });
  context.messages.push({ id: 'request-2', text: '주소 조회도 추가해줘' });
  assert.throws(
    () => resolveWorkflowClarificationReplies({ round, context, replies: [] }),
    /stale/,
  );
  const edited = globalThis.structuredClone(round);
  edited.statements[0].id = 'new-id';
  assert.throws(
    () =>
      validateWorkflowClarificationRound({
        round: edited,
        context: input.context,
      }),
    /modified identities/,
  );
  assert.throws(
    () =>
      validateWorkflowClarificationRound({
        round: { ...round, extra: true },
        context: input.context,
      }),
    /modified identities/,
  );
});

test('optional suggestions remain separate from confirmed requirements and the derived prompt', async () => {
  const input = await workflowClarificationFixture();
  input.proposal.suggestions = [
    {
      text: '주소 조회도 추가해줘',
      explanation: input.proposal.statements[0].explanation,
    },
  ];
  const round = createWorkflowClarificationRound(input);
  assert.equal(round.suggestions.length, 1);
  const resolution = resolveWorkflowClarificationReplies({
    round,
    context: input.context,
    replies: [],
  });
  assert.doesNotMatch(resolution.requirementsPrompt, /주소/);
  assert.equal(resolution.facts.length, 1);
});

test('native-only and no-material contexts do not inject arbitrary HTTP APIs or a hidden registry', () => {
  const context = {
    messages: [{ id: 'request-1', text: '작업 흐름을 만들어줘' }],
  };
  assert.deepEqual(describeWorkflowPlanningContext(context), {
    ...context,
    operations: [],
    capabilities: [],
  });
  assert.throws(
    () => describeWorkflowPlanningContext({ messages: [] }),
    /context.messages/,
  );
  assert.throws(
    () => describeWorkflowPlanningContext({ messages: [null] }),
    /context.messages/,
  );
  assert.throws(
    () => describeWorkflowPlanningContext({ ...context, operations: [null] }),
    /context.operations\[0\].key/,
  );
  assert.throws(
    () => describeWorkflowPlanningContext({ ...context, capabilities: [null] }),
    /context.capabilities/,
  );
  assert.throws(
    () =>
      describeWorkflowPlanningContext({
        messages: [context.messages[0], context.messages[0]],
      }),
    /distinct/,
  );
  assert.throws(
    () => describeWorkflowPlanningContext({ ...context, operations: null }),
    /arrays/,
  );
});

test('the compiler-owned entrypoint is explicit planning evidence, not an invented native instance', async () => {
  const entrypoint = describeN8nManualTrigger();
  const template = compileN8nWorkflowTemplate(await workflowTemplateFixture());
  assert.equal(
    template.workflow.nodes.filter((node) => node.type === entrypoint.kind)
      .length,
    1,
  );
  const context = {
    messages: [{ id: 'request-1', text: '수동으로 시작해줘' }],
    entrypoint,
  };
  const evidence = [{ kind: 'entrypoint', entrypoint: entrypoint.kind }];
  assert.doesNotThrow(() =>
    validateWorkflowPlanningEvidence({ context, evidence }),
  );
  assert.throws(
    () =>
      validateWorkflowPlanningEvidence({
        context: { messages: context.messages },
        evidence,
      }),
    /unavailable entrypoint/,
  );
  assert.throws(
    () =>
      describeWorkflowPlanningContext({ ...context, entrypoint: { kind: '' } }),
    /context.entrypoint/,
  );
  const input = await workflowClarificationFixture();
  const round = createWorkflowClarificationRound(input);
  assert.throws(
    () =>
      validateWorkflowClarificationRound({
        round,
        context: {
          ...input.context,
          entrypoint: {
            ...input.context.entrypoint,
            description: 'changed declaration',
          },
        },
      }),
    /stale/,
  );
});

test('the model makes one typed bounded call and core resolves candidate evidence without model-owned keys', async () => {
  const input = await workflowClarificationFixture();
  const calls = [];
  const model = {
    withStructuredOutput(schema, config) {
      return {
        async invoke(messages) {
          calls.push({ schema, config, messages });
          const proposal = globalThis.structuredClone(input.proposal);
          proposal.statements[0].explanation.evidence = [
            { kind: 'oas', candidateId: 'candidate-1' },
          ];
          return modelMessageEvidenceSelections(proposal);
        },
      };
    },
  };
  const round = await clarifyWorkflowRequirements({ ...input, model });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].messages[0] instanceof SystemMessage);
  assert.ok(calls[0].messages[1] instanceof HumanMessage);
  assert.deepEqual(calls[0].config, {
    name: 'clarify_workflow_requirements',
    method: 'jsonSchema',
    strict: true,
  });
  assert.deepEqual(
    round.statements[0].explanation.evidence[0].operation,
    input.context.operations[0].key,
  );
  assert.equal(
    Object.hasOwn(round.statements[0].explanation.evidence[0], 'candidateId'),
    false,
  );
  assert.equal(round.statements[0].explanation.evidence[0].pointer, '');
  const wire = expandLocalSchemaReferences(toJsonSchema(calls[0].schema));
  assert.match(
    wire.properties.statements.items.properties.text.description,
    /explicitly/,
  );
  assert.deepEqual(
    wire.properties.statements.items.properties.sources.items.properties
      .messageId.enum,
    ['request-1'],
  );
});

test('the model wire requests explanations, but runtime clarification accepts omitted or malformed display text in a single call', async () => {
  const input = await workflowClarificationFixture();
  for (const explanation of [
    undefined,
    null,
    { reason: false },
    { reason: ' \n ', evidence: [] },
  ]) {
    let calls = 0;
    const round = await clarifyWorkflowRequirements({
      ...input,
      model: {
        withStructuredOutput(schema) {
          const wire = expandLocalSchemaReferences(toJsonSchema(schema));
          const statement = wire.properties.statements.items;
          assert(statement.required.includes('explanation'));
          assert.equal(
            statement.properties.explanation.properties.reason.type,
            'string',
          );
          return {
            async invoke() {
              calls++;
              const proposal = modelMessageEvidenceSelections(input.proposal);
              proposal.statements[0].explanation = explanation;
              return proposal;
            },
          };
        },
      },
    });
    assert.equal(calls, 1);
    assert.equal(round.statements[0].explanation, undefined);
    assert.deepEqual(
      round.statements[0].sources,
      input.proposal.statements[0].sources,
    );
    assert.deepEqual(round.categories, []);
  }
  let calls = 0;
  await assert.rejects(
    clarifyWorkflowRequirements({
      ...input,
      model: {
        withStructuredOutput() {
          return {
            async invoke() {
              calls++;
              const proposal = modelMessageEvidenceSelections(input.proposal);
              proposal.statements[0].explanation = {
                reason: null,
                evidence: [{ kind: 'oas', candidateId: 'not-supplied' }],
              };
              return proposal;
            },
          };
        },
      },
    }),
    /model workflow requirements is invalid/,
  );
  assert.equal(calls, 1);
});

test('disabled optional output fields are absent from the real schema, not generated then discarded', async () => {
  const context = {
    messages: [
      { id: 'native-request', text: '처리를 중단하는 작업 흐름을 만들어줘.' },
    ],
  };
  const options = { includeExplanations: false, includeSuggestions: false };
  const calls = [];
  const model = {
    withStructuredOutput(schema) {
      return {
        async invoke(messages) {
          calls.push({ schema, messages });
          return {
            statements: [
              {
                text: context.messages[0].text,
                sources: [
                  {
                    kind: 'message',
                    messageId: 'native-request',
                  },
                ],
              },
            ],
            categories: [],
          };
        },
      };
    },
  };
  const round = await clarifyWorkflowRequirements({
    context,
    limits: clarificationLimits,
    options,
    model,
  });
  assert.equal(calls.length, 1);
  const wire = expandLocalSchemaReferences(toJsonSchema(calls[0].schema));
  assert.equal(Object.hasOwn(wire.properties, 'suggestions'), false);
  assert.equal(
    Object.hasOwn(wire.properties.statements.items.properties, 'explanation'),
    false,
  );
  assert.equal(Object.hasOwn(round, 'suggestions'), false);
  const invalid = {
    ...round.statements[0],
    explanation: { reason: 'not allowed', evidence: [] },
  };
  delete invalid.id;
  await assert.rejects(
    clarifyWorkflowRequirements({
      context,
      limits: clarificationLimits,
      options,
      model: {
        withStructuredOutput() {
          return {
            async invoke() {
              return { statements: [invalid], categories: [] };
            },
          };
        },
      },
    }),
    /model workflow requirements is invalid/,
  );
});

test('invalid model proposals and transport errors propagate once without retry, repair or invented questions', async () => {
  const input = await workflowClarificationFixture();
  let calls = 0;
  let output = {
    ...input.proposal,
    statements: [
      {
        ...input.proposal.statements[0],
        explanation: {
          reason: 'invalid',
          evidence: [{ kind: 'oas', candidateId: 'unknown' }],
        },
      },
    ],
  };
  const model = {
    withStructuredOutput() {
      return {
        async invoke() {
          calls++;
          if (output instanceof Error) throw output;
          return output;
        },
      };
    },
  };
  await assert.rejects(
    clarifyWorkflowRequirements({ ...input, model }),
    /model workflow requirements is invalid/,
  );
  output = new Error('upstream timed out');
  await assert.rejects(
    clarifyWorkflowRequirements({ ...input, model }),
    (error) => error === output,
  );
  assert.equal(calls, 2);
  const before = calls;
  await assert.rejects(
    clarifyWorkflowRequirements({
      ...input,
      limits: { ...input.limits, maxCategories: 0 },
      model,
    }),
  );
  assert.equal(calls, before);
});
import { modelMessageEvidenceSelections } from './fixtures/model-message-evidence-selections.mjs';
