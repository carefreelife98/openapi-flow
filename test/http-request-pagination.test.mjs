import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createHttpRequestNode,
  httpRequestPaginationSchema,
} from '@openapi-flow/n8n';
import {
  paginationInput,
  pagePagination,
} from './fixtures/http-request-pagination-fixture.mjs';
import { createPaginationResponseGuard } from '../packages/n8n/dist/nodes/request/pagination/create-pagination-response-guard.js';
import { createOutputItemReaderCode } from '../packages/n8n/dist/nodes/request/bindings/create-output-item-reader-code.js';

const transport = (fragment) =>
  fragment.nodes.find((n) => n.type === 'n8n-nodes-base.httpRequest').config
    .parameters;
const official = (fragment) =>
  transport(fragment).options.pagination.pagination;
const evaluate = (expr, { page = 0, request = {}, response = {} } = {}) =>
  new Function(
    '$pageCount',
    '$request',
    '$response',
    `return (${expr.slice(3, -2)});`,
  )(page, request, response);

test('explicit page config compiles official pagination and retains raw decoder and 1:N item contract', async () => {
  const input = await paginationInput();
  const fragment = createHttpRequestNode(input);
  const params = transport(fragment);
  assert.equal(fragment.preservesInputItems, false);
  assert.equal(params.url, 'https://example.test/pages?filter=A%20B%26%2F');
  assert.equal(params.options.response.response.responseFormat, 'file');
  assert.deepEqual(params.options.redirect, {
    redirect: { followRedirects: false },
  });
  const pagination = official(fragment);
  assert.equal(pagination.paginationMode, 'updateAParameterInEachRequest');
  assert.equal(pagination.maxRequests, 3);
  assert.equal(pagination.limitPagesFetched, true);
  assert.equal(pagination.paginationCompleteWhen, 'other');
  const [parameter] = pagination.parameters.parameters;
  assert.equal(parameter.name, 'page');
  assert.equal(parameter.type, 'qs');
  assert.equal(evaluate(parameter.value, { page: 0 }), 1);
  assert.equal(evaluate(parameter.value, { page: 2 }), 3);
  assert.equal(
    evaluate(pagination.completeExpression, { response: { statusCode: 200 } }),
    false,
  );
  assert.throws(
    () =>
      evaluate(pagination.completeExpression, {
        response: { statusCode: 503 },
      }),
    /HTTP status 503/,
  );
  assert.equal(input.arguments.values.query.page, 1);
});

test('no pagination retains the existing singleton behavior', async () => {
  const input = await paginationInput();
  delete input.pagination;
  const fragment = createHttpRequestNode(input);
  assert.equal(fragment.preservesInputItems, true);
  assert.equal(transport(fragment).options.pagination, undefined);
  assert.match(transport(fragment).url, /page=1/);
});

test('the complete page sequence is checked against the original numeric OAS domain before execution', async () => {
  const input = await paginationInput({
    pageSchema: { type: 'integer', enum: [1, 3], maximum: 3 },
  });
  input.pagination.step = 2;
  assert.throws(
    () => createHttpRequestNode(input),
    /page 2 value 5 does not match the OAS schema/,
  );
  input.pagination.maxRequests = 2;
  const expr = official(createHttpRequestNode(input)).parameters.parameters[0]
    .value;
  assert.equal(evaluate(expr, { page: 1 }), 3);
});

test('explicit status termination keeps the terminal page and checks all other errors', async () => {
  const input = await paginationInput();
  input.pagination.termination = { kind: 'status-codes', statusCodes: [204] };
  const fragment = createHttpRequestNode(input);
  const complete = official(fragment).completeExpression;
  assert.equal(evaluate(complete, { response: { statusCode: 204 } }), true);
  assert.equal(evaluate(complete, { response: { statusCode: 200 } }), false);
  assert.match(
    fragment.exit.config.parameters.jsCode,
    /pagination HTTP status/,
  );
});

test('strict config has no inference, raw expressions, implicit collection or arbitrary 1000 request ceiling', () => {
  assert.equal(
    httpRequestPaginationSchema.parse({ ...pagePagination, maxRequests: 1001 })
      .maxRequests,
    1001,
  );
  for (const config of [
    { ...pagePagination, start: undefined },
    { ...pagePagination, termination: undefined },
    { ...pagePagination, output: undefined },
    { ...pagePagination, output: 'collection' },
    { ...pagePagination, value: '={{ $json.page }}' },
    { ...pagePagination, completeExpression: '={{ true }}' },
    { ...pagePagination, mode: 'response-next-url' },
  ])
    assert.equal(httpRequestPaginationSchema.safeParse(config).success, false);
});

