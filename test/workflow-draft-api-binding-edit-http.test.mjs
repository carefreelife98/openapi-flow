import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import test from 'node:test';
import { ChatOpenAI } from '@langchain/openai';
import { stageWorkflowDraftEdit } from '@openapi-flow/core';
import { planWorkflowDraftApiBindingEdit } from '@openapi-flow/langchain';
import {
  workflowDraftApiBindingEditFixture,
  bindingEditPlan,
  bindingEditProposal,
  independentBindingDecision,
} from './fixtures/workflow-draft-api-binding-edit-fixture.mjs';

const { default: Ajv } = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
)('ajv');

test('actual HTTP binding-edit schemas constrain real sources/repair targets, omit fixed metadata and preserve optional evidence in one call', async () => {
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
        id: 'chatcmpl-binding-edit',
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
      for (const mode of ['step', 'repair', 'no-sources']) {
        const text =
          mode === 'repair'
            ? 'Replace source operation and use its renamed response for follow id.'
            : mode === 'no-sources'
              ? 'Remove source and independent; fill follow id at execution.'
              : 'Use the independent lookup response value for follow id.';
        let input = await workflowDraftApiBindingEditFixture(
          text,
          includeExplanations,
        );
        let decision = independentBindingDecision;
        if (mode === 'repair') {
          const plan = bindingEditPlan(
            input,
            [
              {
                kind: 'replace-api-operation',
                nodeId: 'source',
                operation: input.replacement.key,
              },
            ],
            includeExplanations,
          );
          const resolutions = [
            {
              stepId: plan.steps[0].id,
              kind: 'api-call',
              values: { path: { id: 'new-explicit-source-id' } },
              bindings: [],
            },
          ];
          input = { ...input, plan, resolutions };
          input.scope = {
            kind: 'repair',
            taskId: stageWorkflowDraftEdit(input).pendingRepairs[0].id,
          };
          decision = {
            ...independentBindingDecision,
            sourceNodeId: 'source',
            sourcePointer: '/renamed',
          };
        } else if (mode === 'no-sources') {
          const plan = bindingEditPlan(
            input,
            [
              { kind: 'remove-node', nodeId: 'source' },
              { kind: 'remove-node', nodeId: 'independent' },
              { kind: 'revise-api-bindings', nodeId: 'follow' },
            ],
            includeExplanations,
          );
          input = {
            ...input,
            plan,
            scope: { kind: 'step', stepId: plan.steps[2].id },
          };
          decision = { kind: 'unbind', targetPointer: '/path/id' };
        }
        output = bindingEditProposal(input, [decision]);
        const result = await planWorkflowDraftApiBindingEdit({
          ...input,
          model,
        });
        assert.equal(result.status, 'ready');
        const wire = requests.at(-1).response_format.json_schema;
        assert.equal(wire.name, 'plan_draft_api_binding_edit');
        assert.equal(wire.strict, true);
        const ajv = new Ajv({ strict: false });
        assert.equal(
          ajv.validateSchema(wire.schema),
          true,
          JSON.stringify(ajv.errors),
        );
        const validate = ajv.compile(wire.schema);
        assert.equal(validate(output), true, JSON.stringify(validate.errors));
        assert.equal(validate({ ...output, stepId: 'invented' }), false);
        assert.equal(
          validate({ decisions: [{ ...output.decisions[0], values: {} }] }),
          false,
        );
        const choices = wire.schema.properties.decisions.items.anyOf;
        const bind = choices.find(
          (choice) => choice.properties.kind.const === 'bind',
        );
        const unbind = choices.find(
          (choice) => choice.properties.kind.const === 'unbind',
        );
        assert.equal(
          Object.hasOwn(unbind.properties, 'explanation'),
          includeExplanations,
        );
        if (mode === 'no-sources') assert.equal(bind, undefined);
        else {
          assert.deepEqual(bind.properties.sourceNodeId.enum, [
            'source',
            'independent',
          ]);
          assert.equal(
            validate({
              decisions: [{ ...output.decisions[0], sourceNodeId: 'follow' }],
            }),
            false,
          );
          assert.equal(
            validate({
              decisions: [
                { ...output.decisions[0], sourceNodeId: 'not-a-node' },
              ],
            }),
            false,
          );
        }
        if (mode === 'repair') {
          assert.deepEqual(unbind.properties.targetPointer.enum, ['/path/id']);
          assert.equal(
            validate({
              decisions: [
                { ...output.decisions[0], targetPointer: '/query/locale' },
              ],
            }),
            false,
          );
          assert.equal(
            choices.some(
              (choice) =>
                choice.properties.kind.const === 'replace-literal-with-binding',
            ),
            false,
          );
        }
        const materials = JSON.parse(requests.at(-1).messages[1].content);
        assert.deepEqual(
          materials.messages.map((message) => message.id),
          ['edit-1'],
        );
        for (const key of [
          'stage',
          'scope',
          'fingerprint',
          'revision',
          'planId',
          'resolutions',
          'repairs',
        ])
          assert.equal(Object.hasOwn(materials, key), false);
        for (const candidate of materials.sourceCandidates) {
          assert.equal(candidate.kind, 'api');
          assert.equal(
            Object.hasOwn(candidate.operation, 'requestBody'),
            false,
          );
          assert.ok(candidate.operation.responses);
        }
      }
    assert.equal(requests.length, 6);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
import { modelMessageEvidenceSelections } from './fixtures/model-message-evidence-selections.mjs';
