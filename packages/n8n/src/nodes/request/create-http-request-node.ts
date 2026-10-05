import {
  validateApiArguments,
  UnsupportedOperationError,
} from '@openapi-flow/core';
import { mapOperationForWorkflow } from '@openapi-flow/core/internal';
import type { JsonObject, InputValues } from '@openapi-flow/core/internal';
import type {
  CreateHttpRequestNodeInput,
  N8nNodeFragment,
} from '../../types/node-fragment.js';
import { originFrom } from '../../legacy/workflow/request/base-url.js';
import { makeUrl } from '../../legacy/workflow/request/request-url.js';
import { makeBody } from '../../legacy/workflow/request/request-body.js';
import { makeHeaders } from '../../legacy/workflow/request/request-headers.js';
import { resolveCredentialBinding } from '../../legacy/workflow/request/credential-binding.js';
import { httpRequestNode } from '../../legacy/workflow/request/http-request-node.js';

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
  if (args.bindings.length)
    throw new UnsupportedOperationError(
      contract.key.operationRef,
      `arguments[${args.callId}] output bindings require runtime materialization; this standalone literal-node compiler does not execute or substitute them`,
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
  const values: InputValues = {};
  for (const group of ['path', 'query', 'header', 'cookie'] as const) {
    for (const [name, value] of Object.entries(args.values[group] ?? {}))
      Object.defineProperty(values, `${group}.${name}`, {
        value,
        enumerable: true,
      });
  }
  if (Object.hasOwn(args.values, 'body')) values.body = args.values.body;
  const missing: string[] = [];
  const url = makeUrl(operation, originFrom(input.baseUrl), values, missing);
  const body = makeBody(operation, values, missing, args.requestMediaType);
  const headers = makeHeaders(operation, values, missing);
  if (missing.length)
    throw new Error(
      `arguments[${args.callId}] is missing ${missing.join(', ')}`,
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
