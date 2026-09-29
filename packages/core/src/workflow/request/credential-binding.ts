import { newCredential } from '@n8n/workflow-sdk';
import type { Operation } from '../../types/request.js';
import type { CredentialBindings } from '../../types/request-workflow.js';
import { isObject } from '../../utils/validation.js';

export function resolveCredentialBinding(
  operation: Operation,
  credentialBindings: CredentialBindings,
) {
  if (!isObject(credentialBindings)) {
    throw new Error(
      'credentialBindings must be an OAS-scheme-to-n8n-credential map',
    );
  }
  if (operation.authentication === undefined) return undefined;
  const schemeName = operation.authentication.schemeName;
  const binding = credentialBindings[schemeName];
  if (
    !isObject(binding) ||
    Object.keys(binding).some((key) => key !== 'id' && key !== 'name') ||
    typeof binding.id !== 'string' ||
    !binding.id.trim() ||
    typeof binding.name !== 'string' ||
    !binding.name.trim()
  ) {
    throw new Error(
      'credentialBindings.' +
        schemeName +
        ' must contain an existing n8n credential id and name',
    );
  }
  return {
    parameters: {
      authentication: 'genericCredentialType',
      genericAuthType: operation.authentication.credentialType,
    },
    credentials: {
      [operation.authentication.credentialType]: newCredential(
        binding.name,
        binding.id,
      ),
    },
  };
}
