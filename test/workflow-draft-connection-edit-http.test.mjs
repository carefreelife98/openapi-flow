import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import test from 'node:test';
import { ChatOpenAI } from '@langchain/openai';
import { describeWorkflowDraftConnectionEdit } from '@openapi-flow/core';
import { planWorkflowDraftConnectionEdit } from '@openapi-flow/langchain';
import { resolveN8nNativeFeatures, N8nNativeFeature } from '@openapi-flow/n8n';
import {
  workflowDraftConnectionEditFixture,
  connectionEditPlan,
  connectionEditProposal,
  addConnection,
} from './fixtures/workflow-draft-connection-edit-fixture.mjs';

const { default: Ajv } = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
)('ajv');

test('actual ChatOpenAI HTTP schemas preserve actual port pairs, editable edge IDs and optional evidence without fixed metadata', async () => {
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
        id: 'chatcmpl-connection-edit',
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
    for (const includeExplanations of [false, true])
      for (const mode of ['ports', 'removed', 'empty']) {
        let input =
          await workflowDraftConnectionEditFixture(includeExplanations);
        let decisions;
        if (mode === 'ports') {
          input.context.capabilities.push(
            ...resolveN8nNativeFeatures({
              features: [N8nNativeFeature.MergeAppend],
            }).capabilities,
          );
          const plan = connectionEditPlan(
            input,
            [
              {
                kind: 'add-native-node',
                capability: N8nNativeFeature.MergeAppend,
              },
            ],
            includeExplanations,
          );
          const nodeId = plan.steps[0].newNodeId;
          input = {
            ...input,
            plan,
            resolutions: [
              {
                stepId: plan.steps[0].id,
                kind: 'native-literal',
                parameters: { numberInputs: 2 },
              },
            ],
          };
          decisions = [
            addConnection('follow', nodeId, 'main', 'input1'),
            addConnection('independent', nodeId, 'main', 'input2'),
          ];
        } else {
          const plan = connectionEditPlan(
            input,
            mode === 'empty'
              ? input.draft.apiCalls.map((call) => ({
                  kind: 'remove-node',
                  nodeId: call.id,
                }))
              : [{ kind: 'remove-node', nodeId: 'follow' }],
            includeExplanations,
          );
          input = { ...input, plan };
          const described = describeWorkflowDraftConnectionEdit(input);
          assert.equal(described.existingEdges.length, 0);
          assert.equal(described.stage.nodeRemovalConnections.length, 1);
          decisions = [{ kind: 'keep-connections' }];
        }
        output = connectionEditProposal(input, decisions);
        const result = await planWorkflowDraftConnectionEdit({
          ...input,
          model,
        });
        assert.equal(result.status, 'ready');
        const wire = requests.at(-1).response_format.json_schema;
        assert.equal(wire.name, 'plan_draft_connection_edit');
        assert.equal(wire.strict, true);
        const ajv = new Ajv({ strict: false });
        assert.equal(
          ajv.validateSchema(wire.schema),
          true,
          JSON.stringify(ajv.errors),
        );
        const validate = ajv.compile(wire.schema);
        assert.equal(validate(output), true, JSON.stringify(validate.errors));
        assert.equal(validate({ ...output, revision: 2 }), false);
        const choices = wire.schema.properties.decisions.items.anyOf;
        assert.equal(
          Object.hasOwn(choices[0].properties, 'explanation'),
          includeExplanations,
        );
        if (mode === 'ports') {
          assert.equal(
            validate({
              decisions: [
                {
                  ...output.decisions[0],
                  target: {
                    nodeId: input.plan.steps[0].newNodeId,
                    port: 'main',
                  },
                },
              ],
            }),
            false,
          );
          assert.equal(
            validate({
              decisions: [
                {
                  ...output.decisions[0],
                  source: { nodeId: 'invented', port: 'main' },
                },
              ],
            }),
            false,
          );
          assert.equal(
            validate({
              decisions: [
                {
                  ...output.decisions[0],
                  source: { nodeId: 'follow', port: 'main' },
                  target: { nodeId: 'independent', port: 'main' },
                },
              ],
            }),
            false,
          );
          assert.equal(
            choices.some((choice) => choice.properties.kind.const === 'remove'),
            false,
          );
        } else {
          assert.equal(
            validate({
              decisions: [{ ...output.decisions[0], edgeId: 'invented' }],
            }),
            false,
          );
          if (mode === 'empty')
            assert.equal(
              choices.some((choice) => choice.properties.kind.const === 'add'),
              false,
            );
        }
        const payload = JSON.parse(requests.at(-1).messages[1].content);
        assert.ok(Array.isArray(payload.removedIncidentEdges));
        if (mode !== 'ports') {
          assert.deepEqual(payload.removedIncidentEdges, [
            { from: 'source', output: 'main', to: 'follow', input: 'main' },
          ]);
          assert.deepEqual(payload.existingEdges, []);
          assert.ok(
            !JSON.stringify(payload.removedIncidentEdges).includes('stepId'),
          );
        }
        assert.deepEqual(
          payload.messages.map((message) => message.id),
          ['edit-1'],
        );
        for (const key of [
          'stage',
          'fingerprint',
          'revision',
          'planId',
          'resolutions',
          'repairs',
          'starts',
        ])
          assert.equal(Object.hasOwn(payload, key), false);
        assert.equal(Object.hasOwn(payload.instructions[0], 'stepId'), false);
      }
    assert.equal(requests.length, 6);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
import { modelMessageEvidenceSelections } from './fixtures/model-message-evidence-selections.mjs';
