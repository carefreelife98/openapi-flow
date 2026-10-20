import { createHash } from 'node:crypto';
import { resolveWorkflowPlanningMessages } from '../../../planning/evidence/resolve-workflow-planning-messages.js';
import { z } from 'zod';
import type { BindingSchema } from '../../../types/api-bindings.js';
import type {
  WorkflowDraftNativeParameterEditInput,
  WorkflowDraftNativeParameterEditDescription,
} from '../../../types/workflow-draft-native-parameter-edit.js';
import { stageWorkflowDraftEdit } from '../stage-workflow-draft-edit.js';
import { createWorkflowPlanningCapabilities } from '../../../workflow/create-workflow-planning-capabilities.js';
import { describeWorkflowDraftReferenceSources } from '../references/describe-workflow-draft-reference-sources.js';
import { nativeMaterialSourcesFromDraftReferences } from '../references/native-material-sources-from-draft-references.js';
import { bindNativeMaterialContracts } from '../../../workflow/bind-native-material-contracts.js';

/** Resolve an unfinished native revision, never replace its identity or registered capability. */
export function describeWorkflowDraftNativeParameterEdit(
  input: WorkflowDraftNativeParameterEditInput,
): WorkflowDraftNativeParameterEditDescription {
  if (
    input.allowRuntimeParameters !== undefined &&
    typeof input.allowRuntimeParameters !== 'boolean'
  )
    throw new Error(
      'Native parameter edit allowRuntimeParameters must be a boolean',
    );
  const stage = stageWorkflowDraftEdit(input);
  const step = input.plan.steps.find((step) => step.id === input.stepId);
  if (!step || step.decision.kind !== 'revise-native-node')
    throw new Error(
      'Native parameter edit stepId must identify a revise-native-node decision',
    );
  if (!stage.pendingResolutionStepIds.includes(step.id))
    throw new Error(
      'Native parameter edit already has an explicit result; remove it before replanning',
    );
  const nodeId = step.decision.nodeId;
  const node = stage.content.nativeNodes.find((node) => node.id === nodeId)!;
  if (
    stage.content.requirements.some(
      (requirement) =>
        requirement.state !== 'confirmed' &&
        (requirement.scope.kind === 'workflow' ||
          requirement.scope.nodeIds.includes(node.id)),
    )
  )
    throw new Error(
      `Native parameter target ${node.id} is blocked by an unresolved requirement`,
    );
  const definition = input.context.capabilities.find(
    (capability) => capability.name === node.capability,
  )!;
  const sources = describeWorkflowDraftReferenceSources({
    stage,
    context: input.context,
    excludedNodeIds: [node.id],
  });
  const original = bindNativeMaterialContracts(
    definition,
    nativeMaterialSourcesFromDraftReferences(sources),
  );
  const [planning] = createWorkflowPlanningCapabilities({
    capabilities: [original],
    apiCallIds: sources.values
      .filter((source) => source.kind === 'api')
      .map((source) => source.nodeId),
  });
  const fields = {
    stage,
    node: structuredClone(node),
    capability: {
      name: original.name,
      description: original.description,
      supportsRuntimeParameters: original.supportsRuntimeParameters === true,
    },
    parametersSchema: JSON.parse(
      JSON.stringify(
        z.toJSONSchema(planning.parametersSchema, {
          io: 'input',
          target: 'draft-2020-12',
          reused: 'inline',
          cycles: 'ref',
        }),
      ),
    ) as BindingSchema,
    instruction: step.decision.instruction,
    messages: structuredClone(
      resolveWorkflowPlanningMessages(input.context).filter((message) =>
        input.requestMessageIds.includes(message.id),
      ),
    ),
    backgroundMessages: structuredClone(
      resolveWorkflowPlanningMessages(input.context).filter(
        (message) => !input.requestMessageIds.includes(message.id),
      ),
    ),
    sourceCandidates: sources.values,
    exclusiveOutputSources: sources.exclusiveOutputs,
    includeExplanations: input.plan.options.includeExplanations,
    allowRuntimeParameters: input.allowRuntimeParameters === true,
  };
  return {
    fingerprint: createHash('sha256')
      .update(JSON.stringify(fields))
      .digest('hex'),
    ...fields,
  };
}
