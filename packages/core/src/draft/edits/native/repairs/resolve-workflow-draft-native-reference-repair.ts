import { createHash } from 'node:crypto';
import type {
  ResolveWorkflowDraftNativeReferenceRepairInput,
  WorkflowDraftNativeReferenceRepairResult,
  WorkflowDraftNativeReferenceRepairQuestion,
  ResolvedWorkflowDraftNativeReferenceRepairDecision,
} from '../../../../types/workflow-draft-native-reference-repair.js';
import type { WorkflowDraftValueEdit } from '../../../../types/workflow-draft-edit-assembly.js';
import type { WorkflowNativeParameterReference } from '../../../../types/native-parameter-reference.js';
import { describeWorkflowDraftNativeReferenceRepair } from './describe-workflow-draft-native-reference-repair.js';
import { createWorkflowDraftNativeReferenceRepairSchema } from '../../../../schemas/workflow-draft-native-reference-repair-schema.js';
import { resolveWorkflowDraftSourceEvidence } from '../../references/resolve-workflow-draft-source-evidence.js';
import { validateWorkflowDraftNativeReference } from '../../references/validate-workflow-draft-native-reference.js';
import { validateWorkflowDraftNativeReferences } from '../../references/validate-workflow-draft-native-references.js';
import { pointerValue } from '../../../../bindings/json-pointer.js';
import { applyWorkflowDraftValueEdits } from '../../values/apply-workflow-draft-value-edits.js';
import { parseNativeNodeParameters } from '../../../../workflow/parse-native-node-parameters.js';
import { workflowDraftNativeNodeSchema } from '../../../../schemas/workflow-draft-schema.js';
import { bindNativeMaterialContracts } from '../../../../workflow/bind-native-material-contracts.js';
import { nativeMaterialSourcesFromDraftReferences } from '../../references/native-material-sources-from-draft-references.js';

/** Only reference-location strings change. A question never hides an invalid explicit keep/bind. */
export function resolveWorkflowDraftNativeReferenceRepair(
  input: ResolveWorkflowDraftNativeReferenceRepairInput,
): WorkflowDraftNativeReferenceRepairResult {
  const context = describeWorkflowDraftNativeReferenceRepair(input);
  if (input.fingerprint !== context.fingerprint)
    throw new Error(
      'Native reference repair fingerprint is stale or describes different staged materials',
    );
  const proposal = createWorkflowDraftNativeReferenceRepairSchema(
    context,
  ).parse(input.proposal);
  const assignments = new Map<string, string>();
  const questions: WorkflowDraftNativeReferenceRepairQuestion[] = [];
  const decisions: Record<
    string,
    ResolvedWorkflowDraftNativeReferenceRepairDecision
  > = {};
  function assign(pointer: string, value: string): void {
    if (assignments.has(pointer) && assignments.get(pointer) !== value)
      throw new Error(
        `Native reference repair decisions conflict at shared parameter ${pointer}`,
      );
    assignments.set(pointer, value);
  }
  for (const binding of context.bindings) {
    const decision = proposal.decisions[binding.id];
    const evidence = resolveWorkflowDraftSourceEvidence({
      decision,
      description: context,
      capabilities: input.context.capabilities,
    });
    decisions[binding.id] =
      decision.kind === 'bind'
        ? {
            kind: 'bind',
            sourceNodeId: decision.sourceNodeId,
            ...(decision.sourcePointer === undefined
              ? {}
              : { sourcePointer: decision.sourcePointer }),
            ...evidence,
          }
        : decision.kind === 'keep'
          ? { kind: 'keep', ...evidence }
          : {
              kind: 'needs-clarification',
              message: decision.message,
              ...evidence,
            };
    if (decision.kind === 'needs-clarification') {
      questions.push({
        id:
          'native-reference-question:' +
          createHash('sha256')
            .update(JSON.stringify([context.fingerprint, binding.id, decision]))
            .digest('hex'),
        bindingId: binding.id,
        nodeId: context.node.id,
        message: decision.message,
        ...evidence,
      });
      continue;
    }
    let reference: WorkflowNativeParameterReference;
    if (decision.kind === 'keep') reference = binding.reference;
    else if (binding.reference.source === 'exclusive-output')
      reference = { source: 'exclusive-output', nodeId: decision.sourceNodeId };
    else {
      if (
        binding.valuePointer !== undefined &&
        decision.sourcePointer === undefined
      )
        throw new Error(
          'Native reference repair requires its declared configurable sourcePointer',
        );
      reference = {
        source: binding.reference.source,
        nodeId: decision.sourceNodeId,
        pointer:
          binding.valuePointer === undefined
            ? binding.reference.pointer
            : decision.sourcePointer!,
      };
    }
    validateWorkflowDraftNativeReference({
      reference,
      sources: context.sources,
    });
    assign(binding.nodeIdPointer, reference.nodeId);
    if (binding.valuePointer !== undefined) {
      if (!('pointer' in reference))
        throw new Error('A control source cannot supply a value pointer');
      assign(binding.valuePointer, reference.pointer);
    }
  }
  const fields = { fingerprint: context.fingerprint, proposal, decisions };
  if (questions.length)
    return { status: 'needs-clarification', ...fields, questions };
  const edits: WorkflowDraftValueEdit[] = [...assignments]
    .filter(
      ([pointer, value]) =>
        pointerValue(context.node.parameters, pointer) !== value,
    )
    .map(([pointer, value]) => ({ kind: 'set', pointer, value }));
  const node = workflowDraftNativeNodeSchema.parse({
    ...context.node,
    parameters: applyWorkflowDraftValueEdits({
      value: context.node.parameters,
      edits,
      source: `Native consumer repair ${context.node.id}`,
    }),
  });
  const definition = input.context.capabilities.find(
    (capability) => capability.name === node.capability,
  )!;
  const capability = bindNativeMaterialContracts(
    definition,
    nativeMaterialSourcesFromDraftReferences(context.sources),
  );
  parseNativeNodeParameters(node, capability);
  validateWorkflowDraftNativeReferences({
    node,
    capability,
    sources: context.sources,
  });
  return {
    status: 'ready',
    ...fields,
    repair: { taskId: context.task.id, kind: 'native-parameters', edits },
  };
}
