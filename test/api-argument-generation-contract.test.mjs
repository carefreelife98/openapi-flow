import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import {
  createApiArgumentGenerationContract,
  createApiArgumentsSchema,
  validateApiArguments,
} from '@openapi-flow/core';
import { generateApiArguments } from '@openapi-flow/langchain';
import {
  outputBinding,
  requestOperation,
  noInvocationModel,
} from './fixtures/api-argument-generation-fixture.mjs';

const cacheSchema = {
  type: 'boolean',
  description: 'This bound definition must not reach the literal model',
};
const literalSchema = {
  type: 'integer',
  description: 'Quantity explicitly requested for this call',
};
const inputFor = (operation, bindings) => ({
  operation,
  bindings,
  requestMediaType: 'application/json',
});

test('one generation contract supplies the Zod tool and model input without bound definitions', async () => {
  const operation = await requestOperation({
    type: 'object',
    properties: { enableCache: cacheSchema, quantity: literalSchema },
  });
  const input = inputFor(operation, [outputBinding('/body/enableCache')]);
  const before = globalThis.structuredClone(operation);
  const contract = createApiArgumentGenerationContract(input);
  assert.equal(contract.hasLiteralInputs, true);
  assert.deepEqual(
    contract.literalInputSchema,
    z.toJSONSchema(contract.schema),
  );
  assert.equal(
    contract.schema.safeParse({ values: { body: { enableCache: false } } })
      .success,
    false,
  );
  assert.equal(
    contract.schema.safeParse({
      values: { body: { unrelated: 'OAS allows extras' } },
    }).success,
    true,
  );
  const result = await generateApiArguments({
    ...input,
    callId: 'consumer',
    scenario: 'Use the bound cache value and quantity 2',
    model: {
      withStructuredOutput(schema) {
        return {
          async invoke(messages) {
            const prompt = JSON.parse(messages[1].content);
            assert.deepEqual(prompt.literalInputSchema, toJsonSchema(schema));
            assert.equal(Object.hasOwn(prompt, 'bindings'), false);
            assert.equal(Object.hasOwn(prompt.operation, 'parameters'), false);
            assert.equal(Object.hasOwn(prompt.operation, 'requestBody'), false);
            assert.equal(
              JSON.stringify(prompt).includes(cacheSchema.description),
              false,
            );
            assert.ok(
              JSON.stringify(prompt).includes(literalSchema.description),
            );
            return { values: { body: { quantity: 2 } } };
          },
        };
      },
    },
  });
  assert.deepEqual(result.values, { body: { quantity: 2 } });
  assert.deepEqual(result.bindings, input.bindings);
  assert.deepEqual(operation, before);
  assert.deepEqual(
    createApiArgumentsSchema(input).parse({ values: result.values }),
    {
      values: result.values,
    },
  );
});

test('bound fields cannot re-enter open nested objects or matching pattern properties', async () => {
  const operation = await requestOperation({
    type: 'object',
    additionalProperties: false,
    properties: {
      filter: {
        type: 'object',
        additionalProperties: true,
        properties: { 'cache/key': cacheSchema, quantity: literalSchema },
        patternProperties: { '^cache/': { type: 'boolean' } },
      },
    },
  });
  const schema = createApiArgumentsSchema(
    inputFor(operation, [outputBinding('/body/filter/cache~1key')]),
  );
  assert.equal(
    schema.safeParse({ values: { body: { filter: { 'cache/key': false } } } })
      .success,
    false,
  );
  assert.equal(
    schema.safeParse({
      values: { body: { filter: { 'cache/other': true, quantity: 2 } } },
    }).success,
    true,
  );
});

test('fully bound nested closed bodies and parameter objects do not call the model', async () => {
  const operation = await requestOperation(
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        filter: {
          type: 'object',
          additionalProperties: false,
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
      required: ['filter'],
    },
    [
      {
        in: 'query',
        name: 'options',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { enabled: { type: 'boolean' } },
        },
      },
    ],
  );
  const input = inputFor(operation, [
    outputBinding('/body/filter/id'),
    outputBinding('/query/options/enabled'),
  ]);
  assert.equal(
    createApiArgumentGenerationContract(input).hasLiteralInputs,
    false,
  );
  const result = await generateApiArguments({
    ...input,
    callId: 'consumer',
    scenario: 'Use preceding responses for all inputs',
    model: noInvocationModel(),
  });
  assert.deepEqual(result.values, {});
  assert.deepEqual(result.unresolvedInputs, []);
});

