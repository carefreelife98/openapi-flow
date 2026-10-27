import { isDeepStrictEqual } from 'node:util';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeWorkflowConnectionRevision,
  applyWorkflowConnectionRevision,
  validateWorkflowConnectionMaterialRepairRequest,
  validateWorkflowConnectionMaterialRepairReceipt,
  runOpenApiFlowOperation,
  workflowConnectionRejectedProposalSchema,
  validateWorkflowConnectionRevision,
  validateWorkflowConnectionGoalReview,
} from '@openapi-flow/core';
import type {
  PlanWorkflowConnectionRevisionInput,
  PlanWorkflowConnectionRevisionResult,
} from '../../types/workflow-connection-revision.js';
import { createWorkflowConnectionRevisionSchema } from '../../schemas/workflow-connection-revision-schema.js';
import { modelSignalSchema } from '../../schemas/model-signal-schema.js';
import { workflowConnectionRevisionRejectionSchema } from '../../schemas/workflow-connection-revision-rejection-schema.js';
import { workflowConnectionRevisionPrompt } from '../../prompts/workflow-connection-revision-prompt.js';
import { invokeConnectionPlanningModel } from './invoke-connection-planning-model.js';
import {
  validateConnectionProposal,
  WorkflowConnectionPlanningError,
} from './workflow-connection-planning-error.js';
import {
  resolveConnectionGoalSelections,
  resolveConnectionEdgeSelections,
  resolveConnectionEndpointSelections,
} from './resolve-connection-selections.js';

