import type {
  CreateN8nPreviewNotesInput,
  N8nPreviewNote,
} from '../../types/workflow-preview.js';
import { escapePreviewMarkdown } from './escape-preview-markdown.js';

export function createPreviewNotes({
  metadata,
  contracts,
  diagnostics,
}: CreateN8nPreviewNotesInput): N8nPreviewNote[] {
  const notes: N8nPreviewNote[] = [
    {
      content: [
        '# REVIEW ONLY — not an executable workflow',
        'API cards are confirmed OAS contracts, not completed or approved calls. Reported gaps require human review; they are not proof that an API is absent.',
        'This canvas contains notes only: no trigger, request, code or execution connections. Regenerate an executable workflow after resolving the reports.',
        '## Scenario',
        escapePreviewMarkdown(metadata.scenario),
        'Text from the scenario, purposes and gap reports is included. Review it before sharing.',
      ].join('\n\n'),
      config: {
        id: 'preview-overview',
        name: 'Review only',
        position: [0, 0],
        color: 1,
        width: 580,
        height: 420,
      },
    },
  ];
  for (const [index, selected] of metadata.selection.operations.entries()) {
    const contract = contracts[index];
    notes.push({
      content: [
        '# OAS API — selected, not executed',
        escapePreviewMarkdown(contract.method + ' ' + contract.path),
        'Document: ' + escapePreviewMarkdown(contract.key.documentId),
        'Operation: ' + escapePreviewMarkdown(contract.key.operationRef),
        'Snapshot: ' + escapePreviewMarkdown(contract.key.snapshotId),
        'Purpose: ' + escapePreviewMarkdown(selected.purpose),
      ].join('\n\n'),
      config: {
        id: `preview-api-${index + 1}`,
        name: `OAS API ${index + 1}`,
        position: [650, index * 400],
        color: 5,
        width: 560,
        height: 360,
      },
    });
  }
  for (const [index, diagnostic] of diagnostics.entries()) {
    const text = [
      '# NEEDS REVIEW — ' + diagnostic.kind,
      'Stage: ' + diagnostic.stage,
      escapePreviewMarkdown(diagnostic.description),
    ];
    if (diagnostic.stage === 'api-selection' && diagnostic.operation) {
      text.push(
        'Document: ' + escapePreviewMarkdown(diagnostic.operation.documentId),
        'Operation: ' +
          escapePreviewMarkdown(diagnostic.operation.operationRef),
        'Snapshot: ' + escapePreviewMarkdown(diagnostic.operation.snapshotId),
      );
    }
    notes.push({
      content: text.join('\n\n'),
      config: {
        id: `preview-gap-${index + 1}`,
        name: `Needs review ${index + 1}`,
        position: [1280, index * 400],
        color: 3,
        width: 560,
        height: 360,
      },
    });
  }
  if (
    metadata.proposedNativeNodes !== undefined ||
    metadata.proposedEdges !== undefined
  ) {
    const text = ['# Reported graph proposal — not validated for execution'];
    for (const item of metadata.proposedNativeNodes ?? [])
      text.push(
        escapePreviewMarkdown(
          'Node: ' + item.id + ' (' + item.capability + ')',
        ),
      );
    for (const edge of metadata.proposedEdges ?? [])
      text.push(
        escapePreviewMarkdown(
          `${edge.from}.${edge.output} → ${edge.to}.${edge.input}`,
        ),
      );
    notes.push({
      content: text.join('\n\n'),
      config: {
        id: 'preview-graph-proposal',
        name: 'Reported graph proposal',
        position: [0, 500],
        color: 7,
        width: 580,
        height: 420,
      },
    });
  }
  return notes;
}
