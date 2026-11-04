import type {
  WorkflowConnectionStepDescription,
  WorkflowConnectionStepProposal,
  WorkflowConnectionPatch,
} from '@openapi-flow/core';
import type { WorkflowConnectionCompletionSelection } from '../../types/incremental-connection-planning.js';

/** A chosen source is copied by its owner. No model quote repair, duplicate removal or pointer correction. */
export function resolveWorkflowConnectionCompletionSelection(
  description: WorkflowConnectionStepDescription,
  selection: WorkflowConnectionCompletionSelection,
): Exclude<WorkflowConnectionStepProposal, WorkflowConnectionPatch> {
  return {
    ...selection,
    assessments: Object.entries(selection.assessments).map(
      ([goalId, { evidence, ...assessment }]) => {
        const goal = description.goals.find((item) => item.id === goalId);
        if (goal?.decision.kind !== 'semantic')
          throw new Error(
            `Completion review selects unknown semantic goal ${goalId}`,
          );
        const selected = Object.entries(evidence)
          .filter(([, pointer]) => pointer !== null)
          .map(([evidenceId, pointer]) => {
            if (pointer === null)
              throw new Error(
                'An unselected evidence entry cannot become a reference',
              );
            const item = description.evidence.find(
              (entry) => entry.id === evidenceId,
            );
            if (!item)
              throw new Error(
                `Completion review selects unknown evidence ${evidenceId}`,
              );
            return { item, pointer };
          });
        return {
          ...assessment,
          goalId,
          scope: goal.decision.scope,
          nodeIds: [
            ...new Set(
              selected.flatMap(({ item }) => {
                if (item.kind === 'graph' || item.kind === 'material-inventory')
                  return description.context.nodes.map((node) => node.id);
                if (item.kind === 'requirement') return [];
                if (!item.nodeId)
                  throw new Error(
                    `Completion material evidence ${item.id} has no node identity`,
                  );
                return [item.nodeId];
              }),
            ),
          ],
          evidenceRefs: selected.map(({ item, pointer }) => {
            if (item.kind !== 'requirement')
              return { evidenceId: item.id, pointer };
            const fact = description.requirements.find(
              (entry) => entry.id === item.factId,
            );
            if (!fact)
              throw new Error(
                `Completion review evidence ${item.id} has no original requirement`,
              );
            return { evidenceId: item.id, pointer, quote: fact.text };
          }),
        };
      },
    ),
  };
}
