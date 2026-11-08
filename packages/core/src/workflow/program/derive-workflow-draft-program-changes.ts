import type { DeriveWorkflowDraftProgramChangesInput } from '../../types/workflow-execution-program.js';
import type { WorkflowDraftChange } from '../../types/workflow-draft-changes.js';
import { describeWorkflowDraftExecutionProgram } from './describe-workflow-draft-execution-program.js';
import { validateWorkflowExecutionProgram } from './resolve-workflow-execution-program.js';
import { describeWorkflowDraftConnectionEdit } from '../../draft/edits/connections/describe-workflow-draft-connection-edit.js';
import { draftEdgeKey } from '../../draft/changes/draft-edge-key.js';
/** Changes contain only the checked edit's connections and compiler-created controls. */
export function deriveWorkflowDraftProgramChanges(
  input: DeriveWorkflowDraftProgramChangesInput,
): WorkflowDraftChange[] {
  const source = describeWorkflowDraftExecutionProgram(input);
  const result = validateWorkflowExecutionProgram({
    ...source,
    result: input.result,
  });
  const described = describeWorkflowDraftConnectionEdit(input);
  if (described.status === 'waiting-for-materials')
    throw new Error(
      'Draft program changes require the material-ready edit scope',
    );
  const original = new Map(
    described.stage.content.edges.map((edge) => [draftEdgeKey(edge), edge]),
  );
  const next = new Map(
    result.plan.edges.map((edge) => [draftEdgeKey(edge), edge]),
  );
  const generated = new Set(result.generatedNodeIds);
  const scope = new Set([
    ...(described.status === 'ready' ? described.affectedNodeIds : []),
    ...generated,
  ]);
  if (described.status === 'not-required' && generated.size)
    throw new Error(
      'A material-only edit cannot introduce new compiler controls',
    );
  const changes: WorkflowDraftChange[] = result.plan.nativeNodes
    .filter((node) => generated.has(node.id))
    .map((node) => ({ kind: 'add-native-node', node }));
  for (const [key, edge] of original)
    if (!next.has(key)) changes.push({ kind: 'remove-edge', edge });
  for (const [key, edge] of next)
    if (!original.has(key)) changes.push({ kind: 'add-edge', edge });
  for (const change of changes)
    if (
      (change.kind === 'add-edge' || change.kind === 'remove-edge') &&
      !scope.has(change.edge.from) &&
      !scope.has(change.edge.to)
    )
      throw new Error(
        'Execution program connection change is outside the current draft edit scope',
      );
  return changes;
}
