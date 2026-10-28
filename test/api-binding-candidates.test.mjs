import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createApiCatalog,
  resolveApiOperations,
  resolveApiBindingSourceSelection,
  describeApiBindingCandidates,
  resolveApiBindingCandidates,
  listWorkflowRequiredPrecedence,
} from '@openapi-flow/core';
import { candidateChoices } from './fixtures/api-binding-candidate-choice.mjs';

async function fixture(schema, parameter = { type: 'string' }) {
  const spec = {
    openapi: '3.1.0',
    info: { title: 'Binding contracts', version: '1' },
    paths: {
      '/source': {
        get: {
          responses: {
            200: {
              description: 'data',
              content: { 'application/json': { schema } },
            },
          },
        },
      },
      '/target/{id}': {
        get: {
          parameters: [
            { in: 'path', name: 'id', required: true, schema: parameter },
          ],
          responses: { 200: { description: 'ok' } },
        },
      },
    },
  };
  const catalog = await createApiCatalog([{ id: 'oas', spec }]);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map((op) => op.key),
  );
  const materials = operations.map((operation) => ({
    callId: operation.path === '/source' ? 'source' : 'target',
    operation,
  }));
  const input = {
    scenario: 'Use the requested original source value.',
    callId: 'target',
    materials,
  };
  const sources = resolveApiBindingSourceSelection({
    ...input,
    proposal: { sourceNodeIds: ['source'], gaps: [] },
  });
  return { ...input, sources };
}
const object = (properties) => ({
  type: 'object',
  additionalProperties: false,
  properties,
});
const segments = (values) =>
  values.map((value) => ({ kind: 'property', value }));

test('known array/object to scalar pairs are absent; code copies the selected scalar field verbatim', async () => {
  const input = await fixture(
    object({
      id: { type: 'string' },
      contents: { type: 'array', items: object({ id: { type: 'string' } }) },
    }),
  );
  const before = globalThis.structuredClone(input);
  const catalog = describeApiBindingCandidates(input);
  assert(
    !catalog.candidates.some(
      (c) =>
        JSON.stringify(c.source.segments) ===
        JSON.stringify(segments(['contents'])),
    ),
  );
  const expected = {
    sourceNodeId: 'source',
    sourcePointer: '/id',
    targetPointer: '/path/id',
  };
  const choices = candidateChoices({ bindingCandidates: catalog.candidates }, [
    expected,
  ]);
  const result = resolveApiBindingCandidates({
    ...input,
    proposal: { bindings: choices, gaps: [] },
  });
  assert.deepEqual(result.bindings, [{ ...expected, kind: 'node-output' }]);
  assert.deepEqual(input, before);
  assert.throws(
    () =>
      resolveApiBindingCandidates({
        ...input,
        scenario: 'changed',
        proposal: { bindings: choices, gaps: [] },
      }),
    /planning snapshot/,
  );
});

test('array index and nested dictionary key remain explicit selector values; no first item is generated', async () => {
  const input = await fixture(
    object({
      groups: {
        type: 'object',
        additionalProperties: {
          type: 'array',
          items: object({ 'a/b~c': { type: 'string' } }),
        },
      },
    }),
  );
  const catalog = describeApiBindingCandidates(input);
  const expected = {
    sourceNodeId: 'source',
    sourcePointer: '/groups/QA/7/a~1b~0c',
    targetPointer: '/path/id',
  };
  const choices = candidateChoices({ bindingCandidates: catalog.candidates }, [
    expected,
  ]);
  assert.deepEqual(choices[0].sourceSelections, { s0: 'QA', s1: 7 });
  assert.deepEqual(
    resolveApiBindingCandidates({
      ...input,
      proposal: { bindings: choices, gaps: [] },
    }).bindings,
    [{ ...expected, kind: 'node-output' }],
  );
  for (const sourceSelections of [
    { s0: 'QA' },
    { s0: 'QA', s1: -1 },
    { s0: 'QA', s1: '7' },
    { s0: 'QA', s1: 7, s2: 'extra' },
  ])
    assert.throws(
      () =>
        resolveApiBindingCandidates({
          ...input,
          proposal: {
            bindings: [{ ...choices[0], sourceSelections }],
            gaps: [],
          },
        }),
      /selection/i,
    );
});

