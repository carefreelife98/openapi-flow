import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import test from 'node:test';
import { z } from 'zod';
import {
  assembleWorkflowDraftEdit,
  createWorkflowDraftApiInputEditContract,
  createWorkflowDraftApiInputEditAnswersSchema,
  resolveWorkflowDraftApiInputEdits,
} from '@openapi-flow/core';
import { schemaDraftInputEditFixture } from './fixtures/workflow-draft-api-input-edit-fixture.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');

async function fixture() {
  const body = {
    name: 'old',
    count: 4,
    enabled: true,
    nullable: 'old',
    rows: [1],
  };
  const input = await schemaDraftInputEditFixture(
    {
      type: 'object',
      properties: {
        name: { type: 'string' },
        count: { type: 'integer' },
        enabled: { type: 'boolean' },
        nullable: { type: ['string', 'null'] },
        rows: { type: 'array', items: { type: 'integer' } },
      },
      required: Object.keys(body),
      additionalProperties: false,
    },
    body,
    'Change these fields. Ask for the new values; do not reuse their old values.',
  );
  const contract = createWorkflowDraftApiInputEditContract({
    ...input,
    proposal: {
      targets: Object.keys(body).map((name) => ({
        kind: 'set',
        pointer: '/body/' + name,
        sources: input.sources,
      })),
    },
  });
  const output = {
    values: Object.fromEntries(
      contract.targets.map((target) => [target.id, { status: 'needs-input' }]),
    ),
  };
  return { ...input, contract, output };
}

test('typed edit answers preserve actual values without rewriting model evidence or messages', async () => {
  const input = await fixture();
  const values = ['0007', 0, false, null, [0, 2]];
  const confirmedAnswers = {
    contractId: input.contract.id,
    answers: input.contract.targets.map((target, index) => ({
      targetId: target.id,
      value: values[index],
    })),
  };
  const before = globalThis.structuredClone({
    draft: input.draft,
    contract: input.contract,
    output: input.output,
    confirmedAnswers,
  });
  const schema = createWorkflowDraftApiInputEditAnswersSchema(input);
  assert.deepEqual(schema.parse(confirmedAnswers), confirmedAnswers);
  const result = resolveWorkflowDraftApiInputEdits({
    ...input,
    confirmedAnswers,
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.values, input.output);
  assert.deepEqual(result.confirmedAnswers, confirmedAnswers);
  assert.deepEqual(
    Object.fromEntries(
      result.resolution.edits.map((edit) => [edit.pointer, edit.value]),
    ),
    Object.fromEntries(
      input.contract.targets.map((target, index) => [
        target.pointer,
        values[index],
      ]),
    ),
  );
  const adopted = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
  });
  assert.deepEqual(adopted.draft.apiCalls[0].values.body, {
    name: '0007',
    count: 0,
    enabled: false,
    nullable: null,
    rows: [0, 2],
  });
  assert.deepEqual(
    {
      draft: input.draft,
      contract: input.contract,
      output: input.output,
      confirmedAnswers,
    },
    before,
  );
  assert.equal(JSON.stringify(result.values).includes('0007'), false);
  result.confirmedAnswers.answers[4].value.push(9);
  assert.deepEqual(confirmedAnswers.answers[4].value, [0, 2]);
  assert.deepEqual(
    result.resolution.edits.find((edit) => edit.pointer === '/body/rows').value,
    [0, 2],
  );
});

test('partial typed replies retain their own receipt and return only still-unanswered targets', async () => {
  const input = await fixture();
  const firstReply = {
    contractId: input.contract.id,
    answers: [{ targetId: input.contract.targets[0].id, value: '0007' }],
  };
  const first = resolveWorkflowDraftApiInputEdits({
    ...input,
    confirmedAnswers: firstReply,
  });
  assert.equal(first.status, 'needs-input');
  assert.deepEqual(
    first.pendingTargets.map((target) => target.id),
    input.contract.targets.slice(1).map((target) => target.id),
  );
  assert.deepEqual(first.values, input.output);
  assert.equal(Object.hasOwn(first, 'resolution'), false);
  assert.equal(input.draft.apiCalls[0].values.body.name, 'old');
  const moreValues = [0, false, null, []];
  const second = resolveWorkflowDraftApiInputEdits({
    ...input,
    confirmedAnswers: {
      ...first.confirmedAnswers,
      answers: [
        ...first.confirmedAnswers.answers,
        ...first.pendingTargets.map((target, index) => ({
          targetId: target.id,
          value: moreValues[index],
        })),
      ],
    },
  });
  assert.equal(second.status, 'ready');
  const adopted = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [second.resolution],
  });
  assert.deepEqual(adopted.draft.apiCalls[0].values.body, {
    name: '0007',
    count: 0,
    enabled: false,
    nullable: null,
    rows: [],
  });
});

