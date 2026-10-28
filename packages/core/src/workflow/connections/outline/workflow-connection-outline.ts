import { isDeepStrictEqual } from 'node:util';
import type {
  CreateWorkflowConnectionOutlineInput,
  WorkflowConnectionOutline,
  WorkflowConnectionOutlineInput,
  WorkflowConnectionOutlineDescription,
  WorkflowConnectionOutlineBundleInput,
  WorkflowConnectionOutlineBundleDescription,
  ApplyWorkflowConnectionOutlineStepInput,
} from '../../../types/workflow-connection-outline.js';
import type { ApplyWorkflowConnectionStepResult } from '../../../types/workflow-connection-session.js';
import {
  workflowConnectionOutlineProposalSchema,
  workflowConnectionOutlineSchema,
} from '../../../schemas/workflow-connection-outline-schema.js';
import {
  workflowConnectionStepProposalSchema,
  workflowConnectionStepExpectationSchema,
} from '../../../schemas/workflow-connection-session-schema.js';
import { describeWorkflowConnectionStep } from '../incremental/describe-workflow-connection-step.js';
import { applyWorkflowConnectionStep } from '../incremental/apply-workflow-connection-step.js';
import { connectionValueFingerprint } from '../incremental/connection-graph-identity.js';
import { deriveWorkflowConnectionOutlineGoals } from './derive-workflow-connection-outline-goals.js';
import { runOpenApiFlowOperation } from '../../../errors/run-openapi-flow-operation.js';

/** Model chooses grouping. Typed goal association is derived, never completion proof. */
export function createWorkflowConnectionOutline(
  input: CreateWorkflowConnectionOutlineInput,
): WorkflowConnectionOutline {
  return runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'createWorkflowConnectionOutline',
      stage: 'contract-validation',
      code: 'WORKFLOW_GRAPH_PLANNING_FAILED',
    },
    () => {
      const step = describeWorkflowConnectionStep(input);
      const proposal = workflowConnectionOutlineProposalSchema.parse(
        input.proposal,
      );
      if (!isDeepStrictEqual(proposal, input.proposal))
        throw new Error('Outline proposals must not be normalized');
      const actual = {
        nodeIds: step.context.nodes.map((node) => node.id),
        goalIds: step.goals.map((goal) => goal.id),
        factIds: step.requirements.map((fact) => fact.id),
      };
      for (const field of ['nodeIds', 'goalIds', 'factIds'] as const) {
        const covered = new Set<string>();
        for (const bundle of proposal.bundles) {
          const ids = bundle[field];
          if (ids === undefined) continue;
          if (
            new Set(ids).size !== ids.length ||
            ids.some((id) => !actual[field].includes(id))
          )
            throw new Error(
              `Outline ${field} must name distinct actual supplied identities`,
            );
          for (const id of ids) covered.add(id);
        }
        if (field === 'nodeIds' && actual[field].some((id) => !covered.has(id)))
          throw new Error(`Outline must retain every supplied ${field}`);
      }
      const association = deriveWorkflowConnectionOutlineGoals(step, proposal);
      const bundles: WorkflowConnectionOutline['bundles'] =
        proposal.bundles.map((bundle, index) => ({
          ...structuredClone(bundle),
          scope: 'local',
          goalIds: association.bundleGoalIds[index]!,
          id: connectionValueFingerprint({
            nodeIds: [...bundle.nodeIds].sort(),
          }),
        }));
      if (new Set(bundles.map((bundle) => bundle.id)).size !== bundles.length)
        throw new Error('Outline contains duplicate structural work bundles');
      if (association.globalGoalIds.length) {
        bundles.push({
          scope: 'global',
          purpose:
            'Assess and revise global session goals against the complete workflow.',
          nodeIds: [...actual.nodeIds],
          goalIds: [...association.globalGoalIds],
          id: connectionValueFingerprint({
            scope: 'global',
            nodeIds: [...actual.nodeIds].sort(),
            goalIds: [...association.globalGoalIds].sort(),
          }),
        });
      }
      const identity = {
        sessionId: step.expected.sessionId,
        sourceFingerprint: step.expected.sourceFingerprint,
        goalFingerprint: connectionValueFingerprint(step.goals),
      };
      return {
        ...proposal,
        ...identity,
        goalIds: actual.goalIds,
        globalGoalIds: association.globalGoalIds,
        bundles,
        id: connectionValueFingerprint({
          ...identity,
          bundles: bundles.map((bundle) => bundle.id).sort(),
        }),
      };
    },
  );
}

