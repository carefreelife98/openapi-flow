import {
  validateApiArguments,
  inspectApiArgumentRequirements,
} from '@openapi-flow/core';
import type {
  CreateHttpRequestNodeInput,
  N8nNodeFragment,
} from '../../types/node-fragment.js';
import { resolveCredentialBinding } from '../../legacy/workflow/request/credential-binding.js';
import { createBoundRequestFragment } from './bindings/create-bound-request-fragment.js';
import { serializeHttpRequest } from './serialization/serialize-http-request.js';
import { createSerializedHttpRequestNode } from './serialization/create-serialized-http-request-node.js';
import { resolveHttpRequestNodeConfiguration } from './resolve-http-request-node-configuration.js';
import { finalizeHttpRequestFragment } from './finalize-http-request-fragment.js';
import { applyHttpRequestPagination } from './pagination/apply-http-request-pagination.js';

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
  const inspected = inspectApiArgumentRequirements({
    operation: contract,
    callId: args.callId,
    values: args.values,
    bindings: args.bindings,
    requestMediaType: args.requestMediaType,
    requestedInputs: args.requestedInputs,
  });
  if (inspected.status === 'needs-input')
    throw new Error(
      `arguments[${args.callId}] is missing scenario-requested inputs: ${inspected.requirements.map((requirement) => requirement.targetPointer).join(', ')}`,
    );
  const prepared = resolveHttpRequestNodeConfiguration(input);
  const resolvedInput = prepared.input;
  const operation = prepared.config.operation;
  let fragment: N8nNodeFragment;
  if (args.bindings.length) {
    fragment = createBoundRequestFragment(resolvedInput, prepared.config);
  } else {
    const { url, body, headers } = serializeHttpRequest(
      operation,
      prepared.config.templateUrl,
      args.values,
      args.requestMediaType,
      prepared.config.pagination,
    );
    const request = createSerializedHttpRequestNode({
      bodySource: 'literal',
      operation,
      id: `${args.callId}-transport`,
      name: 'Receive ' + args.callId,
      position: input.position,
      url,
      body,
      headers,
      authentication: resolveCredentialBinding(
        resolvedInput,
        resolvedInput.credentialBindings,
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
  return finalizeHttpRequestFragment({
    pagination: prepared.config.pagination,
    fragment: applyHttpRequestPagination(fragment, prepared.config),
    method: contract.method,
    documentId: contract.key.documentId,
    deployment: resolvedInput,
  });
}
