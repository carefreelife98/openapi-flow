import type {
  DescribeWorkflowConnectionEvidenceInput,
  WorkflowConnectionEvidence,
} from '../../../types/workflow-connection-evidence.js';
import { describeConnectionSessionSource } from '../incremental/describe-connection-session-source.js';
import { describeWorkflowConnectionConflictMaterials } from '../materials/describe-workflow-connection-conflict-materials.js';
import { connectionValueFingerprint } from '../incremental/connection-graph-identity.js';
import { createApiResponseSchema } from '../../../openapi/response/create-api-response-schema.js';

/** Reuse validated material ownership; never derive execution values from model explanations. */
export function describeWorkflowConnectionEvidence(
  input: DescribeWorkflowConnectionEvidenceInput,
): WorkflowConnectionEvidence[] {
  const description = describeConnectionSessionSource(input.source);
  const nodeIds = description.source.context.nodes.map((node) => node.id);
  const materials =
    nodeIds.length === 0
      ? { apiCalls: [], nativeNodes: [], apiResponseContracts: [] }
      : describeWorkflowConnectionConflictMaterials({
          source: input.source,
          nodeIds,
        });
  const items: Omit<WorkflowConnectionEvidence, 'id'>[] = [
    {
      kind: 'material-inventory',
      value: {
        apiCalls: description.apiOperations,
        nativeNodes: description.source.input.nativeNodes.map((node) => ({
          nodeId: node.id,
          capability: node.capability,
        })),
      },
    },
    ...input.source.requirements.map((fact) => ({
      kind: 'requirement' as const,
      factId: fact.id,
      value: fact,
    })),
    ...description.apiOperations.map((operation) => ({
      kind: 'api-operation' as const,
      nodeId: operation.nodeId,
      value: operation,
    })),
    ...description.source.input.materials.flatMap((material) =>
      material.status !== 'ready'
        ? []
        : [
            {
              kind: 'api-response-contract' as const,
              nodeId: material.arguments.callId,
              value: createApiResponseSchema({ operation: material.operation }),
            },
          ],
    ),
    ...materials.apiCalls.map((material) => {
      const original = input.source.materials?.find(
        (item) =>
          item.status === 'ready' && item.arguments.callId === material.callId,
      );
      if (original?.status !== 'ready')
        throw new Error(
          `Completion evidence is missing current material ${material.callId}`,
        );
      return {
        kind: 'api-arguments' as const,
        nodeId: material.callId,
        value: {
          ...material,
          enumAttribution:
            original.arguments.enumInterpretation === undefined
              ? { status: 'not-supplied' }
              : {
                  status: 'verified-selection',
                  selectedValues:
                    original.arguments.enumInterpretation.analysis.answers.map(
                      (answer) => {
                        const requirement =
                          original.arguments.enumInterpretation!.requirements.find(
                            (item) => item.id === answer.requirementId,
                          );
                        if (!requirement)
                          throw new Error(
                            `Completion enum evidence ${material.callId} has no original requirement`,
                          );
                        return {
                          targetPointer: requirement.targetPointer,
                          value: answer.value,
                        };
                      },
                    ),
                },
          literalAttribution:
            original.arguments.literalSources === undefined
              ? { status: 'not-supplied' }
              : {
                  status: 'verified',
                  targetPointers: original.arguments.literalSources.map(
                    (source) => source.targetPointer,
                  ),
                },
          ...(original.arguments.literalSources === undefined
            ? {}
            : { literalSources: original.arguments.literalSources }),
        },
      };
    }),
    ...materials.nativeNodes.map((material) => ({
      kind: 'native-material' as const,
      nodeId: material.node.id,
      value: material,
    })),
    {
      kind: 'graph',
      value: structuredClone({
        edges: input.graph.edges,
        rootNodeIds: input.graph.rootNodeIds,
        terminals: input.graph.terminals,
      }),
    },
  ];
  return items.map((item) => ({
    ...structuredClone(item),
    id: `evidence-${connectionValueFingerprint(item)}`,
  }));
}