/** One originating-stage decision. The caller owns repetition, material generation, budgets and adoption. */
export async function planWorkflowConnectionRevision(
  input: PlanWorkflowConnectionRevisionInput,
): Promise<PlanWorkflowConnectionRevisionResult> {
  const operation = 'planWorkflowConnectionRevision';
  const {
    description,
    schema,
    rejectedProposals,
    rejectedConnections,
    rejectedGoalReviews,
  } = runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation,
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      modelSignalSchema.parse(input.signal);
      const description = describeWorkflowConnectionRevision(input);
      if (input.rejectedConnections !== undefined) {
        if (!Array.isArray(input.rejectedConnections))
          throw new Error('rejectedConnections must be an array when supplied');
        for (const rejection of input.rejectedConnections) {
          const checked =
            workflowConnectionRejectedProposalSchema.parse(rejection);
          if (
            !isDeepStrictEqual(checked, rejection) ||
            !isDeepStrictEqual(rejection.expected, description.before.expected)
          )
            throw new Error(
              'Rejected connection evidence must belong to the current original session/revision',
            );
        }
      }
      if (input.rejectedGoalReviews !== undefined) {
        if (!Array.isArray(input.rejectedGoalReviews))
          throw new Error('rejectedGoalReviews must be an array when supplied');
        for (const candidate of input.rejectedGoalReviews) {
          validateWorkflowConnectionRevision({
            ...input,
            proposal: candidate.revision.proposal,
            revision: candidate.revision,
          });
          validateWorkflowConnectionGoalReview({
            ...input.after,
            ...candidate.revision.sourceUpdate,
            session: candidate.revision.session,
            review: candidate.review,
          });
          if (candidate.review.accepted)
            throw new Error(
              'Revision rejection history cannot contain an accepted goal review',
            );
        }
      }
      if (input.rejectedProposals !== undefined) {
        if (!Array.isArray(input.rejectedProposals))
          throw new Error('rejectedProposals must be an array when supplied');
        for (const rejection of input.rejectedProposals) {
          const checked =
            workflowConnectionRevisionRejectionSchema.parse(rejection);
          if (
            !isDeepStrictEqual(checked, rejection) ||
            rejection.sourceFingerprint !== description.sourceFingerprint ||
            !isDeepStrictEqual(rejection.expected, description.before.expected)
          )
            throw new Error(
              'Rejected revisions must belong to the unchanged source epochs and original session',
            );
        }
      }
      return {
        description,
        schema: createWorkflowConnectionRevisionSchema(description),
        rejectedProposals:
          input.rejectedProposals === undefined
            ? undefined
            : structuredClone(input.rejectedProposals),
        rejectedConnections:
          input.rejectedConnections === undefined
            ? undefined
            : structuredClone(input.rejectedConnections),
        rejectedGoalReviews:
          input.rejectedGoalReviews === undefined
            ? undefined
            : structuredClone(input.rejectedGoalReviews),
      };
    },
  );
  const checkCurrentInput = (
    output: unknown,
    rejectedOutputError?: WorkflowConnectionPlanningError,
  ): void => {
    validateConnectionProposal(
      {
        operation,
        stage: 'input-validation',
        code: 'PLANNING_INPUT_INVALID',
        output,
        sourceFingerprint: description.sourceFingerprint,
      },
      () => {
        try {
          if (
            !isDeepStrictEqual(
              describeWorkflowConnectionRevision(input),
              description,
            ) ||
            !isDeepStrictEqual(input.rejectedProposals, rejectedProposals) ||
            !isDeepStrictEqual(
              input.rejectedConnections,
              rejectedConnections,
            ) ||
            !isDeepStrictEqual(input.rejectedGoalReviews, rejectedGoalReviews)
          )
            throw new Error(
              'Connection revision source, session or rejection evidence changed during model invocation',
              { cause: rejectedOutputError },
            );
        } catch (error) {
          if (rejectedOutputError !== undefined)
            throw new AggregateError(
              [rejectedOutputError, error],
              'Connection revision input changed while invalid model output was received',
              { cause: error },
            );
          throw error;
        }
      },
    );
  };
  const output = await invokeConnectionPlanningModel({
    model: input.model,
    operation,
    name: 'plan_workflow_connection_revision',
    schema,
    sourceFingerprint: description.sourceFingerprint,
    messages: [
      new SystemMessage(workflowConnectionRevisionPrompt),
      new HumanMessage(
        JSON.stringify({
          ...description,
          ...(rejectedProposals === undefined ? {} : { rejectedProposals }),
          ...(rejectedConnections === undefined ? {} : { rejectedConnections }),
          ...(rejectedGoalReviews === undefined ? {} : { rejectedGoalReviews }),
        }),
      ),
    ],
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  }).catch((error: unknown) => {
    // A malformed model response must not skip the input guard and become retryable after a concurrent edit.
    if (
      error instanceof WorkflowConnectionPlanningError &&
      error.diagnostic.stage === 'model-output'
    )
      checkCurrentInput(error.output, error);
    throw error;
  });
  checkCurrentInput(output);
  return validateConnectionProposal(
    {
      operation,
      stage: 'contract-validation',
      code: 'WORKFLOW_GRAPH_PLANNING_FAILED',
      output,
      sourceFingerprint: description.sourceFingerprint,
    },
    () => {
      if (output.decision.kind === 'replan-materials') {
        validateWorkflowConnectionMaterialRepairRequest({
          ...input,
          request: output.decision,
        });
        const receipt = {
          kind: 'replan-materials' as const,
          expected: {
            before: structuredClone(description.before.expected),
            afterSourceFingerprint: description.after.sourceFingerprint,
            revisionSourceFingerprint: description.sourceFingerprint,
          },
          request: output.decision,
        };
        validateWorkflowConnectionMaterialRepairReceipt({ ...input, receipt });
        return receipt;
      }
      const addEdges = resolveConnectionEdgeSelections(
        output.decision.graphChange.addEdges,
        description.after.context.nodes,
      );
      const revision = applyWorkflowConnectionRevision({
        ...input,
        proposal: {
          goals: resolveConnectionGoalSelections(
            output.decision.goals,
            description.after.context.nodes,
          ),
          graphChange: {
            ...output.decision.graphChange,
            addEdges,
            addTerminals: resolveConnectionEndpointSelections(
              output.decision.graphChange.addTerminals,
              description.after.context.nodes,
            ),
            removeTerminals: resolveConnectionEndpointSelections(
              output.decision.graphChange.removeTerminals,
              description.before.context.nodes,
            ),
          },
        },
      });
      if (
        rejectedGoalReviews?.some(
          (candidate) => candidate.revision.session.id === revision.session.id,
        )
      )
        throw new Error(
          'Connection revision repeats a candidate already rejected by the configured goal review',
        );
      return { kind: 'revised-connections', revision };
    },
  );
}
