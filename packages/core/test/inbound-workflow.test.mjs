import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileInboundWorkflow,
  inboundOperationsFromSpec,
  operationsFromSpec,
  UnsupportedOperationError,
} from '@openapi-flow/core';

const inboundSpec = {
  openapi: '3.2.1',
  info: { title: 'Inbound', version: '1' },
  paths: {
    '/register': {
      post: {
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { callbackUrl: { type: 'string' } },
              },
            },
          },
        },
        responses: { 202: { description: 'accepted' } },
        callbacks: {
          onDone: {
            '{$request.body#/callbackUrl}': {
              post: {
                responses: {
                  202: {
                    description: 'accepted',
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          required: ['ok'],
                          properties: { ok: { type: 'boolean' } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  webhooks: {
    onEvent: {
      post: {
        responses: {
          202: {
            description: 'accepted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['ok'],
                  properties: { ok: { type: 'boolean' } },
                },
              },
            },
          },
        },
      },
    },
  },
};

test('webhook and callback candidates retain distinct OAS sources and references', async () => {
  assert.equal((await operationsFromSpec(inboundSpec)).length, 1);
  const inbound = await inboundOperationsFromSpec(inboundSpec);
  assert.deepEqual(
    inbound.map(({ source, operationRef }) => ({ source, operationRef })),
    [
      { source: 'webhooks', operationRef: '#/webhooks/onEvent/post' },
      {
        source: 'callbacks',
        operationRef:
          '#/paths/~1register/post/callbacks/onDone/{$request.body#~1callbackUrl}/post',
      },
    ],
  );
  assert.equal(inbound[1].parentOperationRef, '#/paths/~1register/post');
  const webhookOnly = globalThis.structuredClone(inboundSpec);
  delete webhookOnly.paths;
  assert.deepEqual(
    (await inboundOperationsFromSpec(webhookOnly)).map(({ source }) => source),
    ['webhooks'],
  );
  const callbackOnly = globalThis.structuredClone(inboundSpec);
  delete callbackOnly.webhooks;
  assert.deepEqual(
    (await inboundOperationsFromSpec(callbackOnly)).map(({ source }) => source),
    ['callbacks'],
  );
});

test('webhook and callback compile to deterministic trigger and OAS-checked response', async () => {
  const inbound = await inboundOperationsFromSpec(inboundSpec);
  for (const candidate of inbound) {
    const request = {
      spec: inboundSpec,
      plan: {
        version: '1',
        goal: 'Acknowledge an inbound request',
        operationRef: candidate.operationRef,
        webhookPath: candidate.source + '/events',
        responseStatus: 202,
        responseBody: { ok: true },
      },
    };
    const result = await compileInboundWorkflow(request);
    assert.equal(result.status, 'complete');
    assert.equal(result.evidence.source, candidate.source);
    assert.deepEqual(
      result.workflow.nodes.map((node) => node.type),
      ['n8n-nodes-base.webhook', 'n8n-nodes-base.respondToWebhook'],
    );
    assert.equal(result.workflow.nodes[0].parameters.httpMethod, 'POST');
    assert.equal(
      result.workflow.nodes[0].parameters.path,
      candidate.source + '/events',
    );
    assert.equal(
      result.workflow.nodes[0].parameters.responseMode,
      'responseNode',
    );
    assert.equal(result.workflow.nodes[1].parameters.options.responseCode, 202);
    assert.equal(
      result.workflow.nodes[1].parameters.responseBody,
      '{"ok":true}',
    );
    assert.deepEqual(
      result.workflow,
      (await compileInboundWorkflow(request)).workflow,
    );
  }
});

test('inbound compiler rejects undeclared response and unmapped security', async () => {
  const operationRef = '#/webhooks/onEvent/post';
  const plan = {
    version: '1',
    goal: 'Acknowledge',
    operationRef,
    webhookPath: 'events',
    responseStatus: 202,
    responseBody: { ok: true },
  };
  await assert.rejects(
    () =>
      compileInboundWorkflow({
        spec: inboundSpec,
        plan: { ...plan, responseStatus: 201 },
      }),
    /responseStatus 201 is not declared/,
  );
  await assert.rejects(
    () =>
      compileInboundWorkflow({
        spec: inboundSpec,
        plan: { ...plan, responseBody: { ok: 1 } },
      }),
    /plan.responseBody does not match the OAS schema/,
  );
  const secured = globalThis.structuredClone(inboundSpec);
  secured.components = {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
  };
  secured.webhooks.onEvent.post.security = [{ bearer: [] }];
  await assert.rejects(
    () => compileInboundWorkflow({ spec: secured, plan }),
    (error) =>
      error instanceof UnsupportedOperationError &&
      /inbound authentication/.test(error.message),
  );
});