test('whole-body bindings skip the model even when OAS permits arbitrary properties', async () => {
  const operation = await requestOperation({
    type: 'object',
    additionalProperties: true,
  });
  const input = inputFor(operation, [outputBinding('/body')]);
  assert.equal(
    createApiArgumentGenerationContract(input).hasLiteralInputs,
    false,
  );
  assert.deepEqual(
    (
      await generateApiArguments({
        ...input,
        callId: 'consumer',
        scenario: 'Use the complete source response',
        model: noInvocationModel(),
      })
    ).values,
    {},
  );
});

test('open properties and unbound empty containers remain legitimate model decisions', async () => {
  const open = await requestOperation({
    type: 'object',
    properties: { enableCache: cacheSchema },
  });
  assert.equal(
    createApiArgumentGenerationContract(
      inputFor(open, [outputBinding('/body/enableCache')]),
    ).hasLiteralInputs,
    true,
  );
  const closed = await requestOperation({
    type: 'object',
    additionalProperties: false,
    properties: {
      enableCache: cacheSchema,
      empty: { type: 'object', additionalProperties: false },
    },
  });
  const contract = createApiArgumentGenerationContract(
    inputFor(closed, [outputBinding('/body/enableCache')]),
  );
  assert.equal(contract.hasLiteralInputs, true);
  assert.deepEqual(contract.schema.parse({ values: { body: { empty: {} } } }), {
    values: { body: { empty: {} } },
  });
});

test('OAS stays authoritative: allowed optional values are not globally forbidden', async () => {
  const operation = await requestOperation({
    type: 'object',
    properties: {
      validationType: { type: 'string', enum: ['NONE', 'VALID_STAT'] },
      enableCache: cacheSchema,
    },
  });
  const contract = createApiArgumentGenerationContract(
    inputFor(operation, [outputBinding('/body/enableCache')]),
  );
  const values = { body: { validationType: 'NONE' } };
  assert.ok(contract.schema.safeParse({ values }).success);
  assert.ok(
    validateApiArguments({
      ...inputFor(operation, []),
      values: { body: { validationType: 'NONE', enableCache: true } },
    }).valid,
  );
});

test('a bound array index does not change the schemas of other positions', async () => {
  const operation = await requestOperation({
    type: 'array',
    items: { type: 'string' },
  });
  const schema = createApiArgumentsSchema(
    inputFor(operation, [outputBinding('/body/1')]),
  );
  assert.ok(schema.safeParse({ values: { body: ['literal-prefix'] } }).success);
  assert.equal(
    schema.safeParse({ values: { body: ['literal-prefix', 'overwrite'] } })
      .success,
    false,
  );
  assert.ok(
    validateApiArguments({
      ...inputFor(operation, []),
      values: { body: ['prefix', 'runtime', 'tail'] },
    }).valid,
  );
});

test('nested array binding forbids only the selected index and field', async () => {
  const operation = await requestOperation({
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      properties: { id: { type: 'string' }, quantity: literalSchema },
    },
  });
  const schema = createApiArgumentsSchema(
    inputFor(operation, [outputBinding('/body/0/id')]),
  );
  assert.ok(
    schema.safeParse({
      values: { body: [{ quantity: 2 }, { id: 'independent-item' }] },
    }).success,
  );
  assert.equal(
    schema.safeParse({ values: { body: [{ id: 'overwrite' }] } }).success,
    false,
  );
});

test('numeric object property bindings are not interpreted as array positions', async () => {
  const operation = await requestOperation({
    type: 'object',
    additionalProperties: false,
    properties: { 0: cacheSchema, 1: literalSchema },
  });
  const schema = createApiArgumentsSchema(
    inputFor(operation, [outputBinding('/body/0')]),
  );
  assert.ok(schema.safeParse({ values: { body: { 1: 2 } } }).success);
  assert.equal(
    schema.safeParse({ values: { body: { 0: true } } }).success,
    false,
  );
});

