import { isDeepStrictEqual } from 'node:util';
import type {
  ApplyWorkflowConnectionMaterialRepairInput,
  WorkflowConnectionMaterialRepairWork,
  WorkflowConnectionApiArgumentRepairTask,
} from '../../../types/workflow-connection-material-repair.js';
import type { WorkflowConnectionMaterialRepairTarget } from '../../../types/workflow-connection-revision.js';
import { describeApiLiteralGeneration } from '../../../arguments/generation/describe-api-literal-generation.js';
import { runOpenApiFlowOperation } from '../../../errors/run-openapi-flow-operation.js';
import { connectionValueFingerprint } from '../incremental/connection-graph-identity.js';
import { prepareConnectionMaterialReplacement } from './prepare-connection-material-replacement.js';
import { validateApiBindingAssignments } from '../../../bindings/validate-api-binding-assignments.js';
import { createNativeOutputContracts } from '../../create-native-output-contracts.js';

/** Describe dependent request work after actual binding results; never invoke a planner or adopt the replacement. */
export function describeWorkflowConnectionMaterialRepairWork(
  input: ApplyWorkflowConnectionMaterialRepairInput,
): WorkflowConnectionMaterialRepairWork {
  return runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'describeWorkflowConnectionMaterialRepairWork',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      const prepared = prepareConnectionMaterialReplacement(input);
      const materials =
        prepared.source.materials === undefined
          ? []
          : prepared.source.materials;
      validateApiBindingAssignments({
        materials: materials.map((material) => ({
          operation: material.operation,
          callId:
            material.status === 'ready'
              ? material.arguments.callId
              : material.callId,
          requestMediaType:
            material.status === 'ready'
              ? material.arguments.requestMediaType
              : material.requestMediaType,
        })),
        calls: materials.map((material) => ({
          callId:
            material.status === 'ready'
              ? material.arguments.callId
              : material.callId,
          bindings:
            material.status === 'ready'
              ? material.arguments.bindings
              : material.bindings,
        })),
        nativeOutputs: createNativeOutputContracts({
          nativeNodes:
            prepared.source.nativeNodes === undefined
              ? []
              : prepared.source.nativeNodes,
          capabilities:
            prepared.source.capabilities === undefined
              ? []
              : prepared.source.capabilities,
        }),
      });
      const targets: WorkflowConnectionMaterialRepairTarget[] = structuredClone(
        prepared.request.request.targets,
      );
      const tasks: WorkflowConnectionApiArgumentRepairTask[] = [];
      for (const replacement of prepared.replacement.apiArguments) {
        const before = prepared.snapshot.materials?.find(
          (material) =>
            material.status === 'ready' &&
            material.arguments.callId === replacement.callId,
        );
        if (!before || before.status !== 'ready')
          throw new Error(
            `Material work is missing its original API: ${replacement.callId}`,
          );
        const explicit = targets.some(
          (target) =>
            target.stage === 'api-arguments' &&
            target.nodeId === replacement.callId,
        );
        const bindingsChanged = !isDeepStrictEqual(
          before.arguments.bindings,
          replacement.bindings,
        );
        const releasedInput =
          bindingsChanged &&
          before.arguments.bindings.some(
            (binding) =>
              !replacement.bindings.some(
                (next) =>
                  next.targetPointer === binding.targetPointer ||
                  binding.targetPointer.startsWith(next.targetPointer + '/'),
              ),
          );
        if (!explicit && !releasedInput) continue;
        const generation = describeApiLiteralGeneration({
          callId: replacement.callId,
          scenario: prepared.snapshot.scenario,
          operation: before.operation,
          bindings: replacement.bindings,
          ...(before.purpose === undefined ? {} : { purpose: before.purpose }),
          ...(replacement.requestMediaType === undefined
            ? {}
            : { requestMediaType: replacement.requestMediaType }),
        });
        if (!generation.contract.hasLiteralInputs) continue;
        if (!explicit)
          targets.push({ stage: 'api-arguments', nodeId: replacement.callId });
        tasks.push({
          input: generation.input,
          literalInputSchema: generation.contract.literalInputSchema,
        });
      }
      return {
        originalRequest: structuredClone(prepared.request),
        request: {
          ...structuredClone(prepared.request),
          request: { ...structuredClone(prepared.request.request), targets },
        },
        replacementFingerprint: connectionValueFingerprint(
          prepared.replacement,
        ),
        apiArgumentTasks: tasks,
      };
    },
  );
}
