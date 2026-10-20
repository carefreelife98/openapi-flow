import { selectN8nTemplateDeployments } from '@openapi-flow/n8n';
import type { N8nTemplateDeployment } from '@openapi-flow/n8n';
import type { WorkflowDraft } from '@openapi-flow/core';
import type { WorkflowDraftConversationDependencies } from '../../types/workflow-draft-conversation.js';

export function selectDraftConversationDeployments(
  draft: WorkflowDraft,
  dependencies: WorkflowDraftConversationDependencies,
): N8nTemplateDeployment[] | undefined {
  if (dependencies.deployments === undefined) return undefined;
  return selectN8nTemplateDeployments({
    deployments: dependencies.deployments,
    availableDocumentIds: [
      ...new Set(
        dependencies.context.operations.map(
          (operation) => operation.key.documentId,
        ),
      ),
    ],
    selectedDocumentIds: [
      ...new Set(draft.apiCalls.map((call) => call.operation.documentId)),
    ],
  });
}
