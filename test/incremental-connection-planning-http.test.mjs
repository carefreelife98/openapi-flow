import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import {
  applyWorkflowConnectionStep,
  finalizeWorkflowConnectionSession,
} from '@openapi-flow/core';
import {
  planWorkflowConnectionGoals,
  planWorkflowConnectionStep,
} from '@openapi-flow/langchain';
import {
  incrementalConnectionFixture as fixture,
  incrementalConnectionPatch as patch,
  incrementalConnectionModelPatch as modelPatch,
} from './fixtures/incremental-connection-fixture.mjs';

const { Ajv2020 } = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
)('ajv/dist/2020.js');

test('actual ChatOpenAI wire uses valid strict schemas for goals and two automatic connection bundles', async () => {
  const { source, goals, plan } = fixture();
  const outputs = [
    { goals },
    {
      decision: modelPatch(
        source,
        patch({
          addRootNodeIds: ['source'],
          addEdges: plan.edges.filter((edge) => edge.from === 'source'),
        }),
      ),
    },
    {
      decision: modelPatch(
        source,
        patch({
          addEdges: plan.edges.filter((edge) => edge.from !== 'source'),
          addTerminals: [{ nodeId: 'summary', output: 'main' }],
        }),
      ),
    },
  ];
  const requests = [];
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    const index = requests.length;
    requests.push(body);
    const wire = body.tools[0].function;
    const validator = new Ajv2020({ strict: false });
    if (!validator.validateSchema(wire.parameters)) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          error: {
            message: 'Invalid output JSON Schema',
            type: 'invalid_request_error',
          },
        }),
      );
      return;
    }
    const validate = validator.compile(wire.parameters);
    assert.equal(
      validate(outputs[index]),
      true,
      JSON.stringify(validate.errors),
    );
    assert.equal(wire.strict, true);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: `incremental-wire-${index}`,
        object: 'chat.completion',
        created: 1,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: `decision-${index}`,
                  type: 'function',
                  function: {
                    name: wire.name,
                    arguments: JSON.stringify(outputs[index]),
                  },
                },
              ],
            },
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
    let session = await planWorkflowConnectionGoals({ ...source, model });
    for (let index = 0; index < 2; index++) {
      const planned = await planWorkflowConnectionStep({
        ...source,
        session,
        model,
      });
      const applied = applyWorkflowConnectionStep({
        ...source,
        session,
        expected: planned.expected,
        proposal: planned.decision,
      });
      assert.equal(applied.status, 'accepted', JSON.stringify(applied));
      assert.equal(applied.inspection.ready, index === 1);
      session = applied.session;
    }
    const final = finalizeWorkflowConnectionSession({ ...source, session });
    assert.deepEqual(final.edges, plan.edges);
    assert.deepEqual(final.starts, ['source']);
    assert.deepEqual(
      requests.map((request) => request.tools[0].function.name),
      [
        'plan_workflow_connection_goals',
        'plan_workflow_connection_step',
        'plan_workflow_connection_step',
      ],
    );
    for (const request of requests) {
      const schema = request.tools[0].function.parameters;
      assert.equal(Object.hasOwn(schema.properties, 'expectedRevision'), false);
      assert.equal(
        Object.hasOwn(schema.properties, 'sourceFingerprint'),
        false,
      );
      assert.equal(JSON.stringify(schema).includes('"prefixItems":[]'), false);
      assert.equal(request.messages[0].role, 'system');
      assert.equal(request.messages[1].role, 'user');
    }
    const graph = JSON.parse(requests[2].messages[1].content);
    assert.deepEqual(
      graph.context.edges,
      plan.edges.filter((edge) => edge.from === 'source'),
    );
    assert.equal(graph.expected.revision, 1);
    assert.deepEqual(graph.goals, session.goals);
    assert.equal(graph.context.nodes.length, 6);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
