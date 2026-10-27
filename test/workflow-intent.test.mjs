import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import {
  createWorkflowIntentProposalSchema,
  resolveWorkflowIntent,
  validateWorkflowIntent,
  formatWorkflowIntentScenario,
} from '@openapi-flow/core';
import { planWorkflowIntent } from '@openapi-flow/langchain';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');

function fixture() {
  const scenario =
    'Read the account and delivery status independently, then collect both.\n| Future       | send email only after I request it |\nDo not update records.';
  return {
    input: { scenario, messages: [{ id: 'original', text: scenario }] },
    proposal: {
      objective: 'Collect current account and delivery status',
      roles: [
        {
          task: 'Read account',
          scope: 'required',
          sourceMessageIds: ['original'],
        },
        {
          task: 'Read delivery',
          scope: 'required',
          sourceMessageIds: ['original'],
        },
        {
          task: 'Collect both results',
          scope: 'required',
          sourceMessageIds: ['original'],
        },
        {
          task: 'Send email after a later request',
          scope: 'conditional',
          sourceMessageIds: ['original'],
        },
        {
          task: 'Update records',
          scope: 'excluded',
          sourceMessageIds: ['original'],
        },
      ],
      flows: [
        { kind: 'parallel', roleIndices: [0, 1], intent: 'Independent reads' },
        {
          kind: 'collect',
          roleIndices: [0, 1, 2],
          intent: 'Collect both results',
        },
      ],
    },
  };
}

test('upstream business intent uses code-owned identities/original sources without executable fields or quote copying', () => {
  const { input, proposal } = fixture();
  const before = globalThis.structuredClone({ input, proposal });
  const plan = resolveWorkflowIntent({ ...input, proposal });
  assert.deepEqual({ input, proposal }, before);
  assert.deepEqual(plan.roles[0].sources, input.messages);
  assert.equal(
    plan.roles[0].sources[0].text.includes('| Future       |'),
    true,
  );
  assert.deepEqual(
    plan.roles.map((role) => role.scope),
    ['required', 'required', 'required', 'conditional', 'excluded'],
  );
  assert.deepEqual(
    plan.flows[1].roleIds,
    plan.roles.slice(0, 3).map((role) => role.id),
  );
  const scenario = JSON.parse(formatWorkflowIntentScenario({ ...input, plan }));
  assert.equal(scenario.originalRequirements, input.scenario);
  assert.deepEqual(
    scenario.workflowIntent.roles.map((role) => role.id),
    plan.roles.map((role) => role.id),
  );
  assert.equal(
    Object.hasOwn(scenario.workflowIntent.roles[0], 'sources'),
    false,
  );
  validateWorkflowIntent({ ...input, plan: JSON.parse(JSON.stringify(plan)) });
  for (const change of [
    (copy) => {
      copy.roles[0].id = 'invented';
    },
    (copy) => {
      copy.roles[0].sources[0].text = 'made-up quotation';
    },
    (copy) => {
      copy.flows[0].roleIds[0] = 'absent';
    },
  ]) {
    const copy = globalThis.structuredClone(plan);
    change(copy);
    assert.throws(() => validateWorkflowIntent({ ...input, plan: copy }));
  }
  const changedSource = {
    ...input,
    scenario: input.scenario + ' Send email now.',
  };
  assert.throws(() => validateWorkflowIntent({ ...changedSource, plan }));
});

test('intent structure rejects absent source/role references and activation of future/excluded tasks, not wording whitespace', () => {
  const { input, proposal } = fixture();
  for (const change of [
    (copy) => {
      copy.roles[0].sourceMessageIds = ['absent'];
    },
    (copy) => {
      copy.roles[0].sourceMessageIds = ['original', 'original'];
    },
    (copy) => {
      copy.roles[0].parameters = {};
    },
    (copy) => {
      copy.flows[0].roleIndices = [0, 1.5];
    },
    (copy) => {
      copy.flows[0].roleIndices = [0, 99];
    },
    (copy) => {
      copy.flows[0].roleIndices = [0, 3];
    },
    (copy) => {
      copy.flows[0].roleIndices = [0, 4];
    },
  ]) {
    const copy = globalThis.structuredClone(proposal);
    change(copy);
    assert.throws(() => resolveWorkflowIntent({ ...input, proposal: copy }));
  }
  assert.throws(() =>
    createWorkflowIntentProposalSchema({ ...input, messages: [] }),
  );
});

test('real LangChain JSON-schema invocation plans intent once; no generated quote or extra display call is required', async () => {
  const { input, proposal } = fixture();
  const requests = [];
  let reply = proposal;
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    requests.push(JSON.parse(raw));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'intent-fixture',
        object: 'chat.completion',
        created: 1,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: JSON.stringify(reply) },
          },
        ],
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const model = new ChatOpenAI({
      model: 'gpt-4o',
      apiKey: 'fixture-only',
      maxRetries: 0,
      configuration: {
        baseURL: `http://127.0.0.1:${server.address().port}/v1`,
      },
    });
    const plan = await planWorkflowIntent({ ...input, model });
    assert.deepEqual(plan.source, input);
    assert.equal(requests.length, 1);
    const wire = requests[0].response_format.json_schema;
    assert.equal(wire.name, 'plan_workflow_intent');
    assert.equal(wire.strict, true);
    assert.equal(
      new Ajv2020({ strict: false }).compile(wire.schema)(proposal),
      true,
    );
    const encoded = JSON.stringify(wire.schema);
    assert.equal(encoded.includes('sourceQuote'), false);
    assert.equal(encoded.includes('parameters'), false);
    assert.deepEqual(JSON.parse(requests[0].messages[1].content), input);
    reply = {
      ...proposal,
      roles: [{ ...proposal.roles[0], sourceMessageIds: ['absent'] }],
    };
    await assert.rejects(planWorkflowIntent({ ...input, model }));
    assert.equal(requests.length, 2);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('mutated intent sources during a model call are rejected, not silently rebased', async () => {
  const { input, proposal } = fixture();
  const model = {
    withStructuredOutput: () => ({
      invoke: async () => {
        input.messages[0].text = 'changed';
        return proposal;
      },
    }),
  };
  await assert.rejects(
    planWorkflowIntent({ ...input, model }),
    /source changed/,
  );
});
