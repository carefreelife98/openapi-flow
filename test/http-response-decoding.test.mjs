import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { TextDecoder, TextEncoder } from 'node:util';
import { Buffer } from 'node:buffer';
import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';
import { createHttpRequestNode, assembleN8nWorkflow } from '@openapi-flow/n8n';
import { decodeHttpResponse } from '../packages/n8n/dist/nodes/request/response/decode-http-response.js';

const envelope = (contentType = 'application/json', statusCode = 200) => ({
  statusCode,
  statusMessage: 'Synthetic response',
  headers: { 'Content-Type': contentType, 'x-test': 'preserved' },
});
const decode = (text, options = {}) =>
  decodeHttpResponse({
    response: envelope(),
    bytes: new TextEncoder().encode(text),
    method: 'GET',
    sourceNodeId: 'source',
    ...options,
  });

for (const body of [
  'ordinary string',
  '42',
  '{"id":42}',
  '',
  ' ',
  '상품 😀',
  42,
  false,
  null,
  { id: 42 },
  [null, '42', { id: 42 }],
]) {
  test(`raw JSON decoding preserves ${JSON.stringify(body)} and metadata without rewriting the input`, () => {
    const response = envelope();
    const before = globalThis.structuredClone(response);
    const actual = decode(JSON.stringify(body), { response });
    assert.deepEqual(actual, { kind: 'json', response: { ...before, body } });
    assert.deepEqual(response, before);
    assert.equal(actual.response.headers, response.headers);
  });
}

test('actual media type selects JSON including structured +json suffix, not the appearance of the body', () => {
  assert.equal(
    decode('"42"', {
      response: envelope('application/problem+json; charset=utf-8'),
    }).response.body,
    '42',
  );
  assert.equal(
    decode('"42"', { response: envelope('text/plain; charset=utf-8') }).response
      .body,
    '"42"',
  );
  assert.equal(
    decode('42', { response: envelope('text/plain') }).response.body,
    '42',
  );
  assert.equal(
    decode('', { response: envelope('text/plain') }).response.body,
    '',
  );
});

test('invalid or empty JSON and invalid UTF-8 fail without returning a replacement value', () => {
  for (const text of ['', ' ', 'ordinary string', '{', 'undefined']) {
    assert.throws(
      () => decode(text),
      (error) => {
        assert.match(error.message, /API source.*invalid JSON HTTP response/);
        assert.ok(error.cause instanceof SyntaxError);
        return true;
      },
    );
  }
  assert.throws(
    () => decode('', { bytes: new Uint8Array([0x22, 0xff, 0x22]) }),
    /API source.*invalid HTTP response encoding/,
  );
});

test('empty HEAD/204/304 bodies remain absent, not null, empty strings or objects', () => {
  for (const options of [
    { method: 'HEAD' },
    { response: envelope('application/json', 204) },
    { response: envelope('application/json', 304) },
  ]) {
    const actual = decode('', options);
    assert.equal(actual.kind, 'empty');
    assert.equal(Object.hasOwn(actual.response, 'body'), false);
  }
});

test('binary bodies remain binary including zero bytes; explicitly declared text charsets are honored', () => {
  for (const bytes of [new Uint8Array(), new Uint8Array([0, 255, 42])]) {
    assert.equal(
      decode('', { response: envelope('application/octet-stream'), bytes })
        .kind,
      'binary',
    );
  }
  assert.equal(
    decode('', {
      response: envelope('text/plain; charset="windows-1252"'),
      bytes: new Uint8Array([0xe9]),
    }).response.body,
    'é',
  );
  for (const charset of ['""', 'no-such-encoding'])
    assert.throws(
      () =>
        decode('test', {
          response: envelope('text/plain; charset=' + charset),
        }),
      (error) => {
        assert.match(
          error.message,
          /API source.*invalid HTTP response encoding/,
        );
        assert.equal(error.cause.code, 'ERR_ENCODING_NOT_SUPPORTED');
        return true;
      },
    );
});

