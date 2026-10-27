import type {
  PreparedConnectionNativeRepair,
  WorkflowConnectionNativeRepairInput,
} from '../../../../types/workflow-connection-native-repair.js';
import { validateWorkflowConnectionSourceRepairRequest } from '../prepare-connection-material-replacement.js';
import { describeConnectionSessionSource } from '../../incremental/describe-connection-session-source.js';
import { connectionValueFingerprint } from '../../incremental/connection-graph-identity.js';

export function prepareConnectionNativeRepair(
  input: WorkflowConnectionNativeRepairInput,
): PreparedConnectionNativeRepair {
  validateWorkflowConnectionSourceRepairRequest(input);
  if (
    input.includeExplanations !== undefined &&
    typeof input.includeExplanations !== 'boolean'
  )
    throw new Error('Native repair includeExplanations must be a boolean');
  const description = describeConnectionSessionSource(input.source);
  return {
    description,
    context: structuredClone({
      fingerprint: connectionValueFingerprint({
        request: input.request,
        includeExplanations: input.includeExplanations === true,
      }),
      sourceFingerprint: description.fingerprint,
      scenario: description.source.input.scenario,
      reason: input.request.request.reason,
      requirements: input.source.requirements.filter((fact) =>
        input.request.request.factIds.includes(fact.id),
      ),
      apiMaterials: description.source.input.materials.map((material) => ({
        nodeId:
          material.status === 'ready'
            ? material.arguments.callId
            : material.callId,
        key: material.operation.key,
        method: material.operation.method,
        path: material.operation.path,
        responses: material.operation.operation.responses,
        ...(material.operation.operation.summary === undefined
          ? {}
          : { summary: material.operation.operation.summary }),
        ...(material.operation.operation.description === undefined
          ? {}
          : { description: material.operation.operation.description }),
        ...(material.purpose === undefined
          ? {}
          : { purpose: material.purpose }),
      })),
      nativeNodes: description.source.input.nativeNodes,
      outputs: description.source.sources.nativeOutputs,
    }),
  };
}
