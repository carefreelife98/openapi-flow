import type { ResolvedHttpRequestDeployment } from '../../../types/request-deployment.js';

export function createRequestDeploymentNotes(
  documentId: string,
  deployment: ResolvedHttpRequestDeployment,
): string {
  return `REPLACE_ME: OAS ${documentId} requires ${deployment.pendingFields.join(', ')} before execution. Supply deployment options and regenerate, or replace the placeholders in the exported JSON and select the real n8n credential. Bound request URLs are configured in their Materialize node. No credential secret is stored in this workflow.`;
}
