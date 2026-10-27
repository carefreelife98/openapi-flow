import { z } from 'zod';
import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';
import {
  createJsonOutputCapability,
  createNativeArrayCapability,
  createNativeOutputProjectionCapability,
  createN8nNativeOutputSources,
  createHttpRequestNode,
  compilePlannedN8nWorkflow,
} from '@openapi-flow/n8n';

export const projectionRowSchema = z.strictObject({
  code: z.string(),
  amount: z.number(),
  enabled: z.boolean(),
  nothing: z.null(),
  values: z.array(z.string()),
  'a/b~c': z.string(),
  optional: z.string().optional(),
});
export const projectionContextSchema = z.strictObject({
  rows: z.array(projectionRowSchema),
  marker: z.literal('original'),
});
export const projectionContext = {
  rows: [
    {
      code: '0007',
      amount: 0,
      enabled: false,
      nothing: null,
      values: ['={{ untouched }}'],
      'a/b~c': '',
    },
    {
      code: '0008',
      amount: -2,
      enabled: true,
      nothing: null,
      values: [],
      'a/b~c': '={{ original }}',
    },
  ],
  marker: 'original',
};
export const projectionFields = [
  { name: 'code', pointer: '/item/code' },
  { name: 'amount', pointer: '/item/amount' },
  { name: 'enabled', pointer: '/item/enabled' },
  { name: 'nothing', pointer: '/item/nothing' },
  { name: 'values', pointer: '/item/values' },
  { name: 'a.b', pointer: '/item/a~1b~0c' },
];
export const projectionMeasurementFields = [
  ...projectionFields,
  {
    name: 'textLength',
    pointer: '/item/code',
    measurement: 'utf16-code-units',
  },
  { name: 'valueCount', pointer: '/item/values', measurement: 'array-items' },
];
export function expectedProjection(row) {
  return {
    code: row.code,
    amount: row.amount,
    enabled: row.enabled,
    nothing: row.nothing,
    values: row.values,
    'a.b': row['a/b~c'],
  };
}
export function expectedMeasuredProjection(row) {
  return {
    ...expectedProjection(row),
    textLength: row.code.length,
    valueCount: row.values.length,
  };
}

export async function compileNativeOutputProjectionWorkflow(
  baseUrl,
  value,
  fields,
  includeConsumer,
) {
  if (typeof includeConsumer !== 'boolean')
    throw new Error(
      'includeConsumer must explicitly select the REST consumer check',
    );
  const producer = createJsonOutputCapability({
    name: 'explicit-context',
    description:
      'Explicit synthetic native rows, not model-generated business data.',
    parametersSchema: projectionContextSchema,
  });
  const context = {
    id: 'context',
    capability: producer.name,
    parameters: value,
  };
  const sources = createN8nNativeOutputSources({
    nativeNodes: [context],
    capabilities: [producer],
    apiNodeNames: {},
  });
  const split = createNativeArrayCapability({ sources, itemMode: 'linked' });
  const each = {
    id: 'each-row',
    capability: split.name,
    parameters: { sourceNodeId: context.id, pointer: '/rows' },
  };
  const eachSources = createN8nNativeOutputSources({
    nativeNodes: [context, each],
    capabilities: [producer, split],
    apiNodeNames: {},
  });
  const projection = createNativeOutputProjectionCapability({
    sources: eachSources,
  });
  const projected = {
    id: 'selected-fields',
    capability: projection.name,
    parameters: { sourceNodeId: each.id, fields },
  };
  const nativeNodes = [context, each, projected];
  const capabilities = [producer, split, projection];
  const nativeOutputSources = createN8nNativeOutputSources({
    nativeNodes,
    capabilities,
    apiNodeNames: {},
  });
  const echoSchema = z.toJSONSchema(
    projectionRowSchema.omit({ 'a/b~c': true, optional: true }).extend({
      'a.b': z.string(),
      ...Object.fromEntries(
        fields
          .filter((field) => field.measurement !== undefined)
          .map((field) => [field.name, z.number().int().nonnegative()]),
      ),
    }),
  );
  const catalog = await createApiCatalog([
    {
      id: 'native-projection',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Typed native field consumer', version: '1' },
        paths: {
          '/echo': {
            post: {
              requestBody: {
                required: true,
                content: { 'application/json': { schema: echoSchema } },
              },
              responses: {
                200: {
                  description: 'Unchanged original fields',
                  content: { 'application/json': { schema: echoSchema } },
                },
              },
            },
          },
        },
      },
    },
  ]);
  const [operation] = await resolveApiOperations(
    catalog,
    catalog.operations.map((entry) => entry.key),
  );
  const sink = {
    operation,
    arguments: {
      callId: 'echo',
      values: {},
      unresolvedInputs: [],
      bindings: [
        {
          kind: 'node-output',
          sourceNodeId: projected.id,
          sourcePointer: '',
          targetPointer: '/body',
        },
      ],
    },
  };
  // The missing optional source value case stops in the native guard before this consumer.
  const apiNodes = includeConsumer
    ? [
        createHttpRequestNode({
          ...sink,
          baseUrl,
          position: [1000, 0],
          nativeOutputSources,
          itemMode: 'linked',
        }),
      ]
    : [];
  return compilePlannedN8nWorkflow({
    id: 'native-output-projection',
    name: 'Native values through official Edit Fields and REST',
    materials: apiNodes.length ? [sink] : [],
    apiNodes,
    capabilities,
    plan: {
      nativeNodes,
      starts: [context.id],
      gaps: [],
      edges: [
        { from: context.id, output: 'main', to: each.id, input: 'main' },
        { from: each.id, output: 'main', to: projected.id, input: 'main' },
        ...apiNodes.map(() => ({
          from: projected.id,
          output: 'main',
          to: 'echo',
          input: 'main',
        })),
      ],
    },
  }).workflow;
}
