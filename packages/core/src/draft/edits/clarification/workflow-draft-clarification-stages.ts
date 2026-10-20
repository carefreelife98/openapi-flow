import type { WorkflowDraftEditDecision } from '../../../types/workflow-draft-edit.js';
import type { WorkflowDraftClarificationPlanningStage } from '../../../types/workflow-draft-clarification-ownership.js';

/** Direct owner stages only. Consumer repairs are separate code-derived tasks, not the producer's input owner. */
export function workflowDraftClarificationStages(
  decision: WorkflowDraftEditDecision,
): WorkflowDraftClarificationPlanningStage[] {
  switch (decision.kind) {
    case 'add-api-call':
    case 'replace-api-operation':
      return ['api-bindings', 'api-arguments', 'connections'];
    case 'add-native-node':
    case 'revise-native-node':
      return ['native-parameters', 'connections'];
    case 'revise-api-inputs':
      return ['api-arguments'];
    case 'revise-api-bindings':
      return ['api-bindings', 'connections'];
    case 'revise-requirement':
    case 'restore-requirement':
      return ['requirements'];
    case 'revise-connections':
    case 'remove-node':
    case 'report-capability-gap':
      return ['connections'];
    case 'needs-clarification':
    case 'no-change':
    case 'remove-requirement':
      return [];
  }
}