test('answer schema rejects stale contracts, foreign or duplicate target IDs, coercion and invented metadata', async () => {
  const input = await fixture();
  const targetId = input.contract.targets[1].id;
  const valid = {
    contractId: input.contract.id,
    answers: [{ targetId, value: 0 }],
  };
  const schema = createWorkflowDraftApiInputEditAnswersSchema(input);
  for (const invalid of [
    { ...valid, contractId: 'another-contract' },
    { ...valid, answers: [{ targetId: 'unknown', value: 0 }] },
    { ...valid, answers: [{ targetId, value: '0' }] },
    { ...valid, answers: [...valid.answers, ...valid.answers] },
    { ...valid, explanation: 'invented-model-reason' },
    {
      ...valid,
      answers: [{ ...valid.answers[0], source: { messageId: 'fake' } }],
    },
  ]) {
    assert.equal(schema.safeParse(invalid).success, false);
    assert.throws(() =>
      resolveWorkflowDraftApiInputEdits({
        ...input,
        confirmedAnswers: invalid,
      }),
    );
  }
  const wire = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' });
  assert.equal(wire.properties.contractId.const, input.contract.id);
});

test('human answers cannot override model-provided targets or legitimize invalid model evidence', async () => {
  const input = await fixture();
  const [provided, pending] = input.contract.targets;
  const text = input.context.messages[0].text;
  const output = {
    values: {
      ...input.output.values,
      [provided.id]: {
        status: 'provided',
        value: text,
        source: { messageId: 'edit-1', sourceFormat: 'text', sourceText: text },
      },
    },
  };
  const schema = createWorkflowDraftApiInputEditAnswersSchema({
    ...input,
    output,
  });
  assert.equal(
    schema.safeParse({
      contractId: input.contract.id,
      answers: [{ targetId: provided.id, value: 'replaced' }],
    }).success,
    false,
  );
  assert.throws(
    () =>
      resolveWorkflowDraftApiInputEdits({
        ...input,
        output: {
          values: {
            ...output.values,
            [provided.id]: {
              ...output.values[provided.id],
              source: {
                messageId: 'edit-1',
                sourceFormat: 'text',
                sourceText: 'absent',
              },
            },
          },
        },
        confirmedAnswers: {
          contractId: input.contract.id,
          answers: [{ targetId: pending.id, value: 0 }],
        },
      }),
    /source|match|literal/,
  );
});

test('provided and removal-only contracts accept only an empty answer list with valid wire schema', async () => {
  for (const kind of ['set', 'remove']) {
    const input = await schemaDraftInputEditFixture(
      { type: 'object', properties: { name: { type: 'string' } } },
      { name: 'old' },
      'new',
    );
    const contract = createWorkflowDraftApiInputEditContract({
      ...input,
      proposal: {
        targets: [{ kind, pointer: '/body/name', sources: input.sources }],
      },
    });
    const output = {
      values:
        kind === 'remove'
          ? {}
          : {
              [contract.targets[0].id]: {
                status: 'provided',
                value: 'new',
                source: {
                  messageId: 'edit-1',
                  sourceFormat: 'text',
                  sourceText: 'new',
                },
              },
            },
    };
    const schema = createWorkflowDraftApiInputEditAnswersSchema({
      ...input,
      contract,
      output,
    });
    const empty = { contractId: contract.id, answers: [] };
    assert.deepEqual(schema.parse(empty), empty);
    assert.equal(
      schema.safeParse({
        ...empty,
        answers: [{ targetId: contract.targets[0].id, value: 'new' }],
      }).success,
      false,
    );
    const wire = z.toJSONSchema(schema, {
      target: 'draft-2020-12',
      io: 'input',
    });
    const ajv = new Ajv2020({ strict: false });
    assert.equal(ajv.validateSchema(wire), true, JSON.stringify(ajv.errors));
    assert.equal(ajv.compile(wire)(empty), true);
    assert.equal(JSON.stringify(wire).includes('"prefixItems":[]'), false);
    const result = resolveWorkflowDraftApiInputEdits({
      ...input,
      contract,
      output,
      confirmedAnswers: empty,
    });
    assert.equal(result.status, 'ready');
  }
});

