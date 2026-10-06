import { sticky, workflow, validateWorkflow } from '@n8n/workflow-sdk';
import { resolveApiOperations } from '@openapi-flow/core';
import type {
  CreateN8nWorkflowPreviewInput,
  N8nWorkflowPreviewDiagnostic,
  N8nWorkflowPreviewResult,
  N8nPreviewWorkflowJSON,
} from '../../types/workflow-preview.js';
import { workflowPreviewMetadataSchema } from '../../schemas/workflow-preview-schema.js';
import { createPreviewNotes } from './create-preview-notes.js';
import { assertPreviewCatalog } from './assert-preview-catalog.js';

export async function createN8nWorkflowPreview(
  input: CreateN8nWorkflowPreviewInput,
): Promise<N8nWorkflowPreviewResult> {
  const { catalog, ...rawMetadata } = input;
  const metadata = workflowPreviewMetadataSchema.parse(rawMetadata);
  await assertPreviewCatalog(catalog);
  const diagnostics: N8nWorkflowPreviewDiagnostic[] = [
    ...metadata.selection.gaps.map((gap) => ({
      ...gap,
      stage: 'api-selection' as const,
    })),
    ...(metadata.issues === undefined
      ? []
      : metadata.issues.map((issue) => ({
          ...issue,
          kind: 'unmet_requirement' as const,
        }))),
  ];
  if (!diagnostics.length)
    throw new Error(
      'preview requires reported gaps; use workflow compilation for a complete plan',
    );
  const identifiedGaps = metadata.selection.gaps.filter(
    (gap) => gap.kind === 'insufficient_contract',
  );
  const contracts = await resolveApiOperations(catalog, [
    ...metadata.selection.operations.map((item) => item.key),
    ...identifiedGaps.map((gap) => gap.operation!),
  ]);
  let built = workflow(metadata.id, '[REVIEW ONLY] ' + metadata.name);
  for (const note of createPreviewNotes({ metadata, contracts, diagnostics }))
    built = built.add(sticky(note.content, [], note.config));
  const validation = validateWorkflow(built, { allowNoTrigger: true });
  if (!validation.valid)
    throw new Error(
      'n8n preview SDK validation failed: ' +
        validation.errors.map((error) => error.message).join('; '),
    );
  const previewWorkflow: N8nPreviewWorkflowJSON = {
    ...built.toJSON(),
    active: false,
  };
  if (
    previewWorkflow.nodes.some(
      (item) => item.type !== 'n8n-nodes-base.stickyNote',
    ) ||
    Object.keys(previewWorkflow.connections).length
  )
    throw new Error('preview must contain only disconnected Sticky Notes');
  return {
    status: 'needs-review',
    executable: false,
    diagnostics,
    previewWorkflow,
  };
}
