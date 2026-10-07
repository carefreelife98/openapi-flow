import type { GapReviewRegionLayout } from '../../types/reviewable-workflow.js';

export const GAP_REVIEW_REGION_WIDTH = 560;
export const GAP_REVIEW_REGION_SPACING = 64;

// Reserve the upper area for wrapped Markdown, then place the node below it.
// These are canvas spacing metrics, not limits on diagnostic text or OAS data.
export function gapReviewRegionLayout(
  origin: [number, number],
  content: string[],
): GapReviewRegionLayout {
  const textHeight =
    96 +
    content
      .slice(1)
      .reduce(
        (height, paragraph) =>
          height +
          paragraph
            .split('\n')
            .reduce(
              (lines, line) =>
                lines + Math.max(1, Math.ceil(Array.from(line).length / 34)),
              0,
            ) *
            28 +
          16,
        0,
      );
  return {
    notePosition: origin,
    nodePosition: [origin[0] + 232, origin[1] + textHeight + 32],
    width: GAP_REVIEW_REGION_WIDTH,
    height: textHeight + 272,
  };
}
