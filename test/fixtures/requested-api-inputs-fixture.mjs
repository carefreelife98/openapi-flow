import {
  createApiCatalog,
  resolveApiOperations,
  createWorkflowDraft,
  createWorkflowDraftEditPlan,
  describeWorkflowDraftApiCallPlanning,
  resolveWorkflowDraftApiCallBindings,
} from '@openapi-flow/core';

export async function requestedApiInputFixture() {
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      config: {
        type: 'object',
        additionalProperties: false,
        properties: {
          enabled: { type: 'boolean' },
          count: { type: 'number' },
          nullable: { type: ['string', 'null'] },
          label: { type: 'string' },
        },
      },
      rows: {
        type: 'array',
        items: { type: 'object', properties: { name: { type: 'string' } } },
      },
    },
  };
  const spec = {
    openapi: '3.1.0',
    info: { title: 'Scenario input presence', version: '1' },
    paths: {
      '/search': {
        post: {
          parameters: [
            { in: 'query', name: 'filter', schema: { type: 'string' } },
          ],
          requestBody: {
            content: { 'application/json': { schema } },
          },
          responses: {
            200: { description: 'Search completed' },
          },
        },
      },
      '/seed': {
        get: {
          responses: {
            200: {
              description: 'Configuration',
              content: { 'application/json': { schema } },
            },
          },
        },
      },
    },
  };
  const catalog = await createApiCatalog([{ id: 'requested-inputs', spec }]);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map((candidate) => candidate.key),
  );
  const operation = operations.find((entry) => entry.path === '/search');
  const seed = operations.find((entry) => entry.path === '/seed');
  const context = {
    operations,
    capabilities: [],
    messages: [
      { id: 'request-1', text: '검색 필터를 적용해줘. 필터 값은 아직 몰라.' },
    ],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'requested-input-workflow',
      requirements: [],
      apiCalls: [],
      nativeNodes: [],
      edges: [],
    },
  });
  const requestMessageIds = ['request-1'];
  const plan = createWorkflowDraftEditPlan({
    draft,
    context,
    requestMessageIds,
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        {
          kind: 'add-api-call',
          operation: operation.key,
          instruction: context.messages[0].text,
          sources: [
            {
              kind: 'message',
              messageId: 'request-1',
              quote: context.messages[0].text,
            },
          ],
        },
      ],
    },
  });
  const input = {
    draft,
    context,
    plan,
    requestMessageIds,
    resolutions: [],
    stepId: plan.steps[0].id,
  };
  const bindingPlan = resolveWorkflowDraftApiCallBindings({
    ...input,
    fingerprint: describeWorkflowDraftApiCallPlanning(input).fingerprint,
    proposal: {
      decision: { status: 'provided', sourceMessageIds: requestMessageIds },
    },
  });
  return {
    spec,
    schema,
    operation,
    seed,
    input: { ...input, bindingPlan },
    material: {
      operation,
      callId: 'search',
      values: {},
      bindings: [],
      requestMediaType: 'application/json',
    },
  };
}
