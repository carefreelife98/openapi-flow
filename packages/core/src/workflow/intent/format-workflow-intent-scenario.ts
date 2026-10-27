import type { ValidateWorkflowIntentInput } from '../../types/workflow-intent.js';
import { validateWorkflowIntent } from './resolve-workflow-intent.js';

/** Shared upstream semantic context. Never use this formatted context as a literal request-value source. */
export function formatWorkflowIntentScenario(
  input: ValidateWorkflowIntentInput,
): string {
  const plan = validateWorkflowIntent(input);
  return JSON.stringify({
    originalRequirements: plan.source.scenario,
    workflowIntent: {
      objective: plan.objective,
      roles: plan.roles.map(({ id, task, scope }) => ({ id, task, scope })),
      flows: plan.flows,
    },
    scopePolicy:
      'Implement required roles only. Conditional roles remain inactive until the user explicitly requests them. Excluded roles stay out. This semantic overview does not replace the original requirements, OAS, native contracts or execution validation. Resolve concrete references and mandatory dependencies from actual contracts later. Do not fabricate missing business conditions.',
  });
}
