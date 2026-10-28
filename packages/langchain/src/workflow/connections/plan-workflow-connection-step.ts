import { isDeepStrictEqual } from 'node:util';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeWorkflowConnectionStep,
  describeWorkflowConnectionGoals,
  createWorkflowConnectionMaterialRevisionRequest,
  workflowConnectionPlanningDecisionSchema,
  workflowConnectionRejectedProposalSchema,
  runOpenApiFlowOperation,
  describeWorkflowConnectionOutlineBundle,
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
} from '../../prompts/incremental-workflow-connections-prompt.js';
import { invokeConnectionPlanningModel } from './invoke-connection-planning-model.js';
import {
  resolveConnectionEdgeSelections,
  resolveConnectionEndpointSelections,
} from './resolve-connection-selections.js';
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
            proposal.expected.revision > description.expected.revision
          )
            throw new Error(
              'Rejected proposal must belong to this session/source and not a future revision',
            );
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
  const output = await invokeConnectionPlanningModel({
    model: input.model,
    operation,
    name: 'plan_workflow_connection_step',
    schema,
    messages: [
      new SystemMessage(
        allowMaterialRevisions === true
          ? `${workflowConnectionStepPrompt}\n${workflowConnectionMaterialRevisionStepPrompt}`
          : workflowConnectionStepPrompt,
      ),
      new HumanMessage(
        JSON.stringify({
          ...description,
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
    },
    () => {
      const raw = output.decision;
      const addEdges =
        raw.kind === 'patch'
          ? resolveConnectionEdgeSelections(
              raw.addEdges,
              description.context.nodes,
            )
          : [];
      const decision: WorkflowConnectionPlanningDecision =
        raw.kind !== 'patch'
          ? raw
          : {
              ...raw,
              addEdges,
              addTerminals: resolveConnectionEndpointSelections(
                raw.addTerminals,
                description.context.nodes,
              ),
              removeTerminals: resolveConnectionEndpointSelections(
                raw.removeTerminals,
                description.context.nodes,
              ),
            };
      const checked = workflowConnectionPlanningDecisionSchema.parse(decision);
      if (checked.kind === 'replan-materials')
        createWorkflowConnectionMaterialRevisionRequest({
          ...input,
          expected: description.expected,
          decision: checked,
        });
      return {
        expected: structuredClone(description.expected),
        decision: checked,
      };
    },
  );
}
