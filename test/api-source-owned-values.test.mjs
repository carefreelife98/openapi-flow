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
      model.calls[0].schema.properties.literalInputs.anyOf.find(
        (branch) => branch.properties?.state?.const === 'provided',
      ).properties,
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

test('joint construction carries original candidates and validates destination types before acceptance', async () => {
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
  assert.equal(model.calls.length, 1);
  assert.equal(
    Object.hasOwn(model.calls[0].payload, 'literalJsonSources'),
    false,
  );
  const catalog = model.calls[0].payload.declaredLiteralSourceChoices;
  assert.ok(
    catalog.some((group) =>
      group.candidates.some((candidate) => candidate.id === source.candidateId),
    ),
  );
  const numeric = f.choices.find((x) => x.text === '12001').id;
  await assert.rejects(
    generateApiArguments({
      ...f,
      scenario: f.messages[0].text,
      literalSourceMessages: f.messages,
      model: literalGenerationModel({
        ...output,
        literalInputs: {
          state: 'provided',
          literalSources: [{ ...source, candidateId: numeric }],
        },
      }),
    }),
    (error) => error.diagnostic.code === 'MODEL_OUTPUT_INVALID',
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

test('declared string roots keep destination-scoped wire filtering without freezing new construction paths', async () => {
  const f = await fixture();
  const quoted = f.choices.find((entry) => entry.text === '"12001"').id;
  const numeric = f.choices.find((entry) => entry.text === '12001').id;
  const output = {
    literalInputs: {
      state: 'provided',
      literalSources: [
        {
          targetPointer: '/path/id',
          sourceFormat: 'json',
          candidateId: quoted,
        },
      ],
    },
    requestedInputs: [],
  };
  const { createValidator } = await import('@scalar/json-schema-validator');
  const model = literalGenerationModel(output, ({ schema }) => {
    const validate = createValidator(schema);
    assert.equal(validate(output).valid, true);
    const wrong = globalThis.structuredClone(output);
    wrong.literalInputs.literalSources[0].candidateId = numeric;
    assert.equal(
      validate(wrong).valid,
      false,
      'generic construction must not bypass an already declared string target',
    );
  });
  const result = await generateApiArguments({
    ...f,
    scenario: f.messages[0].text,
    literalSourceMessages: f.messages,
    model,
  });
  assert.equal(result.values.path.id, '12001');
  assert.equal(model.calls.length, 1);
});
