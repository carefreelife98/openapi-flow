import type { WorkflowConnectionEvidence } from '../../../types/workflow-connection-evidence.js';
import { pointerValue } from '../../../bindings/json-pointer.js';

/** Enumerate actual configured-value paths. Models select these code-owned choices, never invent pointer roots. */
export function listWorkflowConnectionEvidencePointers(
  evidence: WorkflowConnectionEvidence,
): string[] {
  if (evidence.kind === 'requirement') return ['/text'];
  const prefix =
    evidence.kind === 'api-arguments'
      ? '/arguments/values'
      : evidence.kind === 'native-material'
        ? '/node/parameters'
        : undefined;
  if (prefix === undefined) return [''];
  const value = pointerValue(evidence.value, prefix);
  if (value === undefined)
    throw new Error(`Completion evidence ${evidence.id} is missing ${prefix}`);
  const paths = [''];
  const visit = (current: unknown, pointer: string): void => {
    paths.push(pointer);
    if (current !== null && typeof current === 'object')
      for (const [key, child] of Object.entries(current))
        visit(
          child,
          `${pointer}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`,
        );
  };
  visit(value, prefix);
  return paths;
}
