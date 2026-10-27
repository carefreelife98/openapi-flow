import { z } from 'zod';
import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';
import {
  createJsonOutputCapability,
  createNativeArrayCapability,
  createNativeOutputProjectionCapability,
  createNativeValueCollectionCapability,
  createN8nNativeOutputSources,
  createHttpRequestNode,
  compilePlannedN8nWorkflow,
} from '@openapi-flow/n8n';
import {
  projectionContextSchema,
  projectionRowSchema,
  projectionContext,
  projectionMeasurementFields,
  expectedMeasuredProjection,
} from './native-output-projection-fixture.mjs';

export async function nativeValueCollectionWorkflow(baseUrl, name) {
  const value = globalThis.structuredClone(projectionContext);
  if (name === 'empty') value.rows = [];
  if (name === 'duplicates')
    value.rows = [value.rows[0], globalThis.structuredClone(value.rows[0])];
  const literal = createJsonOutputCapability({
    name: 'collection-context',
    description: 'Explicit original fixture rows',
    parametersSchema: projectionContextSchema,
  });
  const context = {
    id: 'context',
    capability: literal.name,
    parameters: value,
  };
  const nativeNodes = [context],
    capabilities = [literal];
  const sources = () =>
    createN8nNativeOutputSources({
      nativeNodes,
      capabilities,
      apiNodeNames: {},
    });
  const split = createNativeArrayCapability({
    sources: sources(),
    itemMode: 'linked',
  });
  const each = {
    id: 'each',
    capability: split.name,
    parameters: { sourceNodeId: 'context', pointer: '/rows' },
  };
  nativeNodes.push(each);
  capabilities.push(split);
  const project = createNativeOutputProjectionCapability({
    sources: sources(),
  });
  const summary = {
    id: 'summary',
    capability: project.name,
    parameters: {
      sourceNodeId: 'each',
      fields: globalThis.structuredClone(projectionMeasurementFields),
    },
  };
  nativeNodes.push(summary);
  capabilities.push(project);
  const current = sources();
  const collect = createNativeValueCollectionCapability({ sources: current });
  const pointer =
    name === 'nested-arrays'
      ? '/values'
      : name === 'numbers'
        ? '/amount'
        : name === 'missing'
          ? '/not-present'
          : '';
  const collected = {
    id: 'collected',
    capability: collect.name,
    parameters: { sourceNodeId: 'summary', pointer },
  };
  if (name === 'missing-collector') {
    collected.parameters.sourceNodeId = 'each';
    collected.parameters.pointer = '/item/optional';
  }
  // The missing runtime value is declared optional in the independent source, not an invented pointer.
  if (name === 'missing') {
    summary.parameters.fields.push({
      name: 'optional',
      pointer: '/item/optional',
    });
    collected.parameters.pointer = '';
  }
  nativeNodes.push(collected);
  capabilities.push(collect);
  const outputs = sources();
  // The local REST consumer has an independent plain OAS contract, not internal
  // native schema-resource references copied into an unrelated OAS document.
  const rowSchema = projectionRowSchema
    .omit({ 'a/b~c': true, optional: true })
    .extend({
      'a.b': z.string(),
      textLength: z.number().int().nonnegative(),
      valueCount: z.number().int().nonnegative(),
    });
  const responseSchema = z.toJSONSchema(
    z.strictObject({
      items: z.array(
        name === 'nested-arrays'
          ? z.array(z.string())
          : name === 'missing-collector'
            ? z.string()
            : name === 'numbers'
              ? z.number()
              : rowSchema,
      ),
    }),
  );
  const catalog = await createApiCatalog([
    {
      id: 'native-collection',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Original collected values', version: '1' },
        paths: {
          '/echo': {
            post: {
              requestBody: {
                required: true,
                content: { 'application/json': { schema: responseSchema } },
              },
              responses: {
                200: {
                  description: 'Exact collected values',
                  content: { 'application/json': { schema: responseSchema } },
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
  const material = {
    operation,
    arguments: {
      callId: 'echo',
      values: {},
      bindings: [
        {
          kind: 'node-output',
          sourceNodeId: 'collected',
          sourcePointer: '',
          targetPointer: '/body',
        },
      ],
      unresolvedInputs: [],
    },
  };
  const request = createHttpRequestNode({
    ...material,
    baseUrl,
    nativeOutputSources: outputs,
    itemMode: 'linked',
    position: [1500, 0],
  });
  const workflow = compilePlannedN8nWorkflow({
    id: 'native-collection-' + name,
    name: 'Native projection to official Aggregate and REST',
    materials: [material],
    apiNodes: [request],
    capabilities,
    plan: {
      nativeNodes,
      starts: ['context'],
      gaps: [],
      edges: [
        { from: 'context', output: 'main', to: 'each', input: 'main' },
        { from: 'each', output: 'main', to: 'summary', input: 'main' },
        { from: 'summary', output: 'main', to: 'collected', input: 'main' },
        { from: 'collected', output: 'main', to: 'echo', input: 'main' },
      ],
    },
  }).workflow;
  if (name === 'invalid')
    workflow.nodes.find((node) => node.id === 'context').parameters.jsonOutput =
      JSON.stringify({ ...value, marker: 'invalid' });
  if (name === 'invalid-collector')
    workflow.nodes.find((node) => node.id === 'summary').parameters.jsonOutput =
      '{}';
  const selected = value.rows.map(expectedMeasuredProjection);
  const expected = {
    items: selected.map((row) =>
      name === 'nested-arrays'
        ? row.values
        : name === 'numbers'
          ? row.amount
          : row,
    ),
  };
  return { workflow, expected };
}
