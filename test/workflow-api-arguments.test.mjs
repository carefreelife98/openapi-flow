import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWorkflowInputCatalog,
  resolveWorkflowInputSelection,
  compileWorkflowApiArguments,
  fingerprintWorkflowApiArgumentContext,
  validateCompiledWorkflowApiArguments,
  createApiCatalog,
  resolveApiOperations,
  describeWorkflowApiArgumentTargets,
} from '../packages/core/dist/public-api.js';
import { recursiveOasDocument } from './fixtures/recursive-oas-fixture.mjs';

import {
  fixture,
  messages,
} from './fixtures/workflow-api-argument-fixture.mjs';

test('six calls reuse five code-resolved inputs without generating text or message identity', async () => {
  const { context, plan } = await fixture();
  const result = compileWorkflowApiArguments({ ...context, plan });
  assert.deepEqual(result.rejections, []);
  assert.equal(result.arguments.length, 6);
  assert.equal(result.inputs.length, 5);
  for (const call of result.arguments.slice(0, 2))
    assert.deepEqual(call.values.body, { ids: ['101', '102', '103'] });
  assert.deepEqual(
    result.arguments.slice(2, 5).map((x) => x.values),
    [
      { path: { id: '101' }, query: { sequence: 0 } },
      { path: { id: '102' }, query: { sequence: 0 } },
      { path: { id: '103' }, query: { sequence: 0 } },
    ],
  );
  assert.deepEqual(result.arguments[5].values, {
    query: { category: 'GOODS' },
  });
  assert.equal(result.arguments[3].literalSources[0].messageId, 'products');
  assert.equal(result.arguments[3].literalSources[1].messageId, 'conditions');
});

test('a bad call remains rejected while the other five compiled calls remain available', async () => {
  const { context, plan, inputs } = await fixture();
  plan.calls['stock-2'].assignments[0].source = inputs[3]; // Actual JSON number 0 is not a string.
  const result = compileWorkflowApiArguments({ ...context, plan });
  assert.equal(result.arguments.length, 5);
  assert.equal(result.rejections.length, 1);
  assert.equal(result.rejections[0].callId, 'stock-2');
  assert.equal(result.arguments[0].values.body.ids[1], '102');
});

test('source ownership cannot be overridden with a generated messageId or quotation', async () => {
  const { context, plan } = await fixture();
  plan.calls['stock-2'].assignments[0].source.messageId = 'conditions';
  plan.calls['stock-2'].assignments[0].source.sourceText = '102';
  assert.throws(
    () => compileWorkflowApiArguments({ ...context, plan }),
    /Unrecognized/,
  );
});

test('references from an earlier source revision are rejected', async () => {
  const { context, plan } = await fixture();
  context.catalog = createWorkflowInputCatalog([
    ...messages,
    { id: 'new', text: '추가 조건' },
  ]);
  assert.throws(
    () => compileWorkflowApiArguments({ ...context, plan }),
    /another input revision/,
  );
});

test('mutated catalog bytes or offsets cannot become a trusted checkpoint', async () => {
  const { context, plan } = await fixture();
  context.catalog.sources[0].sources.text[0].tokens[0].text = 'forged';
  assert.throws(
    () => compileWorkflowApiArguments({ ...context, plan }),
    /changed original sources/,
  );
});

test('missing values remain explicit missing-input requirements', async () => {
  const { context } = await fixture();
  const plan = {
    sourceFingerprint: fingerprintWorkflowApiArgumentContext(context),
    calls: Object.fromEntries(
      context.calls.map((x) => [
        x.callId,
        { assignments: [], requestedInputs: [] },
      ]),
    ),
  };
  const result = compileWorkflowApiArguments({ ...context, plan });
  assert.deepEqual(result.rejections, []);
  assert.deepEqual(result.arguments[2].values, {});
  assert.deepEqual(result.arguments[2].unresolvedInputs, [
    '/path/id',
    '/query/sequence',
  ]);
});

test('a text span is resolved inside its selected original region only', async () => {
  const { context, text } = await fixture();
  const selection = text('products', '102');
  const wrongRegion = context.catalog.sources.find(
    (x) => x.messageId === 'conditions',
  ).sources.text[0];
  selection.sourceId = wrongRegion.id;
  assert.throws(
    () => resolveWorkflowInputSelection(context.catalog, selection),
    /selected source region/,
  );
});

