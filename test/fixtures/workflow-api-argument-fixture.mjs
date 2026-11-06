import assert from 'node:assert/strict';
import {
  createApiCatalog,
  resolveApiOperations,
  listApiOperations,
  createWorkflowInputCatalog,
  fingerprintWorkflowApiArgumentContext,
  describeWorkflowApiArgumentTargets,
} from '../../packages/core/dist/public-api.js';

export const messages = [
  {
    id: 'products',
    text: '상품 101, 102, 103의 정보와 가격·재고를 확인해 줘.',
  },
  { id: 'conditions', text: '재고 순번은 0이며 동기화 분류는 GOODS야.' },
];

export async function fixture() {
  const catalog = await createApiCatalog([
    {
      id: 'shared-inputs',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Shared original inputs', version: '1' },
        paths: {
          '/items': {
            post: {
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        ids: { type: 'array', items: { type: 'string' } },
                      },
                      required: ['ids'],
                      additionalProperties: false,
                    },
                  },
                },
              },
              responses: { 200: { description: 'ok' } },
            },
          },
          '/stock/{id}': {
            get: {
              parameters: [
                {
                  in: 'path',
                  name: 'id',
                  required: true,
                  schema: { type: 'string' },
                },
                {
                  in: 'query',
                  name: 'sequence',
                  required: true,
                  schema: { type: 'integer' },
                },
              ],
              responses: { 200: { description: 'ok' } },
            },
          },
          '/sync': {
            get: {
              parameters: [
                {
                  in: 'query',
                  name: 'category',
                  required: true,
                  schema: { type: 'string', enum: ['GOODS'] },
                },
              ],
              responses: { 200: { description: 'ok' } },
            },
          },
        },
      },
    },
  ]);
  const operations = await resolveApiOperations(
    catalog,
    listApiOperations(catalog).map((x) => x.key),
  );
  const operation = (path) => operations.find((x) => x.path === path);
  const context = {
    scenario: '세 상품의 정보·가격·재고와 동기화 상태를 조회한다.',
    catalog: createWorkflowInputCatalog(messages),
    calls: [
      ...['info', 'price'].map((callId) => ({
        callId,
        operation: operation('/items'),
        requestMediaType: 'application/json',
        bindings: [],
      })),
      ...['stock-1', 'stock-2', 'stock-3'].map((callId) => ({
        callId,
        operation: operation('/stock/{id}'),
        bindings: [],
      })),
      { callId: 'sync', operation: operation('/sync'), bindings: [] },
    ],
  };
  const text = (messageId, value) => {
    const original = messages.find((x) => x.id === messageId).text;
    const start = original.indexOf(value),
      end = start + value.length;
    const segment = context.catalog.sources
      .find((x) => x.messageId === messageId)
      .sources.text.find(
        (x) =>
          x.tokens.some((t) => t.offset === start) &&
          x.tokens.some((t) => t.offset + t.length === end),
      );
    assert(segment);
    return {
      kind: 'text',
      sourceId: segment.id,
      startTokenId: segment.tokens.find((t) => t.offset === start).id,
      endTokenId: segment.tokens.find((t) => t.offset + t.length === end).id,
    };
  };
  const json = context.catalog.sources
    .find((x) => x.messageId === 'conditions')
    .sources.json.find((x) => x.text === '0');
  const inputs = [
    text('products', '101'),
    text('products', '102'),
    text('products', '103'),
    { kind: 'json', sourceId: json.id },
    text('conditions', 'GOODS'),
  ];
  const assignment = (callId, pointer, source) => {
    const call = context.calls.find((entry) => entry.callId === callId);
    const tokens = pointer.slice(1).split('/');
    for (const target of describeWorkflowApiArgumentTargets({
      ...call,
      scenario: context.scenario,
      literalSourceMessages: context.catalog.messages,
    })) {
      const selected = {};
      let position = 0;
      let slot = 0;
      let matches = true;
      for (const segment of target.template.segments) {
        const token = tokens[position++];
        if (segment.kind === 'property') {
          if (segment.value !== token) {
            matches = false;
            break;
          }
        } else if (segment.kind === 'index')
          selected[`s${slot++}`] = Number(token);
        else {
          matches = false;
          break;
        }
      }
      if (matches && position === tokens.length)
        return { targetId: target.id, targetSelections: selected, source };
    }
    throw new Error('Fixture target not found: ' + pointer);
  };
  const calls = Object.fromEntries(
    context.calls.map((call) => [
      call.callId,
      call.callId === 'sync'
        ? {
            assignments: [
              assignment(call.callId, '/query/category', inputs[4]),
            ],
            requestedInputs: ['/query/category'],
          }
        : call.callId.startsWith('stock')
          ? {
              assignments: [
                assignment(
                  call.callId,
                  '/path/id',
                  inputs[Number(call.callId.at(-1)) - 1],
                ),
                assignment(call.callId, '/query/sequence', inputs[3]),
              ],
              requestedInputs: ['/path/id', '/query/sequence'],
            }
          : {
              assignments: [0, 1, 2].map((index) =>
                assignment(call.callId, `/body/ids/${index}`, inputs[index]),
              ),
              requestedInputs: ['/body/ids'],
            },
    ]),
  );
  return {
    context,
    plan: {
      sourceFingerprint: fingerprintWorkflowApiArgumentContext(context),
      calls,
    },
    text,
    inputs,
    assignment,
  };
}
