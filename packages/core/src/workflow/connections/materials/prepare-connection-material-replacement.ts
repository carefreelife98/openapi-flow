import { isDeepStrictEqual } from 'node:util';
import type {
  ApplyWorkflowConnectionMaterialRepairInput,
  PreparedConnectionMaterialReplacement,
  ValidateWorkflowConnectionSourceRepairRequestInput,
} from '../../../types/workflow-connection-material-repair.js';
import type { WorkflowConnectionSessionSource } from '../../../types/workflow-connection-session.js';
import { runOpenApiFlowOperation } from '../../../errors/run-openapi-flow-operation.js';
import { describeConnectionSessionSource } from '../incremental/describe-connection-session-source.js';
import {
  workflowConnectionSourceRepairRequestSchema,
  workflowConnectionMaterialReplacementSchema,
} from '../../../schemas/workflow-connection-material-repair-schema.js';
import { validateConnectionMaterialRepairTargets } from './validate-connection-material-repair-targets.js';
import { selectWorkflowConnectionArgumentValues } from './select-workflow-connection-argument-values.js';
import { collectDeferredApiInputSlots } from '../../../inputs/collect-deferred-api-input-slots.js';
import { resolveNativePlanningMaterials } from '../../planning/resolve-native-planning-materials.js';

export function validateWorkflowConnectionSourceRepairRequest(
  input: ValidateWorkflowConnectionSourceRepairRequestInput,
): void {
  runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'validateWorkflowConnectionSourceRepairRequest',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      const before = describeConnectionSessionSource(input.source);
      const request = workflowConnectionSourceRepairRequestSchema.parse(
        input.request,
      );
      if (!isDeepStrictEqual(request, input.request))
        throw new Error('Material repair request must not be normalized');
      if (request.sourceFingerprint !== before.fingerprint)
        throw new Error(
          'Material repair belongs to a different source snapshot',
        );
      validateConnectionMaterialRepairTargets(input.source, request.request);
    },
  );
}

