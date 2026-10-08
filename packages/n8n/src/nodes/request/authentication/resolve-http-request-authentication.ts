import { resolveOpenApiSecurity } from '@openapi-flow/core';
import { UnsupportedOperationError } from '@openapi-flow/core/internal';
import type {
  HttpRequestAuthenticationMapping,
  ResolveHttpRequestAuthenticationInput,
} from '../../../types/authentication.js';

export function resolveHttpRequestAuthentication(
  input: ResolveHttpRequestAuthenticationInput,
): HttpRequestAuthenticationMapping | undefined {
  const contract = input.operation;
  const selected = resolveOpenApiSecurity({
    operationRef: contract.key.operationRef,
    security: contract.effective.security,
    securitySchemes: contract.effective.securitySchemes,
    requirementIndex: input.securityRequirementIndex,
  });
  if (!selected || !selected.schemes.length) return undefined;
  if (selected.schemes.length !== 1)
    throw new UnsupportedOperationError(
      contract.key.operationRef,
      `${contract.key.operationRef}: combined security schemes require a separate composite credential mapping`,
    );
  const { name, definition, scopes } = selected.schemes[0];
  if (definition.type === 'http') {
    const scheme = String(definition.scheme).toLowerCase();
    if (scheme === 'bearer')
      return { schemeName: name, credentialType: 'httpBearerAuth' };
    if (scheme === 'basic')
      return { schemeName: name, credentialType: 'httpBasicAuth' };
    if (scheme === 'digest')
      return { schemeName: name, credentialType: 'httpDigestAuth' };
  }
  if (
    definition.type === 'apiKey' &&
    ['header', 'query'].includes(String(definition.in))
  ) {
    if (typeof definition.name !== 'string' || !definition.name.trim())
      throw new Error(
        `${contract.key.operationRef}.securitySchemes.${name}.name is required`,
      );
    return {
      schemeName: name,
      credentialType:
        definition.in === 'header' ? 'httpHeaderAuth' : 'httpQueryAuth',
      credentialRequirements: `OAS ${name}: configure the credential ${definition.in} Name as ${JSON.stringify(definition.name)}. The workflow contains only a credential reference; the stored secret and Name are owned by n8n.`,
    };
  }
  if (definition.type === 'oauth2')
    return {
      schemeName: name,
      credentialType: 'oAuth2Api',
      credentialRequirements: `OAS ${name}: use an existing OAuth2 credential configured for the declared flows and required scopes ${JSON.stringify(scopes)}. This compiler does not create grants, invent tokens or verify the stored credential configuration.`,
    };
  throw new UnsupportedOperationError(
    contract.key.operationRef,
    `${contract.key.operationRef}.securitySchemes.${name}: ${definition.type}/${definition.scheme ?? definition.in ?? ''} has no implemented HTTP Request credential mapping`,
  );
}
