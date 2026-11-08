import {
  createN8nNativeCapabilities,
  createN8nWorkflowProgramControls,
  createPassThroughCapability,
} from '@openapi-flow/n8n';

export const executionProgramNode = (nodeId) => ({ kind: 'node', nodeId });
export function executionProgramBranchFixture() {
  const scenario =
    'Compare the declared condition, execute exactly its selected path and then continue. Other work is independent.';
  return {
    scenario,
    materials: [],
    gaps: [],
    edges: [],
    requirements: [
      {
        id: 'intent',
        text: scenario,
        sources: [{ kind: 'message', messageId: 'request', quote: scenario }],
      },
    ],
    literalSourceMessages: [{ id: 'request', text: scenario }],
    capabilities: [
      ...createN8nNativeCapabilities(),
      createPassThroughCapability(),
    ],
    controls: createN8nWorkflowProgramControls(),
    limits: { maxBlocks: 100, maxDepth: 20 },
    nativeNodes: [
      ...['seed', 'yes', 'no', 'other', 'done'].map((id) => ({
        id,
        capability: 'pass-through',
        parameters: {},
      })),
      {
        id: 'condition',
        capability: 'if',
        parameters: {
          combinator: 'and',
          conditions: [
            {
              left: { source: 'literal', value: true },
              operator: 'equals',
              right: { source: 'literal', value: true },
            },
          ],
        },
      },
    ],
  };
}
export function executionProgramBranch() {
  return {
    kind: 'branch',
    nodeId: 'condition',
    paths: [
      { output: 'true', body: executionProgramNode('yes') },
      { output: 'false', body: executionProgramNode('no') },
    ],
  };
}
