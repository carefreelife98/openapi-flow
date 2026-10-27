import { isDeepStrictEqual } from 'node:util';
import { runOpenApiFlowOperation } from '../../../errors/run-openapi-flow-operation.js';
import type {
  ValidateWorkflowConnectionMaterialRepairInput,
  ValidateWorkflowConnectionMaterialRepairReceiptInput,
} from '../../../types/workflow-connection-revision.js';
import {
  workflowConnectionMaterialRepairRequestSchema,
  workflowConnectionMaterialRepairReceiptSchema,
} from '../../../schemas/workflow-connection-revision-schema.js';
import { describeWorkflowConnectionRevision } from './describe-workflow-connection-revision.js';
import { validateConnectionMaterialRepairTargets } from '../materials/validate-connection-material-repair-targets.js';

/** Requesting an originating stage never changes material, goals or the user's requirements. */
export function validateWorkflowConnectionMaterialRepairRequest(
  input: ValidateWorkflowConnectionMaterialRepairInput,
): void {
  runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'validateWorkflowConnectionMaterialRepairRequest',
      stage: 'contract-validation',
      code: 'WORKFLOW_GRAPH_PLANNING_FAILED',
    },
    () => {
      const description = describeWorkflowConnectionRevision(input);
      const request = workflowConnectionMaterialRepairRequestSchema.parse(
        input.request,
      );
      void description;
      validateConnectionMaterialRepairTargets(
        { ...input.after, edges: [], editableEdgeIds: undefined },
        request,
      );
    },
  );
}

export function validateWorkflowConnectionMaterialRepairReceipt(
  input: ValidateWorkflowConnectionMaterialRepairReceiptInput,
): void {
  runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'validateWorkflowConnectionMaterialRepairReceipt',
      stage: 'contract-validation',
      code: 'WORKFLOW_GRAPH_PLANNING_FAILED',
    },
    () => {
      const receipt = workflowConnectionMaterialRepairReceiptSchema.parse(
        input.receipt,
      );
      const description = describeWorkflowConnectionRevision(input);
      if (
        !isDeepStrictEqual(receipt.expected, {
          before: description.before.expected,
          afterSourceFingerprint: description.after.sourceFingerprint,
          revisionSourceFingerprint: description.sourceFingerprint,
        })
      )
        throw new Error(
          'Material repair receipt belongs to a different session, revision or replacement source',
        );
      validateWorkflowConnectionMaterialRepairRequest({
        ...input,
        request: receipt.request,
      });
    },
  );
}
