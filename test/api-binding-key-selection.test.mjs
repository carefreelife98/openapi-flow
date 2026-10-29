import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createApiCatalog,
  resolveApiOperations,
  resolveApiBindingSourceSelection,
  resolveApiBindingCandidates,
  describeApiBindingCandidates,
  createApiBindingKeyCatalog,
  describeApiLiteralJsonSources,
  validateApiCallBindingPlan,
} from '@openapi-flow/core';
import {
  selectApiBindingSources,
  planApiCallBindings,
  planApiBindingsByCall,
} from '@openapi-flow/langchain';
import { candidateChoices } from './fixtures/api-binding-candidate-choice.mjs';

const closed = (properties) => ({
  type: 'object',
  properties,
  additionalProperties: false,
});
async function fixture(schema, messages) {
  const catalog = await createApiCatalog([
    {
      id: 'key-contract',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Verified binding keys', version: '1' },
        paths: {
          '/source': {
            get: {
              responses: {
                200: {
                  description: 'Original data',
                  content: { 'application/json': { schema } },
                },
              },
            },
          },
          '/target/{id}': {
            get: {
              parameters: [
                {
                  in: 'path',
                  name: 'id',
                  required: true,
                  schema: { type: 'string' },
                },
              ],
              responses: { 200: { description: 'Result' } },
            },
          },
        },
      },
    },
  ]);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map((x) => x.key),
  );
  return {
    scenario: 'Use the requested original source value.',
    callId: 'target',
    materials: operations.map((operation) => ({
      callId: operation.path === '/source' ? 'source' : 'target',
      operation,
    })),
    ...(messages === undefined ? {} : { literalSourceMessages: messages }),
  };
}
const keyProposal = (
  value,
  source = { sourceFormat: 'text', messageId: 'user-key' },
) => ({ nodeId: 'source', kind: 'key', value, source });
const sourceDecision = (keys) => ({
  decision: {
    kind: 'selected-response-sources',
    sourceNodeIds: ['source'],
    ...(keys === undefined ? {} : { keySelections: keys }),
  },
});
const models = (handler) => ({
  withStructuredOutput(schema, options) {
    return {
      invoke: async (messages) =>
        handler(options.name, JSON.parse(messages[1].content), schema),
    };
  },
});

test('an existing source-selection call verifies the original key and the next call selects only its code-owned ID', async () => {
  const input = await fixture(
    closed({
      groups: {
        type: 'object',
        additionalProperties: {
          type: 'array',
          items: closed({ 'a/b~c': { type: 'string' } }),
        },
      },
    }),
    [{ id: 'user-key', text: 'Use key QA and explicit item index 7.' }],
  );
  const expected = {
    sourceNodeId: 'source',
    sourcePointer: '/groups/QA/7/a~1b~0c',
    targetPointer: '/path/id',
  };
  const calls = [];
  const model = models((name, context) => {
    calls.push(name);
    if (name === 'select_api_binding_sources') {
      assert.deepEqual(
        context.literalSourceMessages,
        input.literalSourceMessages,
      );
      return sourceDecision([
        {
          nodeId: 'source',
          kind: 'key',
          value: 'QA',
          source: { sourceFormat: 'text' },
        },
      ]);
    }
    const key = context.bindingKeyCandidates[0];
    assert.equal(key.value, 'QA');
    assert.equal(key.source.messageId, 'user-key');
    const choices = candidateChoices(context, [expected]);
    assert.deepEqual(choices[0].sourceSelections, {
      s0: { keyId: key.id },
      s1: 7,
    });
    return { bindings: choices, gaps: [] };
  });
  const result = await planApiBindingsByCall({
    ...input,
    model,
    concurrency: 1,
  });
  assert.deepEqual(result.calls.find((x) => x.callId === 'target').bindings, [
    { ...expected, kind: 'node-output' },
  ]);
  assert.deepEqual(calls, [
    'select_api_binding_sources',
    'plan_api_call_bindings',
  ]);
});