test('invalid model output fails at the literal schema boundary without deleting values', async () => {
  const operation = await requestOperation({
    type: 'object',
    properties: { enableCache: cacheSchema, quantity: literalSchema },
  });
  await assert.rejects(
    generateApiArguments({
      ...inputFor(operation, [outputBinding('/body/enableCache')]),
      callId: 'consumer',
      scenario: 'Quantity 2; cache is bound',
      model: {
        withStructuredOutput() {
          return {
            async invoke() {
              return { values: { body: { quantity: 2, enableCache: false } } };
            },
          };
        },
      },
    }),
    /model arguments for consumer/,
  );
});

test('missing required literal inputs remain unresolved rather than generated', async () => {
  const operation = await requestOperation({
    type: 'object',
    additionalProperties: false,
    properties: { id: { type: 'string' }, quantity: literalSchema },
    required: ['id', 'quantity'],
  });
  const result = await generateApiArguments({
    ...inputFor(operation, [outputBinding('/body/id')]),
    callId: 'consumer',
    scenario: 'Use source ID; quantity is not specified',
    model: {
      withStructuredOutput() {
        return {
          async invoke() {
            return { values: {} };
          },
        };
      },
    },
  });
  assert.deepEqual(result.unresolvedInputs, ['/body/quantity']);
});

test('invalid or overlapping binding identities fail before any model invocation', async () => {
  const operation = await requestOperation({
    type: 'object',
    properties: { id: { type: 'string' } },
  });
  await assert.rejects(
    generateApiArguments({
      ...inputFor(operation, [
        outputBinding('/body/id'),
        outputBinding('/body/id'),
      ]),
      callId: 'consumer',
      scenario: 'Use source ID',
      model: noInvocationModel(),
    }),
    /bindings overlap/,
  );
});

test('allOf annotations preserve projection and fully bound closed contracts skip generation', async () => {
  const operation = await requestOperation({
    allOf: [
      {
        type: 'object',
        additionalProperties: false,
        properties: { id: { type: 'string' } },
      },
      { description: 'An annotation does not add literal inputs' },
    ],
  });
  assert.equal(
    createApiArgumentGenerationContract(
      inputFor(operation, [outputBinding('/body/id')]),
    ).hasLiteralInputs,
    false,
  );
});

test('anyOf preserves unbound fields in compatible alternatives without bound values', async () => {
  const operation = await requestOperation({
    anyOf: [
      {
        type: 'object',
        additionalProperties: false,
        properties: { id: { type: 'string' }, quantity: literalSchema },
      },
      {
        type: 'object',
        additionalProperties: false,
        properties: { other: { type: 'string' } },
      },
      { type: 'string' },
    ],
  });
  const schema = createApiArgumentsSchema(
    inputFor(operation, [outputBinding('/body/id')]),
  );
  assert.ok(schema.safeParse({ values: { body: { quantity: 2 } } }).success);
  assert.equal(
    schema.safeParse({ values: { body: { id: 'overwrite' } } }).success,
    false,
  );
});

test('nullable object schemas still prohibit bound fields while retaining literals', async () => {
  const operation = await requestOperation({
    type: ['object', 'null'],
    additionalProperties: false,
    properties: { id: { type: 'string' }, quantity: literalSchema },
  });
  const schema = createApiArgumentsSchema(
    inputFor(operation, [outputBinding('/body/id')]),
  );
  assert.ok(schema.safeParse({ values: { body: { quantity: 2 } } }).success);
  assert.equal(
    schema.safeParse({ values: { body: { id: 'overwrite' } } }).success,
    false,
  );
  assert.equal(schema.safeParse({ values: { body: null } }).success, false);
});

test('unconstrained OAS values retain compatible object and array containers without guessing', async () => {
  const operation = await requestOperation(true);
  const schema = createApiArgumentsSchema(
    inputFor(operation, [outputBinding('/body/1')]),
  );
  assert.ok(schema.safeParse({ values: { body: ['prefix'] } }).success);
  assert.ok(
    schema.safeParse({ values: { body: { 0: 'prefix', other: 'literal' } } })
      .success,
  );
  assert.equal(
    schema.safeParse({ values: { body: { 1: 'overwrite' } } }).success,
    false,
  );
});

