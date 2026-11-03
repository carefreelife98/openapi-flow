import { deriveWorkflowConnectionRegionPatch } from '@openapi-flow/core';
import type {
  WorkflowConnectionRegionContext,
  WorkflowConnectionPatch,
} from '@openapi-flow/core';
import type { WorkflowConnectionRegionSelection } from '../../types/incremental-connection-planning.js';
import { resolveConnectionPortSelection } from './resolve-connection-port-selection.js';

export function resolveWorkflowConnectionRegionSelection(
  description: WorkflowConnectionRegionContext,
  region: WorkflowConnectionRegionSelection,
): WorkflowConnectionPatch {
  return deriveWorkflowConnectionRegionPatch({
    description,
    region: {
      kind: region.kind,
      factIds: region.factIds,
      reason: region.reason,
      nodes: region.nodes.map((node) => {
        const contract = description.context.nodes.find(
          (contract) => contract.id === node.nodeId,
        );
        if (
          !contract &&
          description.retiredNodes?.some(
            (retired) => retired.id === node.nodeId,
          )
        ) {
          if (
            node.incoming.length ||
            node.root ||
            !('finishOutputs' in node) ||
            node.finishOutputs.length
          )
            throw new Error(
              'Retired connection region nodes require explicit empty boundaries',
            );
          return {
            nodeId: node.nodeId,
            incoming: [],
            root: false,
            terminalOutputs: [],
          };
        }
        if (!contract)
          throw new Error(
            'Connection region.nodes names unknown target ' + node.nodeId,
          );
        const terminalOutputs =
          'finish' in node
            ? node.finish
              ? [
                  resolveConnectionPortSelection(
                    { nodeId: node.nodeId },
                    description.context.nodes,
                    'outputs',
                  ),
                ]
              : []
            : node.finishOutputs;
        return {
          nodeId: node.nodeId,
          root: node.root,
          terminalOutputs,
          incoming: node.incoming.map((edge) => ({
            from: edge.source.nodeId,
            output: resolveConnectionPortSelection(
              edge.source,
              description.context.nodes,
              'outputs',
            ),
            input: resolveConnectionPortSelection(
              {
                nodeId: node.nodeId,
                ...(edge.input === undefined ? {} : { port: edge.input }),
              },
              description.context.nodes,
              'inputs',
            ),
          })),
        };
      }),
    },
  });
}