test('transport metadata is required and already-decoded bodies are not accepted as raw bytes', () => {
  assert.throws(
    () => decode('null', { response: { headers: {} } }),
    /statusCode is required/,
  );
  assert.throws(
    () => decode('null', { response: { statusCode: 200 } }),
    /headers is required/,
  );
  assert.throws(
    () => decode('null', { response: { ...envelope(), body: 'null' } }),
    /raw File transport must not contain body/,
  );
  assert.throws(
    () =>
      decode('null', {
        response: {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'content-type': 'text/plain',
          },
        },
      }),
    /ambiguous Content-Type/,
  );
});

const catalog = await createApiCatalog([
  {
    id: 'responses',
    spec: {
      openapi: '3.1.0',
      info: { title: 'Raw responses', version: '1' },
      paths: {
        '/source': {
          get: {
            responses: {
              200: {
                description: 'JSON value',
                content: { 'application/json': { schema: true } },
              },
            },
          },
        },
      },
    },
  },
]);
const [operation] = await resolveApiOperations(catalog, [
  catalog.operations[0].key,
]);
const fragment = createHttpRequestNode({
  operation,
  arguments: {
    callId: 'source',
    values: {},
    bindings: [],
    unresolvedInputs: [],
  },
  baseUrl: 'https://example.test',
  position: [300, 0],
});

test('current public API compiles File transport and an SDK Code decoder with a stable logical response exit', () => {
  const workflow = assembleN8nWorkflow({
    id: 'decode',
    name: 'Decode',
    nodes: [fragment],
    starts: ['source'],
    edges: [],
  }).workflow;
  assert.equal(fragment.entry.type, 'n8n-nodes-base.httpRequest');
  assert.equal(fragment.entry.name, 'Receive source');
  assert.equal(fragment.exit.type, 'n8n-nodes-base.code');
  assert.equal(fragment.exit.name, 'Request source');
  assert.equal(fragment.exit.id, 'source');
  assert.deepEqual(fragment.entry.config.parameters.options.response.response, {
    fullResponse: true,
    responseFormat: 'file',
    outputPropertyName: 'openApiFlowRawResponse',
  });
  assert.equal(workflow.connections.Start.main[0][0].node, 'Receive source');
  assert.equal(
    workflow.connections['Receive source'].main[0][0].node,
    'Request source',
  );
});

test('generated decoder uses the official binary helper for each item and preserves ancestry and binary metadata', async () => {
  const raw = { mimeType: 'application/json', data: 'metadata-not-the-bytes' };
  const retained = { mimeType: 'image/png', data: 'retained' };
  const inputs = ['"42"', '""', 'null'].map(() => ({
    json: envelope(),
    binary: { openApiFlowRawResponse: raw, attachment: retained },
  }));
  const before = globalThis.structuredClone(inputs);
  const read = [];
  const bytes = ['"42"', '""', 'null'].map((text) => Buffer.from(text));
  const context = {
    TextDecoder,
    $input: { all: () => inputs },
    helpers: {
      async getBinaryDataBuffer(index, field) {
        read.push([index, field]);
        return bytes[index];
      },
    },
  };
  const result = await vm.runInNewContext(
    `(async function(){${fragment.exit.config.parameters.jsCode}}).call(this)`,
    context,
  );
  assert.deepEqual(read, [
    [0, 'openApiFlowRawResponse'],
    [1, 'openApiFlowRawResponse'],
    [2, 'openApiFlowRawResponse'],
  ]);
  assert.deepEqual(
    Array.from(result, (item) => item.json.body),
    ['42', '', null],
  );
  for (const [index, item] of result.entries()) {
    assert.equal(item.pairedItem.item, index);
    assert.equal(item.binary.attachment, retained);
    assert.equal(Object.hasOwn(item.binary, 'openApiFlowRawResponse'), false);
  }
  assert.deepEqual(inputs, before);
});
