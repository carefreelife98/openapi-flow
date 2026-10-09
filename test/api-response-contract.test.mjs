import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import {
  createApiCatalog,
  resolveApiOperations,
  createApiResponseSchema,
  apiResponseValidationValue,
} from '@openapi-flow/core';
const { Ajv2020 } = createRequire(
  new URL('../packages/n8n/package.json', import.meta.url),
)('ajv/dist/2020.js');

async function validator(responses, version = '3.1.0') {
  const catalog = await createApiCatalog([
    {
      id: 'response-contract',
      spec: {
        openapi: version,
        info: { title: 'Response contracts', version: '1' },
        paths: { '/response': { get: { responses } } },
      },
    },
  ]);
  const [operation] = await resolveApiOperations(catalog, [
    catalog.operations[0].key,
  ]);
  return new Ajv2020({ strict: false, allErrors: true }).compile(
    createApiResponseSchema({ operation }),
  );
}
const response = (schema, media = 'application/json') => ({
  description: 'Observed response',
  content: { [media]: { schema } },
});
const value = (
  statusCode,
  body,
  contentType = 'application/json; charset=utf-8',
) =>
  apiResponseValidationValue({
    statusCode,
    body,
    headers: { 'Content-Type': contentType },
  });
test('actual status chooses exact, range and default contracts; no expected status is planned', async () => {
  const validate = await validator({
    200: response({ const: 'exact' }),
    '2XX': response({ type: 'integer' }),
    default: response({
      type: 'object',
      required: ['error'],
      properties: { error: { type: 'string' } },
    }),
  });
  assert.equal(validate(value(200, 'exact')), true);
  assert.equal(validate(value(200, 42)), false);
  assert.equal(validate(value(201, 42)), true);
  assert.equal(validate(value(201, '42')), false);
  assert.equal(validate(value(503, { error: 'unavailable' })), true);
  assert.equal(validate(value(503, 42)), false);
});
test('range-only and default-only schemas are valid without empty enum/anyOf restrictions', async () => {
  const range = await validator({ '2XX': response({ type: 'number' }) });
  assert.equal(range(value(202, 2)), true);
  assert.equal(range(value(404, 2)), false);
  const fallback = await validator({ default: response({ type: 'number' }) });
  assert.equal(fallback(value(404, 2)), true);
});
test('actual media type selects the most specific OAS schema without a guessed JSON preference', async () => {
  const validate = await validator({
    200: {
      description: 'Multiple representations',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string' } },
          },
        },
        'Application/*': { schema: { type: 'number' } },
        '*/*': { schema: { type: 'string' } },
      },
    },
  });
  assert.equal(
    validate(value(200, { id: 'x' }, 'APPLICATION/JSON; charset=UTF-8')),
    true,
  );
  assert.equal(validate(value(200, 4, 'application/json')), false);
  assert.equal(validate(value(200, 4, 'application/vnd.example+json')), true);
  assert.equal(validate(value(200, 'plain', 'text/plain')), true);
  assert.equal(validate({ statusCode: 200, body: { id: 'x' } }), false);
});
test('full complex response schema is checked unchanged, not only its bound field', async () => {
  const schema = {
    allOf: [
      {
        type: 'object',
        required: ['id', 'detail'],
        properties: {
          id: { type: 'string', enum: ['allowed'] },
          detail: {
            oneOf: [
              {
                type: 'object',
                required: ['count'],
                additionalProperties: false,
                properties: { count: { type: 'integer', minimum: 1 } },
              },
              { type: 'null' },
            ],
          },
        },
      },
      {
        if: { properties: { detail: { type: 'object' } } },
        then: { properties: { id: { minLength: 5 } } },
      },
    ],
  };
  const validate = await validator({ 200: response(schema) });
  assert.equal(
    validate(value(200, { id: 'allowed', detail: { count: 2 } })),
    true,
  );
  for (const body of [
    { id: 'not-allowed', detail: null },
    { id: 'allowed', detail: { count: 0 } },
    { id: 'allowed', detail: { count: '2' } },
    { id: 'allowed' },
  ])
    assert.equal(validate(value(200, body)), false);
});
test('OAS 3.0 nullable and boolean schemas remain response-contract constraints', async () => {
  const nullable = await validator(
    { 200: response({ type: 'string', nullable: true }) },
    '3.0.3',
  );
  assert.equal(nullable(value(200, null)), true);
  assert.equal(nullable(value(200, 'unchanged')), true);
  assert.equal(nullable(value(200, 8)), false);
  const reject = await validator({ 200: response(false) });
  assert.equal(reject(value(200, 'anything')), false);
});
test('metadata validation does not mutate body, accept absent status, or invent Content-Type', () => {
  const envelope = {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: { id: '42' },
  };
  const projected = apiResponseValidationValue(envelope);
  assert.equal(projected.body, envelope.body);
  assert.equal(
    envelope.headers['Content-Type'],
    'application/json; charset=utf-8',
  );
  assert.throws(
    () => apiResponseValidationValue({ headers: {}, body: {} }),
    /statusCode/,
  );
  assert.throws(
    () => apiResponseValidationValue({ statusCode: 200, body: {} }),
    /headers/,
  );
  assert.throws(
    () =>
      apiResponseValidationValue({
        ...envelope,
        headers: {
          'Content-Type': 'application/json',
          'content-type': 'text/plain',
        },
      }),
    /ambiguous/,
  );
});
