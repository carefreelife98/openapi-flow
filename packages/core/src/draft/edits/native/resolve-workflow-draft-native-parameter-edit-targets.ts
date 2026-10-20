import { createHash } from 'node:crypto';
import type {
  ResolveWorkflowDraftNativeParameterEditTargetsInput,
  WorkflowDraftNativeParameterEditTargetsResult,
  WorkflowDraftNativeParameterEditTarget,
} from '../../../types/workflow-draft-native-parameter-edit.js';
import { describeWorkflowDraftNativeParameterEdit } from './describe-workflow-draft-native-parameter-edit.js';
import { createWorkflowDraftNativeParameterEditProposalSchema } from '../../../schemas/workflow-draft-native-parameter-edit-schema.js';
import { validateWorkflowPlanningEvidence } from '../../../planning/evidence/validate-workflow-planning-evidence.js';
import { pointerTokens, hasPointer } from '../../../bindings/json-pointer.js';
import { schemasAtPointer } from '../../../bindings/schema-at-pointer.js';
import { createSchemaResourceContext } from '../../../bindings/resources/create-schema-resource-context.js';

/** Code derives target identities and original schema resources; the proposal owns no schema. */
export function resolveWorkflowDraftNativeParameterEditTargets(
  input: ResolveWorkflowDraftNativeParameterEditTargetsInput,
): WorkflowDraftNativeParameterEditTargetsResult {
  const context = describeWorkflowDraftNativeParameterEdit(input);
  if (input.fingerprint !== context.fingerprint)
    throw new Error(
      'Native parameter edit fingerprint is stale or describes different staged materials',
    );
  const { decision: proposal } =
    createWorkflowDraftNativeParameterEditProposalSchema(context).parse(
      input.proposal,
    );
  const decisions =
    proposal.status === 'targets' ? proposal.targets : [proposal];
  for (const decision of decisions) {
    validateWorkflowPlanningEvidence({
      context: { messages: context.messages },
      evidence: decision.sources,
    });
    if (decision.explanation)
      validateWorkflowPlanningEvidence({
        context: { messages: context.messages },
        evidence: decision.explanation.evidence,
      });
  }
  if (proposal.status === 'needs-clarification')
    return {
      status: 'needs-clarification',
      questions: [
        {
          id:
            'native-parameter-question:' +
            createHash('sha256')
              .update(JSON.stringify([context.fingerprint, proposal]))
              .digest('hex'),
          nodeId: context.node.id,
          message: proposal.message,
          sources: proposal.sources,
          ...(proposal.explanation === undefined
            ? {}
            : { explanation: proposal.explanation }),
        },
      ],
    };
  if (proposal.status === 'runtime-parameters')
    return {
      status: 'runtime-parameters',
      resolution: { stepId: input.stepId, kind: 'native-runtime' },
    };
  const resources = createSchemaResourceContext(context.parametersSchema);
  const seen: string[] = [];
  const targets = proposal.targets.map(
    (target, index): WorkflowDraftNativeParameterEditTarget => {
      pointerTokens(target.pointer);
      if (
        seen.some(
          (pointer) =>
            pointer === '' ||
            target.pointer === '' ||
            pointer === target.pointer ||
            pointer.startsWith(target.pointer + '/') ||
            target.pointer.startsWith(pointer + '/'),
        )
      )
        throw new Error(
          `Native parameter edit has duplicate or overlapping targets at ${target.pointer}`,
        );
      seen.push(target.pointer);
      if (
        context.node.runtimeParameters === true &&
        (target.kind !== 'set' || target.pointer !== '')
      )
        throw new Error(
          'Runtime-owned native parameters need an explicit whole-object literal replacement',
        );
      if (target.kind === 'defer' && target.pointer === '')
        throw new Error(
          'Native parameter deferral needs a field pointer; use runtime-parameters for the whole object',
        );
      if (
        context.node.runtimeParameters !== undefined &&
        context.node.runtimeParameters !== true &&
        context.node.runtimeParameters.pointers.some((pointer) =>
          target.pointer.startsWith(pointer + '/'),
        )
      )
        throw new Error(
          `Native parameter edit ${target.pointer} needs an explicit whole-parent replacement of its runtime-owned parent`,
        );
      if (
        target.kind === 'remove' &&
        (target.pointer === '' ||
          (!hasPointer(context.node.parameters, target.pointer) &&
            !(
              context.node.runtimeParameters !== undefined &&
              context.node.runtimeParameters !== true &&
              context.node.runtimeParameters.pointers.some(
                (pointer) =>
                  pointer === target.pointer ||
                  pointer.startsWith(target.pointer + '/'),
              )
            )))
      )
        throw new Error(
          `Native parameter edit cannot remove absent value or parameter root ${target.pointer}`,
        );
      const schema =
        target.kind !== 'remove'
          ? schemasAtPointer(resources.root, target.pointer, resources)[0]
          : undefined;
      if (
        target.kind !== 'remove' &&
        (schema === undefined || schema === false)
      )
        throw new Error(
          `Native parameter edit target ${target.pointer} is not permitted by the registered schema`,
        );
      const fields = { ...target, id: `parameter-${index + 1}` };
      return target.kind !== 'set'
        ? { ...fields, kind: target.kind }
        : { ...fields, kind: 'set', schema: schema! };
    },
  );
  const fields = {
    fingerprint: context.fingerprint,
    stepId: input.stepId,
    nodeId: context.node.id,
    schemaResource: resources.root,
    targets,
  };
  return {
    status: 'ready',
    contract: {
      id:
        'native-parameter-edit:' +
        createHash('sha256').update(JSON.stringify(fields)).digest('hex'),
      ...fields,
    },
  };
}
