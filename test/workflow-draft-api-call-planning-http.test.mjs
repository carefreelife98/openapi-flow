import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import {
  createWorkflowDraft,
  createWorkflowDraftApiCallBindingsSchema,
} from '@openapi-flow/core';
import {
  planWorkflowDraftApiCallBindings,
  generateWorkflowDraftApiCallArguments,
  WorkflowDraftApiCallPlanningError,
} from '@openapi-flow/langchain';
import {
  apiCallPlanningFixture,
  apiCallBindingProposal,
  apiCallArgumentsProposal,
} from './fixtures/workflow-draft-api-call-planning-fixture.mjs';
import { connectionEditPlan } from './fixtures/workflow-draft-connection-edit-fixture.mjs';
const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');

test('actual ChatOpenAI requests expose only selected mappings and OAS-typed values, without generated metadata or rewritten evidence', async () => {
  const requests = [];
  let outputs;
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    requests.push(body);
    const output = outputs.shift();
    const tool = body.tools?.[0]?.function;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'selected-api-fixture',
        object: 'chat.completion',
        created: 1,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            finish_reason: tool ? 'tool_calls' : 'stop',
            message: tool
              ? {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      id: 'literal-tool',
                      type: 'function',
                      function: {
                        name: tool.name,
                        arguments: JSON.stringify(output),
                      },
                    },
                  ],
                }
              : { role: 'assistant', content: JSON.stringify(output) },
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
      const input = await apiCallPlanningFixture(
        'add-api-call',
        'replacement',
        includeExplanations,
        { path: { id: 'provided-id' } },
      );
      const bindingOutput = apiCallBindingProposal(input, []);
      const argumentOutput = apiCallArgumentsProposal(input, {
        path: { id: 'provided-id' },
      });
      outputs = [bindingOutput, argumentOutput];
      const bindingPlan = await planWorkflowDraftApiCallBindings({
        ...input,
        model,
      });
      assert.equal(bindingPlan.status, 'ready');
      const result = await generateWorkflowDraftApiCallArguments({
        ...input,
        bindingPlan,
        model,
      });
      assert.equal(result.status, 'ready');
      assert.deepEqual(result.arguments.values, {
        path: { id: 'provided-id' },
      });
      const [bindingRequest, argumentRequest] = requests.slice(-2);
      for (const [request, expected, name] of [
        [bindingRequest, bindingOutput, 'plan_draft_api_call_bindings'],
        [argumentRequest, argumentOutput, 'generate_draft_api_call_arguments'],
      ]) {
        const wire =
          request.response_format?.json_schema ?? request.tools[0].function;
        const schema = request.response_format ? wire.schema : wire.parameters;
        assert.equal(wire.name, name);
        assert.equal(wire.strict, name === 'plan_draft_api_call_bindings');
        assert.equal(schema.type, 'object');
        const ajv = new Ajv2020({ strict: false });
        assert.equal(
          ajv.validateSchema(schema),
          true,
          JSON.stringify(ajv.errors),
        );
        const validate = ajv.compile(schema);
        assert.equal(validate(expected), true, JSON.stringify(validate.errors));
        assert.equal(validate({ ...expected, workflow: { nodes: [] } }), false);
        assert.equal(JSON.stringify(schema).includes('"quote"'), false);
        const payload = JSON.parse(request.messages[1].content);
        for (const key of [
          'stage',
          'revision',
          'nodeId',
          'stepId',
          'planId',
          'fingerprint',
          'resolutions',
          'edges',
          'draft',
        ])
          assert.equal(Object.hasOwn(payload, key), false);
        assert.equal(request.messages[0].role, 'system');
        assert.equal(request.messages[1].role, 'user');
        const fields =
          schema.properties.decision?.anyOf?.[0]?.properties ??
          schema.properties;
        assert.equal(Object.hasOwn(fields, 'explanation'), includeExplanations);
        assert.ok(fields.sourceMessageIds.description);
      }
      const valuesWire = argumentRequest.tools[0].function.parameters;
      const ajv = new Ajv2020({ strict: false });
      const validate = ajv.compile(valuesWire);
      assert.equal(
        validate({
          ...argumentOutput,
          literalSources: [
            {
              ...argumentOutput.literalSources[0],
              targetPointer: '/values/path/id',
            },
          ],
        }),
        false,
        'Wire schema must constrain source pointers to actual request roots, not metadata',
      );
      assert.equal(
        validate({ ...argumentOutput, values: { path: { id: 123 } } }),
        false,
      );
      assert.equal(
        validate({
          ...argumentOutput,
          values: { path: { id: '123' }, invented: true },
        }),
        false,
      );
      assert.equal(
        validate({ ...argumentOutput, sourceMessageIds: ['initial'] }),
        false,
      );
      assert.equal(
        valuesWire.properties.values.properties.path.properties.id.type,
        'string',
      );
      assert.equal(outputs.length, 0);
    }
    assert.equal(requests.length, 4);
    const base = await apiCallPlanningFixture(
      'add-api-call',
      'replacement',
      false,
      { path: { id: 'root-literal' } },
    );
    const draft = createWorkflowDraft({
      context: base.context,
      content: {
        id: 'empty-root',
        apiCalls: [],
        nativeNodes: [],
        requirements: [],
        edges: [],
      },
    });
    const plan = connectionEditPlan({ ...base, draft }, [
      { kind: 'add-api-call', operation: base.replacement.key },
    ]);
    const input = { ...base, draft, plan, stepId: plan.steps[0].id };
    outputs = [
      apiCallArgumentsProposal(input, { path: { id: 'root-literal' } }),
    ];
    const beforeRootBinding = requests.length;
    const rootBindings = await planWorkflowDraftApiCallBindings({
      ...input,
      model,
    });
    assert.equal(requests.length, beforeRootBinding);
    const rootArguments = await generateWorkflowDraftApiCallArguments({
      ...input,
      bindingPlan: rootBindings,
      model,
    });
    assert.equal(rootArguments.status, 'ready');
    assert.deepEqual(rootArguments.arguments.bindings, []);
    assert.deepEqual(rootArguments.arguments.values, {
      path: { id: 'root-literal' },
    });
    // No root binding HTTP request exists: inspect the Core data contract directly.
    const emptySourceWire = z.toJSONSchema(
      createWorkflowDraftApiCallBindingsSchema(input),
    );
    const provided = emptySourceWire.properties.decision.anyOf.find(
      (choice) => choice.properties.status.const === 'provided',
    );
    assert.equal(Object.hasOwn(provided.properties, 'mappings'), false);
    assert.equal(JSON.stringify(emptySourceWire).includes('"not"'), false);
    const emptySourceValidator = new Ajv2020({ strict: false }).compile(
      emptySourceWire,
    );
    assert.equal(
      emptySourceValidator({
        decision: {
          status: 'provided',
          sourceMessageIds: input.requestMessageIds,
          mappings: [],
        },
      }),
      false,
    );
    assert.equal(requests.length, 5);
    const ungrounded = {
      values: { path: { id: 'root-literal' } },
      sourceMessageIds: input.requestMessageIds,
    };
    outputs = [ungrounded];
    await assert.rejects(
      generateWorkflowDraftApiCallArguments({
        ...input,
        bindingPlan: rootBindings,
        model,
      }),
      (error) =>
        error instanceof WorkflowDraftApiCallPlanningError &&
        /literalSources/.test(error.cause.message) &&
        JSON.stringify(error.failure.output) === JSON.stringify(ungrounded),
    );
    assert.equal(
      requests.length,
      6,
      'A source-validation failure must not trigger a model retry',
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
