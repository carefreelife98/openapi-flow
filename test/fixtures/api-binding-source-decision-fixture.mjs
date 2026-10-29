/** Explicit model wire fixtures for every supported source-availability decision. */
export function createApiBindingSourceDecisionFixture(proposal) {
  const keys =
    proposal.keySelections === undefined
      ? {}
      : { keySelections: proposal.keySelections };
  const reason = Object.hasOwn(proposal, 'reason')
    ? { reason: proposal.reason }
    : {};
  if (proposal.sourceNodeIds.length && proposal.gaps.length)
    return {
      decision: {
        kind: 'partially-missing-response-sources',
        ...keys,
        sourceNodeIds: proposal.sourceNodeIds,
        gaps: proposal.gaps,
      },
      ...reason,
    };
  if (proposal.sourceNodeIds.length)
    return {
      decision: {
        kind: 'selected-response-sources',
        ...keys,
        sourceNodeIds: proposal.sourceNodeIds,
      },
      ...reason,
    };
  if (proposal.gaps.length)
    return {
      decision: { kind: 'missing-response-sources', gaps: proposal.gaps },
      ...reason,
    };
  return { decision: { kind: 'independent-inputs' }, ...reason };
}
