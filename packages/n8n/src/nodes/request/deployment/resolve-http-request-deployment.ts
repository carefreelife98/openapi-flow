import type {
  ResolveHttpRequestDeploymentInput,
  ResolvedHttpRequestDeployment,
} from '../../../types/request-deployment.js';
import { httpRequestDeploymentOptionsSchema } from '../../../schemas/request-deployment-schema.js';

export function resolveHttpRequestDeployment(
  input: ResolveHttpRequestDeploymentInput,
): ResolvedHttpRequestDeployment {
  const options = httpRequestDeploymentOptionsSchema.parse({
    baseUrl: input.baseUrl,
    credentialBindings: input.credentialBindings,
  });
  const pendingFields: string[] = [];
  let baseUrl: string;
  if (options.baseUrl === undefined) {
    baseUrl = 'https://REPLACE_ME.invalid';
    pendingFields.push('baseUrl');
  } else {
    baseUrl = options.baseUrl;
  }
  const credentialBindings =
    options.credentialBindings === undefined ? {} : options.credentialBindings;
  const schemeName = input.operation.authentication?.schemeName;
  if (
    schemeName !== undefined &&
    !Object.hasOwn(credentialBindings, schemeName)
  ) {
    credentialBindings[schemeName] = {
      id: `REPLACE_ME:${encodeURIComponent(input.documentId)}:${encodeURIComponent(schemeName)}`,
      name: `REPLACE_ME (${input.documentId}: ${schemeName})`,
    };
    pendingFields.push(`credentialBindings.${schemeName}`);
  }
  return { baseUrl, credentialBindings, pendingFields };
}
