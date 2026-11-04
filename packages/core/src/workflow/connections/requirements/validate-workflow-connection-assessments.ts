import type {
  WorkflowConnectionSessionInput,
  WorkflowConnectionCompletionProposal,
  WorkflowConnectionWorkingGraph,
} from '../../../types/workflow-connection-session.js';
import { hasPointer } from '../../../bindings/json-pointer.js';
import { describeWorkflowConnectionEvidence } from './describe-workflow-connection-evidence.js';

/** Validate attribution and current facts. This does not prove a model's semantic conclusion. */
export function validateWorkflowConnectionAssessments(
  input: WorkflowConnectionSessionInput,
  proposal: WorkflowConnectionCompletionProposal,
  graph: WorkflowConnectionWorkingGraph,
): void {
  const catalog = new Map(
    describeWorkflowConnectionEvidence({
      source: input,
      graph: {
        edges: graph.edges,
        rootNodeIds: graph.rootNodeIds,
        terminals: graph.terminals,
      },
    }).map((item) => [item.id, item]),
  );
  for (const assessment of proposal.assessments) {
    const goal = input.session.goals.find(
      (item) => item.id === assessment.goalId,
    );
    if (
      goal?.decision.kind !== 'semantic' ||
      goal.decision.scope !== assessment.scope
    )
      throw new Error(
        `Completion assessment ${assessment.goalId}: scope must match its semantic goal`,
      );
    const facts = new Set<string>();
    let materialEvidence = false;
    let graphEvidence = false;
    const seen = new Set<string>();
    for (const reference of assessment.evidenceRefs) {
      const key = JSON.stringify([
        reference.evidenceId,
        reference.pointer,
        reference.quote,
      ]);
      const item = catalog.get(reference.evidenceId);
      if (!item || !hasPointer(item.value, reference.pointer) || seen.has(key))
        throw new Error(
          `Completion assessment ${assessment.goalId}: missing, stale, duplicate or invalid evidence reference ${reference.evidenceId}${reference.pointer}`,
        );
      seen.add(key);
      if (item.kind === 'requirement') {
        if (!item.factId || !goal.decision.factIds.includes(item.factId))
          throw new Error(
            `Completion assessment ${assessment.goalId}: evidence cites an unrelated requirement`,
          );
        facts.add(item.factId);
        const fact = input.requirements.find(
          (entry) => entry.id === item.factId,
        );
        if (
          reference.pointer !== '/text' ||
          reference.quote === undefined ||
          !fact?.text.includes(reference.quote)
        )
          throw new Error(
            `Completion assessment ${assessment.goalId}: requirement evidence needs /text and an unchanged quote from the original fact`,
          );
      } else if (item.kind === 'graph') {
        graphEvidence = true;
        if (assessment.scope === 'materials')
          throw new Error(
            `Completion assessment ${assessment.goalId}: material scope cannot depend on graph evidence`,
          );
      } else {
        materialEvidence = true;
        if (
          item.kind !== 'material-inventory' &&
          (!item.nodeId || !assessment.nodeIds.includes(item.nodeId))
        )
          throw new Error(
            `Completion assessment ${assessment.goalId}: evidence node must be included in nodeIds`,
          );
      }
      if (item.kind !== 'requirement' && reference.quote !== undefined)
        throw new Error(
          `Completion assessment ${assessment.goalId}: quotes belong only to original requirement evidence`,
        );
    }
    if (
      assessment.status !== 'insufficient-evidence' &&
      (goal.decision.factIds.some((id) => !facts.has(id)) ||
        !materialEvidence ||
        (assessment.scope === 'workflow' && !graphEvidence))
    )
      throw new Error(
        `Completion assessment ${assessment.goalId}: a conclusion requires every original requirement and current material evidence, plus graph evidence for workflow scope`,
      );
  }
}