test('absent original key sources expose only fixed fields to the model while manual core keys remain supported', async () => {
  const input = await fixture(
    closed({
      fixed: { type: 'string' },
      groups: { type: 'object', additionalProperties: { type: 'string' } },
    }),
  );
  const sources = resolveApiBindingSourceSelection({
    ...input,
    proposal: { sourceNodeIds: ['source'], gaps: [] },
  });
  const binding = {
    sourceNodeId: 'source',
    sourcePointer: '/fixed',
    targetPointer: '/path/id',
  };
  const result = await planApiCallBindings({
    ...input,
    sources,
    model: models((_name, context) => {
      assert.deepEqual(context.bindingKeyCandidates, []);
      for (const field of [
        ...context.bindingSourceFields,
        ...context.bindingTargetFields,
      ])
        assert(
          field.segments.every(
            (x) => x.kind !== 'key' && x.kind !== 'descendant',
          ),
        );
      return { bindings: candidateChoices(context, [binding]), gaps: [] };
    }),
  });
  assert.deepEqual(result.bindings, [{ ...binding, kind: 'node-output' }]);
  const manual = {
    sourceNodeId: 'source',
    sourcePointer: '/groups/manual-key',
    targetPointer: '/path/id',
  };
  const catalog = describeApiBindingCandidates({ ...input, sources });
  assert.deepEqual(
    resolveApiBindingCandidates({
      ...input,
      sources,
      proposal: {
        bindings: candidateChoices({ bindingCandidates: catalog.candidates }, [
          manual,
        ]),
        gaps: [],
      },
    }).bindings,
    [{ ...manual, kind: 'node-output' }],
  );
});

test('invented key text, wrong messages and non-string JSON tokens fail at source verification without another model call', async () => {
  const messages = [{ id: 'user-key', text: 'Use QA. JSON number: 1' }];
  const json = describeApiLiteralJsonSources(messages)[0].json.find(
    (x) => x.text === '1',
  );
  assert(json);
  for (const selection of [
    keyProposal('gdNoList}}'),
    keyProposal('QA', { sourceFormat: 'text', messageId: 'absent' }),
    keyProposal('1', {
      sourceFormat: 'json',
      messageId: 'user-key',
      candidateId: json.id,
    }),
  ]) {
    assert.throws(() =>
      createApiBindingKeyCatalog({
        messages,
        selections: [selection],
        nodeIds: ['source'],
      }),
    );
  }
  const input = await fixture(
    { type: 'object', additionalProperties: { type: 'string' } },
    messages,
  );
  let calls = 0;
  await assert.rejects(
    selectApiBindingSources({
      ...input,
      model: models(() => {
        calls++;
        return sourceDecision([
          {
            nodeId: 'source',
            kind: 'key',
            value: 'gdNoList}}',
            source: { sourceFormat: 'text' },
          },
        ]);
      }),
    }),
  );
  assert.equal(calls, 1);
});

test('the same original key can have distinct confirmed sources without inventing another name', () => {
  const first = keyProposal('QA');
  const second = keyProposal('QA', {
    sourceFormat: 'text',
    messageId: 'second-answer',
  });
  const keys = createApiBindingKeyCatalog({
    messages: [
      { id: 'user-key', text: 'Use QA.' },
      { id: 'second-answer', text: 'QA remains the selected group.' },
    ],
    nodeIds: ['source'],
    selections: [first, second, first],
  });
  assert.equal(keys.length, 2);
  assert.notEqual(keys[0].id, keys[1].id);
  assert.deepEqual(
    keys.map((key) => key.value),
    ['QA', 'QA'],
  );
});

test('raw key strings and invented IDs cannot pass the field output schema', async () => {
  const input = await fixture(
    { type: 'object', additionalProperties: { type: 'string' } },
    [{ id: 'user-key', text: 'Use key QA.' }],
  );
  const sources = resolveApiBindingSourceSelection({
    ...input,
    proposal: {
      sourceNodeIds: ['source'],
      keySelections: [keyProposal('QA')],
      gaps: [],
    },
  });
  const expected = {
    sourceNodeId: 'source',
    sourcePointer: '/QA',
    targetPointer: '/path/id',
  };
  for (const invalid of [
    'QA',
    { keyId: 'binding-key-invented' },
    { pathId: 'binding-key-invented' },
  ]) {
    let calls = 0;
    await assert.rejects(
      planApiCallBindings({
        ...input,
        sources,
        model: models((_name, context) => {
          calls++;
          const bindings = candidateChoices(context, [expected]);
          bindings[0].sourceSelections.s0 = invalid;
          return { bindings, gaps: [] };
        }),
      }),
    );
    assert.equal(calls, 1);
  }
});

test('a valid key ID for another producer is not selectable for this candidate', async () => {
  const schema = { type: 'object', additionalProperties: { type: 'string' } };
  const input = await fixture(schema, [
    { id: 'user-key', text: 'Use key QA.' },
  ]);
  input.nativeOutputs = [{ nodeId: 'other', schema }];
  const sources = resolveApiBindingSourceSelection({
    ...input,
    proposal: {
      sourceNodeIds: ['source', 'other'],
      gaps: [],
      keySelections: [
        keyProposal('QA'),
        { ...keyProposal('QA'), nodeId: 'other' },
      ],
    },
  });
  let calls = 0;
  await assert.rejects(
    planApiCallBindings({
      ...input,
      sources,
      model: models((_name, context) => {
        calls++;
        const bindings = candidateChoices(context, [
          {
            sourceNodeId: 'source',
            sourcePointer: '/QA',
            targetPointer: '/path/id',
          },
        ]);
        const other = context.bindingKeyCandidates.find(
          (key) => key.nodeId === 'other',
        );
        bindings[0].sourceSelections.s0 = { keyId: other.id };
        return { bindings, gaps: [] };
      }),
    }),
  );
  assert.equal(calls, 1);
});

