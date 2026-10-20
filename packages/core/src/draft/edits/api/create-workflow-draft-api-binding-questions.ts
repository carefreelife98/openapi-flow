import { createHash } from 'node:crypto';
import type {
  WorkflowDraftApiCallBindingsDescription,
  WorkflowDraftApiCallBindingProposal,
  ProposedWorkflowDraftApiCallMapping,
} from '../../../types/workflow-draft-api-call-planning.js';
import type { WorkflowDraftApiCallPlanningQuestion } from '../../../types/workflow-draft-api-binding-clarification.js';
import type { ResolvedWorkflowDraftSourceEvidence } from '../../../types/workflow-draft-source-evidence.js';
import { requestBindingSchemas } from '../../../bindings/request-binding-schema.js';
import { validateWorkflowDraftApiCallMappings } from './validate-workflow-draft-api-call-mappings.js';

/** The model selects unresolved inputs, never question wording, other operation contracts or UI identities. */
export function createWorkflowDraftApiBindingQuestions(
  description: WorkflowDraftApiCallBindingsDescription,
  proposal: WorkflowDraftApiCallBindingProposal,
  mappings: ProposedWorkflowDraftApiCallMapping[],
  evidence: ResolvedWorkflowDraftSourceEvidence,
): WorkflowDraftApiCallPlanningQuestion[] {
  if (proposal.decision.status !== 'needs-clarification')
    throw new Error(
      'Binding questions require the original unresolved proposal',
    );
  const targets = mappings.map((mapping) => mapping.targetPointer);
  return proposal.decision.questions.map((question) => {
    const pointer = question.targetPointer;
    if (
      description.inputIntent !== undefined &&
      !description.inputIntent.targets.includes(pointer)
    )
      throw new Error(
        `API binding question ${pointer} is outside the selected input intent`,
      );
    if (
      targets.some(
        (target) =>
          target === pointer ||
          target.startsWith(pointer + '/') ||
          pointer.startsWith(target + '/'),
      )
    )
      throw new Error(
        `Binding question overlaps an already assigned or unresolved input: ${pointer}`,
      );
    targets.push(pointer);
    const targetSchemas = requestBindingSchemas(
      {
        callId: description.nodeId,
        operation: description.operation,
        requestMediaType: description.requestMediaType,
      },
      pointer,
    );
    if (!targetSchemas.length)
      throw new Error(
        `Binding question ${pointer} is not declared by selected API ${description.operation.method} ${description.operation.path}`,
      );
    const id =
      'api-call-binding-question:' +
      createHash('sha256')
        .update(JSON.stringify([description.fingerprint, proposal, question]))
        .digest('hex');
    const candidates =
      question.kind === 'choose-source' ? question.candidates : [];
    if (
      new Set(candidates.map((candidate) => JSON.stringify(candidate))).size !==
      candidates.length
    )
      throw new Error(
        'Binding question repeats an identical source alternative',
      );
    const choices = candidates.map((candidate) => {
      validateWorkflowDraftApiCallMappings(description, [
        { targetPointer: pointer, ...candidate },
      ]);
      const source = description.sources.values.find(
        (source) => source.nodeId === candidate.sourceNodeId,
      )!;
      const label =
        source.kind === 'api'
          ? `${source.operation.method} ${source.operation.path} 응답`
          : `${source.node.capability} 출력`;
      return {
        id:
          'api-binding-choice:' +
          createHash('sha256')
            .update(JSON.stringify([id, candidate]))
            .digest('hex'),
        label: `${label} ${candidate.sourcePointer === '' ? '(전체 값)' : candidate.sourcePointer}`,
        ...candidate,
      };
    });
    return {
      id,
      nodeId: description.nodeId,
      operation: structuredClone(description.operation.key),
      method: description.operation.method,
      path: description.operation.path,
      kind: question.kind,
      targetPointer: pointer,
      targetSchemas: structuredClone(targetSchemas),
      message: `${description.operation.method} ${description.operation.path}의 ${pointer} 입력에 ${question.kind === 'choose-source' ? '연결할 선행 응답을 선택해 주세요.' : '선행 응답을 연결할지, 직접 입력값을 사용할지 선택해 주세요.'}`,
      choices,
      ...evidence,
    };
  });
}
