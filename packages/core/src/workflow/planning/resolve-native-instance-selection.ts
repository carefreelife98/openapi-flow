import { createHash } from 'node:crypto';
import type {
  NativeInstanceSelection,
  ResolveNativeInstanceSelectionInput,
  NativeInstanceSelectionInput,
  NativeInstanceSelectionDescription,
  NativeSelectedPlanningInput,
} from '../../types/native-node-planning.js';
import { createNativeInstanceSelectionSchema } from '../../schemas/native-instance-planning-schema.js';
import { createNativeParameterGenerationContract } from '../../schemas/create-native-parameter-generation-contract.js';
import { describeNativeNodePlanning } from './describe-native-node-planning.js';
import { jsonValuesEqual } from '../../utils/json-values-equal.js';
import { createNativePlanningCapabilityMaterial } from './create-native-planning-capability-material.js';

/** The same capability material owns both model context and field-ownership alternatives. */
export function describeNativeInstanceSelection(
  input: NativeInstanceSelectionInput,
): NativeInstanceSelectionDescription {
  const description = describeNativeNodePlanning(input);
  return {
    ...description,
    context: {
      ...description.context,
      parameterPlanning: {
        stage: 'separate-value-generation',
        missingPlanTimeValues: 'ask-in-value-stage',
      },
      capabilities: description.planningCapabilities.map((capability) =>
        createNativePlanningCapabilityMaterial(
          capability,
          input.allowRuntimeParameters === true,
          true,
        ),
      ),
    },
  };
}

/** Select roles and ownership only; node identities and generation schemas are derived here. */
export function resolveNativeInstanceSelection(
  input: ResolveNativeInstanceSelectionInput,
): NativeInstanceSelection {
  const {
    input: snapshot,
    context,
    planningCapabilities,
  } = describeNativeInstanceSelection(input);
  const proposal = createNativeInstanceSelectionSchema(input).parse(
    input.proposal,
  );
  if (!jsonValuesEqual(proposal, input.proposal))
    throw new Error(
      'Native instance selection must preserve original model values',
    );
  const used = new Set([
    ...snapshot.apiMaterials.map((entry) => entry.callId),
    ...snapshot.preparedNativeNodes.map((entry) => entry.id),
  ]);
  const instances = proposal.instances.map((choice) => {
    if (!choice.purpose.trim())
      throw new Error('Native instance purpose must be non-empty');
    const capability = planningCapabilities.find(
      (entry) => entry.name === choice.capability,
    );
    if (!capability)
      throw new Error(
        `Native instance capability ${choice.capability} is not supplied`,
      );
    const id =
      'native-instance:' +
      createHash('sha256')
        .update(
          JSON.stringify([snapshot.planId, choice.capability, choice.purpose]),
        )
        .digest('hex');
    if (used.has(id))
      throw new Error(
        `Native instance role is repeated or its ID collides: ${choice.purpose}`,
      );
    used.add(id);
    const runtimeParameters =
      choice.parameterSource === 'workflow-input'
        ? (true as const)
        : choice.parameterSource === 'workflow-fields'
          ? { pointers: choice.pointers }
          : undefined;
    const contract = createNativeParameterGenerationContract({
      nodeId: id,
      capability,
      runtimeParameters,
    });
    return {
      id,
      capability: choice.capability,
      purpose: choice.purpose,
      ...(choice.reason === undefined ? {} : { reason: choice.reason }),
      literalParametersSchema: contract.literalParametersSchema,
      hasLiteralParameters: contract.hasLiteralParameters,
      ...(runtimeParameters === undefined ? {} : { runtimeParameters }),
    };
  });
  const gaps = proposal.gaps.map((gap, index) => ({
    id: `${snapshot.planId}-gap-${index + 1}`,
    stage: 'workflow-graph' as const,
    description: gap.description,
  }));
  for (const gap of gaps)
    if (used.has(gap.id))
      throw new Error(`Native instance gap ID collides: ${gap.id}`);
  const fields = {
    proposal,
    context,
    includeExplanations: input.includeExplanations === true,
    instances,
    gaps,
  };
  return {
    id:
      'native-selection:' +
      createHash('sha256')
        .update(JSON.stringify([snapshot.planId, fields]))
        .digest('hex'),
    ...structuredClone(fields),
  };
}

export function validateNativeInstanceSelection(
  input: NativeSelectedPlanningInput,
): NativeInstanceSelection {
  if (
    !input.selection ||
    typeof input.selection !== 'object' ||
    !input.selection.proposal
  )
    throw new Error(
      'native configuration.selection requires its original proposal',
    );
  const selection = resolveNativeInstanceSelection({
    ...input,
    proposal: input.selection.proposal,
  });
  if (!jsonValuesEqual(selection, input.selection))
    throw new Error(
      'Native instance selection is stale or its derived contract was modified',
    );
  return selection;
}