test('undeclared binding targets fail before invoking the model', async () => {
  const operation = await requestOperation({
    type: 'object',
    additionalProperties: false,
    properties: { id: { type: 'string' } },
  });
  await assert.rejects(
    generateApiArguments({
      ...inputFor(operation, [outputBinding('/body/missing')]),
      callId: 'consumer',
      scenario: 'Use response ID',
      model: noInvocationModel(),
    }),
    /binding \/body\/missing is not declared/,
  );
});

test('partial literal cardinality accounts for runtime-owned keys without changing the final OAS', async () => {
  const operation = await requestOperation({
    type: 'object',
    additionalProperties: false,
    minProperties: 2,
    maxProperties: 2,
    required: ['id', 'quantity'],
    properties: { id: { type: 'string' }, quantity: literalSchema },
  });
  const input = inputFor(operation, [outputBinding('/body/id')]);
  const values = { body: { quantity: 2 } };
  assert.ok(createApiArgumentsSchema(input).safeParse({ values }).success);
  assert.ok(validateApiArguments({ ...input, values }).valid);
  assert.throws(
    () => validateApiArguments({ ...inputFor(operation, []), values }),
    /schema/,
  );
});

test('array minimum length is checked after binding rather than rejecting a valid literal prefix', async () => {
  const operation = await requestOperation({
    type: 'array',
    minItems: 2,
    items: { type: 'string' },
  });
  const input = inputFor(operation, [outputBinding('/body/1')]);
  const values = { body: ['literal-prefix'] };
  assert.ok(createApiArgumentsSchema(input).safeParse({ values }).success);
  assert.ok(validateApiArguments({ ...input, values }).valid);
  assert.throws(
    () => validateApiArguments({ ...inputFor(operation, []), values }),
    /schema/,
  );
});

test('unconstrained composition branches cannot bypass literal ownership', async () => {
  const operation = await requestOperation({
    anyOf: [
      {
        type: 'object',
        properties: { id: { type: 'string' }, quantity: literalSchema },
      },
      {},
    ],
  });
  const schema = createApiArgumentsSchema(
    inputFor(operation, [outputBinding('/body/id')]),
  );
  assert.ok(
    schema.safeParse({ values: { body: { unrelated: 'OAS permits this' } } })
      .success,
  );
  assert.equal(
    schema.safeParse({ values: { body: { id: 'overwrite' } } }).success,
    false,
  );
});

test('bound discriminators do not require partial literals to distinguish oneOf branches', async () => {
  const operation = await requestOperation({
    oneOf: ['A', 'B'].map((kind) => ({
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'quantity'],
      properties: {
        kind: { type: 'string', const: kind },
        quantity: { type: 'integer' },
      },
    })),
  });
  const input = inputFor(operation, [outputBinding('/body/kind')]);
  const values = { body: { quantity: 2 } };
  assert.ok(createApiArgumentsSchema(input).safeParse({ values }).success);
  assert.ok(validateApiArguments({ ...input, values }).valid);
  assert.ok(
    validateApiArguments({
      ...inputFor(operation, []),
      values: { body: { kind: 'A', quantity: 2 } },
    }).valid,
  );
  assert.throws(
    () =>
      validateApiArguments({
        ...inputFor(operation, []),
        values: { body: { kind: 'C', quantity: 2 } },
      }),
    /schema/,
  );
});

test('partial oneOf projection retains adjacent anyOf constraints and original exclusivity', async () => {
  const operation = await requestOperation({
    anyOf: [
      {
        type: 'object',
        properties: {
          id: { type: 'string' },
          quantity: { type: 'number', maximum: 3 },
        },
      },
    ],
    oneOf: ['integer', 'number'].map((type) => ({
      type: 'object',
      additionalProperties: false,
      properties: { id: { type: 'string' }, quantity: { type } },
    })),
  });
  const input = inputFor(operation, [outputBinding('/body/id')]);
  const schema = createApiArgumentsSchema(input);
  assert.ok(schema.safeParse({ values: { body: { quantity: 2 } } }).success);
  assert.equal(
    schema.safeParse({ values: { body: { quantity: 4 } } }).success,
    false,
  );
  assert.throws(
    () =>
      validateApiArguments({
        ...inputFor(operation, []),
        values: { body: { id: 'source-id', quantity: 2 } },
      }),
    /schema/,
  );
});
