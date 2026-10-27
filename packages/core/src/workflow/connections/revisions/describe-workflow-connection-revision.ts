import { isDeepStrictEqual } from 'node:util';
import { runOpenApiFlowOperation } from '../../../errors/run-openapi-flow-operation.js';
import type {
  WorkflowConnectionRevisionInput,
  WorkflowConnectionRevisionSourceDescription,
  WorkflowConnectionRevisionDescription,
} from '../../../types/workflow-connection-revision.js';
import { workflowConnectionStepExpectationSchema } from '../../../schemas/workflow-connection-session-schema.js';
import { validateWorkflowConnectionSession } from '../incremental/validate-workflow-connection-session.js';
import { describeConnectionSessionSource } from '../incremental/describe-connection-session-source.js';
import { describeWorkflowConnectionStep } from '../incremental/describe-workflow-connection-step.js';
import { describeWorkflowConnectionGoals } from '../incremental/describe-workflow-connection-goals.js';
import { describeWorkflowConnectionMaterialChanges } from './describe-workflow-connection-material-changes.js';
import { inspectConnectionGraph } from '../incremental/inspect-connection-graph.js';
import { connectionValueFingerprint } from '../incremental/connection-graph-identity.js';

export function prepareWorkflowConnectionRevisionSource(
  input: WorkflowConnectionRevisionInput,
): WorkflowConnectionRevisionSourceDescription {
  const before = validateWorkflowConnectionSession(input.before);
  const expected = workflowConnectionStepExpectationSchema.parse(
    input.expected,
  );
  if (
    expected.sessionId !== input.before.session.id ||
    expected.sourceFingerprint !== input.before.session.sourceFingerprint ||
    expected.revision !== input.before.session.revision
  )
    throw new Error(
      'Connection revision belongs to a stale session/source/revision',
    );
  // Capture material without checking an obsolete graph against replacement ports.
  // The immutable original baseline and edit permissions are checked separately below.
  const after = describeConnectionSessionSource({
    ...input.after,
    edges: [],
    editableEdgeIds: undefined,
  });
  if (
    !isDeepStrictEqual(input.before.requirements, input.after.requirements) ||
    input.before.scenario !== input.after.scenario ||
    !isDeepStrictEqual(
      before.source.input.entrypoint,
      after.source.input.entrypoint,
    )
  )
    throw new Error(
      'Technical replanning cannot change confirmed requirements, scenario or entrypoint',
    );
  if (
    !isDeepStrictEqual(
      before.source.input.edges,
      input.after.edges === undefined ? [] : input.after.edges,
    ) ||
    !isDeepStrictEqual(
      input.before.editableEdgeIds,
      input.after.editableEdgeIds,
    )
  )
    throw new Error(
      'Connection revision cannot replace original edges or their edit permissions',
    );
  if (!isDeepStrictEqual(before.source.input.gaps, after.source.input.gaps))
    throw new Error(
      'Technical replanning cannot change business capability gaps',
    );
  const oldApis = new Map(
    before.source.input.materials.map((material) => [
      material.status === 'ready' ? material.arguments.callId : material.callId,
      material,
    ]),
  );
  if (oldApis.size !== after.source.input.materials.length)
    throw new Error('Connection revision must retain every selected API role');
  for (const material of after.source.input.materials) {
    const id =
      material.status === 'ready' ? material.arguments.callId : material.callId;
    const original = oldApis.get(id);
    if (
      !original ||
      original.status !== material.status ||
      original.purpose !== material.purpose ||
      (original.status === 'blocked' &&
        !isDeepStrictEqual(original, material)) ||
      !isDeepStrictEqual(original.operation, material.operation)
    )
      throw new Error(
        `Connection revision cannot change selected API role, status or OAS: ${id}`,
      );
  }
  const allowed = new Set(
    before.source.input.capabilities.map((capability) => capability.name),
  );
  if (
    after.source.input.capabilities.some(
      (capability) => !allowed.has(capability.name),
    )
  )
    throw new Error(
      'Connection revision cannot widen the allowed native registry',
    );
  return { before, after, expected };
}

/** Original and revised material are distinct epochs; the model receives contracts, not runtime registries. */
export function describeWorkflowConnectionRevision(
  input: WorkflowConnectionRevisionInput,
): WorkflowConnectionRevisionDescription {
  return runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'describeWorkflowConnectionRevision',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      const sources = prepareWorkflowConnectionRevisionSource(input);
      const { routeStates, ...currentGraphInspection } = inspectConnectionGraph(
        {
          contracts: sources.after.source.context.nodes,
          graph: input.before.session,
          apiIds: new Set(sources.after.source.context.readyCallIds),
        },
      );
      void routeStates;
      return {
        sourceFingerprint: connectionValueFingerprint({
          expected: sources.expected,
          beforeSource: sources.before.fingerprint,
          beforeSession: input.before.session,
          afterSource: sources.after.fingerprint,
        }),
        before: describeWorkflowConnectionStep(input.before),
        after: describeWorkflowConnectionGoals({
          ...input.after,
          edges: [],
          editableEdgeIds: undefined,
        }),
        nativeNodeIds: sources.after.source.input.nativeNodes.map(
          (node) => node.id,
        ),
        materialChanges: describeWorkflowConnectionMaterialChanges({
          ...sources,
          session: input.before.session,
        }),
        currentGraphInspection,
      };
    },
  );
}
