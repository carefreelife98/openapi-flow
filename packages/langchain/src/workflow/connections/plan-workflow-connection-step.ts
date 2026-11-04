import { randomUUID } from 'node:crypto';
import { createWorkflowConnectionProposalAttempt } from './create-workflow-connection-proposal-attempt.js';
import { isDeepStrictEqual } from 'node:util';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  deriveWorkflowConnectionRegionPatch,
  WorkflowConnectionRegionValidationError,
  describeWorkflowConnectionStep,
  describeWorkflowConnectionGoals,
  createWorkflowConnectionMaterialRevisionRequest,
  workflowConnectionPlanningDecisionSchema,
  workflowConnectionRejectedProposalSchema,
  runOpenApiFlowOperation,
  describeWorkflowConnectionOutlineBundle,
  describeWorkflowConnectionCandidates,
} from '@openapi-flow/core';
import type { WorkflowConnectionPlanningDecision } from '@openapi-flow/core';
import type {
  PlanWorkflowConnectionStepInput,
  PlanWorkflowConnectionStepDefaultInput,
  PlanWorkflowConnectionStepResult,
} from '../../types/incremental-connection-planning.js';
import { createWorkflowConnectionStepSchema } from '../../schemas/workflow-connection-step-schema.js';
import {
  workflowConnectionStepPrompt,
  workflowConnectionMaterialRevisionStepPrompt,
  workflowConnectionCompletionReviewPrompt,
} from '../../prompts/incremental-workflow-connections-prompt.js';
import { invokeConnectionPlanningModel } from './invoke-connection-planning-model.js';
import { resolveWorkflowConnectionRegionSelection } from './resolve-workflow-connection-region-selection.js';
import { isWorkflowConnectionCompletionReview } from './is-workflow-connection-completion-review.js';
import { resolveWorkflowConnectionCompletionSelection } from './resolve-workflow-connection-completion-selection.js';
import {
  validateConnectionProposal,
  WorkflowConnectionPlanningError,
} from './workflow-connection-planning-error.js';

