import type {
  ApplyWorkflowConnectionMaterialRepairInput,
  WorkflowConnectionMaterialRepairInputInspection,
} from '../../../types/workflow-connection-material-repair.js';
import { runOpenApiFlowOperation } from '../../../errors/run-openapi-flow-operation.js';
import { connectionValueFingerprint } from '../incremental/connection-graph-identity.js';
import { prepareConnectionMaterialReplacement } from './prepare-connection-material-replacement.js';

/** Inspect a pending replacement before the host chooses an explicit input policy. Never adopt the pending source. */
export function inspectWorkflowConnectionMaterialRepairInputs(
  input: ApplyWorkflowConnectionMaterialRepairInput,
): WorkflowConnectionMaterialRepairInputInspection {
  return runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'inspectWorkflowConnectionMaterialRepairInputs',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      const prepared = prepareConnectionMaterialReplacement(input);
      const approved =
        prepared.source.deferredApiInputIds === undefined
          ? []
          : prepared.source.deferredApiInputIds;
      const previous =
        prepared.snapshot.deferredApiInputIds === undefined
          ? []
          : prepared.snapshot.deferredApiInputIds;
      const currentIds = new Set(prepared.slots.map((slot) => slot.id));
      return structuredClone({
        sourceFingerprint: prepared.beforeFingerprint,
        replacementFingerprint: connectionValueFingerprint(
          prepared.replacement,
        ),
        slots: prepared.slots,
        retainedDeferredApiInputIds: previous.filter((id) =>
          currentIds.has(id),
        ),
        retiredDeferredApiInputIds: previous.filter(
          (id) => !currentIds.has(id),
        ),
        unapprovedSlots: prepared.slots.filter(
          (slot) => !approved.includes(slot.id),
        ),
      });
    },
  );
}