test('open dictionaries remain supported, while original concrete type validation cannot be bypassed', async () => {
  const input = await fixture({
    type: 'object',
    properties: { contents: { type: 'array', items: { type: 'string' } } },
    additionalProperties: true,
  });
  const catalog = describeApiBindingCandidates(input);
  const allowed = candidateChoices({ bindingCandidates: catalog.candidates }, [
    {
      sourceNodeId: 'source',
      sourcePointer: '/runtime-name',
      targetPointer: '/path/id',
    },
  ]);
  assert.equal(
    resolveApiBindingCandidates({
      ...input,
      proposal: { bindings: allowed, gaps: [] },
    }).bindings[0].sourcePointer,
    '/runtime-name',
  );
  const forged = [{ ...allowed[0], sourceSelections: { s0: 'contents' } }];
  assert.throws(
    () =>
      resolveApiBindingCandidates({
        ...input,
        proposal: { bindings: forged, gaps: [] },
      }),
    /allowed object key/,
  );
});

test('integer to number remains eligible, number to integer is not guaranteed by a cast', async () => {
  const input = await fixture(object({ id: { type: 'integer' } }), {
    type: 'number',
  });
  assert(
    describeApiBindingCandidates(input).candidates.some(
      (c) =>
        JSON.stringify(c.source.segments) === JSON.stringify(segments(['id'])),
    ),
  );
});

test('unconstrained dynamic paths do not invent expressions or erase invalid original pointers', async () => {
  const input = await fixture(object({ value: true }));
  const catalog = describeApiBindingCandidates(input);
  const wanted = {
    sourceNodeId: 'source',
    sourcePointer: '/value/nested/key',
    targetPointer: '/path/id',
  };
  const choices = candidateChoices({ bindingCandidates: catalog.candidates }, [
    wanted,
  ]);
  assert.equal(
    resolveApiBindingCandidates({
      ...input,
      proposal: { bindings: choices, gaps: [] },
    }).bindings[0].sourcePointer,
    wanted.sourcePointer,
  );
});

test('mandatory precedence is derived from confirmed references and retains input-port scope without adding direct edges', () => {
  const node = (id, extra = {}) => ({
    id,
    inputs: ['main'],
    outputs: ['main'],
    references: [],
    dependencyNodeIds: [],
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
    ...extra,
  });
  const nodes = [
    node('root'),
    node('consumer', {
      references: [{ source: 'response', nodeId: 'root', pointer: '/id' }],
    }),
    node('join', {
      inputReferences: {
        left: [{ source: 'response', nodeId: 'consumer', pointer: '' }],
      },
      dependencyNodeIds: ['root'],
    }),
  ];
  const before = globalThis.structuredClone(nodes);
  assert.deepEqual(listWorkflowRequiredPrecedence(nodes), [
    { before: 'root', after: 'consumer', kind: 'data-reference' },
    {
      before: 'consumer',
      after: 'join',
      kind: 'data-reference',
      inputPort: 'left',
    },
    { before: 'root', after: 'join', kind: 'declared-dependency' },
  ]);
  assert.deepEqual(nodes, before);
});

test('native local references expose declared fields and recursive descendants without inventing an array item', async () => {
  const base = await fixture(object({ id: { type: 'string' } }));
  const schema = {
    $defs: {
      item: {
        type: 'object',
        additionalProperties: false,
        properties: { id: { type: 'string' }, next: { $ref: '#/$defs/item' } },
      },
    },
    $ref: '#/$defs/item',
  };
  const input = { ...base, nativeOutputs: [{ nodeId: 'native', schema }] };
  input.sources = resolveApiBindingSourceSelection({
    ...input,
    proposal: { sourceNodeIds: ['native'], gaps: [] },
  });
  const catalog = describeApiBindingCandidates(input);
  assert(
    catalog.candidates.some(
      (c) =>
        JSON.stringify(c.source.segments) === JSON.stringify(segments(['id'])),
    ),
  );
  const wanted = {
    sourceNodeId: 'native',
    sourcePointer: '/next/next/id',
    targetPointer: '/path/id',
  };
  const choices = candidateChoices({ bindingCandidates: catalog.candidates }, [
    wanted,
  ]);
  assert.deepEqual(
    resolveApiBindingCandidates({
      ...input,
      proposal: { bindings: choices, gaps: [] },
    }).bindings,
    [{ ...wanted, kind: 'node-output' }],
  );
});
