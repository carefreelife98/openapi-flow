import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import {
  resolveNativeInstanceSelection,
  resolveNativeInstanceDependencies,
} from '@openapi-flow/core';
import {
  generateNativeNodeParameters,
  planNativeNodes,
  NativeNodePlanningError,
} from '@openapi-flow/langchain';
import {
  N8nNativeFeature,
  resolveN8nNativePlanningFeatures,
} from '@openapi-flow/n8n';
import { responseFieldSelectionMaterials } from './fixtures/api-response-field-selection-fixture.mjs';

for (const mode of ['staged', 'one-call'])
  test(`real LangChain ${mode} transport sends source-coupled field schemas and rejects an unchanged cross-API reply locally`, async () => {
    const input = {
      planId: 'field-selection-wire',
      scenario:
        'Copy the original text and complete alternative array without changing their types.',
      apiMaterials: await responseFieldSelectionMaterials(),
      capabilities: resolveN8nNativePlanningFeatures({
        features: [N8nNativeFeature.ComposeApiResponses],
      }).planningCapabilities,
    };
    const original = globalThis.structuredClone(input.apiMaterials);
    const selection = resolveNativeInstanceSelection({
      ...input,
      proposal: {
        instances: [
          {
            capability: N8nNativeFeature.ComposeApiResponses,
            purpose: 'Requested original text and array',
            parameterSource: 'literal',
          },
        ],
        gaps: [],
      },
    });
    const nodeId = selection.instances[0].id;
    const dependencies = resolveNativeInstanceDependencies({
      ...input,
      selection,
      proposal: {
        sourcesByNodeId: { [nodeId]: { sourceNodeIds: ['text', 'list'] } },
      },
    });
    const stagedProposal = {
      decision: {
        status: 'provided',
        parameters: {
          fields: [
            { name: 'originalText', sourceNodeId: 'text', pointer: '/text' },
            {
              name: 'alternatives',
              sourceNodeId: 'list',
              pointer: '/alternatives',
            },
          ],
        },
      },
    };
    const proposal =
      mode === 'staged'
        ? stagedProposal
        : {
            nativeNodes: [
              {
                id: 'selected-fields',
                capability: N8nNativeFeature.ComposeApiResponses,
                parameters: stagedProposal.decision.parameters,
              },
            ],
            gaps: [],
          };
    const bad = globalThis.structuredClone(proposal);
    const badParameters =
      mode === 'staged'
        ? bad.decision.parameters
        : bad.nativeNodes[0].parameters;
    badParameters.fields[0].pointer = '/alternatives';
    const requests = [];
    const serverErrors = [];
    const require = createRequire(
      new URL('../packages/core/package.json', import.meta.url),
    );
    const { Ajv2020 } = require('ajv/dist/2020.js');
    const server = createServer(async (request, response) => {
      try {
        let raw = '';
        for await (const chunk of request) raw += chunk;
        const body = JSON.parse(raw);
        requests.push(body);
        const wire =
          mode === 'staged'
            ? body.response_format.json_schema
            : body.tools[0].function;
        assert.equal(wire.strict, true);
        const ajv = new Ajv2020({ strict: false });
        assert.equal(
          ajv.validateSchema(mode === 'staged' ? wire.schema : wire.parameters),
          true,
          JSON.stringify(ajv.errors),
        );
        const validate = ajv.compile(
          mode === 'staged' ? wire.schema : wire.parameters,
        );
        assert.equal(validate(proposal), true, JSON.stringify(validate.errors));
        assert.equal(validate(bad), false);
        const context = JSON.parse(
          body.messages.find((message) => message.role === 'user').content,
        );
        assert.deepEqual(
          context.apiMaterials.map((entry) => entry.callId),
          mode === 'staged'
            ? ['text', 'list']
            : input.apiMaterials.map((entry) => entry.callId),
        );
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            id: 'field-wire',
            object: 'chat.completion',
            created: 1,
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                finish_reason: mode === 'staged' ? 'stop' : 'tool_calls',
                message:
                  mode === 'staged'
                    ? {
                        role: 'assistant',
                        content: JSON.stringify(
                          requests.length === 1 ? proposal : bad,
                        ),
                      }
                    : {
                        role: 'assistant',
                        content: null,
                        tool_calls: [
                          {
                            id: 'field-tool',
                            type: 'function',
                            function: {
                              name: wire.name,
                              arguments: JSON.stringify(
                                requests.length === 1 ? proposal : bad,
                              ),
                            },
                          },
                        ],
                      },
              },
            ],
          }),
        );
      } catch (error) {
        serverErrors.push(error.message);
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            error: { message: 'Invalid local structured-output request' },
          }),
        );
      }
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
      const generate = () =>
        mode === 'staged'
          ? generateNativeNodeParameters({
              ...input,
              selection,
              dependencies,
              nodeId,
              model,
            })
          : planNativeNodes({ ...input, model });
      const configured = await generate();
      if (mode === 'staged') {
        assert.equal(configured.status, 'ready');
        assert.deepEqual(
          configured.node.parameters,
          stagedProposal.decision.parameters,
        );
      } else {
        assert.deepEqual(configured.nativeNodes, proposal.nativeNodes);
      }
      await assert.rejects(
        generate(),
        (error) =>
          error instanceof NativeNodePlanningError &&
          error.failure.stage ===
            (mode === 'staged' ? 'parameter-schema' : 'proposal-schema'),
      );
      assert.equal(requests.length, 2, 'No retries or repaired model replies');
      assert.deepEqual(serverErrors, []);
      assert.deepEqual(input.apiMaterials, original);
      assert.equal(badParameters.fields[0].pointer, '/alternatives');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
