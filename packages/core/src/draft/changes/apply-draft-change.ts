import type { WorkflowDraftContent } from '../../types/workflow-draft.js';
import type { WorkflowDraftChange } from '../../types/workflow-draft-changes.js';
import { draftEdgeKey } from './draft-edge-key.js';

/** Mutate only an isolated candidate; callers validate the complete transaction. */
export function applyDraftChange(
  content: WorkflowDraftContent,
  change: WorkflowDraftChange,
): void {
  switch (change.kind) {
    case 'add-capability-gap':
      assertNewId(content, change.node.id);
      if (content.gapNodes === undefined) content.gapNodes = [];
      content.gapNodes.push(structuredClone(change.node));
      break;
    case 'add-api-call':
      assertNewId(content, change.call.id);
      content.apiCalls.push(structuredClone(change.call));
      break;
    case 'update-api-call': {
      const index = content.apiCalls.findIndex(
        (call) => call.id === change.call.id,
      );
      if (index < 0)
        throw new Error(`Cannot update unknown API call ${change.call.id}`);
      content.apiCalls[index] = structuredClone(change.call);
      break;
    }
    case 'add-native-node':
      assertNewId(content, change.node.id);
      content.nativeNodes.push(structuredClone(change.node));
      break;
    case 'update-native-node': {
      const index = content.nativeNodes.findIndex(
        (node) => node.id === change.node.id,
      );
      if (index < 0)
        throw new Error(`Cannot update unknown native node ${change.node.id}`);
      content.nativeNodes[index] = structuredClone(change.node);
      break;
    }
    case 'remove-node': {
      if (
        !content.apiCalls.some((call) => call.id === change.nodeId) &&
        !content.nativeNodes.some((node) => node.id === change.nodeId) &&
        !content.gapNodes?.some((node) => node.id === change.nodeId)
      )
        throw new Error(`Cannot remove unknown draft node ${change.nodeId}`);
      content.apiCalls = content.apiCalls.filter(
        (call) => call.id !== change.nodeId,
      );
      content.nativeNodes = content.nativeNodes.filter(
        (node) => node.id !== change.nodeId,
      );
      if (content.gapNodes !== undefined)
        content.gapNodes = content.gapNodes.filter(
          (node) => node.id !== change.nodeId,
        );
      break;
    }
    case 'add-edge':
      content.edges.push(structuredClone(change.edge));
      break;
    case 'remove-edge': {
      const key = draftEdgeKey(change.edge);
      const index = content.edges.findIndex(
        (edge) => draftEdgeKey(edge) === key,
      );
      if (index < 0) throw new Error('Cannot remove an undeclared draft edge');
      content.edges.splice(index, 1);
      break;
    }
    case 'set-requirement': {
      const index = content.requirements.findIndex(
        (item) => item.id === change.requirement.id,
      );
      if (index < 0)
        content.requirements.push(structuredClone(change.requirement));
      else content.requirements[index] = structuredClone(change.requirement);
      break;
    }
    case 'remove-requirement': {
      const index = content.requirements.findIndex(
        (item) => item.id === change.requirementId,
      );
      if (index < 0)
        throw new Error(
          `Cannot remove unknown requirement ${change.requirementId}`,
        );
      content.requirements.splice(index, 1);
      break;
    }
  }
}

function assertNewId(content: WorkflowDraftContent, id: string): void {
  if (
    content.apiCalls.some((call) => call.id === id) ||
    content.nativeNodes.some((node) => node.id === id) ||
    content.gapNodes?.some((node) => node.id === id)
  )
    throw new Error(`Draft node ${id} already exists; use an explicit update`);
}
