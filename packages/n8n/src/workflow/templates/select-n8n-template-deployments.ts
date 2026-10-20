import type {
  SelectN8nTemplateDeploymentsInput,
  N8nTemplateDeployment,
} from '../../types/workflow-template.js';
import { templateDeploymentSelectionSchema } from '../../schemas/template-deployment-selection-schema.js';

/** Validate the whole supplied registry first, then project declared settings onto the selected OAS documents. */
export function selectN8nTemplateDeployments(
  input: SelectN8nTemplateDeploymentsInput,
): N8nTemplateDeployment[] {
  const parsed = templateDeploymentSelectionSchema.parse(input);
  for (const deployment of parsed.deployments)
    if (!parsed.availableDocumentIds.includes(deployment.documentId))
      throw new Error(
        `deployments.${deployment.documentId} does not belong to an available original OAS document`,
      );
  for (const documentId of parsed.selectedDocumentIds)
    if (!parsed.availableDocumentIds.includes(documentId))
      throw new Error(
        `selectedDocumentIds.${documentId} is not an available original OAS document`,
      );
  return structuredClone(
    parsed.deployments.filter((deployment) =>
      parsed.selectedDocumentIds.includes(deployment.documentId),
    ),
  );
}
