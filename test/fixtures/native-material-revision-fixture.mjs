import {
  createApiCatalog,
  resolveApiOperations,
  createWorkflowDraft,
  createWorkflowDraftEditPlan,
  stageWorkflowDraftEdit,
  describeWorkflowDraftNativeReferenceRepair,
  resolveWorkflowDraftNativeReferenceRepair,
  describeWorkflowDraftApiBindingEdit,
  resolveWorkflowDraftApiBindingEdit,
  assembleWorkflowDraftEdit,
} from '@openapi-flow/core';
import {
  createResponseArrayCapability,
  createNativeArrayCapability,
  createItemJoinCapability,
  createResponseCollectionCapability,
  createN8nNativeOutputSources,
  createHttpRequestNode,
} from '@openapi-flow/n8n';

const object = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const response = (schema) => ({
  200: {
    description: 'Unchanged actual JSON values',
    content: { 'application/json': { schema } },
  },
});
const list = (field, type) =>
  object({
    [field]: {
      type: 'array',
      items: object({ values: { type: 'array', items: { type } } }),
    },
  });
const echoed = object({ value: { type: ['string', 'number'] } });

export async function nativeMaterialRevisionFixture(
  replacementPath = '/after',
) {
  const catalog = await createApiCatalog([
    {
      id: 'native-material-revisions',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Material revision contracts', version: '1' },
        paths: {
          '/before': { get: { responses: response(list('rows', 'string')) } },
          '/after': { get: { responses: response(list('entries', 'number')) } },
          '/same-path': {
            get: { responses: response(list('rows', 'number')) },
          },
          '/follow': {
            post: {
              requestBody: {
                required: true,
                content: { 'application/json': { schema: echoed } },
              },
              responses: response(echoed),
            },
          },
          '/number-only': {
            post: {
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: object({ value: { type: 'number' } }),
                  },
                },
              },
              responses: response(echoed),
            },
          },
        },
      },
    },
  ]);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map((entry) => entry.key),
  );
  const before = operations.find((operation) => operation.path === '/before');
  const replacement = operations.find(
    (operation) => operation.path === replacementPath,
  );
  const follow = operations.find((operation) => operation.path === '/follow');
  const numberOnly = operations.find(
    (operation) => operation.path === '/number-only',
  );
  if (!replacement)
    throw new Error('Missing explicit replacement fixture operation');
  const apiMaterials = [
    { callId: 'source', operation: before },
    ...['first', 'second'].map((callId) => ({
      callId,
      operation: follow,
      requestMediaType: 'application/json',
    })),
  ];
  const apiResponseContracts = Object.fromEntries(
    apiMaterials.map((material) => [material.callId, material.operation]),
  );
  const source = createHttpRequestNode({
    operation: before,
    arguments: {
      callId: 'source',
      values: {},
      bindings: [],
      unresolvedInputs: [],
    },
    baseUrl: 'https://contract.example.test',
    position: [0, 0],
  });
  const apiNodeNames = { source: source.exit.name };
  const apiArray = createResponseArrayCapability({
    materials: apiMaterials,
    itemMode: 'linked',
  });
  const apiItems = {
    id: 'api-items',
    capability: apiArray.name,
    parameters: { sourceNodeId: 'source', pointer: '/rows' },
  };
  const apiSources = createN8nNativeOutputSources({
    nativeNodes: [apiItems],
    capabilities: [apiArray],
    apiNodeNames,
    apiResponseContracts,
  });
  const nativeArray = createNativeArrayCapability({
    sources: apiSources,
    itemMode: 'linked',
  });
  const values = {
    id: 'values',
    capability: nativeArray.name,
    parameters: { sourceNodeId: 'api-items', pointer: '/item/values' },
  };
  const scopes = createN8nNativeOutputSources({
    nativeNodes: [apiItems, values],
    capabilities: [apiArray, nativeArray],
    apiNodeNames,
    apiResponseContracts,
  });
  const join = createItemJoinCapability({
    materials: apiMaterials.filter((material) => material.callId !== 'source'),
    scopes: scopes.filter((scope) => scope.nodeId === 'values'),
  });
  const collection = createResponseCollectionCapability({
    materials: apiMaterials,
  });
  const message = {
    id: 'edit',
    text: 'Replace source with the numeric source operation. Split its declared result array, keep every value unchanged, run both follow-up APIs in parallel, join by the existing item scope and collect the first response stream. Preserve all routes and other settings.',
  };
  const context = {
    operations,
    capabilities: [apiArray, nativeArray, join, collection],
    messages: [message],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'native-material-revisions',
      requirements: [],
      apiCalls: [
        { id: 'source', operation: before.key, values: {}, bindings: [] },
        ...['first', 'second'].map((id) => ({
          id,
          operation: follow.key,
          values: {},
          bindings: [
            {
              kind: 'node-output',
              sourceNodeId: 'values',
              sourcePointer: '/item',
              targetPointer: '/body/value',
            },
          ],
          requestMediaType: 'application/json',
        })),
      ],
      nativeNodes: [
        {
          id: 'collected',
          capability: collection.name,
          parameters: { sourceNodeId: 'first', pointer: '' },
        },
        {
          id: 'joined',
          capability: join.name,
          parameters: {
            scopeNodeId: 'values',
            sourceCallIds: ['first', 'second'],
          },
        },
        values,
        apiItems,
      ],
      edges: [
        { from: 'source', to: 'api-items', output: 'main', input: 'main' },
        { from: 'api-items', to: 'values', output: 'main', input: 'main' },
        ...['first', 'second'].map((to) => ({
          from: 'values',
          to,
          output: 'main',
          input: 'main',
        })),
        { from: 'first', to: 'joined', output: 'main', input: 'input1' },
        { from: 'second', to: 'joined', output: 'main', input: 'input2' },
        { from: 'joined', to: 'collected', output: 'main', input: 'main' },
      ],
    },
  });
  const sources = [
    { kind: 'message', messageId: message.id, quote: message.text },
  ];
  const base = { draft, context, requestMessageIds: [message.id] };
  const plan = createWorkflowDraftEditPlan({
    ...base,
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        {
          kind: 'replace-api-operation',
          nodeId: 'source',
          operation: replacement.key,
          instruction: message.text,
          sources,
        },
      ],
    },
  });
  const input = {
    ...base,
    plan,
    resolutions: [
      { stepId: plan.steps[0].id, kind: 'api-call', values: {}, bindings: [] },
    ],
  };
  return { ...input, before, replacement, numberOnly, sources };
}

