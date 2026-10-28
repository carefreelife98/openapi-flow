import { isDeepStrictEqual } from 'node:util';
import type {
  CreateWorkflowConnectionMaterialRevisionRequestInput,
  ValidateWorkflowConnectionMaterialRevisionRequestInput,
  WorkflowConnectionSourceRepairRequest,
} from '../../../types/workflow-connection-material-repair.js';
import { workflowConnectionMaterialRepairRequestSchema } from '../../../schemas/workflow-connection-material-repair-request-schema.js';
import { workflowConnectionStepExpectationSchema } from '../../../schemas/workflow-connection-session-schema.js';
import { runOpenApiFlowOperation } from '../../../errors/run-openapi-flow-operation.js';
import { validateWorkflowConnectionSession } from '../incremental/validate-workflow-connection-session.js';
import { validateWorkflowConnectionSourceRepairRequest } from './prepare-connection-material-replacement.js';
import { describeConnectionMaterialRepairStages } from './describe-connection-material-repair-stages.js';

/** Request originating-stage planning against the original current source. No material or graph is adopted. */
export function createWorkflowConnectionMaterialRevisionRequest(
  input: CreateWorkflowConnectionMaterialRevisionRequestInput,
): WorkflowConnectionSourceRepairRequest {
  return runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'createWorkflowConnectionMaterialRevisionRequest',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      const current = validateWorkflowConnectionSession(input);
      const expected = workflowConnectionStepExpectationSchema.parse(
        input.expected,
      );
      if (
        expected.sessionId !== input.session.id ||
        expected.sourceFingerprint !== input.session.sourceFingerprint ||
        expected.revision !== input.session.revision
      )
        throw new Error(
          'Material revision request is stale: expected.sessionId, expected.sourceFingerprint and expected.revision must match the current session',
        );
      const decision = workflowConnectionMaterialRepairRequestSchema.parse(
        input.decision,
      );
      if (!isDeepStrictEqual(decision, input.decision))
        throw new Error('Material revision decision must not be normalized');
      const request: WorkflowConnectionSourceRepairRequest = {
        kind: 'replan-materials',
        sourceFingerprint: expected.sourceFingerprint,
        request: structuredClone(decision),
      };
      validateWorkflowConnectionSourceRepairRequest({ source: input, request });
      const stages = describeConnectionMaterialRepairStages(
        current.source.input,
      );
      for (const target of decision.targets)
        if (
          !stages.some(
            (stage) =>
              stage.stage === target.stage &&
              stage.nodeIds.includes(target.nodeId),
          )
        )
          throw new Error(
            `Material revision target is not currently eligible: ${target.stage}: ${target.nodeId}`,
          );
      return request;
    },
  );
}

/** Revalidate at the host boundary against the original decision and current accepted session. */
export function validateWorkflowConnectionMaterialRevisionRequest(
  input: ValidateWorkflowConnectionMaterialRevisionRequestInput,
): void {
  runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'validateWorkflowConnectionMaterialRevisionRequest',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      const original = createWorkflowConnectionMaterialRevisionRequest(input);
      validateWorkflowConnectionSourceRepairRequest({
        source: input,
        request: input.request,
      });
      const targets = new Set(
        original.request.targets.map((target) =>
          JSON.stringify([target.stage, target.nodeId]),
        ),
      );
      if (
        input.request.request.targets.length !== targets.size ||
        input.request.request.targets.some(
          (target) =>
            !targets.has(JSON.stringify([target.stage, target.nodeId])),
        )
      )
        throw new Error(
          'Material revision request targets differ from the original decision',
        );
      // factIds/reason describe the request for the UI; they do not prove semantic coverage or require text equality.
    },
  );
}
