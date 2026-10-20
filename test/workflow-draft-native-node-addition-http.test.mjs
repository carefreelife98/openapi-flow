import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import {
  generateWorkflowDraftNativeNodeAddition,
  selectWorkflowDraftNativeNodeParameterOwnership,
} from '@openapi-flow/langchain';
import {
  nativeNodeAdditionFixture,
  nativeAdditionParameters,
  nativeAdditionProposal,
} from './fixtures/workflow-draft-native-node-addition-fixture.mjs';
const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');

test('actual ChatOpenAI addition requests send a valid described implementation schema with source-only evidence and no generated metadata', async () => {
  const requests = [];
  let output;
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    requests.push(JSON.parse(raw));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'addition-fixture',
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
      const input = await nativeNodeAdditionFixture(
        'typed-context',
        includeExplanations,
      );
      output = nativeAdditionProposal(
        input,
        { status: 'provided', parameters: nativeAdditionParameters },
        ['source'],
      );
      const result = await generateWorkflowDraftNativeNodeAddition({
        ...input,
        model,
      });
      assert.equal(result.status, 'ready');
      const wire = requests.at(-1).response_format.json_schema;
      assert.equal(wire.name, 'generate_draft_native_node_addition');
      assert.equal(wire.strict, true);
      assert.equal(wire.schema.type, 'object');
      const ajv = new Ajv2020({ strict: false });
      assert.equal(
        ajv.validateSchema(wire.schema),
        true,
        JSON.stringify(ajv.errors),
      );
      const validate = ajv.compile(wire.schema);
      assert.equal(validate(output), true, JSON.stringify(validate.errors));
      for (const addition of [
        { nodeId: input.plan.steps[0].newNodeId },
        { capability: 'if' },
        { stepId: input.stepId },
        { edges: [] },
        { fingerprint: 'old' },
      ])
        assert.equal(
          validate({
            ...output,
            decision: { ...output.decision, ...addition },
          }),
          false,
        );
      assert.equal(
        validate({
          ...output,
          decision: {
            ...output.decision,
            parameters: { ...nativeAdditionParameters, count: '4' },
          },
        }),
        false,
      );
      assert.equal(
        validate({
          ...output,
          decision: { ...output.decision, sourceMessageIds: ['initial'] },
        }),
        false,
      );
      const provided = wire.schema.properties.decision.anyOf.find(
        (choice) => choice.properties.status.const === 'provided',
      );
      assert.equal(
        provided.properties.parameters.properties.count.type,
        'integer',
      );
      assert.ok(provided.properties.sourceMessageIds.description);
      assert.equal(
        Object.hasOwn(provided.properties, 'explanation'),
        includeExplanations,
      );
      assert.equal(JSON.stringify(wire.schema).includes('"quote"'), false);
      const payload = JSON.parse(requests.at(-1).messages[1].content);
      for (const key of [
        'revision',
        'stage',
        'nodeId',
        'stepId',
        'planId',
        'fingerprint',
        'resolutions',
        'edges',
      ])
        assert.equal(Object.hasOwn(payload, key), false);
      assert.equal(payload.capability.name, 'typed-context');
      assert.ok(
        payload.sourceCandidates.some(
          (source) => source.nodeId === 'source' && source.operation.responses,
        ),
      );
      assert.ok(
        payload.sourceCandidates.every(
          (source) => source.nodeId !== input.plan.steps[0].newNodeId,
        ),
      );
      assert.equal(requests.at(-1).messages[0].role, 'system');
      assert.equal(requests.at(-1).messages[1].role, 'user');
    }
    assert.equal(requests.length, 2);
    for (const includeExplanations of [false, true]) {
      const input = {
        ...(await nativeNodeAdditionFixture(
          'typed-context',
          includeExplanations,
          'Add another context with enabled false. Supply count and nested value at execution.',
        )),
        allowRuntimeParameters: true,
      };
      output = nativeAdditionProposal(input, {
        status: 'runtime-fields',
        pointers: ['/count', '/nested/value'],
      });
      const ownership = await selectWorkflowDraftNativeNodeParameterOwnership({
        ...input,
        model,
      });
      assert.equal(ownership.status, 'ready');
      const ownershipWire = requests.at(-1).response_format.json_schema;
      assert.equal(
        ownershipWire.name,
        'select_draft_native_node_parameter_ownership',
      );
      const validateOwnership = new Ajv2020({ strict: false }).compile(
        ownershipWire.schema,
      );
      assert.equal(
        validateOwnership(output),
        true,
        JSON.stringify(validateOwnership.errors),
      );
      assert.equal(validateOwnership({ ...output, nodeId: 'invented' }), false);
      output = nativeAdditionProposal(input, {
        status: 'provided',
        parameters: { enabled: false },
      });
      const result = await generateWorkflowDraftNativeNodeAddition({
        ...input,
        parameterOwnership: ownership.contract,
        model,
      });
      assert.equal(result.status, 'ready');
      const wire = requests.at(-1).response_format.json_schema.schema;
      const ajv = new Ajv2020({ strict: false });
      assert.equal(ajv.validateSchema(wire), true, JSON.stringify(ajv.errors));
      const validate = ajv.compile(wire);
      assert.equal(validate(output), true, JSON.stringify(validate.errors));
      for (const parameters of [
        {},
        { enabled: 'false' },
        { enabled: false, count: 7 },
        { enabled: false, nested: { value: 'invented' } },
      ])
        assert.equal(
          validate(
            nativeAdditionProposal(input, { status: 'provided', parameters }),
          ),
          false,
        );
      assert.equal(
        validate(
          nativeAdditionProposal(input, { status: 'runtime-parameters' }),
        ),
        false,
      );
      const payload = JSON.parse(requests.at(-1).messages[1].content);
      assert.equal(
        Object.hasOwn(payload.parametersSchema.properties, 'count'),
        false,
      );
      assert.deepEqual(payload.parametersSchema.required, ['enabled']);
      assert.deepEqual(payload.runtimeParameters, {
        pointers: ['/count', '/nested/value'],
      });
      assert.equal(Object.hasOwn(payload, 'parameterOwnership'), false);
    }
    assert.equal(requests.length, 6);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
