import assert from 'node:assert/strict';
import test from 'node:test';
import { compileWorkflow } from '@openapi-flow/n8n/legacy';
import { UnsupportedOperationError } from '@openapi-flow/core';

const operationRef = '#/paths/~1submit/post';
const spec = {
  openapi: '3.2.1',
  info: { title: 'Form', version: '1' },
  paths: {
    '/submit': {
      post: {
        requestBody: {
          required: true,
          content: {
            'application/x-www-form-urlencoded': {
              schema: {
                type: 'object',
                required: ['name', 'address'],
                properties: {
                  name: { type: 'string' },
                  address: {
                    type: 'object',
                    properties: { city: { type: 'string' } },
                  },
                  tags: { type: 'array', items: { type: 'string' } },
                  details: {
                    type: 'object',
                    properties: { x: { type: 'string' } },
                  },
                },
              },
              encoding: { details: { style: 'deepObject' } },
            },
          },
        },
        responses: { 204: { description: 'ok' } },
      },
    },
  },
};

function request(body, altered = spec) {
  return {
    spec: altered,
    baseUrl: 'https://example.test',
    profile: 'test',
    effectPolicy: { [operationRef]: 'write' },
    credentialBindings: {},
    plan: {
      version: '1',
      goal: 'Submit form',
      operationRef,
      inputs: { body },
    },
  };
}

test('form body uses OAS default JSON values, repeated array fields and explicit deepObject', async () => {
  const result = await compileWorkflow(
    request({
      name: 'a b',
      address: { city: 'New York' },
      tags: ['red', 'blue'],
      details: { x: 'y' },
    }),
  );
  assert.equal(result.status, 'complete');
  assert.equal(result.workflow.nodes[1].parameters.contentType, 'raw');
  assert.equal(
    result.workflow.nodes[1].parameters.rawContentType,
    'application/x-www-form-urlencoded',
  );
  assert.equal(
    result.workflow.nodes[1].parameters.body,
    'name=a+b&address=%7B%22city%22%3A%22New+York%22%7D&tags=red&tags=blue&details%5Bx%5D=y',
  );
});

test('nested encoding remains an explicit conversion error for the selected operation', async () => {
  const altered = globalThis.structuredClone(spec);
  altered.paths['/submit'].post.requestBody.content[
    'application/x-www-form-urlencoded'
  ].encoding.details.encoding = { x: { contentType: 'text/plain' } };
  await assert.rejects(
    () =>
      compileWorkflow(
        request(
          { name: 'a', address: { city: 'B' }, details: { x: 'y' } },
          altered,
        ),
      ),
    (error) =>
      error instanceof UnsupportedOperationError &&
      /field details needs nested encoding/.test(error.message),
  );
});
