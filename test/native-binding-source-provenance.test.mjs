import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  createNativeOutputContracts,
  describeApiCallBindingPlanning,
  resolveApiBindingSourceSelection,
  validateNativeOutputContracts,
} from '@openapi-flow/core';
import {
  selectApiBindingSources,
  planApiCallBindings,
} from '@openapi-flow/langchain';
import { materials } from './fixtures/request-binding-fixture.mjs';

const outputSchema = { type: 'array', items: { type: 'string' } };
const capability = {
  name: 'declared-reference-output',
  description: 'Collects unchanged values from the explicitly selected source.',
  parametersSchema: z.strictObject({
    source: z.enum(['response', 'node-output']),
    nodeId: z.string().min(1),
    pointer: z.string(),
  }),
  inputPorts: () => ['main'],
  outputPorts: () => ['main'],
  responseReferences: (parameters) =>
    parameters.source === 'response' ? [parameters] : [],
  nodeOutputReferences: (parameters) =>
    parameters.source === 'node-output' ? [parameters] : [],
  outputSchema: () => outputSchema,
  waitsForAllInputs: false,
  exclusiveOutputPorts: false,
};
function node(id, source, nodeId) {
  return {
    id,
    capability: capability.name,
    parameters: { source, nodeId, pointer: '' },
  };
}
function fixture() {
  const nativeNodes = [
    node('collect-source', 'response', 'source'),
    node('final-gather', 'response', 'detail'),
    node('after-gather', 'node-output', 'final-gather'),
    node('later', 'node-output', 'after-gather'),
  ];
  return {
    scenario: 'Use the collected source values to read detail.',
    materials,
    callId: 'detail',
    nativeOutputs: createNativeOutputContracts({
      nativeNodes,
      capabilities: [capability],
    }),
  };
}

test('discovery preserves implementation meaning, actual input references and the original output schema', () => {
  const input = fixture();
  const before = globalThis.structuredClone(input);
  const description = describeApiCallBindingPlanning(input);
  const collect = description.sourceCandidates.find(
    (item) => item.nodeId === 'collect-source',
  );
  assert.deepEqual(collect.schema, outputSchema);
  assert.deepEqual(collect.provenance, {
    capability: capability.name,
    description: capability.description,
    references: [{ source: 'response', nodeId: 'source', pointer: '' }],
  });
  assert.deepEqual(description.input.nativeOutputs, input.nativeOutputs);
  assert.deepEqual(input, before);
  collect.provenance.references[0].nodeId = 'mutated-copy';
  assert.deepEqual(input, before);
});

test('direct and transitive downstream native sources are excluded before source selection and cannot be forced back', () => {
  const input = fixture();
  const allowed = describeApiCallBindingPlanning(input).sourceCandidates.map(
    (item) => item.nodeId,
  );
  assert(allowed.includes('collect-source'));
  assert(allowed.includes('source'));
  for (const id of ['detail', 'final-gather', 'after-gather', 'later']) {
    assert(!allowed.includes(id));
    assert.throws(
      () =>
        resolveApiBindingSourceSelection({
          ...input,
          proposal: { sourceNodeIds: [id], gaps: [] },
        }),
      /source IDs/,
    );
  }
});

test('provided legacy contracts retain unknown lineage and declared output data without fabricated metadata', () => {
  const input = fixture();
  input.nativeOutputs.push({ nodeId: 'external', schema: outputSchema });
  const candidate = describeApiCallBindingPlanning(input).sourceCandidates.find(
    (item) => item.nodeId === 'external',
  );
  assert(candidate);
  assert.equal(Object.hasOwn(candidate, 'provenance'), false);
  assert.deepEqual(candidate.schema, outputSchema);
});

test('port and exclusive-output implementation references also propagate downstream exclusion without looping', () => {
  const nativeNodes = [
    node('direct', 'response', 'detail'),
    node('port', 'response', 'source'),
    node('exclusive', 'response', 'source'),
  ];
  const portCapability = {
    ...capability,
    inputReferences: () => ({
      main: [{ source: 'node-output', nodeId: 'direct', pointer: '' }],
    }),
  };
  const port = createNativeOutputContracts({
    nativeNodes: [nativeNodes[1]],
    capabilities: [portCapability],
  });
  const exclusiveCapability = {
    ...capability,
    rejoinsExclusiveOutputs: () => 'port',
  };
  const exclusive = createNativeOutputContracts({
    nativeNodes: [nativeNodes[2]],
    capabilities: [exclusiveCapability],
  });
  const direct = createNativeOutputContracts({
    nativeNodes: [nativeNodes[0]],
    capabilities: [capability],
  });
  // A declared cyclic lineage is not approved as a DAG; filtering must terminate.
  direct[0].provenance.references.push({
    source: 'node-output',
    nodeId: 'exclusive',
    pointer: '',
  });
  const description = describeApiCallBindingPlanning({
    ...fixture(),
    nativeOutputs: [...exclusive, ...port, ...direct],
  });
  assert(
    description.sourceCandidates.every((candidate) => candidate.kind === 'api'),
  );
});

test('malformed provenance fails at the declaration boundary instead of silently losing dependency information', () => {
  for (const provenance of [
    null,
    {},
    { capability: ' ', description: '', references: [] },
    {
      capability: 'x',
      description: '',
      references: [
        { source: 'response', nodeId: 'detail', pointer: 'not-a-pointer' },
      ],
    },
    {
      capability: 'x',
      description: '',
      references: [{ source: 'guessed', nodeId: 'detail' }],
    },
  ]) {
    assert.throws(() =>
      validateNativeOutputContracts([
        { nodeId: 'bad', schema: true, provenance },
      ]),
    );
  }
});

test('the actual discovery model sees provenance and a schema that cannot select a downstream native', async () => {
  const input = fixture();
  const sources = await selectApiBindingSources({
    ...input,
    model: {
      withStructuredOutput(schema, options) {
        assert.equal(options.name, 'select_api_binding_sources');
        assert.equal(JSON.stringify(schema).includes('final-gather'), false);
        return {
          invoke: async (messages) => {
            const context = JSON.parse(messages[1].content);
            const collect = context.sourceCandidates.find(
              (item) => item.nodeId === 'collect-source',
            );
            assert.deepEqual(collect.provenance.references, [
              { source: 'response', nodeId: 'source', pointer: '' },
            ]);
            return {
              decision: {
                kind: 'selected-response-sources',
                sourceNodeIds: ['collect-source'],
              },
            };
          },
        };
      },
    },
  });
  let invoked = false;
  const changed = globalThis.structuredClone(input);
  changed.nativeOutputs[0].provenance.references[0].nodeId = 'detail';
  await assert.rejects(
    planApiCallBindings({
      ...changed,
      sources,
      model: {
        withStructuredOutput() {
          invoked = true;
          throw new Error('stale provenance must not reach a model');
        },
      },
    }),
  );
  assert.equal(invoked, false);
});
