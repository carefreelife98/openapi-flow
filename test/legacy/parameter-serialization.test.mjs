import assert from 'node:assert/strict';
import test from 'node:test';
import { compileWorkflow } from '@openapi-flow/n8n/legacy';
import { UnsupportedOperationError } from '@openapi-flow/core';

const operationRef = '#/paths/~1items~1{color}/get';
const spec = {
  openapi: '3.2.1',
  info: { title: 'Styles', version: '1' },
  paths: {
    '/items/{color}': {
      get: {
        parameters: [
          {
            name: 'color',
            in: 'path',
            required: true,
            style: 'matrix',
            explode: true,
            schema: {
              type: 'object',
              properties: { R: { type: 'integer' }, G: { type: 'integer' } },
            },
          },
          {
            name: 'tags',
            in: 'query',
            style: 'form',
            explode: true,
            schema: { type: 'array', items: { type: 'string' } },
          },
          {
            name: 'filter',
            in: 'query',
            style: 'deepObject',
            schema: {
              type: 'object',
              properties: { a: { type: 'string' }, b: { type: 'string' } },
            },
          },
          {
            name: 'ids',
            in: 'query',
            style: 'pipeDelimited',
            schema: { type: 'array', items: { type: 'integer' } },
          },
          {
            name: 'coordinates',
            in: 'query',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { lat: { type: 'number' } },
                },
              },
            },
          },
          {
            name: 'X-Values',
            in: 'header',
            schema: { type: 'array', items: { type: 'string' } },
          },
          {
            name: 'locale',
            in: 'cookie',
            schema: { type: 'string' },
          },
        ],
        responses: { 200: { description: 'ok' } },
      },
    },
  },
};

async function compile(inputs, altered = spec) {
  return compileWorkflow({
    spec: altered,
    baseUrl: 'https://example.test',
    profile: 'read-only',
    effectPolicy: { [operationRef]: 'read' },
    credentialBindings: {},
    plan: { version: '1', goal: 'Read', operationRef, inputs },
  });
}

test('array, object, content, header and cookie styles produce OAS-shaped node values', async () => {
  const result = await compile({
    'path.color': { R: 100, G: 200 },
    'query.tags': ['blue', 'black'],
    'query.filter': { a: 'x y', b: 'z' },
    'query.ids': [1, 2],
    'query.coordinates': { lat: 40.6 },
    'header.X-Values': ['first', 'second'],
    'cookie.locale': 'ko KR',
  });
  assert.equal(result.status, 'complete');
  const node = result.workflow.nodes[1];
  assert.equal(
    node.parameters.url,
    'https://example.test/items/;R=100;G=200?tags=blue&tags=black&filter%5Ba%5D=x%20y&filter%5Bb%5D=z&ids=1%7C2&coordinates=%7B%22lat%22%3A40.6%7D',
  );
  assert.deepEqual(node.parameters.headerParameters.parameters, [
    { name: 'X-Values', value: 'first,second' },
    { name: 'Cookie', value: 'locale=ko%20KR' },
  ]);
});

test('label and spaceDelimited styles preserve OAS delimiters', async () => {
  const altered = globalThis.structuredClone(spec);
  const parameters = altered.paths['/items/{color}'].get.parameters;
  parameters[0].style = 'label';
  parameters[0].explode = true;
  parameters[3].style = 'spaceDelimited';
  const result = await compile(
    { 'path.color': { R: 100, G: 200 }, 'query.ids': [1, 2] },
    altered,
  );
  assert.equal(
    result.workflow.nodes[1].parameters.url,
    'https://example.test/items/.R=100.G=200?ids=1%202',
  );
});

test('exploded path, object query, object header and cookie styles keep distinct delimiters', async () => {
  const altered = globalThis.structuredClone(spec);
  const parameters = altered.paths['/items/{color}'].get.parameters;
  parameters[0].style = 'simple';
  parameters[0].explode = true;
  parameters[2].style = 'form';
  parameters[2].explode = false;
  parameters[5].schema = {
    type: 'object',
    properties: { first: { type: 'string' }, second: { type: 'string' } },
  };
  parameters[5].explode = true;
  parameters[6].schema = {
    type: 'object',
    properties: { locale: { type: 'string' }, mode: { type: 'string' } },
  };
  parameters[6].style = 'cookie';
  const result = await compile(
    {
      'path.color': { R: 100, G: 200 },
      'query.filter': { a: 'x', b: 'y' },
      'header.X-Values': { first: 'a', second: 'b' },
      'cookie.locale': { locale: 'ko', mode: 'test' },
    },
    altered,
  );
  assert.equal(
    result.workflow.nodes[1].parameters.url,
    'https://example.test/items/R=100,G=200?filter=a,x,b,y',
  );
  assert.deepEqual(
    result.workflow.nodes[1].parameters.headerParameters.parameters,
    [
      { name: 'X-Values', value: 'first=a,second=b' },
      { name: 'Cookie', value: 'locale=ko; mode=test' },
    ],
  );
});

test('nested deepObject values fail at selected conversion rather than document intake', async () => {
  const altered = globalThis.structuredClone(spec);
  altered.paths['/items/{color}'].get.parameters[2].schema.properties.a = {
    type: 'object',
    properties: { nested: { type: 'string' } },
  };
  await assert.rejects(
    () =>
      compile(
        { 'path.color': { R: 100 }, 'query.filter': { a: { nested: 'x' } } },
        altered,
      ),
    (error) =>
      error instanceof UnsupportedOperationError &&
      /parameter query.filter requires a scalar value/.test(error.message),
  );
});
