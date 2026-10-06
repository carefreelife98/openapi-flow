import { sticky } from '@n8n/workflow-sdk';
import type { CreateGapNodeInput } from '../../types/reviewable-workflow.js';
import { escapeReviewMarkdown } from './escape-review-markdown.js';

export function createGapNote(input: CreateGapNodeInput) {
  const content = [
    '# NEEDS REVIEW',
    'Step: ' + escapeReviewMarkdown(input.nodeId),
    ...input.gaps.map((gap) =>
      escapeReviewMarkdown(`${gap.stage}: ${gap.description}`),
    ),
    'Start is disconnected. This placeholder fails if executed; it does not implement an API or produce a response.',
  ];
  for (const gap of input.gaps)
    if (gap.callId !== undefined && gap.targetPointer !== undefined)
      content.push(
        'Request: ' + escapeReviewMarkdown(gap.callId + gap.targetPointer),
      );
  if (input.operation)
    content.push(
      'OAS: ' +
        escapeReviewMarkdown(
          input.operation.key.documentId +
            ' ' +
            input.operation.method +
            ' ' +
            input.operation.path,
        ),
    );
  return sticky(content.join('\n\n'), [], {
    id: 'openapi-flow-gap-note-' + input.nodeId,
    name: 'Review ' + input.nodeId,
    position: [input.position[0], input.position[1] + 120],
    color: 3,
    width: 420,
    height: 260,
  });
}
