import type {
  ResolveOasServerAddressInput,
  ResolvedOasServerAddress,
} from '../../../types/request-deployment.js';
import { originFrom } from '../../../legacy/workflow/request/base-url.js';

/** Use the first effective OAS server in author order; environment names are never inferred. */
export function resolveOasServerAddress(
  operation: ResolveOasServerAddressInput,
): ResolvedOasServerAddress {
  const server = operation.effective.servers?.[0];
  if (server === undefined)
    return { baseUrl: 'https://REPLACE_ME.invalid', requiresHost: true };
  const address = server.url.replace(
    /\{([^{}]+)\}/gu,
    (_match, name: string) => {
      const variable = server.variables?.[name];
      if (variable === undefined || typeof variable.default !== 'string')
        throw new Error(`OAS servers[0].variables.${name}.default is missing`);
      return variable.default;
    },
  );
  if (URL.canParse(address))
    return { baseUrl: originFrom(address).href, requiresHost: false };
  const relative = new URL(address, 'https://REPLACE_ME.invalid');
  return { baseUrl: originFrom(relative.href).href, requiresHost: true };
}
