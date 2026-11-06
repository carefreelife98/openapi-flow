import assert from 'node:assert/strict';
import test from 'node:test';
test('a native-only workflow has no API work and does not require a model', async () => {
  const context = {
    scenario: 'Native-only action',
    messages: [{ id: 'request', text: 'Native-only action' }],
    calls: [],
    interpretSchemaChoices: true,
  };
  const result = await generateWorkflowApiValues(context);
  assert.deepEqual(result.arguments, []);
  assert.deepEqual(result.rejections, []);
  validateCompiledWorkflowApiValues({ ...context, result });
});
import { createHash } from 'node:crypto';
import {
  compileWorkflowApiValues,
  fingerprintWorkflowApiValueContext,
  validateCompiledWorkflowApiValues,
  fingerprintWorkflowApiArgumentContext,
  describeApiLiteralGeneration,
  createApiCatalog,
  listApiOperations,
  resolveApiOperations,
} from '../packages/core/dist/public-api.js';
import { generateWorkflowApiValues } from '../packages/langchain/dist/public-api.js';
import {
  fixture,
  messages,
} from './fixtures/workflow-api-argument-fixture.mjs';

async function valuesFixture() {
  const f = await fixture();
  const context = {
    scenario: f.context.scenario,
    calls: f.context.calls,
    messages: globalThis.structuredClone(messages),
    interpretSchemaChoices: true,
  };
  const calls = Object.fromEntries(
    context.calls.map((call) => [
      call.callId,
      {
        values:
          call.callId === 'sync'
            ? { query: { category: 'GOODS' } }
            : call.callId.startsWith('stock')
              ? {
                  path: { id: String(100 + Number(call.callId.at(-1))) },
                  query: { sequence: 0 },
                }
              : { body: { ids: ['101', '102', '103'] } },
        requestedInputs: [],
      },
    ]),
  );
  return { context, calls };
}
function compile(f) {
  return compileWorkflowApiValues({
    ...f.context,
    plan: {
      calls: f.calls,
      sourceFingerprint: fingerprintWorkflowApiValueContext(f.context),
    },
  });
}
function model(output, capture) {
  return {
    withStructuredOutput(schema, options) {
      return {
        invoke: async (messages) => {
          capture?.({ schema, options, messages });
          return output;
        },
      };
    },
  };
}

