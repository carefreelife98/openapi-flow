import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import {
  applyConfirmedApiInputs,
  createApiArgumentGenerationContract,
  createApiInputAnswersSchema,
  inspectApiArgumentRequirements,
  resolveApiSelectionAnswers,
  validateApiInputAnswers,
  createApiCatalog,
} from '@openapi-flow/core';
import {
  analyzeApiSelection,
  generateApiArguments,
  extractApiInputAnswers,
} from '@openapi-flow/langchain';
import {
  clarificationOperation,
  clarificationModel,
  clarificationSpec,
} from './fixtures/api-clarification-fixture.mjs';

test('OAS determines required input questions with stable snapshot-scoped IDs and unchanged schemas', async () => {
  const { operation } = await clarificationOperation();
  const input = { operation, callId: 'read', values: {}, bindings: [] };
  const inspection = inspectApiArgumentRequirements(input);
  assert.equal(inspection.status, 'needs-input');
  assert.equal(inspection.requirements[0].targetPointer, '/path/id');
  assert.deepEqual(inspection.requirements[0].schema, {
    type: 'string',
    minLength: 2,
  });
  assert.deepEqual(inspection, inspectApiArgumentRequirements(input));
  assert.notEqual(
    inspection.requirements[0].id,
    inspectApiArgumentRequirements({ ...input, callId: 'another' })
      .requirements[0].id,
  );
  assert.equal(
    inspectApiArgumentRequirements({
      ...input,
      values: { path: { id: 'member-01' } },
    }).status,
    'ready',
  );
});

test('answer wire schemas remain valid JSON Schema with one or multiple pending fields', async () => {
  const { operation } = await clarificationOperation();
  const { requirements } = inspectApiArgumentRequirements({
    operation,
    callId: 'read',
    values: {},
    bindings: [],
  });
  const require = createRequire(
    new URL('../packages/core/package.json', import.meta.url),
  );
  const { Ajv2020 } = require('ajv/dist/2020.js');
  const validator = new Ajv2020({ strict: false });
  for (const pending of [
    requirements,
    [...requirements, { ...requirements[0], id: 'another' }],
  ]) {
    assert.equal(
      validator.validateSchema(
        z.toJSONSchema(createApiInputAnswersSchema(pending)),
      ),
      true,
    );
  }
});

test('JSON source spans preserve numbers, arrays, objects, null and empty strings without type changes', async () => {
  const { operation } = await clarificationOperation();
  const original = inspectApiArgumentRequirements({
    operation,
    callId: 'read',
    values: {},
    bindings: [],
  }).requirements[0];
  for (const value of [2, false, null, '', [1, 'two'], { name: 'value' }]) {
    const sourceText = JSON.stringify(value);
    const requirements = [{ ...original, schema: true }];
    const model = {
      withStructuredOutput() {
        return {
          async invoke() {
            return {
              answers: [
                {
                  requirementId: original.id,
                  value,
                  sourceFormat: 'json',
                  sourceText,
                },
              ],
            };
          },
        };
      },
    };
    const result = await extractApiInputAnswers({
      model,
      requirements,
      reply: `입력: ${sourceText}`,
    });
    assert.deepEqual(result[0].value, value);
  }
});

test('confirmed arrays never fill missing prefixes and numeric object keys stay object keys', async () => {
  for (const bodySchema of [
    {
      type: 'array',
      items: { type: 'object', properties: { code: { type: 'string' } } },
    },
    {
      type: 'object',
      properties: {
        0: { type: 'object', properties: { code: { type: 'string' } } },
      },
    },
  ]) {
    const spec = globalThis.structuredClone(clarificationSpec);
    spec.paths['/body'] = {
      post: {
        requestBody: {
          content: { 'application/json': { schema: bodySchema } },
        },
        responses: { 200: { description: 'OK' } },
      },
    };
    const catalog = await createApiCatalog([{ id: 'body', spec }]);
    const key = catalog.operations.find((item) => item.method === 'POST').key;
    const { resolveApiOperations } = await import('@openapi-flow/core');
    const [operation] = await resolveApiOperations(catalog, [key]);
    const confirmed = {
      callId: 'write',
      operation: key,
      targetPointer: '/body/0/code',
      value: 'A',
    };
    const input = {
      operation,
      callId: 'write',
      bindings: [],
      values: {},
      confirmedInputs: [confirmed],
    };
    const output = applyConfirmedApiInputs(input);
    assert.equal(Array.isArray(output.body), bodySchema.type === 'array');
    assert.equal(output.body[0].code, 'A');
    if (bodySchema.type === 'array')
      assert.throws(
        () =>
          applyConfirmedApiInputs({
            ...input,
            confirmedInputs: [{ ...confirmed, targetPointer: '/body/3/code' }],
          }),
        /explicit complete array prefix/,
      );
  }
});

