import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { WorkflowDraftNativeNodeAdditionInput } from '../../../../types/workflow-draft-native-node-addition.js';
import type { WorkflowDraftNativeNodeAdditionContext } from '../../../../types/workflow-draft-native-node-addition-internal.js';
import type { BindingSchema } from '../../../../types/api-bindings.js';
import { resolveNativeNodeAdditionMaterials } from './resolve-native-node-addition-materials.js';
import { nativeMaterialSourcesFromDraftReferences } from '../../references/native-material-sources-from-draft-references.js';
import { bindNativeMaterialContracts } from '../../../../workflow/bind-native-material-contracts.js';
import { createWorkflowPlanningCapabilities } from '../../../../workflow/create-workflow-planning-capabilities.js';
import { hasFixedEmptyNativeParameters } from '../../../../workflow/planning/has-fixed-empty-native-parameters.js';
import { resolveWorkflowPlanningMessages } from '../../../../planning/evidence/resolve-workflow-planning-messages.js';

/** Only one already-selected addition: identities and implementation contracts are code-owned. */
export function resolveNativeNodeAdditionContext(
  input: WorkflowDraftNativeNodeAdditionInput,
): WorkflowDraftNativeNodeAdditionContext {
  const {
    stage,
    nodeId,
    definition,
    sources,
    instruction,
    missingContext,
    pendingSourceNodeIds,
    sourceDependencies,
    plannedNativeRoles,
  } = resolveNativeNodeAdditionMaterials(input);
  if (missingContext.length || pendingSourceNodeIds.length)
    throw new Error(
      `Native node addition ${nodeId} [${definition.name}] requires ${missingContext.map((entry) => `${entry.field} (at least ${entry.minimumItems}, available ${entry.availableItems})`).join(', ')}${pendingSourceNodeIds.length ? '; pending selected producers: ' + pendingSourceNodeIds.join(', ') : ''}`,
    );
  const capability = bindNativeMaterialContracts(
    definition,
    nativeMaterialSourcesFromDraftReferences(sources),
  );
  const [planning] = createWorkflowPlanningCapabilities({
    capabilities: [capability],
    apiCallIds: sources.values
      .filter((source) => source.kind === 'api')
      .map((source) => source.nodeId),
  });
  const parametersSchema = JSON.parse(
    JSON.stringify(
      z.toJSONSchema(planning.parametersSchema, {
        io: 'input',
        target: 'draft-2020-12',
        reused: 'inline',
        cycles: 'ref',
      }),
    ),
  ) as BindingSchema;
  const fields = {
    stage,
    nodeId,
    capability: {
      name: capability.name,
      description: capability.description,
      supportsRuntimeParameters: capability.supportsRuntimeParameters === true,
    },
    instruction,
    parametersSchema,
    parameterMode: hasFixedEmptyNativeParameters(parametersSchema, capability)
      ? ('fixed-empty' as const)
      : ('values' as const),
    sources,
    ...(sourceDependencies === undefined ? {} : { sourceDependencies }),
    ...(plannedNativeRoles === undefined ? {} : { plannedNativeRoles }),
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
    includeExplanations: input.plan.options.includeExplanations,
    allowRuntimeParameters: input.allowRuntimeParameters === true,
  };
  return {
    capability,
    parametersSchema: planning.parametersSchema,
    description: {
      fingerprint: createHash('sha256')
        .update(JSON.stringify(fields))
        .digest('hex'),
      ...fields,
    },
  };
}