test('an explicit original descendant path becomes an ID; the model cannot return new path tokens', async () => {
  const input = await fixture(true, [
    { id: 'user-key', text: 'Read /deep/value from the response.' },
  ]);
  const sources = resolveApiBindingSourceSelection({
    ...input,
    proposal: {
      sourceNodeIds: ['source'],
      keySelections: [{ ...keyProposal('/deep/value'), kind: 'path' }],
      gaps: [],
    },
  });
  const expected = {
    sourceNodeId: 'source',
    sourcePointer: '/deep/value',
    targetPointer: '/path/id',
  };
  const result = await planApiCallBindings({
    ...input,
    sources,
    model: models((_name, context) => {
      const bindings = candidateChoices(context, [expected]);
      assert('pathId' in bindings[0].sourceSelections.s0);
      return { bindings, gaps: [] };
    }),
  });
  assert.deepEqual(result.bindings, [{ ...expected, kind: 'node-output' }]);
});

test('JSON empty keys and escaped original keys preserve their values through key IDs', async () => {
  for (const value of ['', 'a/b~c']) {
    const messages = [{ id: 'user-key', text: JSON.stringify(value) }];
    const candidate = describeApiLiteralJsonSources(messages)[0].json.find(
      (x) => x.text === JSON.stringify(value),
    );
    assert(candidate);
    const input = await fixture(
      { type: 'object', additionalProperties: { type: 'string' } },
      messages,
    );
    const sources = resolveApiBindingSourceSelection({
      ...input,
      proposal: {
        sourceNodeIds: ['source'],
        keySelections: [
          keyProposal(value, {
            sourceFormat: 'json',
            messageId: 'user-key',
            candidateId: candidate.id,
          }),
        ],
        gaps: [],
      },
    });
    const expected = {
      sourceNodeId: 'source',
      sourcePointer: '/' + value.replaceAll('~', '~0').replaceAll('/', '~1'),
      targetPointer: '/path/id',
    };
    const result = await planApiCallBindings({
      ...input,
      sources,
      model: models((_name, context) => ({
        bindings: candidateChoices(context, [expected]),
        gaps: [],
      })),
    });
    assert.deepEqual(result.bindings, [{ ...expected, kind: 'node-output' }]);
    validateApiCallBindingPlan({ ...input, result });
  }
});

test('key receipts reject source drift before planning and source mutation during either model stage', async () => {
  const messages = [{ id: 'user-key', text: 'Use key QA.' }];
  const input = await fixture(
    { type: 'object', additionalProperties: { type: 'string' } },
    messages,
  );
  const sources = resolveApiBindingSourceSelection({
    ...input,
    proposal: {
      sourceNodeIds: ['source'],
      keySelections: [keyProposal('QA')],
      gaps: [],
    },
  });
  let invoked = false;
  const changed = {
    ...input,
    literalSourceMessages: [{ id: 'user-key', text: 'Use another key.' }],
  };
  await assert.rejects(
    planApiCallBindings({
      ...changed,
      sources,
      model: models(() => {
        invoked = true;
        throw Error('must not invoke');
      }),
    }),
  );
  assert.equal(invoked, false);
  const selectionInput = {
    ...input,
    literalSourceMessages: globalThis.structuredClone(messages),
  };
  await assert.rejects(
    selectApiBindingSources({
      ...selectionInput,
      model: models(() => {
        selectionInput.literalSourceMessages[0].text = 'changed';
        return sourceDecision([
          {
            nodeId: 'source',
            kind: 'key',
            value: 'QA',
            source: { sourceFormat: 'text' },
          },
        ]);
      }),
    }),
    /changed/,
  );
  const fieldInput = {
    ...input,
    literalSourceMessages: globalThis.structuredClone(messages),
  };
  await assert.rejects(
    planApiCallBindings({
      ...fieldInput,
      sources,
      model: models((_name, context) => {
        const bindings = candidateChoices(context, [
          {
            sourceNodeId: 'source',
            sourcePointer: '/QA',
            targetPointer: '/path/id',
          },
        ]);
        fieldInput.literalSourceMessages[0].text = 'changed';
        return { bindings, gaps: [] };
      }),
    }),
    /changed/,
  );
});