test('undeclared, incompatible and conflicting page contracts fail at compile boundary', async () => {
  const input = await paginationInput();
  assert.throws(
    () =>
      createHttpRequestNode({
        ...input,
        pagination: { ...input.pagination, parameter: 'missing' },
      }),
    /declared form/,
  );
  assert.throws(
    () =>
      createHttpRequestNode({
        ...input,
        pagination: { ...input.pagination, start: 0 },
      }),
    /pagination.start/,
  );
  const bound = globalThis.structuredClone(input);
  delete bound.arguments.values.query.page;
  bound.arguments.bindings = [
    {
      kind: 'node-output',
      sourceNodeId: 'seed',
      sourcePointer: '',
      targetPointer: '/query/page',
    },
  ];
  assert.throws(() => createHttpRequestNode(bound), /cannot also be bound/);
});

test('ordinary response binding rejects a page stream rather than taking or collecting an item', () => {
  const source = { nodeId: 'pages', nodeName: 'Request pages' };
  const read = new Function(
    '$',
    'source',
    `${createOutputItemReaderCode(false)}return item;`,
  );
  assert.throws(
    () =>
      read(
        () => ({
          all: () => [{ json: { body: '1' } }, { json: { body: '2' } }],
        }),
        source,
      ),
    /unambiguous single JSON item; got 2 items/,
  );
});

test('status termination uses ordered terminal markers despite decoder pairedItem rebasing', () => {
  const pagination = {
    ...pagePagination,
    maxRequests: 2,
    termination: { kind: 'status-codes', statusCodes: [204] },
  };
  const check = new Function(
    '$input',
    createPaginationResponseGuard(pagination),
  );
  // Actual decoder input ancestry indexes the transport pages, not original inputs.
  const input = (...statuses) => ({
    all: () =>
      statuses.map((statusCode, index) => ({
        json: { statusCode },
        pairedItem: { item: index },
      })),
  });
  assert.doesNotThrow(() => check(input(200, 204)));
  assert.doesNotThrow(() => check(input(200, 204, 204, 200, 204)));
  assert.throws(() => check(input(200, 200, 204)), /exhausted maxRequests/);
  assert.throws(
    () => check(input(204, 200)),
    /ended before status-codes termination/,
  );
  assert.throws(() => check(input(503)), /HTTP status 503/);
  const one = new Function(
    '$input',
    createPaginationResponseGuard({ ...pagination, maxRequests: 1 }),
  );
  assert.throws(() => one(input(200)), /exhausted maxRequests/);
  assert.doesNotThrow(() => one(input(204)));
  assert.doesNotThrow(() =>
    new Function('$input', createPaginationResponseGuard(pagePagination))(
      input(200),
    ),
  );
});

test('normal OAS field names and JSON pointer escaping are not guessed to be credentials or unsafe', async () => {
  for (const name of ['pageToken', 'page.number', 'page/name', 'page~number']) {
    const input = await paginationInput({
      query: { [name]: 1 },
      parameters: [{ in: 'query', name, schema: { type: 'integer' } }],
    });
    input.pagination.parameter = name;
    assert.equal(
      official(createHttpRequestNode(input)).parameters.parameters[0].name,
      name,
    );
    input.arguments.values.query = {};
    input.arguments.bindings = [
      {
        kind: 'node-output',
        sourceNodeId: 'seed',
        sourcePointer: '',
        targetPointer:
          '/query/' + name.replaceAll('~', '~0').replaceAll('/', '~1'),
      },
    ];
    assert.throws(() => createHttpRequestNode(input), /cannot also be bound/);
  }
});

test('maxRequests is a positive safe integer and arithmetic overflow fails before sequence validation', async () => {
  for (const maxRequests of [
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    Infinity,
  ]) {
    assert.equal(
      httpRequestPaginationSchema.safeParse({ ...pagePagination, maxRequests })
        .success,
      false,
    );
  }
  assert.equal(
    httpRequestPaginationSchema.parse({
      ...pagePagination,
      maxRequests: Number.MAX_SAFE_INTEGER,
    }).maxRequests,
    Number.MAX_SAFE_INTEGER,
  );
  const input = await paginationInput({
    pageSchema: { type: 'integer' },
    query: { page: Number.MAX_SAFE_INTEGER },
  });
  input.pagination.start = Number.MAX_SAFE_INTEGER;
  input.pagination.maxRequests = 2;
  assert.throws(() => createHttpRequestNode(input), /safe integer range/);
  input.pagination.start = Number.MAX_SAFE_INTEGER - 1;
  input.arguments.values.query.page = input.pagination.start;
  assert.equal(
    evaluate(
      official(createHttpRequestNode(input)).parameters.parameters[0].value,
      { page: 1 },
    ),
    Number.MAX_SAFE_INTEGER,
  );
  input.pagination.maxRequests = Number.MAX_SAFE_INTEGER;
  input.pagination.step = 2;
  assert.throws(() => createHttpRequestNode(input), /safe integer range/);
});
