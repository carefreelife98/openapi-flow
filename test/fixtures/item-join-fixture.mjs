import { node } from '@n8n/workflow-sdk';
import { z } from 'zod';
import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';
import {
  createResponseArrayCapability,
  createItemJoinCapability,
  createN8nNativeOutputSources,
  createHttpRequestNode,
  compilePlannedN8nWorkflow,
} from '@openapi-flow/n8n';

export const rows = [
  { id: 'same/42', amount: 8 },
  { id: 'same/42', amount: 2 },
  { id: 'same/42', amount: 8 },
];
const itemSchema = {
  type: 'object',
  required: ['id', 'amount'],
  additionalProperties: false,
  properties: { id: { type: 'string' }, amount: { type: 'number' } },
};
const response = (schema) => ({
  200: {
    description: 'JSON response',
    content: { 'application/json': { schema } },
  },
});
const argumentsFor = (callId, bindings) => ({
  callId,
  values: {},
  bindings,
  unresolvedInputs: [],
});
const binding = (targetPointer, sourceNodeId, sourcePointer) => ({
  kind: 'node-output',
  targetPointer,
  sourceNodeId,
  sourcePointer,
});

export async function createItemJoinFixture(
  baseUrl = 'https://fixture.test',
  mode = 'reordered',
  branchCount = 2,
) {
  const callIds = ['alpha', 'beta', 'gamma'].slice(0, branchCount);
  const responseSchemas = Object.fromEntries(
    callIds.map((id) => [
      id,
      {
        type: 'object',
        required: ['branch', 'item'],
        additionalProperties: false,
        properties: { branch: { const: id }, item: itemSchema },
      },
    ]),
  );
  const spec = {
    openapi: '3.1.0',
    info: { title: 'Item ancestry join', version: '1' },
    paths: {
      '/records': {
        get: {
          responses: response({
            type: 'object',
            properties: { records: { type: 'array', items: itemSchema } },
            required: ['records'],
            additionalProperties: false,
          }),
        },
      },
      ...Object.fromEntries(
        callIds.map((id) => [
          '/' + id,
          {
            post: {
              requestBody: {
                required: true,
                content: { 'application/json': { schema: itemSchema } },
              },
              responses: response(responseSchemas[id]),
            },
          },
        ]),
      ),
      '/consume/{amount}': {
        post: {
          parameters: [
            {
              in: 'path',
              name: 'amount',
              required: true,
              schema: { type: 'number' },
            },
            {
              in: 'query',
              name: 'id',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: callIds,
                  additionalProperties: false,
                  properties: responseSchemas,
                },
              },
            },
          },
          responses: response({
            type: 'object',
            required: ['accepted'],
            properties: { accepted: { const: true } },
          }),
        },
      },
    },
  };
  const catalog = await createApiCatalog([{ id: 'join-service', spec }]);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map((entry) => entry.key),
  );
  const selected = operations.map((operation) => ({
    callId:
      operation.path === '/records'
        ? 'records'
        : operation.path.startsWith('/consume')
          ? 'consume'
          : operation.path.slice(1),
    operation,
  }));
  const names = Object.fromEntries(
    selected.map((material) => [material.callId, 'Request ' + material.callId]),
  );
  const contracts = Object.fromEntries(
    selected.map((material) => [material.callId, material.operation]),
  );
  const array = createResponseArrayCapability({ materials: selected });
  const scope = {
    id: 'each-record',
    capability: array.name,
    parameters: { sourceNodeId: 'records', pointer: '/records' },
  };
  const scopeSources = createN8nNativeOutputSources({
    nativeNodes: [scope],
    capabilities: [array],
    apiNodeNames: names,
  });
  const join = createItemJoinCapability({
    materials: selected.filter((material) => callIds.includes(material.callId)),
    scopes: scopeSources,
  });
  const reorder = {
    name: 'fixture-branch-order',
    description: 'Regression-only explicit item order and lineage cases.',
    parametersSchema: z.strictObject({ branch: z.enum(callIds) }),
    inputPorts: () => ['main'],
    outputPorts: () => ['main'],
    responseReferences: () => [],
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
    compile: ({ planned, position }) => {
      const branch = planned.parameters.branch;
      const omit =
        (branch === 'beta' &&
          (mode === 'missing' || mode === 'empty-branch')) ||
        (mode === 'both-filtered' && (branch === 'alpha' || branch === 'beta'));
      const filter = omit
        ? mode === 'empty-branch'
          ? '.filter(()=>false)'
          : '.filter((_,i)=>i!==1)'
        : '';
      const transform =
        branch === 'beta'
          ? mode === 'duplicate'
            ? '.flatMap(item=>[item,item])'
            : mode === 'ambiguous'
              ? '.map(item=>({...item,pairedItem:[{item:0},{item:1}]}))'
              : '.reverse()'
          : '';
      const sdk = node({
        type: 'n8n-nodes-base.code',
        version: 2,
        config: {
          id: planned.id,
          name: planned.id,
          position,
          parameters: {
            mode: 'runOnceForAllItems',
            jsCode:
              'return $input.all().map((item,i)=>({json:item.json,pairedItem:{item:i}}))' +
              filter +
              transform +
              ';',
          },
        },
      });
      return {
        nodeId: planned.id,
        nodes: [sdk],
        entry: sdk,
        exit: sdk,
        inputPorts: { main: 0 },
        outputPorts: { main: 0 },
      };
    },
  };
  const nativeNodes = [
    scope,
    ...callIds.map((branch) => ({
      id: 'order-' + branch,
      capability: reorder.name,
      parameters: { branch },
    })),
    {
      id: 'joined',
      capability: join.name,
      parameters: { scopeNodeId: scope.id, sourceCallIds: callIds },
    },
  ];
  const capabilities = [array, join, reorder];
  const nativeSources = createN8nNativeOutputSources({
    nativeNodes,
    capabilities,
    apiNodeNames: names,
  });
  const materials = selected.map((material) => ({
    operation: material.operation,
    arguments: argumentsFor(
      material.callId,
      material.callId === 'records'
        ? []
        : material.callId === 'consume'
          ? [
              binding('/body', 'joined', '/responses'),
              binding('/path/amount', 'each-record', '/item/amount'),
              binding('/query/id', 'alpha', '/item/id'),
            ]
          : [binding('/body', 'each-record', '/item')],
    ),
  }));
  const plan = {
    starts: ['records'],
    gaps: [],
    nativeNodes,
    edges: [
      { from: 'records', output: 'main', to: scope.id, input: 'main' },
      ...callIds.flatMap((callId, i) => [
        { from: scope.id, output: 'main', to: callId, input: 'main' },
        { from: callId, output: 'main', to: 'order-' + callId, input: 'main' },
        {
          from: 'order-' + callId,
          output: 'main',
          to: 'joined',
          input: 'input' + (i + 1),
        },
      ]),
      { from: 'joined', output: 'main', to: 'consume', input: 'main' },
    ],
  };
  const apiNodes = materials.map((material) =>
    createHttpRequestNode({
      ...material,
      baseUrl,
      position: [300, 0],
      apiNodeNames: names,
      apiResponseContracts: contracts,
      nativeOutputSources: nativeSources,
      ...(material.arguments.callId === 'records'
        ? {}
        : { itemMode: 'linked' }),
    }),
  );
  const result = compilePlannedN8nWorkflow({
    id: 'item-join-' + mode + '-' + branchCount,
    name: 'Item ancestry join',
    plan,
    materials,
    apiNodes,
    capabilities,
  });
  return {
    ...result,
    plan,
    materials,
    apiNodes,
    capabilities,
    join,
    scopeSources,
    callIds,
  };
}
