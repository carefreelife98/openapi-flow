import { isDeepStrictEqual } from 'node:util';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeWorkflowConnectionStep,
  workflowConnectionPlanningDecisionSchema,
  workflowConnectionRejectedProposalSchema,
  runOpenApiFlowOperation,
} from '@openapi-flow/core';
import type { WorkflowConnectionPlanningDecision } from '@openapi-flow/core';
import type {
  PlanWorkflowConnectionStepInput,
  PlanWorkflowConnectionStepResult,
} from '../../types/incremental-connection-planning.js';
import { createWorkflowConnectionStepSchema } from '../../schemas/workflow-connection-step-schema.js';
import { workflowConnectionStepPrompt } from '../../prompts/incremental-workflow-connections-prompt.js';
import { invokeConnectionPlanningModel } from './invoke-connection-planning-model.js';
import { resolveConnectionPortSelection } from './resolve-connection-port-selection.js';
import { validateConnectionProposal } from './workflow-connection-planning-error.js';

export async function planWorkflowConnectionStep(
  input: PlanWorkflowConnectionStepInput,
): Promise<PlanWorkflowConnectionStepResult> {
  const operation = 'planWorkflowConnectionStep';
  const { description, capabilities, capabilityIndex, schema } =
    runOpenApiFlowOperation(
      {
        owner: 'langchain',
        operation,
        stage: 'input-validation',
        code: 'PLANNING_INPUT_INVALID',
      },
      () => {
        const description = describeWorkflowConnectionStep(input);
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
          capabilities,
          capabilityIndex: capabilities.map(({ name, description }) => ({
            name,
            description,
          })),
          schema: createWorkflowConnectionStepSchema(description, capabilities),
        };
      },
    );
  const output = await invokeConnectionPlanningModel({
    model: input.model,
    operation,
    name: 'plan_workflow_connection_step',
    schema,
    messages: [
      new SystemMessage(workflowConnectionStepPrompt),
      new HumanMessage(
        JSON.stringify({
          ...description,
          availableNativeCapabilities: capabilityIndex,
          ...(input.rejectedProposals === undefined
            ? {}
            : { rejectedProposals: input.rejectedProposals }),
        }),
      ),
    ],
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  return validateConnectionProposal(
    {
      operation,
      stage: 'contract-validation',
      code: 'WORKFLOW_GRAPH_PLANNING_FAILED',
      output,
    },
    () => {
      if (
        !isDeepStrictEqual(describeWorkflowConnectionStep(input), description)
      )
        throw new Error(
          'Connection session or source changed during model invocation',
        );
      if (
        !isDeepStrictEqual(
          capabilities.map(({ name, description }) => ({ name, description })),
          capabilityIndex,
        )
      )
        throw new Error(
          'Available native capabilities changed during model invocation',
        );
      const raw = output.decision;
      const decision: WorkflowConnectionPlanningDecision =
        raw.kind !== 'patch'
          ? raw
          : {
              ...raw,
              addEdges: raw.addEdges.map((edge) => ({
                from: edge.source.nodeId,
                output: resolveConnectionPortSelection(
                  edge.source,
                  description.context.nodes,
                  'outputs',
                ),
                to: edge.target.nodeId,
                input: resolveConnectionPortSelection(
                  edge.target,
                  description.context.nodes,
                  'inputs',
                ),
              })),
              addTerminals: raw.addTerminals.map((selection) => ({
                nodeId: selection.nodeId,
                output: resolveConnectionPortSelection(
                  selection,
                  description.context.nodes,
                  'outputs',
                ),
              })),
              removeTerminals: raw.removeTerminals.map((selection) => ({
                nodeId: selection.nodeId,
                output: resolveConnectionPortSelection(
                  selection,
                  description.context.nodes.map((node) => ({
                    ...node,
                    outputs: node.outputs.filter((port) =>
                      description.terminals.some(
                        (terminal) =>
                          terminal.nodeId === node.id &&
                          terminal.output === port,
                      ),
                    ),
                  })),
                  'outputs',
                ),
              })),
            };
      return {
        expected: structuredClone(description.expected),
        decision: workflowConnectionPlanningDecisionSchema.parse(decision),
      };
    },
  );
}
