import { createHash } from 'node:crypto';
import {
  describeWorkflowConnectionStep,
  describeWorkflowConnectionOutline,
  runOpenApiFlowOperation,
} from '@openapi-flow/core';
import type {
  WorkflowConnectionOutlineRequestInput,
  WorkflowConnectionOutlineRequestDescription,
} from '../../types/workflow-connection-outline.js';

/** Replanning feedback belongs to this exact session revision and grouping hypothesis. */
export function describeWorkflowConnectionOutlineRequest(
  input: WorkflowConnectionOutlineRequestInput,
): WorkflowConnectionOutlineRequestDescription {
  return runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation: 'describeWorkflowConnectionOutlineRequest',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      const description = describeWorkflowConnectionStep(input);
      if (input.previousOutline !== undefined)
        describeWorkflowConnectionOutline({
          ...input,
          outline: input.previousOutline,
        });
      const context = {
        description,
        ...(input.previousOutline === undefined
          ? {}
          : { previousOutline: structuredClone(input.previousOutline) }),
      };
      return {
        ...context,
        requestFingerprint: createHash('sha256')
          .update(JSON.stringify(context))
          .digest('hex'),
      };
    },
  );
}
