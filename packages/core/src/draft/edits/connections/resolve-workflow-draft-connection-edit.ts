import { createHash } from 'node:crypto';
import type {
  ResolveWorkflowDraftConnectionEditInput,
  WorkflowDraftConnectionEditResult,
  WorkflowDraftConnectionEditQuestion,
} from '../../../types/workflow-draft-connection-edit.js';
import type { WorkflowDraftEditConnectionChange } from '../../../types/workflow-draft-edit-assembly.js';
import { describeWorkflowDraftConnectionEdit } from './describe-workflow-draft-connection-edit.js';
import { createWorkflowDraftConnectionEditProposalSchema } from '../../../schemas/workflow-draft-connection-edit-schema.js';
import { validateWorkflowPlanningEvidence } from '../../../planning/evidence/validate-workflow-planning-evidence.js';
import { draftEdgeKey } from '../../changes/draft-edge-key.js';
import { validateWorkflowEdges } from '../../../workflow/validate-workflow-edges.js';
import { assembleWorkflowDraftEdit } from '../assemble-workflow-draft-edit.js';

/** Preserve retained edges; only a complete validated candidate is returned as ready. */
export function resolveWorkflowDraftConnectionEdit(
  input: ResolveWorkflowDraftConnectionEditInput,
): WorkflowDraftConnectionEditResult {
  const described = describeWorkflowDraftConnectionEdit(input);
  if (input.fingerprint !== described.fingerprint)
    throw new Error(
      'Connection edit fingerprint is missing, stale or describes different staged materials',
    );
  if (described.status !== 'ready')
    throw new Error(`Connection edit cannot resolve while ${described.status}`);
  const proposal = createWorkflowDraftConnectionEditProposalSchema(
    described,
  ).parse(input.proposal);
  const connections: WorkflowDraftEditConnectionChange[] = [];
  const questions: WorkflowDraftConnectionEditQuestion[] = [];
  const keys = new Set<string>();
  if (
    proposal.decisions.some(
      (decision) => decision.kind === 'keep-connections',
    ) &&
    proposal.decisions.length !== 1
  )
    throw new Error('keep-connections must be the only connection decision');
  for (const decision of proposal.decisions) {
    validateWorkflowPlanningEvidence({
      context: { messages: described.messages },
      evidence: decision.sources,
    });
    if (decision.explanation)
      validateWorkflowPlanningEvidence({
        context: { messages: described.messages },
        evidence: decision.explanation.evidence,
      });
    if (decision.kind === 'needs-clarification') {
      questions.push({
        id:
          'connection-question:' +
          createHash('sha256')
            .update(JSON.stringify([described.fingerprint, decision]))
            .digest('hex'),
        message: decision.message,
        sources: decision.sources,
        ...(decision.explanation === undefined
          ? {}
          : { explanation: decision.explanation }),
      });
      continue;
    }
    if (decision.kind === 'keep-connections') continue;
    const edge =
      decision.kind === 'remove'
        ? described.existingEdges.find((item) => item.id === decision.edgeId)!
            .edge
        : {
            from: decision.source.nodeId,
            output: decision.source.port,
            to: decision.target.nodeId,
            input: decision.target.port,
          };
    const key = draftEdgeKey(edge);
    if (keys.has(key))
      throw new Error(
        'Connection edit contains duplicate or cancelling changes for the same edge',
      );
    keys.add(key);
    if (
      !described.affectedNodeIds.includes(edge.from) &&
      !described.affectedNodeIds.includes(edge.to)
    )
      throw new Error(
        'Connection change is outside every connection-planning node scope',
      );
    if (decision.kind === 'add') {
      validateWorkflowEdges({ contracts: described.contracts, edges: [edge] });
      if (edge.from === edge.to)
        throw new Error('Connection edit cannot add a self-cycle');
      if (
        described.existingEdges.some((item) => draftEdgeKey(item.edge) === key)
      )
        throw new Error('Connection edit cannot add an existing edge');
    }
    connections.push({
      kind: decision.kind === 'add' ? 'add-edge' : 'remove-edge',
      stepIds: described.steps.map((step) => step.id),
      edge: structuredClone(edge),
    });
  }
  const fields = { fingerprint: described.fingerprint, proposal };
  if (questions.length)
    return { status: 'needs-clarification', ...fields, questions };
  const candidate = assembleWorkflowDraftEdit({ ...input, connections });
  return { status: 'ready', ...fields, connections, candidate };
}
