import type { ValidateWorkflowDraftNativeReferencesInput } from '../../../types/native-reference-validation.js';
import { createWorkflowNodeContracts } from '../../../workflow/create-workflow-node-contracts.js';
import { createNativeOutputContracts } from '../../../workflow/create-native-output-contracts.js';
import { validateWorkflowDraftNativeReference } from './validate-workflow-draft-native-reference.js';
import { nativeMaterialSourcesFromDraftReferences } from './native-material-sources-from-draft-references.js';
import { validateNativeMaterialSources } from '../../../workflow/validate-native-material-sources.js';

export function validateWorkflowDraftNativeReferences(
  input: ValidateWorkflowDraftNativeReferencesInput,
): void {
  const [contract] = createWorkflowNodeContracts({
    materials: [],
    nativeNodes: [input.node],
    capabilities: [input.capability],
  });
  createNativeOutputContracts({
    nativeNodes: [input.node],
    capabilities: [input.capability],
  });
  const references = [
    ...contract.references,
    ...Object.values(
      contract.inputReferences === undefined ? {} : contract.inputReferences,
    ).flat(),
  ];
  validateNativeMaterialSources(
    input.capability,
    references,
    nativeMaterialSourcesFromDraftReferences(input.sources),
  );
  for (const reference of references)
    validateWorkflowDraftNativeReference({ reference, sources: input.sources });
  if (contract.rejoinsExclusiveOutputs !== undefined)
    validateWorkflowDraftNativeReference({
      reference: {
        source: 'exclusive-output',
        nodeId: contract.rejoinsExclusiveOutputs,
      },
      sources: input.sources,
    });
}
