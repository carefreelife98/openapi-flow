import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import {
  createWorkflowDraftEditPlan,
  describeWorkflowDraftClarificationScopes,
} from '@openapi-flow/core';
import { planWorkflowDraftClarificationScopes } from '@openapi-flow/langchain';
import { draftClarificationFixture } from './fixtures/workflow-draft-clarification-fixture.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');
test('actual ChatOpenAI scope requests contain fixed requirement keys and real instance choices, with optional evidence and no generated facts/status/metadata', async () => {
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
        id: 'clarified-scope-fixture',
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
      const base = await draftClarificationFixture();
      const plan = createWorkflowDraftEditPlan({
        ...base,
        options: { includeExplanations },
        proposal: {
          decisions: base.plan.steps.map((step) => ({
            ...step.decision,
            ...(includeExplanations
              ? {
                  explanation: {
                    reason:
                      'The original request specifies this material role.',
                    evidence: step.decision.sources,
                  },
                }
              : {}),
          })),
        },
      });
      const input = { ...base, plan };
      const description = describeWorkflowDraftClarificationScopes(input);
      const evidence = [
        {
          kind: 'message',
          messageId: 'request-1',
          quote: base.originalContext.messages[0].text,
        },
      ];
      output = {
        scopes: Object.fromEntries(
          description.requirements.map((requirement, index) => [
            requirement.id,
            {
              scope: { kind: 'nodes', nodeIds: [plan.steps[index].newNodeId] },
              ...(includeExplanations
                ? {
                    explanation: {
                      reason: 'The named role is the actual affected scope.',
                      evidence,
                    },
                  }
                : {}),
            },
          ]),
        ),
      };
      const result = await planWorkflowDraftClarificationScopes({
        ...input,
        model,
      });
      assert.equal(result.requirements.length, 2);
      const request = requests.at(-1);
      assert.equal(
        request.response_format.json_schema.name,
        'scope_workflow_draft_clarification',
      );
      assert.equal(request.response_format.json_schema.strict, true);
      const schema = request.response_format.json_schema.schema;
      const ajv = new Ajv2020({ strict: false });
      assert.equal(
        ajv.validateSchema(schema),
        true,
        JSON.stringify(ajv.errors),
      );
      const validate = ajv.compile(schema);
      assert.equal(validate(output), true, JSON.stringify(validate.errors));
      assert.equal(validate({ ...output, facts: [] }), false);
      const payload = JSON.parse(request.messages[1].content);
      assert.deepEqual(
        payload.requirements.map((requirement) => requirement.id).sort(),
        Object.keys(output.scopes).sort(),
      );
      assert.equal(Object.hasOwn(payload, 'fingerprint'), false);
      for (const decision of Object.values(output.scopes))
        assert.equal(
          Object.hasOwn(decision, 'explanation'),
          includeExplanations,
        );
      assert.equal(request.messages[0].role, 'system');
      assert.equal(request.messages[1].role, 'user');
    }
    assert.equal(requests.length, 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
import { modelMessageEvidenceSelections } from './fixtures/model-message-evidence-selections.mjs';
