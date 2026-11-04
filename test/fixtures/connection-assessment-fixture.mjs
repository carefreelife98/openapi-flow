import { describeWorkflowConnectionStep } from '@openapi-flow/core';

/** Explicit synthetic semantic judgment. Code only validates these references, not the judgment's meaning. */
export function connectionAssessment(
  description,
  goalId,
  nodeIds,
  status = 'satisfied',
) {
  const goal = description.goals.find((item) => item.id === goalId);
  if (goal?.decision.kind !== 'semantic')
    throw new Error('Missing fixture semantic goal');
  return {
    goalId,
    status,
    scope: goal.decision.scope,
    nodeIds,
    evidenceRefs:
      status === 'insufficient-evidence'
        ? []
        : description.evidence
            .filter(
              (item) =>
                (item.kind === 'requirement' &&
                  goal.decision.factIds.includes(item.factId)) ||
                (item.nodeId !== undefined && nodeIds.includes(item.nodeId)) ||
                (item.kind === 'graph' && goal.decision.scope === 'workflow'),
            )
            .map((item) =>
              item.kind === 'requirement'
                ? {
                    evidenceId: item.id,
                    pointer: '/text',
                    quote: item.value.text,
                  }
                : { evidenceId: item.id, pointer: '' },
            ),
    reason: 'Synthetic fixture review against current facts.',
  };
}

export function sourceConnectionAssessment(
  source,
  session,
  goalId,
  nodeIds,
  status,
) {
  return connectionAssessment(
    describeWorkflowConnectionStep({ ...source, session }),
    goalId,
    nodeIds,
    status,
  );
}

export function modelConnectionAssessment(
  description,
  goalId,
  nodeIds,
  status,
) {
  const {
    evidenceRefs,
    nodeIds: _nodeIds,
    goalId: _goalId,
    scope: _scope,
    ...assessment
  } = connectionAssessment(description, goalId, nodeIds, status);
  void _nodeIds;
  void _goalId;
  void _scope;
  const evidence = Object.fromEntries(
    description.evidence.map((item) => [
      item.id,
      item.kind === 'requirement' &&
      description.goals
        .find((g) => g.id === goalId)
        .decision.factIds.includes(item.factId)
        ? '/text'
        : item.kind === 'material-inventory'
          ? ''
          : item.kind === 'graph' &&
              description.goals.find((g) => g.id === goalId).decision.scope ===
                'workflow'
            ? ''
            : null,
    ]),
  );
  for (const ref of evidenceRefs) {
    if (
      evidence[ref.evidenceId] !== null &&
      evidence[ref.evidenceId] !== ref.pointer
    )
      throw new Error('Fixture requires one selected path per evidence entry');
    evidence[ref.evidenceId] = ref.pointer;
  }
  return { ...assessment, evidence };
}

export function sourceModelConnectionAssessment(
  source,
  session,
  goalId,
  nodeIds,
  status,
) {
  return modelConnectionAssessment(
    describeWorkflowConnectionStep({ ...source, session }),
    goalId,
    nodeIds,
    status,
  );
}