test('one typed proposal plans six calls without lexical catalogs or source IDs', async () => {
  const f = await valuesFixture();
  let count = 0;
  const result = await generateWorkflowApiValues({
    ...f.context,
    model: model({ calls: f.calls }, (wire) => {
      count++;
      const raw = JSON.stringify(wire);
      assert.doesNotMatch(
        raw,
        /startTokenId|endTokenId|sourceId|targetSelections/,
      );
      assert.match(JSON.stringify(wire.schema), /GOODS/);
      assert.equal(wire.options.strict, false);
      assert.equal(JSON.parse(wire.messages[1].content).messages.length, 2);
    }),
  });
  assert.equal(count, 1);
  assert.equal(result.arguments.length, 6);
  assert.deepEqual(result.rejections, []);
  assert.deepEqual(result.arguments[0].values.body.ids, ['101', '102', '103']);
  assert.equal(
    result.evidence['stock-2'].literalSources[0].messageId,
    'products',
  );
  assert.deepEqual(
    validateCompiledWorkflowApiValues({ ...f.context, result }),
    result,
  );
});
test('a declared enum may be interpreted directly while an invalid enum preserves five other calls', async () => {
  const f = await valuesFixture();
  f.context.messages[1].text =
    '재고 순번은 0이며 상품 동기화 상태를 확인해 줘.';
  const valid = compile(f);
  assert.equal(valid.arguments.length, 6);
  assert.deepEqual(valid.evidence.sync.schemaSelections, [
    { targetPointer: '/query/category', value: 'GOODS' },
  ]);
  f.calls.sync.values.query.category = '개';
  const invalid = compile(f);
  assert.equal(invalid.arguments.length, 5);
  assert.equal(invalid.rejections.length, 1);
  assert.equal(invalid.rejections[0].callId, 'sync');
});
test('invented and JSON-type-converted identifiers fail in code without a second model call', async () => {
  const f = await valuesFixture();
  f.calls['stock-2'].values.path.id = '999';
  let count = 0;
  const result = await generateWorkflowApiValues({
    ...f.context,
    model: model({ calls: f.calls }, () => count++),
  });
  assert.equal(count, 1);
  assert.equal(result.arguments.length, 5);
  assert.match(result.rejections[0].reason, /no exact original/);
  const g = await valuesFixture();
  g.context.messages[0].text = '{"ids":[101,102,103]}';
  assert.equal(
    compile(g).arguments.some((a) => a.callId === 'info'),
    false,
  );
});
test('missing values stay absent; OAS examples and defaults are never inserted', async () => {
  const f = await valuesFixture();
  f.calls.info = { values: {}, requestedInputs: ['/body/ids'] };
  const result = compile(f),
    args = result.arguments.find((a) => a.callId === 'info');
  assert.deepEqual(args.values, {});
  assert.deepEqual(args.unresolvedInputs, ['/body']);
});
test('changed sources and tampered value receipts are rejected independently', async () => {
  const f = await valuesFixture(),
    result = compile(f);
  result.arguments[0].values.body.ids[0] = '999';
  assert.throws(
    () => validateCompiledWorkflowApiValues({ ...f.context, result }),
    /changed/,
  );
  const original = compile(f);
  f.context.messages.push({ id: 'new', text: '추가 조건' });
  assert.throws(
    () => validateCompiledWorkflowApiValues({ ...f.context, result: original }),
    /another source revision/,
  );
});
test('transport failures propagate once without manufactured receipts or retries', async () => {
  const f = await valuesFixture(),
    failure = new Error('transport-stopped');
  let count = 0;
  await assert.rejects(
    generateWorkflowApiValues({
      ...f.context,
      model: {
        withStructuredOutput() {
          return {
            invoke: async () => {
              count++;
              throw failure;
            },
          };
        },
      },
    }),
    (error) => error.cause === failure,
  );
  assert.equal(count, 1);
});
test('legacy source fingerprints stay byte-compatible after separating capture from validation', async () => {
  const f = await fixture();
  const expected = createHash('sha256')
    .update(
      JSON.stringify({
        catalog: f.context.catalog.fingerprint,
        scenario: f.context.scenario,
        calls: f.context.calls.map(
          (call) =>
            describeApiLiteralGeneration({
              ...call,
              scenario: f.context.scenario,
              literalSourceMessages: f.context.catalog.messages,
            }).input,
        ),
      }),
    )
    .digest('hex');
  assert.equal(fingerprintWorkflowApiArgumentContext(f.context), expected);
});
test('booleans are explicit schema decisions and a numeric literal is never silently coerced', async () => {
  const catalog = await createApiCatalog([
    {
      id: 'typed',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Typed', version: '1' },
        paths: {
          '/flags': {
            get: {
              parameters: [
                {
                  name: 'enabled',
                  in: 'query',
                  required: true,
                  schema: { type: 'boolean', example: true },
                },
                { name: 'count', in: 'query', schema: { type: 'integer' } },
              ],
              responses: { 200: { description: 'ok' } },
            },
          },
        },
      },
    },
  ]);
  const [operation] = await resolveApiOperations(
    catalog,
    listApiOperations(catalog).map((x) => x.key),
  );
  const context = {
    scenario: '캐시를 꺼 줘.',
    messages: [{ id: 'request', text: '캐시를 꺼 줘.' }],
    calls: [{ callId: 'flag', operation, bindings: [] }],
    interpretSchemaChoices: true,
  };
  const calls = {
    flag: { values: { query: { enabled: false } }, requestedInputs: [] },
  };
  const f = { context, calls };
  assert.equal(compile(f).arguments.length, 1);
  calls.flag.values.query.count = 42;
  assert.equal(compile(f).rejections.length, 1);
  calls.flag.values = {};
  const missing = compile(f);
  assert.deepEqual(missing.arguments[0].values, {});
  assert.deepEqual(missing.arguments[0].unresolvedInputs, ['/query/enabled']);
});
