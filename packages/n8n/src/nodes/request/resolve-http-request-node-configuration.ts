import { mapHttpOperationContract } from '@openapi-flow/core/internal';
import type { JsonObject } from '@openapi-flow/core/internal';
import type { CreateHttpRequestNodeInput } from '../../types/node-fragment.js';
import type { ResolveHttpRequestNodeConfigurationResult } from '../../types/request-node-configuration.js';
import { originFrom } from '../../legacy/workflow/request/base-url.js';
import { absoluteOperationPath } from '../../legacy/workflow/request/request-url.js';
import { resolveHttpRequestAuthentication } from './authentication/resolve-http-request-authentication.js';
import { resolveHttpRequestDeployment } from './deployment/resolve-http-request-deployment.js';
import { resolveHttpRequestPagination } from './pagination/resolve-http-request-pagination.js';

/** Shared configuration ownership, after the strict or template boundary checks. */
export function resolveHttpRequestNodeConfiguration(
  input: CreateHttpRequestNodeInput,
): ResolveHttpRequestNodeConfigurationResult {
  const contract = input.operation;
  const operation = mapHttpOperationContract(
    contract.path,
    contract.method,
    contract.key.operationRef,
    contract.pathItem as unknown as JsonObject,
    contract.operation,
  );
  const pagination = resolveHttpRequestPagination(input, operation);
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
  return {
    input: { ...input, ...deployment },
    config: {
      ...(pagination === undefined ? {} : { pagination }),
      contract,
      operation,
      arguments: {
        callId: input.arguments.callId,
        values: structuredClone(input.arguments.values),
        bindings: structuredClone(input.arguments.bindings),
        ...(input.arguments.requestedInputs === undefined
          ? {}
          : { requestedInputs: [...input.arguments.requestedInputs] }),
        unresolvedInputs: [...input.arguments.unresolvedInputs],
        ...(input.arguments.requestMediaType === undefined
          ? {}
          : { requestMediaType: input.arguments.requestMediaType }),
      },
      templateUrl: new URL(
        absoluteOperationPath(originFrom(deployment.baseUrl), operation.path),
      ).href,
    },
  };
}
