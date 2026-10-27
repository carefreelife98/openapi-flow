import type {
  DescribeWorkflowConnectionConflictMaterialsInput,
  WorkflowConnectionConflictMaterials,
} from '../../../types/workflow-connection-material-repair.js';
import { describeConnectionSessionSource } from '../incremental/describe-connection-session-source.js';
import { createApiRequestSchema } from '../../../schemas/create-api-request-schema.js';
import { runOpenApiFlowOperation } from '../../../errors/run-openapi-flow-operation.js';
import { selectWorkflowConnectionArgumentValues } from './select-workflow-connection-argument-values.js';

/** Code-owned conflict participants and transitive producers, not arbitrary top-K candidates or full OAS copies. */
export function describeWorkflowConnectionConflictMaterials(
  input: DescribeWorkflowConnectionConflictMaterialsInput,
): WorkflowConnectionConflictMaterials {
  return runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'describeWorkflowConnectionConflictMaterials',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      const { source } = describeConnectionSessionSource(input.source);
      const nodes = new Map(
        source.context.nodes.map((node) => [node.id, node]),
      );
      if (
        !Array.isArray(input.nodeIds) ||
        !input.nodeIds.length ||
        new Set(input.nodeIds).size !== input.nodeIds.length ||
        input.nodeIds.some((id) => !nodes.has(id))
      )
        throw new Error(
          'Conflict nodeIds must name distinct actual supplied nodes',
        );
      const relevant = new Set(input.nodeIds);
      const pending = [...relevant];
      for (const id of pending) {
        const node = nodes.get(id)!;
        for (const producer of [
          ...node.references.map((reference) => reference.nodeId),
          ...Object.values(node.inputReferences ?? {})
            .flat()
            .map((reference) => reference.nodeId),
          ...node.dependencyNodeIds,
        ]) {
          if (!nodes.has(producer))
            throw new Error(`Unknown conflict material producer: ${producer}`);
          if (!relevant.has(producer)) {
            relevant.add(producer);
            pending.push(producer);
          }
        }
      }
      const apiMaterials = source.input.materials.filter(
        (material) =>
          material.status === 'ready' &&
          relevant.has(material.arguments.callId),
      );
      return {
        apiCalls: apiMaterials.flatMap((material) =>
          material.status !== 'ready'
            ? []
            : [
                {
                  callId: material.arguments.callId,
                  arguments: selectWorkflowConnectionArgumentValues(
                    material.arguments,
                  ),
                  requestSchema: createApiRequestSchema({
                    operation: material.operation,
                    requestMediaType: material.arguments.requestMediaType,
                  }),
                },
              ],
        ),
        nativeNodes: source.input.nativeNodes
          .filter((node) => relevant.has(node.id))
          .map((node) => {
            const definition = source.sources.capabilities.find(
              (item) => item.name === node.capability,
            );
            if (!definition)
              throw new Error(
                `Conflict native definition is absent: ${node.id}`,
              );
            const output = source.sources.nativeOutputs.find(
              (item) => item.nodeId === node.id,
            );
            return structuredClone({
              node,
              definition,
              output: output === undefined ? null : output,
            });
          }),
        apiResponseContracts: apiMaterials.flatMap((material) =>
          material.status !== 'ready'
            ? []
            : [
                structuredClone({
                  nodeId: material.arguments.callId,
                  key: material.operation.key,
                  method: material.operation.method,
                  path: material.operation.path,
                  responses: material.operation.operation.responses,
                }),
              ],
        ),
      };
    },
  );
}
