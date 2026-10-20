import { createHash } from 'node:crypto';
import type {
  ResolveWorkflowDraftNativeParameterEditsInput,
  WorkflowDraftNativeParameterEditResult,
  WorkflowDraftNativeParameterEditQuestion,
  WorkflowDraftNativeParameterChange,
} from '../../../types/workflow-draft-native-parameter-edit.js';
import { createWorkflowDraftNativeParameterEditValuesSchema } from '../../../schemas/create-workflow-draft-native-parameter-edit-values-schema.js';
import { describeWorkflowDraftNativeParameterEdit } from './describe-workflow-draft-native-parameter-edit.js';
import { validateWorkflowPlanningEvidence } from '../../../planning/evidence/validate-workflow-planning-evidence.js';
import { applyWorkflowDraftNativeParameterChanges } from './apply-workflow-draft-native-parameter-changes.js';
import { orderWorkflowDraftValueEdits } from '../values/order-workflow-draft-value-edits.js';
import { resolveNativeStructureParameters } from '../../../workflow/resolve-native-structure-parameters.js';
import { validateWorkflowDraftNativeReferences } from '../references/validate-workflow-draft-native-references.js';
import { bindNativeMaterialContracts } from '../../../workflow/bind-native-material-contracts.js';
import { nativeMaterialSourcesFromDraftReferences } from '../references/native-material-sources-from-draft-references.js';

/** A parameter-stage result is not graph readiness: connections/consumer changes remain explicit. */
export function resolveWorkflowDraftNativeParameterEdits(
  input: ResolveWorkflowDraftNativeParameterEditsInput,
): WorkflowDraftNativeParameterEditResult {
  const output = createWorkflowDraftNativeParameterEditValuesSchema(
    input,
  ).parse(input.output);
  const context = describeWorkflowDraftNativeParameterEdit(input);
  const edits: WorkflowDraftNativeParameterChange[] = [];
  const questions: WorkflowDraftNativeParameterEditQuestion[] = [];
  for (const target of input.contract.targets) {
    if (target.kind !== 'set') {
      edits.push({ kind: target.kind, pointer: target.pointer });
      continue;
    }
    const answer = output.values[target.id];
    validateWorkflowPlanningEvidence({
      context: { messages: context.messages },
      evidence: answer.sources,
    });
    if (answer.explanation)
      validateWorkflowPlanningEvidence({
        context: { messages: context.messages },
        evidence: answer.explanation.evidence,
      });
    if (answer.status === 'needs-input') {
      questions.push({
        id:
          'native-parameter-question:' +
          createHash('sha256')
            .update(JSON.stringify([input.contract.id, target.id, answer]))
            .digest('hex'),
        nodeId: context.node.id,
        targetId: target.id,
        pointer: target.pointer,
        message: answer.message,
        sources: answer.sources,
        ...(answer.explanation === undefined
          ? {}
          : { explanation: answer.explanation }),
      });
    } else
      edits.push({ kind: 'set', pointer: target.pointer, value: answer.value });
  }
  if (questions.length)
    return {
      status: 'needs-input',
      contractId: input.contract.id,
      values: output,
      questions,
    };
  const ordered = [
    ...orderWorkflowDraftValueEdits(
      edits.filter((edit) => edit.kind !== 'defer'),
    ),
    ...edits.filter((edit) => edit.kind === 'defer'),
  ];
  const definition = input.context.capabilities.find(
    (capability) => capability.name === context.node.capability,
  )!;
  const capability = bindNativeMaterialContracts(
    definition,
    nativeMaterialSourcesFromDraftReferences({
      values: context.sourceCandidates,
      exclusiveOutputs: context.exclusiveOutputSources,
    }),
  );
  const node = applyWorkflowDraftNativeParameterChanges({
    node: context.node,
    capability,
    edits: ordered,
    source: `Native parameter edit ${context.node.id}`,
  });
  resolveNativeStructureParameters(node, capability);
  validateWorkflowDraftNativeReferences({
    node,
    capability,
    sources: {
      values: context.sourceCandidates,
      exclusiveOutputs: context.exclusiveOutputSources,
    },
  });
  return {
    status: 'ready',
    contractId: input.contract.id,
    values: output,
    resolution: {
      stepId: input.stepId,
      kind: 'native-parameters',
      edits: ordered,
    },
  };
}
