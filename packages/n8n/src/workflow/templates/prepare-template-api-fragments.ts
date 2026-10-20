import type {
  PrepareTemplateApiFragmentsInput,
  PreparedTemplateApiFragments,
} from '../../types/workflow-template.js';
import { resolveHttpRequestNodeConfiguration } from '../../nodes/request/resolve-http-request-node-configuration.js';
import { createBoundRequestFragment } from '../../nodes/request/bindings/create-bound-request-fragment.js';
import { finalizeHttpRequestFragment } from '../../nodes/request/finalize-http-request-fragment.js';
import { httpResponseNodeName } from '../../nodes/request/response/http-response-node-name.js';
import { createN8nNativeOutputSources } from '../create-n8n-native-output-sources.js';
import { TEMPLATE_PREFLIGHT_NAME } from './workflow-template-identities.js';
import { n8nTemplateDeploymentsSchema } from '../../schemas/workflow-template-schema.js';

/** Resolve deployment and request runtime configuration only from supplied contracts. */
export function prepareTemplateApiFragments(
  input: PrepareTemplateApiFragmentsInput,
): PreparedTemplateApiFragments {
  const deployments = n8nTemplateDeploymentsSchema.parse(
    input.template.deployments === undefined ? [] : input.template.deployments,
  );
  const usedDocuments = new Set(
    input.materials.map((material) => material.operation.key.documentId),
  );
  if (deployments.some((item) => !usedDocuments.has(item.documentId)))
    throw new Error('template.deployments contains an unused documentId');
  const apiNodeNames = Object.fromEntries(
    input.materials.map((material) => [
      material.arguments.callId,
      httpResponseNodeName(material.arguments.callId),
    ]),
  );
  const apiResponseContracts = Object.fromEntries(
    input.materials.map((material) => [
      material.arguments.callId,
      material.operation,
    ]),
  );
  const nativeOutputSources = createN8nNativeOutputSources({
    nativeNodes: input.plan.nativeNodes,
    capabilities: input.capabilities,
    apiNodeNames,
    apiResponseContracts,
  });
  const prepared = input.materials.map((material, index) => {
    const deployment = deployments.find(
      (item) => item.documentId === material.operation.key.documentId,
    );
    const result = resolveHttpRequestNodeConfiguration({
      ...material,
      baseUrl: deployment?.baseUrl,
      credentialBindings: deployment?.credentialBindings,
      securityRequirementIndex: deployment?.securityRequirementIndex,
      position: [700, index * 260],
      apiNodeNames,
      nativeOutputSources,
      apiResponseContracts,
      itemMode: input.template.itemMode,
    });
    result.config.deferredInputs = {
      revision: input.template.draft.revision,
      inputNodeName: TEMPLATE_PREFLIGHT_NAME,
      slots: input.slots.filter(
        (slot) => slot.callId === material.arguments.callId,
      ),
    };
    return result;
  });
  const apiNodes = prepared.map((item) =>
    finalizeHttpRequestFragment({
      fragment: createBoundRequestFragment(item.input, item.config),
      method: item.config.contract.method,
      documentId: item.config.contract.key.documentId,
      deployment: item.input,
    }),
  );
  const deploymentRequirements = prepared
    .filter((item) => item.input.pendingFields.length > 0)
    .map((item) => {
      const fragment = apiNodes.find(
        (fragment) => fragment.nodeId === item.config.arguments.callId,
      );
      const request = fragment?.nodes.find(
        (node) => node.type === 'n8n-nodes-base.httpRequest',
      );
      if (!fragment || !request)
        throw new Error(
          `Template ${item.config.arguments.callId} requires its compiled HTTP request mapping`,
        );
      return {
        callId: item.config.arguments.callId,
        documentId: item.config.contract.key.documentId,
        fields: item.input.pendingFields,
        materializerNodeName: fragment.entry.name,
        requestNodeName: request.name,
      };
    });
  return {
    apiNodes,
    requests: prepared.map((item) => item.config),
    deploymentRequirements,
  };
}