/** Explicit host decisions for this fixture, not a library repair/retry policy. */
export function repairNativeMaterialRevision(input) {
  const repairs = [];
  const stages = [];
  const seen = new Set();
  for (;;) {
    const stage = stageWorkflowDraftEdit({ ...input, repairs });
    stages.push(stage);
    const task = stage.pendingRepairs[0];
    if (!task)
      return {
        candidate: assembleWorkflowDraftEdit({ ...input, repairs }),
        repairs,
        stages,
      };
    if (seen.has(task.id))
      throw new Error('Fixture repair did not advance the authoritative stage');
    seen.add(task.id);
    if (task.kind === 'native-parameters') {
      const bounded = { ...input, repairs, taskId: task.id };
      const description = describeWorkflowDraftNativeReferenceRepair(bounded);
      const result = resolveWorkflowDraftNativeReferenceRepair({
        ...bounded,
        fingerprint: description.fingerprint,
        proposal: {
          decisions: Object.fromEntries(
            description.bindings.map((binding) => [
              binding.id,
              {
                ...(task.nodeId === 'api-items'
                  ? {
                      kind: 'bind',
                      sourceNodeId: 'source',
                      sourcePointer:
                        input.replacement.path === '/after'
                          ? '/entries'
                          : '/rows',
                    }
                  : { kind: 'keep' }),
                sourceMessageIds: input.requestMessageIds,
              },
            ]),
          ),
        },
      });
      if (result.status !== 'ready')
        throw new Error(
          'Fixture requires its explicitly selected native source',
        );
      repairs.push(result.repair);
    } else {
      const bounded = {
        ...input,
        repairs,
        scope: { kind: 'repair', taskId: task.id },
      };
      const description = describeWorkflowDraftApiBindingEdit(bounded);
      const result = resolveWorkflowDraftApiBindingEdit({
        ...bounded,
        fingerprint: description.fingerprint,
        proposal: {
          decisions: task.targetPointers.map((targetPointer) => ({
            kind: 'keep',
            targetPointer,
            sources: input.sources,
          })),
        },
      });
      if (result.status !== 'ready')
        throw new Error(
          'Fixture requires the original explicit API value reference',
        );
      repairs.push(result.repair);
    }
  }
}
