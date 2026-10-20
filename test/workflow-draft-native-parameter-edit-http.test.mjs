import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import test from 'node:test';
import { ChatOpenAI } from '@langchain/openai';
import {
  selectWorkflowDraftNativeParameterEditTargets,
  generateWorkflowDraftNativeParameterEdits,
} from '@openapi-flow/langchain';
import {
  nativeParameterEditFixture,
  nativeParameterTargets,
  nativeParameterValues,
} from './fixtures/workflow-draft-native-parameter-edit-fixture.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { default: Ajv } = require('ajv');
const { Ajv2020 } = require('ajv/dist/2020.js');

test('actual ChatOpenAI native-edit requests use object-root schemas, shared registered resources, selected typed values and optional evidence', async () => {
  const requests = [];
  let output;
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    requests.push(JSON.parse(raw));
    output = modelMessageEvidenceSelections(output);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'native-edit',
        object: 'chat.completion',
        created: 1,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: JSON.stringify(output) },
          },
        ],
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const model = new ChatOpenAI({
      model: 'gpt-4o',
      apiKey: 'local-fixture-only',
      maxRetries: 0,
      configuration: {
        baseURL: `http://127.0.0.1:${server.address().port}/v1`,
      },
    });
    for (const includeExplanations of [false, true]) {
      const input = await nativeParameterEditFixture(
        'Set config count to 4 and enabled to true.',
        includeExplanations,
      );
      output = nativeParameterTargets(input, [
        { kind: 'set', pointer: '/count' },
        { kind: 'set', pointer: '/enabled' },
      ]);
      const targetsOutput = modelMessageEvidenceSelections(output);
      const selected = await selectWorkflowDraftNativeParameterEditTargets({
        ...input,
        model,
      });
      assert.equal(selected.status, 'ready');
      const targetsWire = requests.at(-1).response_format.json_schema;
      assert.equal(
        targetsWire.name,
        'select_draft_native_parameter_edit_targets',
      );
      assert.equal(targetsWire.strict, true);
      assert.equal(targetsWire.schema.type, 'object');
      const ajv = new Ajv({ strict: false });
      assert.equal(
        ajv.validateSchema(targetsWire.schema),
        true,
        JSON.stringify(ajv.errors),
      );
      const targetsValidator = ajv.compile(targetsWire.schema);
      assert.equal(
        targetsValidator(targetsOutput),
        true,
        JSON.stringify(targetsValidator.errors),
      );
      assert.equal(
        targetsValidator({ ...targetsOutput, nodeId: 'invented' }),
        false,
      );
      assert.equal(
        targetsWire.schema.properties.decision.anyOf.some(
          (choice) => choice.properties.status.const === 'runtime-parameters',
        ),
        false,
      );
      output = nativeParameterValues(input, [
        { status: 'provided', value: 4 },
        { status: 'provided', value: true },
      ]);
      const result = await generateWorkflowDraftNativeParameterEdits({
        ...input,
        model,
        contract: selected.contract,
      });
      assert.equal(result.status, 'ready');
      const valuesWire = requests.at(-1).response_format.json_schema;
      const references = [];
      const visit = (value) => {
        if (!value || typeof value !== 'object') return;
        if (typeof value.$ref === 'string') references.push(value.$ref);
        for (const child of Object.values(value)) visit(child);
      };
      visit(valuesWire.schema);
      assert.ok(references.length);
      assert.ok(
        references.every(
          (reference) =>
            /^#\/\$defs\/schema-[a-f0-9]+$/.test(reference) &&
            Object.hasOwn(
              valuesWire.schema.$defs,
              reference.slice('#/$defs/'.length),
            ),
        ),
      );
      assert.equal(
        valuesWire.name,
        'generate_draft_native_parameter_edit_values',
      );
      assert.equal(valuesWire.schema.type, 'object');
      assert.equal(
        valuesWire.schema.$schema,
        'https://json-schema.org/draft/2020-12/schema',
      );
      const ajv2020 = new Ajv2020({ strict: false });
      assert.equal(
        ajv2020.validateSchema(valuesWire.schema),
        true,
        JSON.stringify(ajv2020.errors),
      );
      const validate = ajv2020.compile(valuesWire.schema);
      assert.equal(validate(output), true, JSON.stringify(validate.errors));
      assert.equal(
        validate({
          values: {
            ...output.values,
            'parameter-1': { ...output.values['parameter-1'], value: '4' },
          },
        }),
        false,
      );
      assert.equal(
        validate({
          values: {
            ...output.values,
            'parameter-3': output.values['parameter-1'],
          },
        }),
        false,
      );
      const valueChoice =
        valuesWire.schema.properties.values.properties['parameter-1'].anyOf[0];
      assert.equal(
        Object.hasOwn(valueChoice.properties, 'explanation'),
        includeExplanations,
      );
      assert.equal(Object.keys(valuesWire.schema.$defs).length, 2);
      const payload = JSON.parse(requests.at(-1).messages[1].content);
      assert.deepEqual(
        payload.targets.map((target) => target.pointer),
        ['/count', '/enabled'],
      );
      for (const key of [
        'stage',
        'fingerprint',
        'revision',
        'stepId',
        'planId',
        'parameters',
        'nodes',
        'resolutions',
      ])
        assert.equal(Object.hasOwn(payload, key), false);
      for (const source of payload.sourceCandidates.filter(
        (source) => source.kind === 'api',
      )) {
        assert.ok(source.operation.responses);
        assert.equal(Object.hasOwn(source.operation, 'requestBody'), false);
      }
    }
    assert.equal(requests.length, 4);
    const input = {
      ...(await nativeParameterEditFixture(
        'Supply count at execution and set enabled to true.',
        true,
      )),
      allowRuntimeParameters: true,
    };
    output = nativeParameterTargets(input, [
      { kind: 'defer', pointer: '/count' },
      { kind: 'set', pointer: '/enabled' },
    ]);
    const selected = await selectWorkflowDraftNativeParameterEditTargets({
      ...input,
      model,
    });
    assert.equal(selected.status, 'ready');
    const wire = requests.at(-1).response_format.json_schema.schema;
    const validateTargets = new Ajv({ strict: false }).compile(wire);
    assert.equal(validateTargets(modelMessageEvidenceSelections(output)), true);
    const targetsChoice = wire.properties.decision.anyOf.find(
      (choice) => choice.properties.status.const === 'targets',
    );
    assert.deepEqual(
      targetsChoice.properties.targets.items.properties.kind.enum,
      ['set', 'remove', 'defer'],
    );
    output = {
      values: {
        'parameter-2': {
          ...nativeParameterValues(input, [{ status: 'provided', value: true }])
            .values['parameter-1'],
        },
      },
    };
    const edited = await generateWorkflowDraftNativeParameterEdits({
      ...input,
      contract: selected.contract,
      model,
    });
    assert.equal(edited.status, 'ready');
    const valueRequest = requests.at(-1);
    const valueSchema = valueRequest.response_format.json_schema.schema;
    const validateValues = new Ajv2020({ strict: false }).compile(valueSchema);
    assert.deepEqual(Object.keys(valueSchema.properties.values.properties), [
      'parameter-2',
    ]);
    assert.equal(validateValues(modelMessageEvidenceSelections(output)), true);
    assert.equal(
      validateValues({
        values: {
          ...modelMessageEvidenceSelections(output).values,
          'parameter-1':
            modelMessageEvidenceSelections(output).values['parameter-2'],
        },
      }),
      false,
    );
    assert.deepEqual(
      JSON.parse(valueRequest.messages[1].content).targets.map(
        (target) => target.pointer,
      ),
      ['/enabled'],
    );
    const before = requests.length;
    output = nativeParameterTargets(input, [
      { kind: 'defer', pointer: '/count' },
    ]);
    const deferred = await selectWorkflowDraftNativeParameterEditTargets({
      ...input,
      model,
    });
    assert.equal(deferred.status, 'ready');
    const complete = await generateWorkflowDraftNativeParameterEdits({
      ...input,
      contract: deferred.contract,
      model,
    });
    assert.equal(complete.status, 'ready');
    assert.equal(requests.length, before + 1);
    assert.deepEqual(complete.resolution.edits, [
      { kind: 'defer', pointer: '/count' },
    ]);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
import { modelMessageEvidenceSelections } from './fixtures/model-message-evidence-selections.mjs';
