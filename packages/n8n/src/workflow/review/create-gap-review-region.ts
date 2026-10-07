import { sticky } from '@n8n/workflow-sdk';
import type {
  CreateGapNodeInput,
  GapReviewRegion,
} from '../../types/reviewable-workflow.js';
import { createGapNode } from '../../nodes/gap/create-gap-node.js';
import { createGapReviewContent } from './create-gap-review-content.js';
import { gapReviewRegionLayout } from './gap-review-region-layout.js';

export function createGapReviewRegion(
  input: CreateGapNodeInput,
): GapReviewRegion {
  const content = createGapReviewContent(input);
  const layout = gapReviewRegionLayout(input.position, content);
  const fragment = createGapNode({
    ...input,
    position: layout.nodePosition,
  });
  return {
    fragment,
    annotation: sticky(content.join('\n\n'), fragment.nodes, {
      id: 'openapi-flow-gap-note-' + input.nodeId,
      name: '확인 안내 · ' + input.nodeId,
      position: layout.notePosition,
      color: 3,
      width: layout.width,
      height: layout.height,
    }),
  };
}
