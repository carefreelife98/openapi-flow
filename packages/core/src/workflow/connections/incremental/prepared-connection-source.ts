import type { PreparedWorkflowConnectionSource } from '../../../types/internal/prepared-connection-source.js';
import type {
  WorkflowConnectionSessionSource,
  WorkflowConnectionSessionDescription,
} from '../../../types/workflow-connection-session.js';
const prepared = new WeakMap<object, PreparedWorkflowConnectionSource>();
const fields = {
  scenario: true,
  entrypoint: true,
  materials: true,
  nativeNodes: true,
  capabilities: true,
  gaps: true,
  edges: true,
  deferredApiInputIds: true,
  requirements: true,
  literalSourceMessages: true,
  reviewBoundary: true,
  editableEdgeIds: true,
} satisfies Record<keyof WorkflowConnectionSessionSource, true>;
/** Internal registration only after core captures and freezes the complete source revision. */
export function registerPreparedConnectionSource(
  source: WorkflowConnectionSessionSource,
  description: WorkflowConnectionSessionDescription,
): void {
  if (
    !Array.isArray(source.materials) ||
    !Object.isFrozen(source) ||
    !Object.isFrozen(source.materials)
  )
    throw new Error(
      'Prepared connection source must be an owned immutable revision',
    );
  prepared.set(source.materials, { source, description });
}
/** A changed supplied revision is revalidated; cached values never replace its fields. */
export function preparedConnectionSourceDescription(
  source: WorkflowConnectionSessionSource,
): WorkflowConnectionSessionDescription | undefined {
  if (!Array.isArray(source.materials)) return undefined;
  const record = prepared.get(source.materials);
  if (record === undefined) return undefined;
  for (const field of Object.keys(
    fields,
  ) as (keyof WorkflowConnectionSessionSource)[])
    if (source[field] !== record.source[field]) return undefined;
  return record.description;
}
