import { z } from 'zod';
import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';
import { N8nNativeFeature } from '@openapi-flow/n8n';

export async function nativeFeatureRegistryFixture() {
  const responseSchema = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      rows: { type: 'array', items: { type: 'number' } },
    },
    required: ['id', 'rows'],
    additionalProperties: false,
  };
  const response = {
    200: {
      description: 'Unchanged response',
      content: { 'application/json': { schema: responseSchema } },
    },
  };
  const catalog = await createApiCatalog([
    {
      id: 'registry-contracts',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Registered feature contracts', version: '1' },
        paths: {
          '/left': { get: { responses: response } },
          '/right': { get: { responses: response } },
        },
      },
    },
  ]);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map((entry) => entry.key),
  );
  const jsonOutput = {
    name: 'original-context',
    description: 'Only explicitly supplied original values.',
    parametersSchema: z.strictObject({
      rows: z.array(z.number()),
      marker: z.literal('={{ literal text }}'),
    }),
  };
  const source = {
    nodeId: 'context',
    nodeName: 'context',
    schema: z.toJSONSchema(jsonOutput.parametersSchema),
  };
  return {
    apiMaterials: operations.map((operation, index) => ({
      callId: index === 0 ? 'left' : 'right',
      operation,
    })),
    nativeOutputSources: [source],
    jsonOutput,
    itemMode: 'linked',
  };
}

const literalCheck = {
  left: { source: 'literal', value: 0 },
  operator: 'equals',
  right: { source: 'literal', value: 0 },
};

export const nativeFeatureParameters = {
  [N8nNativeFeature.CollectNativeOutputValues]: {
    sourceNodeId: 'context',
    pointer: '/rows',
  },
  [N8nNativeFeature.ProjectNativeOutput]: {
    sourceNodeId: 'context',
    fields: [{ name: 'marker', pointer: '/marker' }],
  },
  [N8nNativeFeature.JoinApiResponseArraysByKey]: {
    left: { sourceNodeId: 'left', pointer: '/rows', keyPointer: '' },
    right: { sourceNodeId: 'right', pointer: '/rows', keyPointer: '' },
    joinMode: 'full',
    missingKeys: 'error',
  },
  [N8nNativeFeature.SelectApiResponseMapEntry]: {
    sourceNodeId: 'left',
    pointer: '',
    key: 'rows',
  },
  [N8nNativeFeature.If]: {
    combinator: 'and',
    conditions: [literalCheck],
  },
  [N8nNativeFeature.MergeAppend]: { numberInputs: 2 },
  [N8nNativeFeature.AssertResponses]: {
    checks: [{ ...literalCheck, message: 'Values differ' }],
  },
  [N8nNativeFeature.StopAndError]: { message: 'Explicit stop' },
  [N8nNativeFeature.PassThrough]: {},
  [N8nNativeFeature.RejoinExclusiveBranches]: { sourceNodeId: 'if-branch' },
  [N8nNativeFeature.JsonOutput]: {
    rows: [0, 2],
    marker: '={{ literal text }}',
  },
  [N8nNativeFeature.SplitApiResponseArray]: {
    sourceNodeId: 'left',
    pointer: '/rows',
  },
  [N8nNativeFeature.CollectApiResponses]: {
    sourceNodeId: 'left',
    pointer: '',
  },
  [N8nNativeFeature.ComposeApiResponses]: {
    fields: [
      { name: 'left', sourceNodeId: 'left', pointer: '' },
      { name: 'right', sourceNodeId: 'right', pointer: '' },
    ],
  },
  [N8nNativeFeature.GatherApiResponses]: { sourceNodeIds: ['left', 'right'] },
  [N8nNativeFeature.SplitNativeOutputArray]: {
    sourceNodeId: 'context',
    pointer: '/rows',
  },
  [N8nNativeFeature.JoinApiItems]: {
    scopeNodeId: 'context',
    sourceCallIds: ['left', 'right'],
  },
};