export function describeWorkflowConnectionOutline(
  input: WorkflowConnectionOutlineInput,
): WorkflowConnectionOutlineDescription {
  return runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'describeWorkflowConnectionOutline',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      const outline = workflowConnectionOutlineSchema.parse(input.outline);
      if (!isDeepStrictEqual(outline, input.outline))
        throw new Error('Outline must not be normalized');
      const reconstructed = createWorkflowConnectionOutline({
        ...input,
        proposal: {
          purpose: outline.purpose,
          bundles: outline.bundles
            .filter((bundle) => bundle.scope === 'local')
            .map(({ id, scope, ...bundle }) => {
              void id;
              void scope;
              return bundle;
            }),
        },
      });
      if (!isDeepStrictEqual(reconstructed, outline))
        throw new Error(
          'Outline differs from its actual session, goals or material source',
        );
      const step = describeWorkflowConnectionStep(input);
      return {
        outline: structuredClone(outline),
        step,
        globalUnmetGoalIds: step.inspection.unmetGoalIds.filter((id) =>
          outline.globalGoalIds.includes(id),
        ),
        bundles: outline.bundles.map((bundle) => {
          const pendingNodeIds = step.inspection.pendingNodeIds.filter((id) =>
            bundle.nodeIds.includes(id),
          );
          const unmetGoalIds = step.inspection.unmetGoalIds.filter((id) =>
            bundle.goalIds.includes(id),
          );
          const openBoundaries = step.inspection.openBoundaries.filter(
            (boundary) => bundle.nodeIds.includes(boundary.nodeId),
          );
          return {
            bundleId: bundle.id,
            pendingNodeIds,
            unmetGoalIds,
            openBoundaries,
            pending: !!(
              pendingNodeIds.length ||
              unmetGoalIds.length ||
              openBoundaries.length
            ),
          };
        }),
      };
    },
  );
}

export function describeWorkflowConnectionOutlineBundle(
  input: WorkflowConnectionOutlineBundleInput,
): WorkflowConnectionOutlineBundleDescription {
  return runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'describeWorkflowConnectionOutlineBundle',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      const description = describeWorkflowConnectionOutline(input);
      const bundle = description.outline.bundles.find(
        (item) => item.id === input.bundleId,
      );
      if (!bundle)
        throw new Error(
          'outline.bundleId must name an actual supplied work bundle',
        );
      const anchors = new Set(bundle.nodeIds);
      const relevant = new Set(anchors);
      const nodes = new Map(
        description.step.context.nodes.map((node) => [node.id, node]),
      );
      for (const id of relevant) {
        const node = nodes.get(id)!;
        for (const producer of [
          ...node.references.map((reference) => reference.nodeId),
          ...Object.values(node.inputReferences ?? {})
            .flat()
            .map((reference) => reference.nodeId),
          ...node.dependencyNodeIds,
        ]) {
          if (!nodes.has(producer))
            throw new Error(
              `Outline contains an unknown required producer: ${producer}`,
            );
          relevant.add(producer);
        }
      }
      return {
        ...description,
        bundle,
        requiredProducerIds: [...relevant].filter((id) => !anchors.has(id)),
        crossingEdges: description.step.context.edges.filter(
          (edge) => anchors.has(edge.from) !== anchors.has(edge.to),
        ),
      };
    },
  );
}

/** Local write ownership does not weaken the existing whole-graph, revision or completion checks. */
export function applyWorkflowConnectionOutlineStep(
  input: ApplyWorkflowConnectionOutlineStepInput,
): ApplyWorkflowConnectionStepResult {
  return runOpenApiFlowOperation<ApplyWorkflowConnectionStepResult>(
    {
      owner: 'core',
      operation: 'applyWorkflowConnectionOutlineStep',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      const description = describeWorkflowConnectionOutlineBundle(input);
      if (
        !isDeepStrictEqual(
          workflowConnectionStepExpectationSchema.parse(input.expected),
          description.step.expected,
        )
      )
        throw new Error(
          'Stale connection step: outline application requires the current session/source/revision',
        );
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
      if (parsed.data.kind === 'patch') {
        const patch = parsed.data;
        const focus = new Set(description.bundle.nodeIds);
        const removed = patch.removeEdgeIds.map(
          (id) =>
            description.step.edgeCatalog.find((item) => item.id === id)?.edge,
        );
        const edges = [
          ...patch.addEdges,
          ...removed.filter((edge) => edge !== undefined),
        ];
        const allowedBoundaries = new Set([
          ...focus,
          ...edges.flatMap((edge) => [edge.from, edge.to]),
        ]);
        if (
          edges.some((edge) => !focus.has(edge.from) && !focus.has(edge.to)) ||
          [
            ...patch.addRootNodeIds,
            ...patch.removeRootNodeIds,
            ...patch.addTerminals.map((item) => item.nodeId),
            ...patch.removeTerminals.map((item) => item.nodeId),
          ].some((id) => !allowedBoundaries.has(id))
        )
          return {
            status: 'rejected',
            violations: [
              {
                code: 'INVALID_PROPOSAL',
                message:
                  'Outline bundle patch cannot change an unrelated region; choose or replan the actual responsible bundle',
              },
            ],
          };
      }
      return applyWorkflowConnectionStep(input);
    },
  );
}
