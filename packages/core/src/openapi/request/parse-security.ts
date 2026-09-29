import type { JsonObject } from '../../types/openapi.js';
import type { OperationAuthentication } from '../../types/request.js';
import { dereferencedObject, object } from '../common/parse-spec-utils.js';
import { UnsupportedOperationError } from '../common/unsupported-operation-error.js';

export function parseOperationSecurity(
  spec: JsonObject,
  operation: JsonObject,
  operationRef: string,
): OperationAuthentication | undefined {
  const security =
    operation.security === undefined ? spec.security : operation.security;
  if (security === undefined) return undefined;
  if (!Array.isArray(security)) {
    throw new Error(`operationRef ${operationRef}.security must be an array`);
  }
  if (security.length === 0) return undefined;
  if (security.length !== 1) {
    throw new UnsupportedOperationError(
      operationRef,
      `operationRef ${operationRef}.security has unsupported alternatives`,
    );
  }
  const requirement = object(
    security[0],
    `operationRef ${operationRef}.security[0]`,
  );
  const names = Object.keys(requirement);
  if (names.length === 0) return undefined;
  if (names.length !== 1) {
    throw new UnsupportedOperationError(
      operationRef,
      `operationRef ${operationRef}.security has unsupported combined schemes`,
    );
  }
  const schemeName = names[0];
  const schemes = object(
    object(spec.components, `operationRef ${operationRef}.components`)
      .securitySchemes,
    `operationRef ${operationRef}.components.securitySchemes`,
  );
  const scheme = dereferencedObject(
    schemes[schemeName],
    `operationRef ${operationRef}.components.securitySchemes.${schemeName}`,
  );
  if (
    scheme.type !== 'http' ||
    String(scheme.scheme).toLowerCase() !== 'bearer'
  ) {
    throw new UnsupportedOperationError(
      operationRef,
      `operationRef ${operationRef}.security.${schemeName} cannot be mapped to a supported n8n credential`,
    );
  }
  return { schemeName, credentialType: 'httpBearerAuth' };
}
