import { isDeepStrictEqual } from 'node:util';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  createWorkflowConnectionOutline,
  runOpenApiFlowOperation,
} from '@openapi-flow/core';
import type { WorkflowConnectionOutline } from '@openapi-flow/core';
import type { PlanWorkflowConnectionOutlineInput } from '../../types/workflow-connection-outline.js';
import { createWorkflowConnectionOutlineSchema } from '../../schemas/workflow-connection-outline-schema.js';
import { workflowConnectionOutlinePrompt } from '../../prompts/workflow-connection-outline-prompt.js';
import { modelSignalSchema } from '../../schemas/model-signal-schema.js';
import { workflowConnectionOutlineRejectionSchema } from '../../schemas/workflow-connection-outline-rejection-schema.js';
import { describeWorkflowConnectionOutlineRequest } from './describe-workflow-connection-outline-request.js';
import { invokeConnectionPlanningModel } from './invoke-connection-planning-model.js';
import {
  validateConnectionProposal,
  WorkflowConnectionPlanningError,
} from './workflow-connection-planning-error.js';

/** One outline proposal; the host owns selection, retry, checkpoints and adoption. */
export async function planWorkflowConnectionOutline(
  input: PlanWorkflowConnectionOutlineInput,
): Promise<WorkflowConnectionOutline> {
  const operation = 'planWorkflowConnectionOutline';
  const { description, previousOutline, requestFingerprint, rejectedSnapshot } =
    runOpenApiFlowOperation(
      {
        owner: 'langchain',
        operation,
        stage: 'input-validation',
        code: 'PLANNING_INPUT_INVALID',
      },
      () => {
        modelSignalSchema.parse(input.signal);
        const request = describeWorkflowConnectionOutlineRequest(input);
        if (input.rejectedProposals !== undefined) {
          if (!Array.isArray(input.rejectedProposals))
            throw new Error(
              'Outline rejectedProposals must be an array when supplied',
            );
          for (const rejection of input.rejectedProposals) {
            const parsed =
              workflowConnectionOutlineRejectionSchema.parse(rejection);
            if (
              !isDeepStrictEqual(parsed, rejection) ||
              parsed.requestFingerprint !== request.requestFingerprint ||
              !isDeepStrictEqual(parsed.expected, request.description.expected)
            )
              throw new Error(
                'Outline feedback must belong to this exact source, session, goals, revision and previous outline',
              );
          }
        }
        return {
          ...request,
          rejectedSnapshot:
            input.rejectedProposals === undefined
              ? undefined
              : structuredClone(input.rejectedProposals),
        };
      },
    );
  const checkCurrent = (
    output: unknown,
    originalFailure?: WorkflowConnectionPlanningError,
  ): void =>
    validateConnectionProposal(
      {
        operation,
        stage: 'input-validation',
        code: 'PLANNING_INPUT_INVALID',
        output,
        sourceFingerprint: description.expected.sourceFingerprint,
        requestFingerprint,
      },
      () => {
        try {
          if (
            !isDeepStrictEqual(
              describeWorkflowConnectionOutlineRequest(input)
                .requestFingerprint,
              requestFingerprint,
            ) ||
            !isDeepStrictEqual(input.rejectedProposals, rejectedSnapshot)
          )
            throw new Error(
              'Outline source, session, previous outline or feedback changed during model invocation',
            );
        } catch (error) {
          if (originalFailure !== undefined)
            throw new AggregateError(
              [originalFailure, error],
              'Outline input changed while an invalid output was received',
              { cause: error },
            );
          throw error;
        }
      },
    );
  const output = await invokeConnectionPlanningModel({
    model: input.model,
    operation,
    name: 'plan_workflow_connection_outline',
    schema: createWorkflowConnectionOutlineSchema(description),
    sourceFingerprint: description.expected.sourceFingerprint,
    requestFingerprint,
    messages: [
      new SystemMessage(workflowConnectionOutlinePrompt),
      new HumanMessage(
        JSON.stringify({
          ...description,
          ...(previousOutline === undefined ? {} : { previousOutline }),
          ...(rejectedSnapshot === undefined
            ? {}
            : { rejectedProposals: rejectedSnapshot }),
        }),
      ),
    ],
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  }).catch((error: unknown) => {
    if (
      error instanceof WorkflowConnectionPlanningError &&
      error.diagnostic.stage === 'model-output'
    )
      checkCurrent(error.output, error);
    throw error;
  });
  checkCurrent(output);
  return validateConnectionProposal(
    {
      operation,
      stage: 'contract-validation',
      code: 'WORKFLOW_GRAPH_PLANNING_FAILED',
      output,
      sourceFingerprint: description.expected.sourceFingerprint,
      requestFingerprint,
    },
    () => createWorkflowConnectionOutline({ ...input, proposal: output }),
  );
}
