import type { WorkflowDraftCapabilityGap } from '@openapi-flow/core';
import type { GapReviewRegion } from '../../types/reviewable-workflow.js';
import type { N8nNodeFragment } from '../../types/node-fragment.js';
import { createGapReviewRegion } from '../review/create-gap-review-region.js';
import {
  GAP_REVIEW_REGION_WIDTH,
  GAP_REVIEW_REGION_SPACING,
} from '../review/gap-review-region-layout.js';

/** Existing warning region and stop-on-execution surrogate; no invented API/response. */
export function createTemplateGapRegions(
  gaps: WorkflowDraftCapabilityGap[],
  materialFragments: N8nNodeFragment[],
): GapReviewRegion[] {
  const top =
    Math.max(
      0,
      ...materialFragments.flatMap((fragment) =>
        fragment.nodes.map((node) =>
          node.config.position?.[1] === undefined ? 0 : node.config.position[1],
        ),
      ),
    ) + 240;
  return gaps.map((gap, index) =>
    createGapReviewRegion({
      nodeId: gap.id,
      position: [
        700 + index * (GAP_REVIEW_REGION_WIDTH + GAP_REVIEW_REGION_SPACING),
        top,
      ],
      gaps: [
        {
          id: gap.id,
          stage:
            gap.finding.kind === 'unsupported-native'
              ? 'workflow-graph'
              : 'api-selection',
          description: `요청한 기능: ${gap.requestedBehavior}\n판단 근거: ${gap.finding.reason}${gap.finding.kind === 'api-contract-gap' ? '\n대상 OAS 작업: ' + gap.finding.operation.documentId + ' ' + gap.finding.operation.operationRef : ''}\n제공된 OAS·native 계약에서 충족하지 못한 기능입니다. 전체 서비스에 API가 없다는 확정이나 실행 가능한 구현이 아닙니다.`,
        },
      ],
    }),
  );
}
