import { describeWorkflowConnectionStep } from '@openapi-flow/core';
import type {
  IncrementalConnectionDependencies,
  IncrementalConnectionState,
  IncrementalNativePlanningInput,
} from '../../../types/incremental-connections.js';
import { resolveIncrementalConnectionSource } from '../resolve-incremental-connection-source.js';

export function createIncrementalNativeInput(
  dependencies: IncrementalConnectionDependencies,
  state: IncrementalConnectionState,
): IncrementalNativePlanningInput {
  if (!dependencies.nativeAugmentation?.parameterOwnership)
    throw new Error(
      'nativeAugmentation.parameterOwnership is required for automatic native planning',
    );
  if (
    !state.session ||
    state.pending?.decision.kind !== 'request-native-material'
  )
    throw new Error(
      'Automatic native planning requires the current connection session and material request',
    );
  const source = resolveIncrementalConnectionSource(dependencies, state);
  const description = describeWorkflowConnectionStep({
    ...source,
    session: state.session,
  });
  const expected = state.pending.expected;
  if (
    expected.sessionId !== description.expected.sessionId ||
    expected.sourceFingerprint !== description.expected.sourceFingerprint ||
    expected.revision !== description.expected.revision
  )
    throw new Error(
      'Native request belongs to a stale connection source/session/revision',
    );
  const request = state.pending.decision;
  if (!source.capabilities?.some((item) => item.name === request.capability))
    throw new Error(
      `Requested native capability ${request.capability} is not registered`,
    );
  return {
    request,
    expected,
    input: {
      planId: state.session.id,
      scenario: JSON.stringify({
        scenario: source.scenario,
        requirements: source.requirements,
        request,
        goals: description.goals,
        currentEdges: state.session.edges,
        openBoundaries: description.inspection.openBoundaries,
      }),
      ...(source.entrypoint === undefined
        ? {}
        : { entrypoint: source.entrypoint }),
      capabilities: source.capabilities,
      preparedNativeNodes: source.nativeNodes,
      apiMaterials: source.materials?.flatMap((material) =>
        material.status === 'ready'
          ? [
              {
                callId: material.arguments.callId,
                operation: material.operation,
                ...(material.purpose === undefined
                  ? {}
                  : { purpose: material.purpose }),
                ...(material.arguments.requestMediaType === undefined
                  ? {}
                  : { requestMediaType: material.arguments.requestMediaType }),
              },
            ]
          : [],
      ),
      allowRuntimeParameters:
        dependencies.nativeAugmentation.parameterOwnership.parameterSource !==
        'literal',
      includeExplanations: dependencies.nativeAugmentation.includeExplanations,
    },
  };
}
