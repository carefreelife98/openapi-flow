import { validateApiArguments } from '@openapi-flow/core';
import { mapOperationForWorkflow } from '@openapi-flow/core/internal';
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

export function createHttpRequestNode(
  input: CreateHttpRequestNodeInput,
): N8nNodeFragment {
  const { operation: contract, arguments: args } = input;
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
  const operation = mapOperationForWorkflow(
    {
      security: contract.effective.security,
      components: { securitySchemes: contract.effective.securitySchemes },
    },
    contract.path,
    contract.method,
    contract.key.operationRef,
    contract.pathItem as unknown as JsonObject,
    contract.operation,
  );
  if (args.bindings.length)
    return createBoundRequestFragment(input, {
      contract,
      operation,
      arguments: args,
      templateUrl: new URL(
        absoluteOperationPath(originFrom(input.baseUrl), operation.path),
      ).href,
    });
  const { url, body, headers } = serializeHttpRequest(
    operation,
    new URL(absoluteOperationPath(originFrom(input.baseUrl), operation.path))
      .href,
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
      operation,
      input.credentialBindings,
    ),
    shouldAssert: false,
  });
  return {
    nodeId: args.callId,
    nodes: [request],
    entry: request,
    exit: request,
    inputPorts: { main: 0 },
    outputPorts: { main: 0 },
  };
}
