import type {
  WorkflowDraftEditDecision,
  WorkflowDraftEditStage,
} from '../../types/workflow-draft-edit.js';

/** Stage ownership follows the explicit edit kind, never a natural-language heuristic. */
export function workflowDraftEditStages(
  decision: WorkflowDraftEditDecision,
): WorkflowDraftEditStage[] {
  switch (decision.kind) {
    case 'add-api-call':
    case 'replace-api-operation':
      return [
        'resolve-contracts',
        'api-bindings',
        'api-arguments',
        'connections',
      ];
    case 'add-native-node':
      return ['native-parameters', 'connections'];
    case 'revise-api-inputs':
      return ['api-arguments'];
    case 'revise-api-bindings':
      return ['api-bindings', 'api-arguments', 'connections'];
    case 'revise-native-node':
      return ['native-parameters', 'api-bindings', 'connections'];
    case 'remove-node':
    case 'report-capability-gap':
    case 'revise-connections':
      return ['connections'];
    case 'revise-requirement':
    case 'restore-requirement':
    case 'remove-requirement':
      return ['requirements'];
    case 'needs-clarification':
      return decision.owner.kind === 'semantic' ? ['clarification'] : [];
    case 'no-change':
      return [];
  }
}
