import type { FinalizeHttpRequestFragmentInput } from '../../types/request-node-configuration.js';
import type { N8nNodeFragment } from '../../types/node-fragment.js';
import { createHttpResponseDecoder } from './response/create-http-response-decoder.js';
import { createRequestDeploymentNotes } from './deployment/create-request-deployment-notes.js';

export function finalizeHttpRequestFragment(
  input: FinalizeHttpRequestFragmentInput,
): N8nNodeFragment {
  const fragment = createHttpResponseDecoder(input);
  const { deployment } = input;
  if (
    deployment.pendingFields.length ||
    deployment.authentication?.credentialRequirements
  ) {
    const notes = [
      ...(deployment.pendingFields.length
        ? [createRequestDeploymentNotes(input.documentId, deployment)]
        : []),
      ...(deployment.authentication?.credentialRequirements
        ? [deployment.authentication.credentialRequirements]
        : []),
    ].join('\n');
    for (const node of fragment.nodes) {
      node.config.notes = notes;
      node.config.notesInFlow = true;
    }
  }
  return fragment;
}
