import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createApiCatalog,
  resolveApiOperations,
  describeApiLiteralJsonSources,
  resolveApiLiteralValues,
} from '@openapi-flow/core';
import { generateApiArguments } from '@openapi-flow/langchain';
import { literalGenerationModel } from './fixtures/literal-generation-fixture.mjs';

async function fixture() {
  const catalog = await createApiCatalog([
    {
      id: 'source-owned',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Source-owned values', version: '1' },
        paths: {
          '/records/{id}': {
            get: {
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' },
                },
                { name: 'sequence', in: 'query', schema: { type: 'integer' } },
              ],
              responses: { 200: { description: 'ok' } },
            },
          },
        },
      },
    },
  ]);
  const [operation] = await resolveApiOperations(catalog, [
    catalog.operations[0].key,
  ]);
  const messages = [
    {
      id: 'request',
      text: 'Record 12001. Use {"ids":["12001","12002","12003"]}. sequence=0으로 조회.',
    },
  ];
  const choices = describeApiLiteralJsonSources(messages)[0].json;
  return {
    operation,
    messages,
    choices,
    callId: 'selected-record',
    bindings: [],
  };
}

test('source selection copies the original string and attached assignment number, without model values', async () => {
  const f = await fixture();
  const selections = [
    {
      messageId: 'request',
      targetPointer: '/path/id',
      sourceFormat: 'json',
      candidateId: f.choices.find((x) => x.text === '"12001"').id,
    },
    {
      messageId: 'request',
      targetPointer: '/query/sequence',
      sourceFormat: 'json',
      candidateId: f.choices.find((x) => x.text === '0').id,
    },
  ];
  const before = globalThis.structuredClone(f.messages);
  const resolved = resolveApiLiteralValues({ ...f, selections });
  assert.deepEqual(resolved.values, {
    path: { id: '12001' },
    query: { sequence: 0 },
  });
  assert.deepEqual(f.messages, before);
  const model = literalGenerationModel({
    literalInputs: {
      state: 'provided',
      literalSources: selections.map(
        ({ targetPointer, sourceFormat, candidateId }) => ({
          targetPointer,
          sourceFormat,
          candidateId,
        }),
      ),
    },
    requestedInputs: ['/path/id', '/query/sequence'],
  });
  const result = await generateApiArguments({
    ...f,
    scenario: f.messages[0].text,
    literalSourceMessages: f.messages,
    trackRequestedInputs: true,
    model,
  });
  assert.deepEqual(result.values, resolved.values);
  assert.equal(
    Object.hasOwn(
      model.calls[1].schema.properties.literalInputs.properties,
      'values',
    ),
    false,
  );
});

test('numeric sources cannot become OAS strings; overlapping, stale and rewritten sources fail', async () => {
  const f = await fixture();
  const good = {
    messageId: 'request',
    targetPointer: '/path/id',
    sourceFormat: 'json',
    candidateId: f.choices.find((x) => x.text === '"12001"').id,
  };
  assert.throws(() =>
    resolveApiLiteralValues({
      ...f,
      selections: [
        { ...good, candidateId: f.choices.find((x) => x.text === '12001').id },
      ],
    }),
  );
  assert.throws(() =>
    resolveApiLiteralValues({ ...f, selections: [good, good] }),
  );
  assert.throws(() =>
    resolveApiLiteralValues({
      ...f,
      selections: [{ ...good, candidateId: 'absent' }],
    }),
  );
  assert.throws(() =>
    resolveApiLiteralValues({
      ...f,
      selections: [
        {
          ...good,
          sourceFormat: 'text',
          candidateId: undefined,
          sourceText: 'invented',
        },
      ],
    }),
  );
});

test('the wire schema excludes numeric IDs for string roots and rejects the former duplicated values contract', async () => {
  const f = await fixture();
  const source = {
    targetPointer: '/path/id',
    sourceFormat: 'json',
    candidateId: f.choices.find((x) => x.text === '"12001"').id,
  };
  const output = {
    literalInputs: { state: 'provided', literalSources: [source] },
    requestedInputs: [],
  };
  const model = literalGenerationModel(output);
  await generateApiArguments({
    ...f,
    scenario: f.messages[0].text,
    literalSourceMessages: f.messages,
    trackRequestedInputs: true,
    model,
  });
  assert.equal(
    Object.hasOwn(model.calls[0].payload, 'literalJsonSources'),
    false,
  );
  const scoped = model.calls[1].payload.literalSourceChoices.find(
    (group) => group.targetPointer === '/path/id',
  );
  assert.ok(
    scoped.candidates.every(
      (candidate) => typeof JSON.parse(candidate.text) === 'string',
    ),
  );
  assert.equal(
    model.calls[1].payload.literalSourceChoices.some(
      (group) => group.targetPointer !== '/path/id',
    ),
    false,
  );
  const alternatives =
    model.calls[1].schema.properties.literalInputs.properties.literalSources
      .items.anyOf;
  const branch = alternatives.find(
    (x) =>
      x.properties.targetPointer.const === '/path/id' &&
      x.properties.sourceFormat.const === 'json',
  );
  const numeric = f.choices.find((x) => x.text === '12001').id;
  assert.equal(branch.properties.candidateId.enum.includes(numeric), false);
  assert.equal(
    branch.properties.candidateId.enum.includes(source.candidateId),
    true,
  );
  const old = literalGenerationModel({
    ...output,
    literalInputs: {
      ...output.literalInputs,
      values: { path: { id: '12001' } },
    },
  });
  await assert.rejects(
    generateApiArguments({
      ...f,
      scenario: f.messages[0].text,
      literalSourceMessages: f.messages,
      trackRequestedInputs: true,
      model: old,
    }),
    (e) => e.diagnostic.code === 'MODEL_OUTPUT_INVALID',
  );
});
