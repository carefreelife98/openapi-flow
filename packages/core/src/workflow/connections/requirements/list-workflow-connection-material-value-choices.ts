import type {
  WorkflowConnectionEvidence,
  WorkflowConnectionMaterialValueChoice,
} from '../../../types/workflow-connection-evidence.js';
import { hasPointer, pointerValue } from '../../../bindings/json-pointer.js';

/** Only current scalar configuration fields are eligible code-check subjects, never imagined implementation fields. */
export function listWorkflowConnectionMaterialValueChoices(
  evidence: WorkflowConnectionEvidence[],
): WorkflowConnectionMaterialValueChoice[] {
  return materialChoices(evidence, 'scalar');
}

export function listWorkflowConnectionMaterialShapeChoices(
  evidence: WorkflowConnectionEvidence[],
): WorkflowConnectionMaterialValueChoice[] {
  return materialChoices(evidence, 'container');
}

function materialChoices(
  evidence: WorkflowConnectionEvidence[],
  domain: 'scalar' | 'container',
): WorkflowConnectionMaterialValueChoice[] {
  return evidence.flatMap((item) => {
    if (
      item.kind !== 'api-arguments' &&
      item.kind !== 'api-operation' &&
      item.kind !== 'native-material'
    )
      return [];
    if (item.nodeId === undefined)
      throw new Error(`Material evidence ${item.id} is missing nodeId`);
    const prefix =
      item.kind === 'api-arguments'
        ? '/arguments/values'
        : item.kind === 'native-material'
          ? '/node/parameters'
          : '';
    if (!hasPointer(item.value, prefix))
      throw new Error(`Material evidence ${item.id} is missing ${prefix}`);
    const pointers: string[] = [];
    const visit = (value: unknown, pointer: string): void => {
      if (value !== null && typeof value === 'object') {
        if (domain === 'container') pointers.push(pointer);
        for (const [key, child] of Object.entries(value))
          visit(
            child,
            `${pointer}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`,
          );
      } else if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      )
        if (domain === 'scalar') pointers.push(pointer);
    };
    visit(pointerValue(item.value, prefix), prefix);
    return pointers.length
      ? [{ nodeId: item.nodeId, materialKind: item.kind, pointers }]
      : [];
  });
}
