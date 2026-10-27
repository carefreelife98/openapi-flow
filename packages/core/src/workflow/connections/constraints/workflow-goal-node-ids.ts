import type { WorkflowConnectionGoalProposal } from '../../../types/workflow-connection-session.js';

export function workflowGoalNodeIds(
  goal: WorkflowConnectionGoalProposal,
): string[] {
  switch (goal.kind) {
    case 'semantic':
      return [];
    case 'precedence':
      return [goal.before, goal.after];
    case 'route':
      return [goal.from, goal.to];
    case 'join':
      return [goal.nodeId, ...goal.producerIds];
    case 'independent':
      return goal.nodeIds;
  }
}