export function planWorkflowConnectionStep(
  input: PlanWorkflowConnectionStepDefaultInput,
): Promise<PlanWorkflowConnectionStepResult>;
export function planWorkflowConnectionStep(
  input: PlanWorkflowConnectionStepInput,
): Promise<PlanWorkflowConnectionStepResult<boolean>>;
export async function planWorkflowConnectionStep(
  input: PlanWorkflowConnectionStepInput,
): Promise<PlanWorkflowConnectionStepResult<boolean>> {
  const operation = 'planWorkflowConnectionStep';
  const {
    description,
    capabilities,
    capabilityIndex,
    schema,
    outlineContext,
    rejectedSnapshot,
    allowMaterialRevisions,
    materialRepairStages,
  } = runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation,
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      if (
        input.allowMaterialRevisions !== undefined &&
        typeof input.allowMaterialRevisions !== 'boolean'
      )
        throw new Error(
          'allowMaterialRevisions must be a boolean when supplied',
        );
      const allowMaterialRevisions = input.allowMaterialRevisions;
      const description = describeWorkflowConnectionStep(input);
      const materialRepairStages =
        allowMaterialRevisions === true
          ? describeWorkflowConnectionGoals(input).materialRepairStages
          : undefined;
      if ((input.outline === undefined) !== (input.bundleId === undefined))
        throw new Error(
          'Connection outline and bundleId must be supplied together',
        );
      const outlineContext =
        input.outline === undefined
          ? undefined
          : describeWorkflowConnectionOutlineBundle({
              ...input,
              outline: input.outline,
              bundleId: input.bundleId!,
            });
      if (input.rejectedProposals !== undefined) {
        if (!Array.isArray(input.rejectedProposals))
          throw new Error('rejectedProposals must be an array when supplied');
        for (const proposal of input.rejectedProposals) {
          workflowConnectionRejectedProposalSchema.parse(proposal);
          if (
            proposal.expected.sessionId !== description.expected.sessionId ||
            proposal.expected.sourceFingerprint !==
              description.expected.sourceFingerprint ||
            proposal.expected.revision !== description.expected.revision
          )
            throw new Error(
              'Rejected proposal feedback must belong to the exact current session/source/revision',
            );
          if (proposal.proposal.kind === 'set-region') {
            let replayed: WorkflowConnectionRegionValidationError | undefined;
            try {
              deriveWorkflowConnectionRegionPatch({
                description,
                region: proposal.proposal,
              });
            } catch (error) {
              if (!(error instanceof WorkflowConnectionRegionValidationError))
                throw error;
              replayed = error;
            }
            if (
              !replayed ||
              !isDeepStrictEqual(replayed.violations, proposal.violations)
            )
              throw new Error(
                'Rejected region feedback must match current source validation',
              );
          }
        }
      }
      // An omitted optional registry has no augmentation choices; never infer an engine registry.
      const capabilities =
        input.capabilities === undefined ? [] : input.capabilities;
      return {
        description,
        allowMaterialRevisions,
        materialRepairStages,
        outlineContext,
        rejectedSnapshot:
          input.rejectedProposals === undefined
            ? undefined
            : structuredClone(input.rejectedProposals),
        capabilities,
        capabilityIndex: capabilities.map(({ name, description }) => ({
          name,
          description,
        })),
        schema: createWorkflowConnectionStepSchema(
          description,
          capabilities,
          outlineContext,
          materialRepairStages,
        ),
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
        proposalAttempt: createWorkflowConnectionProposalAttempt({
          ...proposalContext,
          output,
        }),
        sourceFingerprint: description.expected.sourceFingerprint,
      },
      () => {
        try {
          if ((input.outline === undefined) !== (input.bundleId === undefined))
            throw new Error(
              'Connection outline and bundleId changed during model invocation',
            );
          const currentOutline =
            input.outline === undefined
              ? undefined
              : describeWorkflowConnectionOutlineBundle({
                  ...input,
                  outline: input.outline,
                  bundleId: input.bundleId!,
                });
          if (
            !isDeepStrictEqual(
              describeWorkflowConnectionStep(input),
              description,
            ) ||
            input.allowMaterialRevisions !== allowMaterialRevisions ||
            !isDeepStrictEqual(
              allowMaterialRevisions === true
                ? describeWorkflowConnectionGoals(input).materialRepairStages
                : undefined,
              materialRepairStages,
            ) ||
            !isDeepStrictEqual(currentOutline, outlineContext) ||
            !isDeepStrictEqual(input.rejectedProposals, rejectedSnapshot) ||
            !isDeepStrictEqual(
              capabilities.map(({ name, description }) => ({
                name,
                description,
              })),
              capabilityIndex,
            )
          )
            throw new Error(
              'Connection source, session, outline, feedback or native capabilities changed during model invocation',
            );
        } catch (error) {
          if (originalFailure !== undefined)
            throw new AggregateError(
              [originalFailure, error],
              'Planning input changed while an invalid connection output was received',
              { cause: error },
            );
          throw error;
        }
      },
    );
  const proposalContext = {
    id: randomUUID(),
    expected: structuredClone(description.expected),
  };
  const completionReview = isWorkflowConnectionCompletionReview(description);
  const systemPrompt = completionReview
    ? workflowConnectionCompletionReviewPrompt
    : workflowConnectionStepPrompt;
  const output = await invokeConnectionPlanningModel({
    proposalContext,
    model: input.model,
    operation,
    name: completionReview
      ? 'review_workflow_connection_completion'
      : 'plan_workflow_connection_step',
    schema,
    schemaReuse: 'ref',
    messages: [
      new SystemMessage(
        allowMaterialRevisions === true
          ? `${systemPrompt}\n${workflowConnectionMaterialRevisionStepPrompt}`
          : systemPrompt,
      ),
      new HumanMessage(
        JSON.stringify(
          completionReview
            ? {
                scope: 'configured-workflow-only',
                requirements: description.requirements,
                goals: description.goals,
                apiOperations: description.apiOperations,
                evidence: description.evidence,
                availableNativeCapabilities: capabilityIndex,
                ...(materialRepairStages === undefined
                  ? {}
                  : { materialRepairStages }),
              }
            : {
                ...description,
                connectionCandidates:
                  describeWorkflowConnectionCandidates(description),
                ...(materialRepairStages === undefined
                  ? {}
                  : { materialRepairStages }),
                ...(outlineContext === undefined
                  ? {}
                  : {
                      planningOutline: {
                        outline: outlineContext.outline,
                        bundles: outlineContext.bundles,
                        selectedBundle: outlineContext.bundle,
                        requiredProducerIds: outlineContext.requiredProducerIds,
                        crossingEdges: outlineContext.crossingEdges,
                      },
                    }),
                availableNativeCapabilities: capabilityIndex,
                ...(rejectedSnapshot === undefined
                  ? {}
                  : { rejectedProposals: rejectedSnapshot }),
              },
        ),
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
  const proposalAttempt = createWorkflowConnectionProposalAttempt({
    ...proposalContext,
    output,
  });
  checkCurrent(output);
  return validateConnectionProposal(
    {
      operation,
      stage: 'contract-validation',
      code: 'WORKFLOW_GRAPH_PLANNING_FAILED',
      proposalAttempt,
      output,
    },
    () => {
      const raw = output.decision;
      const decision: WorkflowConnectionPlanningDecision =
        raw.kind === 'request-completion'
          ? resolveWorkflowConnectionCompletionSelection(description, raw)
          : raw.kind !== 'set-region'
            ? raw
            : resolveWorkflowConnectionRegionSelection(description, raw);
      const checked = workflowConnectionPlanningDecisionSchema.parse(decision);
      if (checked.kind === 'replan-materials')
        createWorkflowConnectionMaterialRevisionRequest({
          ...input,
          expected: description.expected,
          decision: checked,
        });
      return {
        expected: structuredClone(description.expected),
        proposalAttempt,
        decision: checked,
      };
    },
  );
}
