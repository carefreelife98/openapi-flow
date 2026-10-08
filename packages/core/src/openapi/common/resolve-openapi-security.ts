import type {
  ResolveOpenApiSecurityInput,
  ResolvedOpenApiSecurity,
} from '../../types/security.js';
import { dereferencedObject, object } from './parse-spec-utils.js';

/** Preserve OAS OR alternatives and AND schemes; adapters own credential mappings. */
export function resolveOpenApiSecurity(
  input: ResolveOpenApiSecurityInput,
): ResolvedOpenApiSecurity | undefined {
  const source = `${input.operationRef}.security`;
  if (!Array.isArray(input.security))
    throw new Error(`${source} must be an array`);
  if (!input.security.length && input.requirementIndex === undefined)
    return undefined;
  if (input.security.length > 1 && input.requirementIndex === undefined)
    throw new Error(
      `${source} has alternatives; securityRequirementIndex is required`,
    );
  const index =
    input.requirementIndex === undefined ? 0 : input.requirementIndex;
  if (!Number.isInteger(index) || index < 0 || index >= input.security.length)
    throw new Error(
      `${source} securityRequirementIndex ${index} is not declared`,
    );
  const requirement = object(input.security[index], `${source}[${index}]`);
  return {
    requirementIndex: index,
    schemes: Object.entries(requirement).map(([name, scopes]) => {
      if (
        !Array.isArray(scopes) ||
        scopes.some((scope) => typeof scope !== 'string')
      )
        throw new Error(`${source}[${index}].${name} scopes must be strings`);
      return {
        name,
        scopes: [...scopes] as string[],
        definition: dereferencedObject(
          input.securitySchemes[name],
          `${input.operationRef}.securitySchemes.${name}`,
        ),
      };
    }),
  };
}