test('the selected region determines both original text and identity, even at identical offsets', () => {
  const catalog = createWorkflowInputCatalog([
    { id: 'first', text: '101' },
    { id: 'second', text: '202' },
  ]);
  const region = catalog.sources[1].sources.text[0];
  const result = resolveWorkflowInputSelection(catalog, {
    kind: 'text',
    sourceId: region.id,
    startTokenId: region.tokens[0].id,
    endTokenId: region.tokens[0].id,
  });
  assert.equal(result.value, '202');
  assert.equal(result.source.messageId, 'second');
  assert.equal(result.source.sourceText, '202');
});

test('compiled checkpoints are replayed against original calls and reject changed values', async () => {
  const { context, plan } = await fixture();
  const result = compileWorkflowApiArguments({ ...context, plan });
  assert.deepEqual(
    validateCompiledWorkflowApiArguments({ ...context, result }),
    result,
  );
  result.arguments[0].values.body.ids[0] = 'invented';
  assert.throws(
    () => validateCompiledWorkflowApiArguments({ ...context, result }),
    /changed or belong/,
  );
});

test('changing an OAS, binding or call purpose invalidates a prior plan', async () => {
  for (const change of [
    (call) => {
      call.purpose = 'different role';
    },
    (call) => {
      call.bindings = [
        {
          kind: 'node-output',
          sourceNodeId: 'upstream',
          sourcePointer: '/id',
          targetPointer: '/body/ids',
        },
      ];
    },
    (call) => {
      call.operation.operation.description = 'changed declaration';
    },
  ]) {
    const { context, plan } = await fixture();
    change(context.calls[0]);
    assert.throws(
      () => compileWorkflowApiArguments({ ...context, plan }),
      /another input revision/,
    );
  }
});

test('duplicate, overlapping and sparse construction paths reject only their call', async () => {
  for (const change of [
    (assignments) =>
      assignments.push(globalThis.structuredClone(assignments[0])),
    (assignments) => {
      assignments[0].targetSelections.s0 = 2;
    },
  ]) {
    const { context, plan } = await fixture();
    change(plan.calls.info.assignments);
    const result = compileWorkflowApiArguments({ ...context, plan });
    assert.deepEqual(
      result.rejections.map((x) => x.callId),
      ['info'],
    );
    assert.equal(result.arguments.length, 5);
  }
});

test('recursive targets stay finite while original whole JSON containers retain nested types', async () => {
  const spec = recursiveOasDocument('3.1.0');
  const api = await createApiCatalog([{ id: 'tree', spec }]);
  const [operation] = await resolveApiOperations(api, [api.operations[0].key]);
  const value = { name: 'root', children: [{ name: 'child', children: [] }] };
  const catalog = createWorkflowInputCatalog([
    { id: 'tree-input', text: JSON.stringify(value) },
  ]);
  const context = {
    scenario: 'Use the original tree',
    catalog,
    calls: [
      {
        callId: 'tree',
        operation,
        requestMediaType: 'application/json',
        bindings: [],
      },
    ],
  };
  const targets = describeWorkflowApiArgumentTargets({
    ...context.calls[0],
    scenario: context.scenario,
    literalSourceMessages: catalog.messages,
  });
  assert(targets.length < 20);
  assert(
    targets.some((x) =>
      x.template.segments.some((s) => s.kind === 'descendant'),
    ),
  );
  const root = targets.find(
    (x) =>
      x.template.segments.length === 1 &&
      x.template.segments[0].value === 'body',
  );
  assert(root);
  const original = catalog.sources[0].sources.json.find(
    (x) => x.text === JSON.stringify(value),
  );
  assert(original);
  const plan = {
    sourceFingerprint: fingerprintWorkflowApiArgumentContext(context),
    calls: {
      tree: {
        assignments: [
          {
            targetId: root.id,
            targetSelections: {},
            source: { kind: 'json', sourceId: original.id },
          },
        ],
        requestedInputs: [],
      },
    },
  };
  const result = compileWorkflowApiArguments({ ...context, plan });
  assert.deepEqual(result.rejections, []);
  assert.deepEqual(result.arguments[0].values.body, value);
  assert.deepEqual(
    validateCompiledWorkflowApiArguments({ ...context, result }),
    result,
  );
  const leaf = targets.find((x) =>
    x.template.segments.some(
      (s) => s.kind === 'property' && s.value === 'name',
    ),
  );
  assert(leaf);
  plan.calls.tree.assignments.push({
    targetId: leaf.id,
    targetSelections: {},
    source: {
      kind: 'json',
      sourceId: catalog.sources[0].sources.json.find((x) => x.text === '"root"')
        .id,
    },
  });
  const overlap = compileWorkflowApiArguments({ ...context, plan });
  assert.equal(overlap.arguments.length, 0);
  assert.match(overlap.rejections[0].reason, /overlap/);
});
