import { createHash } from 'node:crypto';
import type {
  ResolveWorkflowDraftApiBindingEditInput,
  WorkflowDraftApiBindingEditResult,
  WorkflowDraftApiBindingEditQuestion,
} from '../../../types/workflow-draft-api-binding-edit.js';
import type {
  WorkflowDraftBindingEdit,
  WorkflowDraftValueEdit,
} from '../../../types/workflow-draft-edit-assembly.js';
import { describeWorkflowDraftApiBindingEdit } from './describe-workflow-draft-api-binding-edit.js';
import { createWorkflowDraftApiBindingEditProposalSchema } from '../../../schemas/workflow-draft-api-binding-edit-schema.js';
import { validateWorkflowPlanningEvidence } from '../../../planning/evidence/validate-workflow-planning-evidence.js';
import { resolveWorkflowDraftApiMaterials } from '../../resolve-workflow-draft-api-materials.js';
import { pointerTokens, hasPointer } from '../../../bindings/json-pointer.js';
import { requestBindingSchemas } from '../../../bindings/request-binding-schema.js';
import { applyWorkflowDraftBindingEdits } from '../values/apply-workflow-draft-binding-edits.js';
import { applyWorkflowDraftApiInputEdits } from '../values/apply-workflow-draft-api-input-edits.js';
import { validateApiArguments } from '../../../arguments/validate-api-arguments.js';
import { validateApiBindingAssignment } from '../../../bindings/validate-api-binding-assignment.js';

/** Resolve one actual target's mappings. Whole-graph validation remains atomic assembly's job. */
export function resolveWorkflowDraftApiBindingEdit(
  input: ResolveWorkflowDraftApiBindingEditInput,
): WorkflowDraftApiBindingEditResult {
  const described = describeWorkflowDraftApiBindingEdit(input);
  if (input.fingerprint !== described.fingerprint)
    throw new Error(
      'Binding edit fingerprint is missing, stale or describes different staged materials',
    );
  const proposal = createWorkflowDraftApiBindingEditProposalSchema(
    described,
  ).parse(input.proposal);
  const material = resolveWorkflowDraftApiMaterials({
    content: described.stage.content,
    context: input.context,
  }).find((item) => item.callId === described.call.id)!;
  const edits: WorkflowDraftBindingEdit[] = [];
  const valueEdits: WorkflowDraftValueEdit[] = [];
  const questions: WorkflowDraftApiBindingEditQuestion[] = [];
  const targets: string[] = [];
  for (const decision of proposal.decisions) {
    pointerTokens(decision.targetPointer);
    if (!requestBindingSchemas(material, decision.targetPointer).length)
      throw new Error(
        `Binding edit target ${decision.targetPointer} is not declared by its actual request OAS`,
      );
    if (
      targets.some(
        (pointer) =>
          pointer === decision.targetPointer ||
          pointer.startsWith(decision.targetPointer + '/') ||
          decision.targetPointer.startsWith(pointer + '/'),
      )
    )
      throw new Error(
        `Binding edit has duplicate or overlapping decisions at ${decision.targetPointer}`,
      );
    targets.push(decision.targetPointer);
    validateWorkflowPlanningEvidence({
      context: { messages: described.messages },
      evidence: decision.sources,
    });
    if (decision.explanation)
      validateWorkflowPlanningEvidence({
        context: { messages: described.messages },
        evidence: decision.explanation.evidence,
      });
    const existing = described.call.bindings.find(
      (binding) => binding.targetPointer === decision.targetPointer,
    );
    if (decision.kind === 'needs-clarification') {
      questions.push({
        id:
          'binding-question:' +
          createHash('sha256')
            .update(JSON.stringify([described.fingerprint, decision]))
            .digest('hex'),
        nodeId: described.call.id,
        targetPointer: decision.targetPointer,
        message: decision.message,
        sources: decision.sources,
        ...(decision.explanation === undefined
          ? {}
          : { explanation: decision.explanation }),
      });
    } else if (decision.kind === 'unbind' || decision.kind === 'keep') {
      if (!existing)
        throw new Error(
          `Binding edit ${decision.kind} requires an existing binding at ${decision.targetPointer}`,
        );
      if (decision.kind === 'unbind')
        edits.push({ kind: 'remove', targetPointer: decision.targetPointer });
    } else {
      const literal = hasPointer(described.call.values, decision.targetPointer);
      if (decision.kind === 'replace-literal-with-binding') {
        if (!literal)
          throw new Error(
            `Binding edit replacement has no actual literal at ${decision.targetPointer}`,
          );
        valueEdits.push({ kind: 'remove', pointer: decision.targetPointer });
      } else if (literal)
        throw new Error(
          `Binding edit ${decision.targetPointer} requires an explicit replace-literal-with-binding decision`,
        );
      edits.push({
        kind: 'set',
        binding: {
          kind: 'node-output',
          targetPointer: decision.targetPointer,
          sourceNodeId: decision.sourceNodeId,
          sourcePointer: decision.sourcePointer,
        },
      });
    }
  }
  if (
    described.scope.kind === 'repair' &&
    (targets.length !== described.requiredTargetPointers.length ||
      described.requiredTargetPointers.some(
        (pointer) => !targets.includes(pointer),
      ))
  )
    throw new Error(
      'Binding repair must explicitly decide every affected target exactly once',
    );
  const materials = [
    material,
    ...described.sourceCandidates
      .filter((candidate) => candidate.kind === 'api')
      .map((candidate) => ({
        callId: candidate.nodeId,
        operation: candidate.operation,
      })),
  ];
  const nativeOutputs = described.sourceCandidates
    .filter((candidate) => candidate.kind === 'native')
    .map((candidate) => ({
      nodeId: candidate.nodeId,
      schema: candidate.schema,
    }));
  for (const edit of edits)
    if (edit.kind === 'set')
      validateApiBindingAssignment({
        callId: described.call.id,
        binding: edit.binding,
        materials,
        nativeOutputs,
      });
  for (const decision of proposal.decisions)
    if (decision.kind === 'keep')
      validateApiBindingAssignment({
        callId: described.call.id,
        binding: described.call.bindings.find(
          (binding) => binding.targetPointer === decision.targetPointer,
        )!,
        materials,
        nativeOutputs,
      });
  const fields = { fingerprint: described.fingerprint, proposal };
  if (questions.length)
    return { status: 'needs-clarification', ...fields, questions };
  const bindings = applyWorkflowDraftBindingEdits(
    described.call.bindings,
    edits,
    `Binding edit ${described.call.id}`,
  );
  const values = applyWorkflowDraftApiInputEdits(
    described.call.values,
    valueEdits,
    material,
  );
  validateApiArguments({ ...material, values, bindings });
  for (const binding of bindings)
    validateApiBindingAssignment({
      callId: described.call.id,
      binding,
      materials,
      nativeOutputs,
    });
  if (described.scope.kind === 'step')
    return {
      status: 'ready',
      kind: 'step',
      ...fields,
      resolution: {
        stepId: described.scope.stepId,
        kind: 'api-bindings',
        edits,
        valueEdits,
      },
    };
  return {
    status: 'ready',
    kind: 'repair',
    ...fields,
    repair: { taskId: described.scope.taskId, kind: 'api-bindings', edits },
  };
}