/** Build a private, unadopted replacement and derive request slots without fabricating values or approving them. */
export function prepareConnectionMaterialReplacement(
  input: ApplyWorkflowConnectionMaterialRepairInput,
): PreparedConnectionMaterialReplacement {
  const before = describeConnectionSessionSource(input.source);
  const request = workflowConnectionSourceRepairRequestSchema.parse(
    input.request,
  );
  const replacement = workflowConnectionMaterialReplacementSchema.parse(
    input.replacement,
  );
  if (!isDeepStrictEqual(replacement, input.replacement))
    throw new Error(
      'Material replacement must not be transformed or normalized',
    );
  validateWorkflowConnectionSourceRepairRequest({
    source: input.source,
    request,
  });
  const apiTargets = new Set(
    request.request.targets
      .filter((target) => target.stage.startsWith('api-'))
      .map((target) => target.nodeId),
  );
  const nativeTargets = new Set(
    request.request.targets
      .filter((target) => target.stage.startsWith('native-'))
      .map((target) => target.nodeId),
  );
  const apis = new Map(
    replacement.apiArguments.map((args) => [args.callId, args]),
  );
  const natives = new Map(
    replacement.nativeNodes.map((node) => [node.id, node]),
  );
  if (
    apis.size !== replacement.apiArguments.length ||
    natives.size !== replacement.nativeNodes.length ||
    apis.size !== apiTargets.size ||
    natives.size !== nativeTargets.size ||
    [...apiTargets].some((id) => !apis.has(id)) ||
    [...nativeTargets].some((id) => !natives.has(id))
  )
    throw new Error(
      'Material replacement must supply each requested API/native exactly once and no unrelated nodes',
    );
  const snapshot: WorkflowConnectionSessionSource = {
    ...structuredClone({ ...input.source, capabilities: undefined }),
    ...(input.source.capabilities === undefined
      ? {}
      : {
          capabilities: input.source.capabilities.map((capability) => ({
            ...capability,
          })),
        }),
  };
  const source: WorkflowConnectionSessionSource = {
    ...snapshot,
    ...(replacement.deferredApiInputIds === undefined
      ? {}
      : { deferredApiInputIds: [...replacement.deferredApiInputIds] }),
    materials: (snapshot.materials === undefined ? [] : snapshot.materials).map(
      (material) => {
        if (material.status !== 'ready' || !apis.has(material.arguments.callId))
          return material;
        const next = apis.get(material.arguments.callId)!;
        const stages = request.request.targets
          .filter((target) => target.nodeId === next.callId)
          .map((target) => target.stage);
        const original = selectWorkflowConnectionArgumentValues(
          material.arguments,
        );
        const proposed = selectWorkflowConnectionArgumentValues(next);
        if (
          !stages.includes('api-bindings') &&
          !isDeepStrictEqual(original.bindings, proposed.bindings)
        )
          throw new Error(
            `api-arguments repair cannot change bindings: ${next.callId}`,
          );
        if (!stages.includes('api-arguments')) {
          const { bindings: originalBindings, ...oldValues } = original;
          const { bindings: proposedBindings, ...newValues } = proposed;
          void originalBindings;
          void proposedBindings;
          if (!isDeepStrictEqual(oldValues, newValues))
            throw new Error(
              `api-bindings repair cannot change literal or unresolved inputs: ${next.callId}`,
            );
        }
        if (original.requestMediaType !== proposed.requestMediaType)
          throw new Error(
            `Material repair cannot reselect request media type: ${next.callId}`,
          );
        return { ...material, arguments: structuredClone(next) };
      },
    ),
    nativeNodes: (snapshot.nativeNodes === undefined
      ? []
      : snapshot.nativeNodes
    ).map((node) => {
      const next = natives.get(node.id);
      if (next === undefined) return node;
      if (
        next.capability !== node.capability ||
        !isDeepStrictEqual(next.runtimeParameters, node.runtimeParameters)
      )
        throw new Error(
          `Material repair cannot replace a native instance or ownership: ${node.id}`,
        );
      return structuredClone(next);
    }),
  };

  if (replacement.nativeNodes.length) {
    const bound = resolveNativePlanningMaterials({
      capabilities: before.source.input.capabilities,
      nativeNodes: source.nativeNodes === undefined ? [] : source.nativeNodes,
      apiMaterials: before.source.input.materials.map((material) => ({
        callId:
          material.status === 'ready'
            ? material.arguments.callId
            : material.callId,
        operation: material.operation,
        requestMediaType:
          material.status === 'ready'
            ? material.arguments.requestMediaType
            : material.requestMediaType,
        ...(material.purpose === undefined
          ? {}
          : { purpose: material.purpose }),
      })),
      nativeOutputs: [],
    });
    source.capabilities = bound.capabilities;
  }

  const slots = collectDeferredApiInputSlots({
    materials: (source.materials === undefined ? [] : source.materials).flatMap(
      (material) =>
        material.status !== 'ready'
          ? []
          : [
              {
                operation: material.operation,
                callId: material.arguments.callId,
                values: material.arguments.values,
                bindings: material.arguments.bindings,
                requestMediaType: material.arguments.requestMediaType,
                requestedInputs: material.arguments.requestedInputs,
              },
            ],
    ),
  });
  if (replacement.deferredApiInputIds !== undefined) {
    const previous =
      snapshot.deferredApiInputIds === undefined
        ? []
        : snapshot.deferredApiInputIds;
    for (const slot of before.source.context.deferredApiInputs === undefined
      ? []
      : before.source.context.deferredApiInputs)
      if (
        !apiTargets.has(slot.callId) &&
        !replacement.deferredApiInputIds.includes(slot.id)
      )
        throw new Error(
          `Material repair cannot revoke an unrelated API input deferral: ${slot.callId}`,
        );
    for (const id of replacement.deferredApiInputIds) {
      const slot = slots.find((entry) => entry.id === id);
      if (!slot)
        throw new Error(
          `Material replacement deferredApiInputIds contains unknown or stale slot ${id}`,
        );
      if (!apiTargets.has(slot.callId) && !previous.includes(id))
        throw new Error(
          `Material repair cannot authorize an unrelated API input: ${slot.callId}`,
        );
    }
  }
  return {
    source,
    snapshot,
    request,
    replacement,
    beforeFingerprint: before.fingerprint,
    slots,
  };
}
