import assert from 'node:assert/strict';
import test from 'node:test';
import { createValidator } from '@scalar/json-schema-validator';
import { generateApiArguments } from '@openapi-flow/langchain';
import { requestOperation } from './fixtures/api-argument-generation-fixture.mjs';
import { literalJsonCandidateId } from './fixtures/api-literal-json-source-choice.mjs';

async function run(schema, pointers, selections, inspect = () => {}) {
  const stages = [];
  const result = await generateApiArguments({
    callId: 'typed-input',
    operation: await requestOperation(schema),
    bindings: [],
    scenario: '상품 101, 102와 수량 3으로 조회해줘.',
    literalSourceMessages: [
      { id: 'user', text: '상품 101, 102와 수량 3으로 조회해줘.' },
    ],
    model: {
      withStructuredOutput(wire, options) {
        return {
          async invoke() {
            stages.push(options.name);
            if (options.name === 'select_api_literal_targets')
              return {
                literalInputs: { state: 'provided', targetPointers: pointers },
                requestedInputs: [],
              };
            assert.equal(options.name, 'generate_api_arguments');
            const output = {
              literalInputs: { state: 'provided', literalSources: selections },
              requestedInputs: [],
            };
            inspect(createValidator(wire), output);
            return output;
          },
        };
      },
    },
  });
  return { result, stages };
}
const json = (targetPointer, token) => ({
  targetPointer,
  sourceFormat: 'json',
  candidateId: literalJsonCandidateId(token),
});
const text = (targetPointer, sourceText) => ({
  targetPointer,
  sourceFormat: 'text',
  sourceText,
});

test('string array and numeric array use distinct destination-scoped source choices in one OAS body', async () => {
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      productIds: { type: 'array', items: { type: 'string' } },
      quantities: { type: 'array', items: { type: 'integer' } },
    },
  };
  const pointers = [
    '/body/productIds/0',
    '/body/productIds/1',
    '/body/quantities/0',
  ];
  const selections = [
    text(pointers[0], '101'),
    text(pointers[1], '102'),
    json(pointers[2], '3'),
  ];
  const { result, stages } = await run(
    schema,
    pointers,
    selections,
    (validate, valid) => {
      assert.equal(validate(valid).valid, true);
      const wrong = globalThis.structuredClone(valid);
      wrong.literalInputs.literalSources[0] = json(pointers[0], '101');
      assert.equal(
        validate(wrong).valid,
        false,
        'number candidate must not be an allowed source for a string array item',
      );
      const wrongText = globalThis.structuredClone(valid);
      wrongText.literalInputs.literalSources[2] = text(pointers[2], '3');
      assert.equal(
        validate(wrongText).valid,
        false,
        'text must not become a numeric request value',
      );
    },
  );
  assert.deepEqual(stages, [
    'select_api_literal_targets',
    'generate_api_arguments',
  ]);
  assert.deepEqual(result.values.body, {
    productIds: ['101', '102'],
    quantities: [3],
  });
});

test('recursive and dynamic input paths resolve their own string contracts without unrolling the OAS', async () => {
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      root: {
        $ref: '#/paths/~1consumer/post/requestBody/content/application~1json/schema/$defs/entry',
      },
      labels: {
        type: 'object',
        additionalProperties: { type: 'string', pattern: '^10' },
      },
    },
    $defs: {
      entry: {
        type: 'object',
        additionalProperties: false,
        properties: {
          code: { type: 'string' },
          children: {
            type: 'array',
            items: {
              $ref: '#/paths/~1consumer/post/requestBody/content/application~1json/schema/$defs/entry',
            },
          },
        },
      },
    },
  };
  const pointers = [
    '/body/root/children/0/children/0/code',
    '/body/labels/x~1y',
  ];
  const { result } = await run(
    schema,
    pointers,
    [text(pointers[0], '101'), text(pointers[1], '102')],
    (validate, valid) => {
      assert.equal(validate(valid).valid, true);
      const invalid = globalThis.structuredClone(valid);
      invalid.literalInputs.literalSources[0] = json(pointers[0], '101');
      assert.equal(validate(invalid).valid, false);
    },
  );
  assert.equal(result.values.body.root.children[0].children[0].code, '101');
  assert.equal(result.values.body.labels['x/y'], '102');
});

test('a selected closed or overlapping target fails before source selection', async () => {
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: { code: { type: 'string' } },
  };
  for (const pointers of [
    ['/body/missing'],
    ['/body', '/body/code'],
    ['/body/code', '/body/code'],
  ]) {
    await assert.rejects(run(schema, pointers, []));
  }
});
