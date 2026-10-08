import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { ChatOpenAI } from '@langchain/openai';
import {
  planReviewableWorkflowGraph,
  ReviewableWorkflowGraphPlanningError,
} from '@openapi-flow/langchain';
import { compilationInput, edge } from './fixtures/workflow-review-fixture.mjs';

test('ChatOpenAI sends described review fields and retains rejected proposals without retry', async () => {
  const requests = [];
  let output = {
    additionalNativeNodes: [],
    edges: [edge('call-1', 'refund'), edge('refund', 'call-2')],
    additionalGaps: [],
    blockedCalls: [],
  };
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'chatcmpl-review-test',
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
                  id: 'call-review-graph',
                  type: 'function',
                  function: {
                    name: 'plan_reviewable_workflow_graph',
                    arguments: JSON.stringify(output),
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
      apiKey: 'test-only',
      maxRetries: 0,
      configuration: {
        baseURL: `http://127.0.0.1:${server.address().port}/v1`,
      },
    });
    const fixture = await compilationInput();
    const input = {
      materials: fixture.materials,
      capabilities: fixture.capabilities,
      gaps: fixture.plan.gaps,
      scenario: 'Read inventory, review refund, then read prices',
      model,
    };
    assert.deepEqual((await planReviewableWorkflowGraph(input)).starts, [
      'call-1',
    ]);
    output = { ...output, edges: [edge('unknown', 'refund')] };
    await assert.rejects(planReviewableWorkflowGraph(input), (error) => {
      assert.ok(error instanceof ReviewableWorkflowGraphPlanningError);
      assert.equal(error.failure.stage, 'graph-validation');
      assert.deepEqual(error.failure.output, output);
      assert.match(error.cause.message, /missing node/);
      return true;
    });
    output = { ...output, starts: ['call-1'] };
    await assert.rejects(planReviewableWorkflowGraph(input));
    assert.equal(requests.length, 3);
    for (const request of requests) {
      const tool = request.tools[0].function;
      assert.equal(tool.strict, true);
      assert.equal(tool.parameters.additionalProperties, false);
      assert.deepEqual(
        [...tool.parameters.required].sort(),
        [
          'additionalNativeNodes',
          'edges',
          'additionalGaps',
          'blockedCalls',
        ].sort(),
      );
      assert.equal(tool.parameters.properties.starts, undefined);
      assert.ok(
        tool.parameters.properties.edges.items.properties.from.description,
      );
      assert.deepEqual(
        tool.parameters.properties.blockedCalls.items.properties.callId.enum,
        ['call-1', 'call-2'],
      );
    }
    // An explicitly empty native registry is valid, but cannot propose a native node.
    output = {
      edges: [],
      additionalGaps: [],
      blockedCalls: [],
    };
    await planReviewableWorkflowGraph({ ...input, capabilities: [] });
    assert.equal(
      Object.hasOwn(
        requests[3].tools[0].function.parameters.properties,
        'additionalNativeNodes',
      ),
      false,
    );
    const blocked = fixture.materials.map((item) => ({
      status: 'blocked',
      callId: item.arguments.callId,
      operation: item.operation,
      bindings: [],
      gapIds: ['refund'],
    }));
    output = { additionalNativeNodes: [], edges: [], additionalGaps: [] };
    await planReviewableWorkflowGraph({ ...input, materials: blocked });
    assert.equal(
      Object.hasOwn(
        requests[4].tools[0].function.parameters.properties,
        'blockedCalls',
      ),
      false,
    );
    assert.equal(
      JSON.stringify(requests[4].tools[0].function.parameters).includes(
        '"enum":[]',
      ),
      false,
    );
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
