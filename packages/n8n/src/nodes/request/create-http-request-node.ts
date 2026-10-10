import { validateApiArguments } from '@openapi-flow/core';
import { mapHttpOperationContract } from '@openapi-flow/core/internal';
import type { JsonObject } from '@openapi-flow/core/internal';
import type {
  CreateHttpRequestNodeInput,
  N8nNodeFragment,
} from '../../types/node-fragment.js';
import { originFrom } from '../../legacy/workflow/request/base-url.js';
import { resolveCredentialBinding } from '../../legacy/workflow/request/credential-binding.js';
import { httpRequestNode } from '../../legacy/workflow/request/http-request-node.js';
import { absoluteOperationPath } from '../../legacy/workflow/request/request-url.js';
import { createBoundRequestFragment } from './bindings/create-bound-request-fragment.js';
import { serializeHttpRequest } from './serialization/serialize-http-request.js';
import { resolveHttpRequestDeployment } from './deployment/resolve-http-request-deployment.js';
import { createRequestDeploymentNotes } from './deployment/create-request-deployment-notes.js';
import { resolveHttpRequestAuthentication } from './authentication/resolve-http-request-authentication.js';

export function createHttpRequestNode(
  input: CreateHttpRequestNodeInput,
): N8nNodeFragment {
  const { operation: contract, arguments: args } = input;
  if (input.itemMode !== undefined && input.itemMode !== 'linked')
    throw new Error('itemMode must be linked or omitted');
  if (!args || typeof args.callId !== 'string' || !args.callId.trim())
    throw new Error('arguments.callId must be non-empty');
  if (!Array.isArray(args.unresolvedInputs))
    throw new Error(
      `arguments[${args.callId}].unresolvedInputs must be an array`,
    );
  if (args.unresolvedInputs.length)
    throw new Error(
      `arguments[${args.callId}] has unresolved inputs: ${args.unresolvedInputs.join(', ')}`,
    );
  const validation = validateApiArguments({
    operation: contract,
    values: args.values,
    bindings: args.bindings,
    requestMediaType: args.requestMediaType,
  });
  if (!validation.valid)
    throw new Error(
      `arguments[${args.callId}] is missing ${validation.missingInputs.join(', ')}`,
    );
  const operation = mapHttpOperationContract(
    contract.path,
    contract.method,
    contract.key.operationRef,
    contract.pathItem as unknown as JsonObject,
    contract.operation,
  );
  const authentication = resolveHttpRequestAuthentication({
    operation: contract,
    securityRequirementIndex: input.securityRequirementIndex,
  });
  const deployment = resolveHttpRequestDeployment({
    documentId: contract.key.documentId,
    authentication,
    baseUrl: input.baseUrl,
    credentialBindings: input.credentialBindings,
    securityRequirementIndex: input.securityRequirementIndex,
  });
  const resolvedInput = { ...input, ...deployment };
  let fragment: N8nNodeFragment;
  if (args.bindings.length) {
    fragment = createBoundRequestFragment(resolvedInput, {
      contract,
      operation,
      arguments: args,
      templateUrl: new URL(
        absoluteOperationPath(originFrom(deployment.baseUrl), operation.path),
      ).href,
    });
  } else {
    const { url, body, headers } = serializeHttpRequest(
      operation,
      new URL(
        absoluteOperationPath(originFrom(deployment.baseUrl), operation.path),
      ).href,
      args.values,
      args.requestMediaType,
    );
    const request = httpRequestNode({
      operation,
      id: args.callId,
      name: 'Request ' + args.callId,
      position: input.position,
      url,
      body,
      headers,
      authentication: resolveCredentialBinding(
        deployment,
        deployment.credentialBindings,
      ),
      shouldAssert: false,
    });
    fragment = {
      nodeId: args.callId,
      preservesInputItems: true,
      nodes: [request],
      entry: request,
      exit: request,
      inputPorts: { main: 0 },
      outputPorts: { main: 0 },
    };
  }
  if (
    deployment.pendingFields.length ||
    authentication?.credentialRequirements
  ) {
    const notes = [
      ...(deployment.pendingFields.length
        ? [createRequestDeploymentNotes(contract.key.documentId, deployment)]
        : []),
      ...(authentication?.credentialRequirements
        ? [authentication.credentialRequirements]
        : []),
    ].join('\n');
    for (const requestNode of fragment.nodes) {
      requestNode.config.notes = notes;
      requestNode.config.notesInFlow = true;
    }
  }
  return fragment;
}