test('typed answers validate original resource references and tuple positions without a second model call', async () => {
  const input = await schemaDraftInputEditFixture(
    {
      type: 'object',
      $defs: { Name: { type: 'string', minLength: 1 } },
      properties: {
        tuple: {
          type: 'array',
          prefixItems: [
            {
              $ref: '#/paths/~1payload/put/requestBody/content/application~1json/schema/$defs/Name',
            },
            { type: 'integer', minimum: 1 },
          ],
          items: false,
          minItems: 2,
          maxItems: 2,
        },
      },
      required: ['tuple'],
      additionalProperties: false,
    },
    { tuple: ['old', 1] },
    'Change the tuple. Ask for its complete actual value.',
  );
  const contract = createWorkflowDraftApiInputEditContract({
    ...input,
    proposal: {
      targets: [
        { kind: 'set', pointer: '/body/tuple', sources: input.sources },
      ],
    },
  });
  const output = {
    values: { [contract.targets[0].id]: { status: 'needs-input' } },
  };
  const schema = createWorkflowDraftApiInputEditAnswersSchema({
    ...input,
    contract,
    output,
  });
  const reply = {
    contractId: contract.id,
    answers: [{ targetId: contract.targets[0].id, value: ['0007', 2] }],
  };
  const wire = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' });
  const ajv = new Ajv2020({ strict: false });
  assert.equal(ajv.validateSchema(wire), true, JSON.stringify(ajv.errors));
  const validate = ajv.compile(wire);
  assert.equal(validate(reply), true, JSON.stringify(validate.errors));
  for (const value of [
    ['', 2],
    ['x', '2'],
    ['x', 0],
    ['x', 2, 3],
  ]) {
    const invalid = { ...reply, answers: [{ ...reply.answers[0], value }] };
    assert.equal(schema.safeParse(invalid).success, false);
    assert.equal(validate(invalid), false);
  }
  const result = resolveWorkflowDraftApiInputEdits({
    ...input,
    contract,
    output,
    confirmedAnswers: reply,
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.resolution.edits[0].value, ['0007', 2]);
});

test('OAS 3.0 nullable values are preserved and complete-request constraints still gate atomic resolution', async () => {
  const nullable = await schemaDraftInputEditFixture(
    {
      type: 'object',
      properties: { name: { type: 'string', nullable: true } },
      required: ['name'],
    },
    { name: 'old' },
    'Change name. Ask for its actual value.',
    '3.0.3',
  );
  const contract = createWorkflowDraftApiInputEditContract({
    ...nullable,
    proposal: {
      targets: [
        { kind: 'set', pointer: '/body/name', sources: nullable.sources },
      ],
    },
  });
  const output = {
    values: { [contract.targets[0].id]: { status: 'needs-input' } },
  };
  const nullResult = resolveWorkflowDraftApiInputEdits({
    ...nullable,
    contract,
    output,
    confirmedAnswers: {
      contractId: contract.id,
      answers: [{ targetId: contract.targets[0].id, value: null }],
    },
  });
  assert.equal(nullResult.status, 'ready');
  assert.equal(nullResult.resolution.edits[0].value, null);

  const input = await schemaDraftInputEditFixture(
    {
      type: 'object',
      properties: { count: { type: 'integer' }, size: { type: 'string' } },
      required: ['count', 'size'],
      if: { properties: { count: { minimum: 5 } } },
      then: { properties: { size: { const: 'large' } } },
    },
    { count: 1, size: 'small' },
    'Change count. Ask for the new count.',
  );
  const constrainedContract = createWorkflowDraftApiInputEditContract({
    ...input,
    proposal: {
      targets: [
        { kind: 'set', pointer: '/body/count', sources: input.sources },
      ],
    },
  });
  const before = globalThis.structuredClone(input.draft);
  assert.throws(
    () =>
      resolveWorkflowDraftApiInputEdits({
        ...input,
        contract: constrainedContract,
        output: {
          values: {
            [constrainedContract.targets[0].id]: { status: 'needs-input' },
          },
        },
        confirmedAnswers: {
          contractId: constrainedContract.id,
          answers: [{ targetId: constrainedContract.targets[0].id, value: 5 }],
        },
      }),
    /schema|OAS|constant|body/,
  );
  assert.deepEqual(input.draft, before);
});
