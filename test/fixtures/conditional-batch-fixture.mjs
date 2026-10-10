import {
  compileBatchedN8nWorkflow,
  createExclusiveBranchMergeCapability,
  createPassThroughCapability,
} from '@openapi-flow/n8n';
import { createBatchIterationInput } from './batch-iteration-fixture.mjs';

export function createConditionalBatchInput(
  size,
  baseUrl = 'https://fixture.test',
  threshold = 3,
) {
  const input = createBatchIterationInput(size, baseUrl);
  input.id = 'conditional-batch-' + size + '-' + threshold;
  input.name = 'Conditional batch with explicit skip path';
  input.capabilities = [
    ...input.capabilities,
    createPassThroughCapability(),
    createExclusiveBranchMergeCapability(),
  ];
  input.plan.nativeNodes.push(
    {
      id: 'eligible',
      capability: 'if',
      parameters: {
        combinator: 'and',
        conditions: [
          {
            left: {
              source: 'response',
              nodeId: 'details',
              pointer: '/input/amount',
            },
            operator: 'greaterThan',
            right: { source: 'literal', value: threshold },
          },
        ],
      },
    },
    { id: 'skip-business-call', capability: 'pass-through', parameters: {} },
    {
      id: 'returned-items',
      capability: 'rejoin-exclusive-branches',
      parameters: { sourceNodeId: 'eligible' },
    },
  );
  const collection = input.plan.nativeNodes.find(
    (item) => item.id === 'collected-results',
  );
  collection.parameters = { sourceNodeId: 'details', pointer: '/input' };
  input.plan.edges = input.plan.edges.filter(
    (edge) =>
      !(edge.from === 'details' && edge.to === 'confirm') &&
      !(edge.from === 'verify-item' && edge.to === 'collected-results'),
  );
  input.plan.edges.push(
    { from: 'details', output: 'main', to: 'eligible', input: 'main' },
    { from: 'eligible', output: 'true', to: 'confirm', input: 'main' },
    {
      from: 'eligible',
      output: 'false',
      to: 'skip-business-call',
      input: 'main',
    },
    {
      from: 'verify-item',
      output: 'main',
      to: 'returned-items',
      input: 'input1',
    },
    {
      from: 'skip-business-call',
      output: 'main',
      to: 'returned-items',
      input: 'input2',
    },
    {
      from: 'returned-items',
      output: 'main',
      to: 'collected-results',
      input: 'main',
    },
  );
  input.batchScopes[0].nodeIds.push(
    'eligible',
    'skip-business-call',
    'returned-items',
  );
  input.batchScopes[0].exitNodeId = 'returned-items';
  return input;
}
export function compileConditionalBatch(size, baseUrl, threshold) {
  return compileBatchedN8nWorkflow(
    createConditionalBatchInput(size, baseUrl, threshold),
  );
}
