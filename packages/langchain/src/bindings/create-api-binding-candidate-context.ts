import type {
  ApiBindingCandidateCatalog,
  ApiBindingKeyCandidate,
} from '@openapi-flow/core';
import type { ApiBindingCandidateContext } from '../types/api-binding-candidate-context.js';

/** Send each field contract once; candidate IDs still identify a coupled source/target pair. */
export function createApiBindingCandidateContext(
  catalog: ApiBindingCandidateCatalog,
  keys: ApiBindingKeyCandidate[],
): ApiBindingCandidateContext {
  const context: ApiBindingCandidateContext = {
    bindingKeyCandidates: structuredClone(keys),
    bindingCandidates: [],
    bindingSourceFields: [],
    bindingTargetFields: [],
  };
  const sources = new Map<string, string>();
  const targets = new Map<string, string>();
  for (const candidate of catalog.candidates) {
    const sourceKey = JSON.stringify([
      candidate.sourceNodeId,
      candidate.source,
    ]);
    let sourceId = sources.get(sourceKey);
    if (sourceId === undefined) {
      sourceId = 'source-' + sources.size;
      sources.set(sourceKey, sourceId);
      context.bindingSourceFields.push({
        id: sourceId,
        nodeId: candidate.sourceNodeId,
        ...candidate.source,
      });
    }
    const targetKey = JSON.stringify(candidate.target);
    let targetId = targets.get(targetKey);
    if (targetId === undefined) {
      targetId = 'target-' + targets.size;
      targets.set(targetKey, targetId);
      context.bindingTargetFields.push({ id: targetId, ...candidate.target });
    }
    context.bindingCandidates.push({ id: candidate.id, sourceId, targetId });
  }
  return context;
}