test('typed answers are validated without coercion, default values or unknown ID acceptance', async () => {
  const { operation } = await clarificationOperation();
  const { requirements } = inspectApiArgumentRequirements({
    operation,
    callId: 'read',
    values: {},
    bindings: [],
  });
  for (const answers of [
    [{ requirementId: requirements[0].id, value: 1 }],
    [{ requirementId: 'other', value: 'member-01' }],
    [],
    [
      { requirementId: requirements[0].id, value: 'member-01' },
      { requirementId: requirements[0].id, value: 'member-01' },
    ],
  ]) {
    assert.equal(
      validateApiInputAnswers({
        requirements,
        answers,
        operations: [operation.key],
      }).status,
      'invalid-answer',
    );
  }
  const accepted = validateApiInputAnswers({
    requirements,
    answers: [{ requirementId: requirements[0].id, value: 'member-01' }],
    operations: [operation.key],
  });
  assert.equal(accepted.status, 'accepted');
  assert.deepEqual(
    applyConfirmedApiInputs({
      operation,
      callId: 'read',
      bindings: [],
      values: {},
      confirmedInputs: accepted.confirmedInputs,
    }),
    { path: { id: 'member-01' } },
  );
  assert.throws(
    () =>
      validateApiInputAnswers({
        requirements,
        answers: [{ requirementId: requirements[0].id, value: 'member-01' }],
        operations: [{ ...operation.key, snapshotId: 'changed' }],
      }),
    /stale OAS/,
  );
});

test('confirmed inputs are excluded from model schemas and skip a fully owned model call', async () => {
  const { operation } = await clarificationOperation();
  const confirmedInputs = [
    {
      callId: 'read',
      operation: operation.key,
      targetPointer: '/path/id',
      value: 'member-01',
    },
  ];
  const input = { callId: 'read', operation, bindings: [], confirmedInputs };
  const contract = createApiArgumentGenerationContract(input);
  assert.equal(contract.hasLiteralInputs, false);
  assert.throws(() =>
    contract.schema.parse({ values: { path: { id: 'different' } } }),
  );
  const model = {
    withStructuredOutput() {
      throw new Error('A fully confirmed request must not invoke the model');
    },
  };
  const result = await generateApiArguments({
    ...input,
    scenario: 'Read member summary',
    model,
  });
  assert.deepEqual(result.values, { path: { id: 'member-01' } });
  assert.deepEqual(result.unresolvedInputs, []);
});

test('confirmed input identity, overlap and invalid values fail before model execution', async () => {
  const { operation } = await clarificationOperation();
  const confirmed = {
    callId: 'read',
    operation: operation.key,
    targetPointer: '/path/id',
    value: 'member-01',
  };
  const input = { operation, callId: 'read', bindings: [] };
  for (const item of [
    { ...confirmed, callId: 'other' },
    { ...confirmed, operation: { ...operation.key, snapshotId: 'stale' } },
    { ...confirmed, value: 1 },
    { ...confirmed, targetPointer: '/query/no-such-parameter' },
  ]) {
    assert.throws(() =>
      createApiArgumentGenerationContract({
        ...input,
        confirmedInputs: [item],
      }),
    );
  }
  assert.throws(
    () =>
      createApiArgumentGenerationContract({
        ...input,
        confirmedInputs: [confirmed, confirmed],
      }),
    /overlap/,
  );
  assert.throws(
    () =>
      createApiArgumentGenerationContract({
        ...input,
        bindings: [
          {
            kind: 'node-output',
            sourceNodeId: 'source',
            sourcePointer: '/id',
            targetPointer: '/path/id',
          },
        ],
        confirmedInputs: [confirmed],
      }),
    /overlap/,
  );
  assert.throws(
    () =>
      applyConfirmedApiInputs({
        ...input,
        values: { path: { id: 'already-present' } },
        confirmedInputs: [confirmed],
      }),
    /conflicts/,
  );
});

test('remaining model values cannot replace confirmed nested fields', async () => {
  const spec = globalThis.structuredClone(clarificationSpec);
  spec.paths['/members/{id}'].post = {
    summary: 'Update member',
    parameters: spec.paths['/members/{id}'].get.parameters,
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string' },
              quantity: { type: 'number' },
            },
            required: ['name', 'quantity'],
          },
        },
      },
    },
    responses: { 200: { description: 'OK' } },
  };
  const catalog = await createApiCatalog([{ id: 'members', spec }]);
  const { resolveApiOperations } = await import('@openapi-flow/core');
  const key = catalog.operations.find((item) => item.method === 'POST').key;
  const [operation] = await resolveApiOperations(catalog, [key]);
  const input = {
    operation,
    callId: 'update',
    bindings: [],
    confirmedInputs: [
      {
        callId: 'update',
        operation: key,
        targetPointer: '/path/id',
        value: 'member-01',
      },
      {
        callId: 'update',
        operation: key,
        targetPointer: '/body/name',
        value: 'Confirmed name',
      },
    ],
    scenario: 'quantity is 2',
  };
  const wire = z.toJSONSchema(
    createApiArgumentGenerationContract(input).schema,
  );
  assert.equal(wire.properties.values.properties.body.properties.name, false);
  const model = {
    withStructuredOutput() {
      return {
        async invoke() {
          return { values: { body: { quantity: 2 } } };
        },
      };
    },
  };
  const result = await generateApiArguments({ ...input, model });
  assert.deepEqual(result.values, {
    path: { id: 'member-01' },
    body: { quantity: 2, name: 'Confirmed name' },
  });
  await assert.rejects(
    generateApiArguments({
      ...input,
      model: {
        withStructuredOutput() {
          return {
            async invoke() {
              return { values: { body: { name: 'Changed', quantity: 2 } } };
            },
          };
        },
      },
    }),
  );
});

