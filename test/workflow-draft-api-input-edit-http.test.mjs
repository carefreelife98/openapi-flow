import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import test from 'node:test';
import { ChatOpenAI } from '@langchain/openai';
import {
  createWorkflowDraftEditPlan,
  assembleWorkflowDraftEdit,
} from '@openapi-flow/core';
import {
  selectWorkflowDraftApiInputEditTargets,
  generateWorkflowDraftApiInputEdits,
} from '@openapi-flow/langchain';
import { workflowDraftEditAssemblyFixture } from './fixtures/workflow-draft-edit-assembly-fixture.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { default: Ajv } = require('ajv');
const { Ajv2020 } = require('ajv/dist/2020.js');
const addFormats = require('ajv-formats').default;

test('actual ChatOpenAI target/value requests preserve dialects, reachable OAS definitions, exact typed outputs and optional explanations', async () => {
  const input = await workflowDraftEditAssemblyFixture(
    'Set count to 4 and enabled to true.',
  );
  const requests = [];
  const responses = [];
  let output;
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body));
    output = modelMessageEvidenceSelections(output);
    responses.push(globalThis.structuredClone(output));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'chatcmpl-input-edit',
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
      const sources = [
        {
          kind: 'message',
          messageId: 'edit-1',
          quote: input.context.messages[1].text,
        },
      ];
      const explanation = includeExplanations
        ? {
            explanation: {
              reason:
                'The current user explicitly supplies both replacement values.',
              evidence: sources,
            },
          }
        : {};
      const plan = createWorkflowDraftEditPlan({
        ...input,
        options: { includeExplanations },
        proposal: {
          decisions: [
            {
              kind: 'revise-api-inputs',
              nodeId: 'source',
              instruction: input.context.messages[1].text,
              sources,
              ...explanation,
            },
          ],
        },
      });
      const stage = { ...input, plan, stepId: plan.steps[0].id, model };
      output = {
        targets: ['/body/config/count', '/body/config/enabled'].map(
          (pointer) => ({ kind: 'set', pointer, sources, ...explanation }),
        ),
      };
      const contract = await selectWorkflowDraftApiInputEditTargets(stage);
      output = {
        values: {
          'value-1': {
            status: 'provided',
            value: 4,
            source: {
              messageId: 'edit-1',
              sourceFormat: 'json',
              sourceText: '4',
            },
            ...explanation,
          },
          'value-2': {
            status: 'provided',
            value: true,
            source: {
              messageId: 'edit-1',
              sourceFormat: 'json',
              sourceText: 'true',
            },
            ...explanation,
          },
        },
      };
      const result = await generateWorkflowDraftApiInputEdits({
        ...stage,
        contract,
      });
      const assembled = assembleWorkflowDraftEdit({
        ...stage,
        resolutions: [result.resolution],
      });
      assert.equal(assembled.draft.apiCalls[0].values.body.config.count, 4);
      assert.equal(
        assembled.draft.apiCalls[0].values.body.config.enabled,
        true,
      );
      const targetsWire = requests.at(-2).response_format.json_schema;
      const valuesWire = requests.at(-1).response_format.json_schema;
      const a7 = new Ajv({ strict: false });
      const a20 = new Ajv2020({ strict: false });
      addFormats(a20);
      assert.equal(targetsWire.name, 'select_draft_api_input_edit_targets');
      assert.equal(valuesWire.name, 'generate_draft_api_input_edit_values');
      assert.equal(targetsWire.strict, true);
      assert.equal(valuesWire.strict, true);
      for (const request of requests.slice(-2)) {
        assert.match(request.messages[0].content, /current user's language/);
        if (includeExplanations)
          assert.match(
            JSON.stringify(request.response_format.json_schema.schema),
            /user-facing reason in the current user's language/,
          );
      }
      assert.equal(
        a7.validateSchema(targetsWire.schema),
        true,
        JSON.stringify(a7.errors),
      );
      assert.equal(
        a20.validateSchema(valuesWire.schema),
        true,
        JSON.stringify(a20.errors),
      );
      const targetValidator = a7.compile(targetsWire.schema);
      const valueValidator = a20.compile(valuesWire.schema);
      assert.equal(
        targetValidator(responses.at(-2)),
        true,
        JSON.stringify(targetValidator.errors),
      );
      assert.equal(
        valueValidator(responses.at(-1)),
        true,
        JSON.stringify(valueValidator.errors),
      );
      assert.deepEqual(
        Object.keys(valuesWire.schema.properties.values.properties),
        ['value-1', 'value-2'],
      );
      const field =
        valuesWire.schema.properties.values.properties['value-1'].anyOf[0];
      assert.deepEqual(Object.keys(field.properties.value), ['$ref']);
      assert.equal(
        valuesWire.schema.$defs[
          field.properties.value.$ref.slice('#/$defs/'.length)
        ].type,
        'integer',
      );
      assert.equal(
        Object.hasOwn(field.properties, 'explanation'),
        includeExplanations,
      );
      assert.equal(Object.hasOwn(field.properties.value, '$defs'), false);
      assert.equal(Object.hasOwn(field.properties.value, '$id'), false);
      assert.equal(Object.keys(valuesWire.schema.$defs).length, 2);
      for (const definition of Object.values(valuesWire.schema.$defs))
        assert.equal(Object.hasOwn(definition, '$id'), false);
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
      for (const forged of [
        {
          values: {
            ...output.values,
            'value-1': { ...output.values['value-1'], value: '4' },
          },
        },
        {
          values: {
            ...output.values,
            'value-1': { ...output.values['value-1'], value: 4.5 },
          },
        },
        { values: { ...output.values, 'value-3': output.values['value-1'] } },
        { ...output, nodeId: 'forged' },
      ])
        assert.equal(valueValidator(forged), false);
      const materials = JSON.parse(requests.at(-1).messages[1].content);
      assert.equal(Object.hasOwn(materials, 'values'), false);
      assert.equal(Object.hasOwn(materials, 'call'), false);
      assert.equal(Object.hasOwn(materials, 'bindings'), false);
      assert.equal(Object.hasOwn(materials, 'revision'), false);
      assert.deepEqual(
        materials.targets.map((target) => target.pointer),
        ['/body/config/count', '/body/config/enabled'],
      );
    }
    assert.equal(requests.length, 4);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
import { modelMessageEvidenceSelections } from './fixtures/model-message-evidence-selections.mjs';
