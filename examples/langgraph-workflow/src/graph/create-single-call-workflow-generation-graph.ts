import type { GraphDependencies } from '../types/workflow-graph.js';
import { createDagWorkflowGenerationGraph } from './create-dag-workflow-generation-graph.js';

export function createWorkflowGenerationGraph(dependencies: GraphDependencies) {
  return createDagWorkflowGenerationGraph({
    ...dependencies,
    reviewSelection(selection) {
      if (selection.operations.length !== 1)
        throw new Error(
          'Single-call example requires exactly one selected API; multi-call scenarios need an explicit host-owned DAG',
        );
    },
    composeDag(requests) {
      const request = requests[0];
      if (!request)
        throw new Error('Single-call composition requires a request');
      return {
        nodes: [request.fragment],
        edges: [],
        starts: [request.fragment.nodeId],
      };
    },
  });
}
