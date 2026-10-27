import { createHash } from 'node:crypto';
import type {
  NativeNodeConfigurationInput,
  NativeNodeConfigurationDescription,
  ResolveNativeNodeParametersInput,
  NativeNodeParameterResult,
  NativeNodeConfigurationReply,
} from '../../types/native-node-planning.js';
import { createNativeNodePlan } from './create-native-node-plan.js';
import { createPreparedNativeNodeMaterials } from './create-prepared-native-node-materials.js';
import {
  createNativeNodeParametersSchema,
  nativeNodeConfigurationRepliesSchema,
} from '../../schemas/native-instance-planning-schema.js';
import { jsonValuesEqual } from '../../utils/json-values-equal.js';
import {
  resolveNativeConfigurationMaterials,
  validateNativeNodeProducerReferences,
} from './resolve-native-configuration-materials.js';
import { nativeParameterQuestionIdentity } from './native-parameter-question-identity.js';
import { nativeNodeParameterExecutionProposal } from './native-planning-execution-proposal.js';

export function describeNativeNodeConfiguration(
  input: NativeNodeConfigurationInput,
): NativeNodeConfigurationDescription {
  const {
    selection,
    instance,
    configuredNodes,
    capabilities,
    outputs,
    sourceDependencies,
  } = resolveNativeConfigurationMaterials(input);
  const allowed = sourceDependencies?.sourceNodeIds;
  const fields = {
    context:
      allowed === undefined
        ? selection.context
        : {
            ...selection.context,
            apiMaterials: selection.context.apiMaterials.filter((source) =>
              allowed.includes(source.callId),
            ),
            preparedNativeNodes: selection.context.preparedNativeNodes.filter(
              (node) => allowed.includes(node.id),
            ),
          },
    instance,
    configuredNodes: createPreparedNativeNodeMaterials(
      configuredNodes.filter(
        (node) => allowed === undefined || allowed.includes(node.id),
      ),
      capabilities,
    ),
    outputs: outputs.filter(
      (source) => allowed === undefined || allowed.includes(source.nodeId),
    ),
    ...(sourceDependencies === undefined ? {} : { sourceDependencies }),
  };
  const replies =
    input.replies === undefined
      ? []
      : nativeNodeConfigurationRepliesSchema.parse(input.replies);
  if (input.replies !== undefined && !jsonValuesEqual(replies, input.replies))
    throw new Error(
      'Native configuration replies must preserve original text and question records',
    );
  if (replies.length && !instance.hasLiteralParameters)
    throw new Error(
      'Native configuration replies require a remaining literal parameter choice',
    );
  const accepted: NativeNodeConfigurationReply[] = [];
  const fingerprint = () =>
    createHash('sha256')
      .update(
        JSON.stringify([
          selection.id,
          { ...fields, ...(accepted.length ? { replies: accepted } : {}) },
        ]),
      )
      .digest('hex');
  for (const [index, reply] of replies.entries()) {
    if (
      reply.question.nodeId !== instance.id ||
      reply.question.fingerprint !== fingerprint()
    )
      throw new Error(
        `Native configuration replies[${index}].question is stale, out of order or belongs to another instance/material revision`,
      );
    const proposal = createNativeNodeParametersSchema(input, false).parse(
      reply.question.proposal,
    );
    if (
      proposal.decision.status !== 'needs-clarification' ||
      !jsonValuesEqual(proposal, reply.question.proposal) ||
      reply.question.message !== proposal.decision.message ||
      reply.question.id !==
        nativeParameterQuestionIdentity(
          reply.question.fingerprint,
          instance.id,
          proposal,
        )
    )
      throw new Error(
        `Native configuration replies[${index}].question differs from its original clarification proposal`,
      );
    accepted.push(structuredClone(reply));
  }
  return {
    fingerprint: fingerprint(),
    ...structuredClone(fields),
    ...(accepted.length ? { replies: accepted } : {}),
  };
}

/** Build one actual instance, never adopt a graph or turn an unfinished role into a source contract. */
export function resolveNativeNodeParameters(
  input: ResolveNativeNodeParametersInput,
): NativeNodeParameterResult {
  const description = describeNativeNodeConfiguration(input);
  if (input.fingerprint !== description.fingerprint)
    throw new Error(
      'Native parameter generation fingerprint is stale; no automatic rebase',
    );
  const proposal = createNativeNodeParametersSchema(input, false).parse(
    input.proposal,
  );
  if (
    !jsonValuesEqual(
      nativeNodeParameterExecutionProposal(proposal),
      nativeNodeParameterExecutionProposal(input.proposal),
    )
  )
    throw new Error(
      'Native parameters must validate without defaults, coercion or transformation',
    );
  if (proposal.decision.status === 'needs-clarification')
    return {
      status: 'needs-clarification',
      id: nativeParameterQuestionIdentity(
        description.fingerprint,
        input.nodeId,
        proposal,
      ),
      fingerprint: description.fingerprint,
      nodeId: input.nodeId,
      message: proposal.decision.message,
      proposal,
    };
  const instance = description.instance;
  const node = {
    id: instance.id,
    capability: instance.capability,
    parameters: proposal.decision.parameters,
    ...(instance.runtimeParameters === undefined
      ? {}
      : { runtimeParameters: instance.runtimeParameters }),
  };
  createNativeNodePlan({
    ...input,
    proposal: {
      nativeNodes: [
        ...(input.configuredNodes === undefined ? [] : input.configuredNodes),
        node,
      ],
      gaps: [],
    },
  });
  if (input.dependencies !== undefined) {
    const materials = resolveNativeConfigurationMaterials(input);
    if (!materials.sourceDependencies)
      throw new Error(
        'Native configuration is missing its validated producer choice',
      );
    validateNativeNodeProducerReferences(
      node,
      materials.capability,
      materials.sourceDependencies.sourceNodeIds,
    );
  }
  return {
    status: 'ready',
    fingerprint: description.fingerprint,
    node: structuredClone(node),
    proposal: structuredClone(proposal),
  };
}
