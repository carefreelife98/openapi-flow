import { z } from 'zod';
import {
  createJsonOutputCapability,
  createNativeArrayCapability,
  createN8nNativeCapabilities,
  createN8nNativeOutputSources,
  createPassThroughCapability,
  compilePlannedN8nWorkflow,
} from '@openapi-flow/n8n';
import { nativeComparisonFixture } from './native-comparison-fixture.mjs';

/** Public compilers only. Runtime faults are injected by the engine harness after compilation. */
export function compileNativeComparisonWorkflow({
  splitItems,
  linked,
  empty,
  reverseItems,
  optionalPointer,
  assertionFailure,
}) {
  for (const flag of [
    splitItems,
    linked,
    empty,
    reverseItems,
    optionalPointer,
    assertionFailure,
  ])
    if (typeof flag !== 'boolean')
      throw new Error('Comparison fixture flags must be explicit booleans');
  const f = nativeComparisonFixture();
  if (reverseItems) f.rows.reverse();
  const value = splitItems
    ? { rows: empty ? [] : f.rows.map((row) => row.item), marker: 'original' }
    : f.rows[0];
  const producer = createJsonOutputCapability({
    name: 'typed-comparison-source',
    description: 'Explicit original typed synthetic rows',
    parametersSchema: splitItems
      ? z.strictObject({
          rows: z.array(f.rowSchema),
          marker: z.literal('original'),
        })
      : f.schema,
  });
  const context = {
    id: splitItems ? 'context' : f.source.nodeId,
    capability: producer.name,
    parameters: value,
  };
  const nativeNodes = [context];
  const capabilities = [
    producer,
    ...createN8nNativeCapabilities(linked ? { itemMode: 'linked' } : {}),
    createPassThroughCapability(),
  ];
  const edges = [];
  if (splitItems) {
    const sources = createN8nNativeOutputSources({
      nativeNodes,
      capabilities,
      apiNodeNames: {},
    });
    const array = createNativeArrayCapability({ sources, itemMode: 'linked' });
    capabilities.push(array);
    nativeNodes.push({
      id: f.source.nodeId,
      capability: array.name,
      parameters: { sourceNodeId: context.id, pointer: '/rows' },
    });
    edges.push({
      from: context.id,
      output: 'main',
      to: f.source.nodeId,
      input: 'main',
    });
  }
  const condition = optionalPointer
    ? {
        ...f.check,
        left: { ...f.check.left, pointer: '/item/optional' },
        operator: 'equals',
        right: { source: 'literal', value: '' },
      }
    : f.check;
  const gate = {
    id: 'gate',
    capability: 'if',
    parameters: { combinator: 'and', conditions: [condition] },
  };
  const assertion = {
    id: 'assert-original',
    capability: 'assert-responses',
    parameters: {
      checks: [
        {
          left: { ...f.check.left, pointer: '/item/enabled' },
          operator: 'equals',
          right: { source: 'literal', value: assertionFailure },
          message: 'Original boolean must be false',
        },
      ],
    },
  };
  nativeNodes.push(gate, assertion, {
    id: 'other-items',
    capability: 'pass-through',
    parameters: {},
  });
  edges.push(
    { from: f.source.nodeId, output: 'main', to: gate.id, input: 'main' },
    { from: gate.id, output: 'true', to: assertion.id, input: 'main' },
    { from: gate.id, output: 'false', to: 'other-items', input: 'main' },
  );
  const workflow = compilePlannedN8nWorkflow({
    id: 'native-comparison',
    name: 'Original native values through official IF',
    materials: [],
    apiNodes: [],
    capabilities,
    plan: { nativeNodes, starts: [context.id], gaps: [], edges },
  }).workflow;
  return {
    workflow,
    rows: splitItems ? value.rows.map((item) => ({ item })) : [value],
  };
}
