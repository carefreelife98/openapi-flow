import { runOpenApiFlowOperation } from '../../../errors/run-openapi-flow-operation.js';
import type {
  ApplyWorkflowConnectionStepInput,
  ApplyWorkflowConnectionStepResult,
  WorkflowConnectionWorkingGraph,
} from '../../../types/workflow-connection-session.js';
import {
  workflowConnectionStepProposalSchema,
  workflowConnectionStepExpectationSchema,
} from '../../../schemas/workflow-connection-session-schema.js';
import {
  validateWorkflowConnectionSession,
  validateConnectionStepReferences,
} from './validate-workflow-connection-session.js';
import { applyConnectionPatch } from './apply-connection-patch.js';
import { inspectConnectionGraph } from './inspect-connection-graph.js';
import {
  workflowConnectionEdgeId,
  connectionGraphFingerprint,
} from './connection-graph-identity.js';
import { inspectWorkflowConnectionCompletion } from './inspect-workflow-connection-completion.js';

export function applyWorkflowConnectionStep(
  input: ApplyWorkflowConnectionStepInput,
): ApplyWorkflowConnectionStepResult {
  return runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'applyWorkflowConnectionStep',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      const { source, visitedGraphFingerprints } =
        validateWorkflowConnectionSession(input);
      const expected = workflowConnectionStepExpectationSchema.parse(
        input.expected,
      );
      if (
        expected.sessionId !== input.session.id ||
        expected.sourceFingerprint !== input.session.sourceFingerprint ||
        expected.revision !== input.session.revision
      )
        throw new Error(
          'Stale connection step: expected.sessionId, expected.sourceFingerprint and expected.revision must match the current session',
        );
      if (input.session.revision === Number.MAX_SAFE_INTEGER)
        throw new Error('Connection revision exhausted');
      const parsed = workflowConnectionStepProposalSchema.safeParse(
        input.proposal,
      );
      if (!parsed.success)
        return {
          status: 'rejected',
          violations: [
            { code: 'INVALID_PROPOSAL', message: parsed.error.message },
          ],
        };
      const proposal = parsed.data;
      const before: WorkflowConnectionWorkingGraph = {
        edges: input.session.edges,
        rootNodeIds: input.session.rootNodeIds,
        terminals: input.session.terminals,
        assessments: input.session.assessments,
      };
      let next: WorkflowConnectionWorkingGraph;
      try {
        validateConnectionStepReferences(
          input,
          proposal,
          new Set(source.context.nodes.map((node) => node.id)),
        );
        next =
          proposal.kind === 'patch'
            ? applyConnectionPatch({
                graph: before,
                proposal,
                protectedEdgeIds: new Set(
                  source.input.edges
                    .map(workflowConnectionEdgeId)
                    .filter((id) => !input.editableEdgeIds?.includes(id)),
                ),
              })
            : {
                ...structuredClone(before),
                assessments: structuredClone(proposal.assessments),
              };
      } catch (error) {
        return {
          status: 'rejected',
          violations: [
            {
              code: 'INVALID_PROPOSAL',
              message:
                error instanceof Error ? error.message : 'Invalid proposal',
            },
          ],
        };
      }
      if (visitedGraphFingerprints.has(connectionGraphFingerprint(next)))
        return {
          status: 'rejected',
          violations: [
            {
              code: 'NO_PROGRESS',
              message:
                'Connection step repeats the current or a previous planning state',
            },
          ],
        };
      const checked = inspectConnectionGraph({
        contracts: source.context.nodes,
        graph: next,
        apiIds: new Set(source.context.readyCallIds),
      });
      if (checked.violations.length)
        return { status: 'rejected', violations: checked.violations };
      const session = {
        ...structuredClone(input.session),
        ...next,
        revision: input.session.revision + 1,
        history: [
          ...structuredClone(input.session.history),
          {
            baseRevision: input.session.revision,
            proposal: structuredClone(proposal),
          },
        ],
      };
      return {
        status: 'accepted',
        session,
        inspection: inspectWorkflowConnectionCompletion({ ...input, session }),
      };
    },
  );
}
