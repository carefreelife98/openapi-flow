import {
  createApiCatalog,
  resolveApiOperations,
  createWorkflowDraft,
  createWorkflowDraftEditPlan,
} from '@openapi-flow/core';

export async function schemaDraftInputEditFixture(
  schema,
  body,
  text,
  openapi = '3.1.0',
) {
  const catalog = await createApiCatalog([
    {
      id: 'schema-input-edits',
      spec: {
        openapi,
        info: { title: 'Original input schema assertions', version: '1' },
        paths: {
          '/payload': {
            put: {
              requestBody: {
                required: true,
                content: { 'application/json': { schema } },
              },
              responses: { 200: { description: 'Accepted' } },
            },
          },
        },
      },
    },
  ]);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map((operation) => operation.key),
  );
  const context = {
    operations,
    capabilities: [],
    messages: [{ id: 'edit-1', text }],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'schema-edit',
      requirements: [],
      nativeNodes: [],
      edges: [],
      apiCalls: [
        {
          id: 'source',
          operation: operations[0].key,
          bindings: [],
          values: { body },
          requestMediaType: 'application/json',
        },
      ],
    },
  });
  const sources = [{ kind: 'message', messageId: 'edit-1', quote: text }];
  const input = { draft, context, requestMessageIds: ['edit-1'] };
  const plan = createWorkflowDraftEditPlan({
    ...input,
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        {
          kind: 'revise-api-inputs',
          nodeId: 'source',
          instruction: text,
          sources,
        },
      ],
    },
  });
  return { ...input, plan, stepId: plan.steps[0].id, sources };
}