test('API ambiguity is separate from missing capability and is resolved against the offered snapshot', async () => {
  const { catalog } = await clarificationOperation();
  const analysis = await analyzeApiSelection({
    operations: catalog.operations,
    scenario: 'Read member',
    model: clarificationModel({ ambiguous: true }),
  });
  assert.equal(analysis.questions.length, 1);
  assert.deepEqual(analysis.selection, { operations: [], gaps: [] });
  const answer = {
    questionId: analysis.questions[0].id,
    operation: catalog.operations[0].key,
  };
  const resolved = await resolveApiSelectionAnswers({
    catalog,
    analysis,
    answers: [answer],
  });
  assert.equal(resolved.questions.length, 0);
  assert.deepEqual(resolved.selection.operations[0].key, answer.operation);
  await assert.rejects(
    resolveApiSelectionAnswers({
      catalog,
      analysis,
      answers: [
        { ...answer, operation: { ...answer.operation, snapshotId: 'stale' } },
      ],
    }),
    /offered candidate/,
  );
  await assert.rejects(
    resolveApiSelectionAnswers({
      catalog,
      analysis,
      answers: [answer, answer],
    }),
    /duplicate/,
  );
  const changed = globalThis.structuredClone(catalog);
  changed.documents[0].spec.info.version = 'changed';
  await assert.rejects(
    resolveApiSelectionAnswers({
      catalog: changed,
      analysis,
      answers: [answer],
    }),
    /changed after catalog/,
  );
  const missing = await analyzeApiSelection({
    operations: catalog.operations,
    scenario: 'Refund',
    model: clarificationModel({ missing: true }),
  });
  assert.equal(missing.selection.gaps[0].kind, 'missing_operation');
  assert.deepEqual(missing.questions, []);
});

test('free-text answer extraction receives pending OAS schemas and only returns offered typed answers', async () => {
  const { operation } = await clarificationOperation();
  const { requirements } = inspectApiArgumentRequirements({
    operation,
    callId: 'read',
    values: {},
    bindings: [],
  });
  const model = clarificationModel();
  const answers = await extractApiInputAnswers({
    requirements,
    reply: '회원번호는 member-01이야.',
    model,
  });
  assert.deepEqual(answers, [
    { requirementId: requirements[0].id, value: 'member-01' },
  ]);
  assert.equal(model.calls.length, 1);
  const schema = createApiInputAnswersSchema(requirements);
  assert.deepEqual(schema.parse({ answers: [] }), { answers: [] });
  assert.throws(() =>
    schema.parse({ answers: [{ requirementId: 'other', value: 'member-01' }] }),
  );
  assert.throws(() =>
    schema.parse({
      answers: [{ requirementId: requirements[0].id, value: 1 }],
    }),
  );
});

test('schema-valid invented values and fabricated source spans are rejected, never repaired', async () => {
  const { operation } = await clarificationOperation();
  const { requirements } = inspectApiArgumentRequirements({
    operation,
    callId: 'read',
    values: {},
    bindings: [],
  });
  for (const output of [
    { value: 'invented-id', sourceFormat: 'text', sourceText: 'invented-id' },
    { value: 'invented-id', sourceFormat: 'text', sourceText: 'member-01' },
    { value: 'invented-id', sourceFormat: 'json', sourceText: '"member-01"' },
  ]) {
    const model = {
      withStructuredOutput() {
        return {
          async invoke() {
            return {
              answers: [{ requirementId: requirements[0].id, ...output }],
            };
          },
        };
      },
    };
    await assert.rejects(
      extractApiInputAnswers({
        requirements,
        reply: '회원번호는 "member-01"이야.',
        model,
      }),
      /sourceText|verbatim/,
    );
  }
});

test('OAS 3.0 nullable answer validation preserves null and does not default missing values', async () => {
  const spec = globalThis.structuredClone(clarificationSpec);
  spec.openapi = '3.0.3';
  spec.paths['/members/{id}'].get.parameters[0].schema = {
    type: 'string',
    nullable: true,
  };
  const { operation } = await clarificationOperation(spec);
  const { requirements } = inspectApiArgumentRequirements({
    operation,
    callId: 'nullable',
    values: {},
    bindings: [],
  });
  const result = validateApiInputAnswers({
    requirements,
    answers: [{ requirementId: requirements[0].id, value: null }],
    operations: [operation.key],
  });
  assert.equal(result.status, 'accepted');
  assert.equal(result.confirmedInputs[0].value, null);
});
