import type {
  NativeInstanceGapAssessment,
  NativeInstanceGapAssessmentProposal,
  NativeInstanceRoleAssessment,
  NativeInstanceRoleAssessmentProposal,
  NativeInstanceSelectionCoverageAssessment,
  NativeInstanceSelectionCoverageAssessmentProposal,
} from '../../../types/native-instance-selection-review.js';
import { planningEvidenceTextSchema } from '../../../schemas/planning-evidence-schema.js';

export function resolveNativeReviewExplanation(
  proposal: NativeInstanceGapAssessmentProposal,
): NativeInstanceGapAssessment;
export function resolveNativeReviewExplanation(
  proposal: NativeInstanceRoleAssessmentProposal,
): NativeInstanceRoleAssessment;
export function resolveNativeReviewExplanation(
  proposal: NativeInstanceSelectionCoverageAssessmentProposal,
): NativeInstanceSelectionCoverageAssessment;
export function resolveNativeReviewExplanation(
  proposal:
    | NativeInstanceGapAssessmentProposal
    | NativeInstanceRoleAssessmentProposal
    | NativeInstanceSelectionCoverageAssessmentProposal,
):
  | NativeInstanceGapAssessment
  | NativeInstanceRoleAssessment
  | NativeInstanceSelectionCoverageAssessment {
  const { reason, ...decision } = proposal;
  const explanation = planningEvidenceTextSchema.safeParse(reason);
  return explanation.success
    ? { ...decision, reason: explanation.data }
    : decision;
}
