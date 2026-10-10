import {
  compileBatchedN8nWorkflow,
  createPassThroughCapability,
  createResponseCollectionCapability,
} from '@openapi-flow/n8n';
import { createItemJoinFixture } from './item-join-fixture.mjs';

export async function createBatchItemJoinInput(
  baseUrl,
  mode,
  branchCount,
  batchSize,
) {
  const fixture = await createItemJoinFixture(baseUrl, mode, branchCount);
  const entry = {
    id: 'batch-entry',
    capability: 'pass-through',
    parameters: {},
  };
  const collection = {
    id: 'batch-results',
    capability: 'collect-api-responses',
    parameters: { sourceNodeId: 'alpha', pointer: '/item' },
  };
  const capabilities = [
    ...fixture.capabilities,
    createPassThroughCapability(),
    createResponseCollectionCapability({
      materials: fixture.materials.map((material) => ({
        callId: material.arguments.callId,
        operation: material.operation,
      })),
    }),
  ];
  const plan = {
    ...fixture.plan,
    nativeNodes: [...fixture.plan.nativeNodes, entry, collection],
    edges: [
      ...fixture.plan.edges.filter(
        (edge) =>
          !(edge.from === 'each-record' && fixture.callIds.includes(edge.to)),
      ),
      { from: 'each-record', output: 'main', to: entry.id, input: 'main' },
      ...fixture.callIds.map((callId) => ({
        from: entry.id,
        output: 'main',
        to: callId,
        input: 'main',
      })),
      { from: 'consume', output: 'main', to: collection.id, input: 'main' },
    ],
  };
  return {
    id: 'batch-item-join-' + mode + '-' + branchCount + '-' + batchSize,
    name: 'Batch item ancestry join',
    plan,
    materials: fixture.materials,
    apiNodes: fixture.apiNodes,
    capabilities,
    batchScopes: [
      {
        id: 'process-branch-batches',
        batchSize,
        nodeIds: [
          entry.id,
          ...fixture.callIds.flatMap((id) => [id, 'order-' + id]),
          'joined',
          'consume',
        ],
        entryNodeId: entry.id,
        exitNodeId: 'consume',
      },
    ],
  };
}
export async function compileBatchItemJoin(
  baseUrl,
  mode,
  branchCount,
  batchSize,
) {
  return compileBatchedN8nWorkflow(
    await createBatchItemJoinInput(baseUrl, mode, branchCount, batchSize),
  );
}
